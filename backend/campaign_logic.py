"""
Campaign content, state, and beat management logic
"""

from campaign_schema import (
    CampaignContent,
    CampaignState,
    NPCState,
    DMPrepData,
)
from helpers import load_campaign_json, save_campaign_json


def _migrate_campaign_data(data: dict) -> dict:
    """Migrate old anchor_runs schema to beats schema"""
    migrated = dict(data)

    # Migrate anchor_runs → beats
    if "anchor_runs" in migrated and "beats" not in migrated:
        beats = []
        anchor_runs = migrated["anchor_runs"]
        for i, run in enumerate(anchor_runs):
            prerequisites = []
            trigger = run.get("trigger", {})
            trigger_type = trigger.get("type", "start")
            trigger_value = trigger.get("value", "")

            unlocked_by = None
            if trigger_type == "after_run" and trigger_value:
                prerequisites = [trigger_value]
            elif trigger_type == "after_runs_count":
                unlocked_by = f"episode:{trigger_value}"

            is_last = (i == len(anchor_runs) - 1)

            beat = {
                "id": run.get("id", f"beat_{i+1}"),
                "description": run.get("goal", run.get("hook", "Unknown")),
                "hints": run.get("must_include", []),
                "revelation": run.get("reveal", "Unknown revelation"),
                "prerequisites": prerequisites,
                "unlocked_by": unlocked_by,
                "closes_after_episodes": None,
                "is_finale": is_last
            }
            beats.append(beat)
        migrated["beats"] = beats
        del migrated["anchor_runs"]

    # Remove filler_seeds
    migrated.pop("filler_seeds", None)

    # Migrate threat.advance_on → threat.advances_each_episode_unless_beat_hit
    if "threat" in migrated:
        threat = migrated["threat"]
        if "advance_on" in threat and "advances_each_episode_unless_beat_hit" not in threat:
            advance_on = threat.pop("advance_on")
            # every_2_runs / every_3_runs / run_failed all map to True
            threat["advances_each_episode_unless_beat_hit"] = advance_on != "manual"
        elif "advance_on" in threat:
            threat.pop("advance_on")

    # Strip unknown fields from NPCs
    if "npcs" in migrated:
        for npc in migrated["npcs"]:
            for key in list(npc.keys()):
                if key not in ("name", "species", "role", "wants", "secret"):
                    del npc[key]

    # Strip unknown fields from locations
    if "locations" in migrated:
        for loc in migrated["locations"]:
            for key in list(loc.keys()):
                if key not in ("name", "vibe", "contains"):
                    del loc[key]

    return migrated


def _migrate_state_data(data: dict) -> dict:
    """Migrate old run-based state to episode/beat state"""
    migrated = dict(data)

    if "runs_completed" in migrated:
        migrated["episodes_completed"] = migrated.pop("runs_completed")
    if "anchor_runs_completed" in migrated:
        migrated["beats_hit"] = migrated.pop("anchor_runs_completed")
    if "beats_expired" not in migrated:
        migrated["beats_expired"] = []
    if "current_episode" not in migrated:
        migrated["current_episode"] = None

    # Remove old fields
    migrated.pop("filler_seeds_used", None)
    migrated.pop("current_run_id", None)
    migrated.pop("current_run_type", None)

    return migrated


def load_campaign_content(campaign_id: str):
    """Load authored campaign content"""
    data = load_campaign_json(campaign_id, "campaign.json")
    if not data:
        return None
    try:
        return CampaignContent(**data)
    except Exception:
        # Try migrating from old schema
        try:
            migrated = _migrate_campaign_data(data)
            content = CampaignContent(**migrated)
            # Save migrated data back so future loads work directly
            save_campaign_json(campaign_id, "campaign.json", content.dict())
            return content
        except Exception:
            return None

def load_campaign_state(campaign_id: str) -> CampaignState:
    """Load runtime campaign state"""
    data = load_campaign_json(campaign_id, "state.json")
    if not data:
        return CampaignState()
    # Auto-migrate old state format
    if "runs_completed" in data or "anchor_runs_completed" in data:
        data = _migrate_state_data(data)
        save_campaign_json(campaign_id, "state.json", data)
    return CampaignState(**data)

def save_campaign_state(campaign_id: str, state: CampaignState):
    """Save runtime campaign state"""
    save_campaign_json(campaign_id, "state.json", state.dict())


def get_available_beats(content: CampaignContent, state: CampaignState) -> list:
    """Get currently available beats (not hit/expired, prerequisites met, unlocked)"""
    available = []
    for beat in content.beats:
        # Skip already hit or expired
        if beat.id in state.beats_hit or beat.id in state.beats_expired:
            continue

        # Check prerequisites
        if not all(prereq in state.beats_hit for prereq in beat.prerequisites):
            continue

        # Check unlocked_by (e.g. "episode:3")
        if beat.unlocked_by:
            if beat.unlocked_by.startswith("episode:"):
                required_episodes = int(beat.unlocked_by.split(":")[1])
                if state.episodes_completed < required_episodes:
                    continue

        # Check expiry
        if check_beat_expiry(beat, state):
            continue

        available.append(beat)
    return available


def check_beat_expiry(beat, state: CampaignState) -> bool:
    """Check if a beat has expired based on closes_after_episodes"""
    if beat.closes_after_episodes is None:
        return False
    return state.episodes_completed >= beat.closes_after_episodes


def advance_threat(content: CampaignContent, state: CampaignState, beat_hit_this_episode: bool) -> bool:
    """Advance threat if configured and no beat was hit. Returns True if advanced."""
    if not content.threat.advances_each_episode_unless_beat_hit:
        return False
    if beat_hit_this_episode:
        return False
    if state.threat_stage >= len(content.threat.stages) - 1:
        return False
    state.threat_stage += 1
    return True


def build_dm_context(content: CampaignContent, state: CampaignState, episode_details: dict) -> dict:
    """Build full context for the DM"""
    party_knows = list(state.facts_known)
    party_does_not_know = []

    for npc in content.npcs:
        if npc.secret not in party_knows:
            party_does_not_know.append(f"{npc.name}'s secret: {npc.secret}")

    for beat in content.beats:
        if beat.id not in state.beats_hit and beat.revelation:
            if beat.revelation not in party_knows:
                party_does_not_know.append(f"Beat reveal ({beat.id}): {beat.revelation}")

    npc_states = {}
    for npc in content.npcs:
        npc_key = npc.name.lower().replace(" ", "_")
        npc_runtime = state.npcs.get(npc_key, NPCState())
        npc_states[npc.name] = {
            "species": npc.species,
            "role": npc.role,
            "wants": npc.wants,
            "secret": npc.secret,
            "met": npc_runtime.met,
            "disposition": npc_runtime.disposition
        }

    threat_desc = content.threat.stages[state.threat_stage] if state.threat_stage < len(content.threat.stages) else "Maximum threat reached"

    available_beats = get_available_beats(content, state)

    return {
        "episode": episode_details,
        "campaign_context": {
            "name": content.name,
            "premise": content.premise,
            "tone": content.tone,
            "locations": [{"name": loc.name, "vibe": loc.vibe, "contains": loc.contains} for loc in content.locations]
        },
        "available_beats": [{"id": b.id, "description": b.description, "is_finale": b.is_finale} for b in available_beats],
        "party_knows": party_knows,
        "party_does_not_know": party_does_not_know,
        "npc_states": npc_states,
        "threat_stage": state.threat_stage,
        "threat_name": content.threat.name,
        "threat_description": threat_desc,
        "episodes_completed": state.episodes_completed,
        "locations_visited": state.locations_visited
    }


# === DM Prep Data Helpers ===

def load_dm_prep_data(campaign_id: str) -> DMPrepData:
    """Load DM prep data for a campaign"""
    data = load_campaign_json(campaign_id, "dm_prep.json")
    if not data:
        return DMPrepData()
    return DMPrepData(**data)


def save_dm_prep_data(campaign_id: str, prep_data: DMPrepData):
    """Save DM prep data for a campaign"""
    save_campaign_json(campaign_id, "dm_prep.json", prep_data.dict())
