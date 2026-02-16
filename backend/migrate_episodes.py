"""
Migration script: Convert campaigns from run-based to episode-based system.

Usage:
    python migrate_episodes.py [campaign_id]

    If no campaign_id is given, migrates all campaigns.
"""

import json
import os
import sys
import shutil
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

DEFAULT_ARCS = [
    {
        "id": "overcome_fear",
        "name": "Overcome Fear",
        "suggested_for": ["Mousefolk", "Rabbitfolk"],
        "milestones": [
            "Face something frightening without fleeing",
            "Stand up for someone else despite fear",
            "Turn a fear into a strength"
        ],
        "reward": {"name": "Brave Heart", "description": "Once per episode, automatically succeed a Brave check"}
    },
    {
        "id": "find_your_voice",
        "name": "Find Your Voice",
        "suggested_for": ["Batfolk", "Frogfolk"],
        "milestones": [
            "Speak up when it would be easier to stay silent",
            "Convince someone to change their mind",
            "Lead others through a difficult moment"
        ],
        "reward": {"name": "Inspiring Words", "description": "Once per episode, give an ally advantage on their next roll"}
    },
]


def load_json(filepath):
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return json.load(f)
    return None


def save_json(filepath, data):
    temp = filepath + ".tmp"
    with open(temp, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(temp, filepath)


def migrate_campaign(campaign_dir, campaign_id):
    """Migrate a single campaign from run-based to episode-based system."""
    print(f"\n--- Migrating campaign: {campaign_id} ---")

    # Backup
    backup_dir = campaign_dir + "_backup_" + datetime.now().strftime("%Y%m%d_%H%M%S")
    shutil.copytree(campaign_dir, backup_dir)
    print(f"  Backup created: {backup_dir}")

    # 1. Migrate characters (roster.json)
    roster_path = os.path.join(campaign_dir, "roster.json")
    roster = load_json(roster_path)
    if roster:
        for char in roster.get("characters", []):
            # Remove old fields
            char.pop("level", None)
            char.pop("xp", None)
            char.pop("maxThreads", None)
            char.pop("gear", None)
            char.pop("weavesKnown", None)
            # Add arc placeholder
            if "arc" not in char:
                char["arc"] = None
        save_json(roster_path, roster)
        print(f"  Characters: migrated {len(roster.get('characters', []))} characters")

    # 2. Migrate campaign content (campaign.json)
    content_path = os.path.join(campaign_dir, "campaign.json")
    content = load_json(content_path)
    if content:
        # Convert anchor_runs to beats
        anchor_runs = content.pop("anchor_runs", [])
        if anchor_runs and "beats" not in content:
            beats = []
            for i, run in enumerate(anchor_runs):
                # Extract prerequisites from trigger
                prerequisites = []
                trigger = run.get("trigger", {})
                trigger_type = trigger.get("type", "start")
                trigger_value = trigger.get("value", "")

                unlocked_by = None
                if trigger_type == "after_run" and trigger_value:
                    prerequisites = [trigger_value]
                elif trigger_type == "after_runs_count":
                    unlocked_by = f"episode:{trigger_value}"
                elif trigger_type == "threat_stage":
                    pass  # No direct equivalent, leave as always available

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
            content["beats"] = beats
            print(f"  Beats: converted {len(anchor_runs)} anchor runs → {len(beats)} beats")

        # Remove filler_seeds
        content.pop("filler_seeds", None)

        # Update threat (remove advance_on)
        threat = content.get("threat", {})
        threat.pop("advance_on", None)
        if "advances_each_episode_unless_beat_hit" not in threat:
            threat["advances_each_episode_unless_beat_hit"] = True

        # Add unlocked_by to NPCs if missing
        for npc in content.get("npcs", []):
            if "unlocked_by" not in npc:
                npc["unlocked_by"] = None

        # Rename available_after_beat → unlocked_by on locations
        for loc in content.get("locations", []):
            if "available_after_beat" in loc:
                beat_id = loc.pop("available_after_beat")
                loc["unlocked_by"] = f"beat:{beat_id}" if beat_id else None
            elif "unlocked_by" not in loc:
                loc["unlocked_by"] = None

        # Add default character arcs if missing
        if "character_arcs" not in content or not content["character_arcs"]:
            content["character_arcs"] = DEFAULT_ARCS
            print(f"  Arcs: added {len(DEFAULT_ARCS)} default arcs")

        save_json(content_path, content)
        print(f"  Content: migrated successfully")

    # 3. Migrate campaign state (state.json)
    state_path = os.path.join(campaign_dir, "state.json")
    state = load_json(state_path)
    if state:
        # Convert runs_completed → episodes_completed
        if "runs_completed" in state:
            state["episodes_completed"] = state.pop("runs_completed")
        elif "episodes_completed" not in state:
            state["episodes_completed"] = 0

        # Convert anchor_runs_completed → beats_hit
        if "anchor_runs_completed" in state:
            state["beats_hit"] = state.pop("anchor_runs_completed")
        elif "beats_hit" not in state:
            state["beats_hit"] = []

        # Add beats_expired if missing
        if "beats_expired" not in state:
            state["beats_expired"] = []

        # Remove old fields
        state.pop("filler_seeds_used", None)
        state.pop("current_run_id", None)
        state.pop("current_run_type", None)

        # Add current_episode if missing
        if "current_episode" not in state:
            state["current_episode"] = None

        save_json(state_path, state)
        print(f"  State: migrated (episodes_completed={state['episodes_completed']}, beats_hit={len(state['beats_hit'])})")

    # 4. Migrate system config (system.json)
    system_path = os.path.join(campaign_dir, "system.json")
    system = load_json(system_path)
    if system:
        # Remove leveling
        system.pop("leveling", None)

        # Remove enemy_tiers from mechanics
        mechanics = system.get("mechanics", {})
        mechanics.pop("enemy_tiers", None)

        # Add unlocks to buildings if missing
        for building in system.get("buildings", []):
            if "unlocks" not in building:
                building["unlocks"] = ""

        # Remove magic resource if present (magic is now narrative)
        resources = system.get("resources", {})
        resources.pop("magic", None)

        save_json(system_path, system)
        print(f"  System: migrated")

    # 5. Clear active session
    session_path = os.path.join(campaign_dir, "current_session.json")
    save_json(session_path, {"active": False})
    print(f"  Session: cleared")

    # 6. Remove stash file
    stash_path = os.path.join(campaign_dir, "stash.json")
    if os.path.exists(stash_path):
        os.remove(stash_path)
        print(f"  Stash: removed")

    # 7. Migrate draft if exists
    draft_path = os.path.join(campaign_dir, "draft.json")
    draft = load_json(draft_path)
    if draft:
        draft_content = draft.get("content", draft)
        if isinstance(draft_content, dict):
            # Same migrations as content
            if "anchor_runs" in draft_content:
                anchor_runs = draft_content.pop("anchor_runs", [])
                if anchor_runs:
                    beats = []
                    for i, run in enumerate(anchor_runs):
                        prerequisites = []
                        trigger = run.get("trigger", {})
                        if trigger.get("type") == "after_run" and trigger.get("value"):
                            prerequisites = [trigger["value"]]
                        beat = {
                            "id": run.get("id", f"beat_{i+1}"),
                            "description": run.get("goal", run.get("hook", "")),
                            "hints": run.get("must_include", []),
                            "revelation": run.get("reveal", ""),
                            "prerequisites": prerequisites,
                            "unlocked_by": None,
                            "closes_after_episodes": None,
                            "is_finale": (i == len(anchor_runs) - 1)
                        }
                        beats.append(beat)
                    draft_content["beats"] = beats

            draft_content.pop("filler_seeds", None)
            threat = draft_content.get("threat", {})
            threat.pop("advance_on", None)

            for npc in draft_content.get("npcs", []):
                if "unlocked_by" not in npc:
                    npc["unlocked_by"] = None
            for loc in draft_content.get("locations", []):
                if "available_after_beat" in loc:
                    beat_id = loc.pop("available_after_beat")
                    loc["unlocked_by"] = f"beat:{beat_id}" if beat_id else None
                elif "unlocked_by" not in loc:
                    loc["unlocked_by"] = None

            if "character_arcs" not in draft_content:
                draft_content["character_arcs"] = DEFAULT_ARCS

            if "content" in draft:
                draft["content"] = draft_content
            else:
                draft = {"content": draft_content}
            save_json(draft_path, draft)
            print(f"  Draft: migrated")

    print(f"  Done!")


def main():
    campaigns_path = os.path.join(DATA_DIR, "campaigns.json")
    campaigns_data = load_json(campaigns_path)

    if not campaigns_data:
        print("No campaigns.json found. Nothing to migrate.")
        return

    campaigns = campaigns_data.get("campaigns", [])

    if len(sys.argv) > 1:
        # Migrate specific campaign
        campaign_id = sys.argv[1]
        campaign_dir = os.path.join(DATA_DIR, "campaigns", campaign_id)
        if os.path.exists(campaign_dir):
            migrate_campaign(campaign_dir, campaign_id)
        else:
            print(f"Campaign directory not found: {campaign_dir}")
    else:
        # Migrate all campaigns
        print(f"Found {len(campaigns)} campaigns to migrate.")
        for campaign in campaigns:
            campaign_id = campaign["id"]
            campaign_dir = os.path.join(DATA_DIR, "campaigns", campaign_id)
            if os.path.exists(campaign_dir):
                migrate_campaign(campaign_dir, campaign_id)
            else:
                print(f"  Skipping {campaign_id} — directory not found")

    print("\nMigration complete!")


if __name__ == "__main__":
    main()
