"""
Campaign content, drafts, state, runs, and DM context routes
"""

from fastapi import APIRouter, HTTPException

from models import CampaignContentRequest, RunCompleteRequest
from helpers import load_json, save_json, load_campaign_json, save_campaign_json
from campaign_schema import (
    CampaignContent,
    CampaignState,
    NPCState,
    validate_campaign_content,
)
from campaign_logic import (
    load_campaign_content,
    load_campaign_state,
    save_campaign_state,
    get_available_runs,
    select_next_run,
    build_dm_context,
    _migrate_campaign_data,
)

router = APIRouter()


@router.post("/campaigns/{campaign_id}/content")
def create_campaign_content(campaign_id: str, request: CampaignContentRequest):
    """Create or replace campaign authored content"""
    result = validate_campaign_content(request.content)
    if not result.valid:
        raise HTTPException(status_code=400, detail={"errors": result.errors})

    content = CampaignContent(**request.content)
    save_campaign_json(campaign_id, "campaign.json", content.dict())

    # Mark campaign as no longer a draft
    campaigns_data = load_json("campaigns.json")
    for campaign in campaigns_data.get("campaigns", []):
        if campaign["id"] == campaign_id:
            campaign["isDraft"] = False
            break
    save_json("campaigns.json", campaigns_data)

    # Initialize state if needed
    state_data = load_campaign_json(campaign_id, "state.json")
    if not state_data:
        state = CampaignState()
        state.initialize_from_content(content)
        save_campaign_state(campaign_id, state)

    return {"success": True, "warnings": result.warnings, "campaign_id": campaign_id}

@router.post("/campaigns/{campaign_id}/draft")
def save_campaign_draft(campaign_id: str, request: CampaignContentRequest):
    """Save campaign content as draft (no validation)"""
    # Save raw content without validation
    save_campaign_json(campaign_id, "draft.json", request.content)

    # Ensure campaign is marked as draft
    campaigns_data = load_json("campaigns.json")
    for campaign in campaigns_data.get("campaigns", []):
        if campaign["id"] == campaign_id:
            campaign["isDraft"] = True
            # Update name/description from draft if provided
            if request.content.get("name"):
                campaign["name"] = request.content["name"]
            if request.content.get("premise"):
                campaign["description"] = request.content["premise"]
            break
    save_json("campaigns.json", campaigns_data)

    return {"success": True, "campaign_id": campaign_id, "isDraft": True}

@router.get("/campaigns/{campaign_id}/draft")
def get_campaign_draft(campaign_id: str):
    """Get campaign draft content for resuming editing"""
    draft = load_campaign_json(campaign_id, "draft.json")
    if draft:
        # Handle old format where draft.json was {content: {...}, system: {...}}
        if "content" in draft and isinstance(draft["content"], dict) and "name" in draft["content"]:
            draft = draft["content"]
        # Migrate old schema (beats → anchor_runs, etc.)
        if "beats" in draft or ("threat" in draft and "advance_on" not in draft.get("threat", {})):
            draft = _migrate_campaign_data(draft)
        return {"hasDraft": True, "content": draft}

    # Fall back to campaign.json if exists
    content = load_campaign_json(campaign_id, "campaign.json")
    if content:
        # Migrate if needed
        if "beats" in content or ("threat" in content and "advance_on" not in content.get("threat", {})):
            content = _migrate_campaign_data(content)
        return {"hasDraft": False, "content": content}

    return {"hasDraft": False, "content": None}

@router.get("/campaigns/{campaign_id}/content")
def get_campaign_content_endpoint(campaign_id: str):
    """Get campaign authored content for editing"""
    content = load_campaign_content(campaign_id)
    if not content:
        raise HTTPException(status_code=404, detail="Campaign content not found")
    return content.dict()

@router.put("/campaigns/{campaign_id}/content")
def update_campaign_content(campaign_id: str, request: CampaignContentRequest):
    """Update campaign authored content"""
    result = validate_campaign_content(request.content)
    if not result.valid:
        raise HTTPException(status_code=400, detail={"errors": result.errors})

    content = CampaignContent(**request.content)
    save_campaign_json(campaign_id, "campaign.json", content.dict())

    # Update state to include any new NPCs
    state = load_campaign_state(campaign_id)
    for npc in content.npcs:
        npc_key = npc.name.lower().replace(" ", "_")
        if npc_key not in state.npcs:
            state.npcs[npc_key] = NPCState()
    save_campaign_state(campaign_id, state)

    return {"success": True, "warnings": result.warnings}

@router.get("/campaigns/{campaign_id}/state")
def get_campaign_state_endpoint(campaign_id: str):
    """Get campaign runtime state"""
    state = load_campaign_state(campaign_id)
    return state.dict()

@router.post("/campaigns/{campaign_id}/state/reset")
def reset_campaign_state(campaign_id: str):
    """Reset campaign runtime state (keep content)"""
    content = load_campaign_content(campaign_id)
    if not content:
        raise HTTPException(status_code=404, detail="Campaign content not found")

    state = CampaignState()
    state.initialize_from_content(content)
    save_campaign_state(campaign_id, state)
    return {"success": True}

@router.get("/campaigns/{campaign_id}/available-runs")
def get_available_runs_endpoint(campaign_id: str):
    """Get list of currently available runs"""
    content = load_campaign_content(campaign_id)
    if not content:
        return {"anchors": [], "fillers": [], "hasContent": False}

    state = load_campaign_state(campaign_id)
    available = get_available_runs(content, state)

    return {
        "hasContent": True,
        "anchors": [{"id": r.id, "hook": r.hook, "goal": r.goal} for r in available["anchors"]],
        "fillers": available["fillers"],
        "runs_completed": state.runs_completed,
        "threat_stage": state.threat_stage
    }

@router.get("/campaigns/{campaign_id}/next-run")
def get_next_run_endpoint(campaign_id: str):
    """Get the next recommended run"""
    content = load_campaign_content(campaign_id)
    if not content:
        return {"type": "none", "hasContent": False}

    state = load_campaign_state(campaign_id)
    return {**select_next_run(content, state), "hasContent": True}

@router.post("/campaigns/{campaign_id}/start-run")
def start_run(campaign_id: str, run_type: str, run_id: str = None, filler_index: int = None):
    """Start a run and get DM context"""
    content = load_campaign_content(campaign_id)
    if not content:
        raise HTTPException(status_code=404, detail="Campaign content not found")

    state = load_campaign_state(campaign_id)

    if run_type == "anchor":
        run = next((r for r in content.anchor_runs if r.id == run_id), None)
        if not run:
            raise HTTPException(status_code=404, detail="Anchor run not found")
        state.current_run_id = run.id
        state.current_run_type = "anchor"
        run_details = {
            "type": "anchor",
            "id": run.id,
            "hook": run.hook,
            "goal": run.goal,
            "tone": run.tone or content.tone,
            "must_include": run.must_include,
            "reveal": run.reveal
        }
    else:
        if filler_index is None or filler_index >= len(content.filler_seeds):
            raise HTTPException(status_code=400, detail="Invalid filler index")
        state.current_run_id = f"filler_{filler_index}"
        state.current_run_type = "filler"
        run_details = {
            "type": "filler",
            "index": filler_index,
            "hook": content.filler_seeds[filler_index],
            "goal": "Complete the task",
            "tone": content.tone,
            "must_include": [],
            "reveal": None
        }

    save_campaign_state(campaign_id, state)
    return build_dm_context(content, state, run_details)

@router.post("/campaigns/{campaign_id}/complete-run")
def complete_run(campaign_id: str, request: RunCompleteRequest):
    """Complete current run and update state"""
    content = load_campaign_content(campaign_id)
    if not content:
        raise HTTPException(status_code=404, detail="Campaign content not found")

    state = load_campaign_state(campaign_id)

    if not state.current_run_id:
        raise HTTPException(status_code=400, detail="No active run")

    state.runs_completed += 1

    if request.outcome == "victory":
        if state.current_run_type == "anchor":
            state.anchor_runs_completed.append(state.current_run_id)
            run = next((r for r in content.anchor_runs if r.id == state.current_run_id), None)
            if run and run.reveal:
                state.facts_known.append(run.reveal)
        else:
            filler_index = int(state.current_run_id.split("_")[1])
            if filler_index not in state.filler_seeds_used:
                state.filler_seeds_used.append(filler_index)

    elif request.outcome == "failed":
        if content.threat.advance_on.value == "run_failed":
            state.threat_stage = min(state.threat_stage + 1, len(content.threat.stages) - 1)

    state.facts_known.extend(request.facts_learned)
    state.facts_known = list(set(state.facts_known))
    state.locations_visited.extend(request.locations_visited)
    state.locations_visited = list(set(state.locations_visited))

    for npc_name in request.npcs_met:
        npc_key = npc_name.lower().replace(" ", "_")
        if npc_key in state.npcs:
            state.npcs[npc_key].met = True

    state.current_run_id = None
    state.current_run_type = None
    save_campaign_state(campaign_id, state)

    # Check periodic threat advance
    if content.threat.advance_on.value == "every_2_runs" and state.runs_completed % 2 == 0:
        state.threat_stage = min(state.threat_stage + 1, len(content.threat.stages) - 1)
        save_campaign_state(campaign_id, state)
    elif content.threat.advance_on.value == "every_3_runs" and state.runs_completed % 3 == 0:
        state.threat_stage = min(state.threat_stage + 1, len(content.threat.stages) - 1)
        save_campaign_state(campaign_id, state)

    # Check if campaign is complete
    all_anchors_done = all(run.id in state.anchor_runs_completed for run in content.anchor_runs)
    threat_maxed = state.threat_stage >= len(content.threat.stages) - 1

    return {
        "success": True,
        "runs_completed": state.runs_completed,
        "threat_stage": state.threat_stage,
        "campaign_complete": all_anchors_done or threat_maxed
    }

@router.get("/campaigns/{campaign_id}/dm-context")
def get_dm_context_endpoint(campaign_id: str):
    """Get current DM context for ongoing run"""
    content = load_campaign_content(campaign_id)
    if not content:
        raise HTTPException(status_code=404, detail="Campaign content not found")

    state = load_campaign_state(campaign_id)

    if not state.current_run_id:
        raise HTTPException(status_code=400, detail="No active run")

    if state.current_run_type == "anchor":
        run = next((r for r in content.anchor_runs if r.id == state.current_run_id), None)
        run_details = {
            "type": "anchor",
            "id": run.id,
            "hook": run.hook,
            "goal": run.goal,
            "tone": run.tone or content.tone,
            "must_include": run.must_include,
            "reveal": run.reveal
        }
    else:
        filler_index = int(state.current_run_id.split("_")[1])
        run_details = {
            "type": "filler",
            "index": filler_index,
            "hook": content.filler_seeds[filler_index],
            "goal": "Complete the task",
            "tone": content.tone,
            "must_include": [],
            "reveal": None
        }

    return build_dm_context(content, state, run_details)
