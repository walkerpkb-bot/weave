"""
Character CRUD routes
"""

from fastapi import APIRouter, HTTPException

from models import Character
from helpers import load_campaign_json, save_campaign_json

router = APIRouter()


@router.get("/campaigns/{campaign_id}/characters")
def get_characters(campaign_id: str):
    data = load_campaign_json(campaign_id, "roster.json")
    return data.get("characters", [])

@router.post("/campaigns/{campaign_id}/characters")
def create_character(campaign_id: str, character: Character):
    data = load_campaign_json(campaign_id, "roster.json")
    if "characters" not in data:
        data["characters"] = []

    # Generate ID
    char_id = f"char_{len(data['characters']) + 1:03d}"
    character.id = char_id

    data["characters"].append(character.dict())
    save_campaign_json(campaign_id, "roster.json", data)
    return character

@router.get("/campaigns/{campaign_id}/characters/{char_id}")
def get_character(campaign_id: str, char_id: str):
    data = load_campaign_json(campaign_id, "roster.json")
    for char in data.get("characters", []):
        if char["id"] == char_id:
            return char
    raise HTTPException(status_code=404, detail="Character not found")

@router.put("/campaigns/{campaign_id}/characters/{char_id}")
def update_character(campaign_id: str, char_id: str, updates: dict):
    """Update a character's stats, level, etc."""
    data = load_campaign_json(campaign_id, "roster.json")
    for i, char in enumerate(data.get("characters", [])):
        if char["id"] == char_id:
            # Apply updates
            for key, value in updates.items():
                if key == "stats" and isinstance(value, dict):
                    # Merge stats
                    char["stats"] = {**char.get("stats", {}), **value}
                else:
                    char[key] = value
            data["characters"][i] = char
            save_campaign_json(campaign_id, "roster.json", data)
            return char
    raise HTTPException(status_code=404, detail="Character not found")

@router.delete("/campaigns/{campaign_id}/characters/{char_id}")
def delete_character(campaign_id: str, char_id: str):
    data = load_campaign_json(campaign_id, "roster.json")
    data["characters"] = [c for c in data.get("characters", []) if c["id"] != char_id]
    save_campaign_json(campaign_id, "roster.json", data)
    return {"deleted": char_id}
