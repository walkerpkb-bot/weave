"""
Session CRUD and dice routes
"""

from fastapi import APIRouter, HTTPException

from models import SessionStart, SessionUpdate, SessionEnd, DiceRoll
from helpers import load_campaign_json, save_campaign_json

router = APIRouter()


@router.get("/campaigns/{campaign_id}/session")
def get_session(campaign_id: str):
    data = load_campaign_json(campaign_id, "current_session.json")
    if not data:
        return {"active": False}
    return data

@router.post("/campaigns/{campaign_id}/session/start")
def start_session(campaign_id: str, session: SessionStart):
    roster = load_campaign_json(campaign_id, "roster.json")

    # Build party from character IDs
    party = []
    for char_id in session.partyIds:
        for char in roster.get("characters", []):
            if char["id"] == char_id:
                party.append({
                    "characterId": char_id,
                    "name": char["name"],
                    "species": char["species"],
                    "stats": char["stats"],
                    "maxHearts": char["maxHearts"],
                    "maxThreads": char["maxThreads"],
                    "currentHearts": char["maxHearts"],
                    "currentThreads": char["maxThreads"],
                    "gear": char["gear"],
                    "conditions": []
                })
                break

    session_data = {
        "active": True,
        "runState": "hook",
        "quest": session.quest,
        "location": session.location,
        "roomNumber": 0,
        "roomsTotal": 4,
        "party": party,
        "enemies": [],
        "lootCollected": [],
        "log": []
    }

    save_campaign_json(campaign_id, "current_session.json", session_data)
    return session_data

@router.put("/campaigns/{campaign_id}/session/update")
def update_session(campaign_id: str, update: SessionUpdate):
    data = load_campaign_json(campaign_id, "current_session.json")
    if not data.get("active"):
        raise HTTPException(status_code=400, detail="No active session")

    if update.runState is not None:
        data["runState"] = update.runState
    if update.roomNumber is not None:
        data["roomNumber"] = update.roomNumber
    if update.party is not None:
        data["party"] = update.party
    if update.enemies is not None:
        data["enemies"] = update.enemies
    if update.lootCollected is not None:
        data["lootCollected"] = update.lootCollected

    save_campaign_json(campaign_id, "current_session.json", data)
    return data

@router.post("/campaigns/{campaign_id}/session/end")
def end_session(campaign_id: str, data: SessionEnd):
    """End session with outcome: 'victory', 'retreat', or 'failed'"""
    session = load_campaign_json(campaign_id, "current_session.json")
    roster = load_campaign_json(campaign_id, "roster.json")
    town = load_campaign_json(campaign_id, "town.json")
    outcome = data.outcome

    if outcome == "victory":
        # Award XP to party members
        for party_member in session.get("party", []):
            for char in roster.get("characters", []):
                if char["id"] == party_member["characterId"]:
                    char["xp"] = char.get("xp", 0) + 2  # 1 base + 1 victory bonus
                    break

        # Add loot to town treasury (simplified: assume loot is seeds)
        # In real implementation, parse loot items
        save_campaign_json(campaign_id, "roster.json", roster)

    elif outcome == "retreat":
        # Award partial XP
        for party_member in session.get("party", []):
            for char in roster.get("characters", []):
                if char["id"] == party_member["characterId"]:
                    char["xp"] = char.get("xp", 0) + 1
                    break
        save_campaign_json(campaign_id, "roster.json", roster)

    # Clear session
    save_campaign_json(campaign_id, "current_session.json", {"active": False})

    return {"outcome": outcome, "message": f"Run ended: {outcome}"}


# === Dice Endpoints ===

@router.post("/campaigns/{campaign_id}/dice/roll")
def log_dice_roll(campaign_id: str, roll: DiceRoll):
    """Log a dice roll and return the result with threshold check"""
    total = roll.result + roll.modifier

    # Check against thresholds for d20 rolls
    threshold_result = None
    if roll.dieType == "d20":
        if total >= 15:
            threshold_result = "success"
        elif total >= 10:
            threshold_result = "partial"
        else:
            threshold_result = "failure"

    # Log to session if active
    session = load_campaign_json(campaign_id, "current_session.json")
    if session.get("active"):
        log_entry = {
            "type": "roll",
            "die": roll.dieType,
            "result": roll.result,
            "modifier": roll.modifier,
            "total": total,
            "purpose": roll.purpose,
            "threshold": threshold_result
        }
        session.setdefault("log", []).append(log_entry)
        save_campaign_json(campaign_id, "current_session.json", session)

    return {
        "die": roll.dieType,
        "result": roll.result,
        "modifier": roll.modifier,
        "total": total,
        "threshold": threshold_result
    }
