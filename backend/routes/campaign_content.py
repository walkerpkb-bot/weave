"""
Campaign content, drafts, state, beats, and DM context routes
"""

from fastapi import APIRouter, HTTPException

from models import CampaignContentRequest, BeatHitRequest
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
    get_available_beats,
    advance_threat,
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
        # Migrate old schema (anchor_runs → beats, etc.)
        if "anchor_runs" in draft or ("threat" in draft and "advance_on" in draft.get("threat", {})):
            draft = _migrate_campaign_data(draft)
        return {"hasDraft": True, "content": draft}

    # Fall back to campaign.json if exists
    content = load_campaign_json(campaign_id, "campaign.json")
    if content:
        # Migrate if needed
        if "anchor_runs" in content or ("threat" in content and "advance_on" in content.get("threat", {})):
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

@router.get("/campaigns/{campaign_id}/available-beats")
def get_available_beats_endpoint(campaign_id: str):
    """Get list of currently available beats"""
    content = load_campaign_content(campaign_id)
    if not content:
        return {"beats": [], "hasContent": False}

    state = load_campaign_state(campaign_id)
    available = get_available_beats(content, state)

    return {
        "hasContent": True,
        "beats": [{"id": b.id, "description": b.description, "is_finale": b.is_finale} for b in available],
        "episodes_completed": state.episodes_completed,
        "threat_stage": state.threat_stage
    }

@router.post("/campaigns/{campaign_id}/hit-beat")
def hit_beat(campaign_id: str, request: BeatHitRequest):
    """Record that a beat was hit during an episode"""
    content = load_campaign_content(campaign_id)
    if not content:
        raise HTTPException(status_code=404, detail="Campaign content not found")

    state = load_campaign_state(campaign_id)

    # Find the beat
    beat = next((b for b in content.beats if b.id == request.beat_id), None)
    if not beat:
        raise HTTPException(status_code=404, detail=f"Beat '{request.beat_id}' not found")

    if beat.id in state.beats_hit:
        raise HTTPException(status_code=400, detail=f"Beat '{request.beat_id}' already hit")

    # Record the beat hit
    state.beats_hit.append(beat.id)

    # Add revelation to facts known
    if beat.revelation:
        state.facts_known.append(beat.revelation)
        state.facts_known = list(set(state.facts_known))

    # Add any additional facts
    state.facts_known.extend(request.facts_learned)
    state.facts_known = list(set(state.facts_known))

    # Track NPCs met
    for npc_name in request.npcs_met:
        npc_key = npc_name.lower().replace(" ", "_")
        if npc_key in state.npcs:
            state.npcs[npc_key].met = True

    save_campaign_state(campaign_id, state)

    # Check if campaign is complete (all beats hit or finale beat hit)
    finale_hit = any(
        b.is_finale and b.id in state.beats_hit
        for b in content.beats
    )
    all_beats_done = all(b.id in state.beats_hit for b in content.beats)
    threat_maxed = state.threat_stage >= len(content.threat.stages) - 1

    return {
        "success": True,
        "beats_hit": state.beats_hit,
        "episodes_completed": state.episodes_completed,
        "threat_stage": state.threat_stage,
        "campaign_complete": finale_hit or all_beats_done or threat_maxed
    }

@router.get("/campaigns/{campaign_id}/dm-context")
def get_dm_context_endpoint(campaign_id: str):
    """Get current DM context for ongoing episode"""
    content = load_campaign_content(campaign_id)
    if not content:
        raise HTTPException(status_code=404, detail="Campaign content not found")

    state = load_campaign_state(campaign_id)

    episode_details = state.current_episode or {"description": "Freeform episode"}
    return build_dm_context(content, state, episode_details)
