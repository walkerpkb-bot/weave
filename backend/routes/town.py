"""
Town and stash routes
"""

from fastapi import APIRouter

from models import TownUpdate
from helpers import load_campaign_json, save_campaign_json

router = APIRouter()


# === Town Endpoints ===

@router.get("/campaigns/{campaign_id}/town")
def get_town(campaign_id: str):
    data = load_campaign_json(campaign_id, "town.json")
    if not data:
        data = {
            "name": "",
            "seeds": 0,
            "buildings": {
                "generalStore": True,
                "blacksmith": False,
                "weaversHut": False,
                "inn": False,
                "shrine": False,
                "watchtower": False,
                "garden": False
            }
        }
        save_campaign_json(campaign_id, "town.json", data)
    return data

@router.put("/campaigns/{campaign_id}/town")
def update_town(campaign_id: str, update: TownUpdate):
    data = load_campaign_json(campaign_id, "town.json")
    if update.name is not None:
        data["name"] = update.name
    if update.seeds is not None:
        data["seeds"] = update.seeds
    if update.buildings is not None:
        data["buildings"].update(update.buildings)
    save_campaign_json(campaign_id, "town.json", data)
    return data


# === Stash Endpoints ===

@router.get("/campaigns/{campaign_id}/stash")
def get_stash(campaign_id: str):
    data = load_campaign_json(campaign_id, "stash.json")
    return data.get("items", [])

@router.put("/campaigns/{campaign_id}/stash")
def update_stash(campaign_id: str, items: list):
    save_campaign_json(campaign_id, "stash.json", {"items": items})
    return {"items": items}
