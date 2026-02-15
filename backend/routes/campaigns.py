"""
Campaign CRUD, select, banner, and system config routes
"""

import json
import os
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from config import TEMPLATES_DIR
from models import CampaignCreate, CampaignUpdate
from helpers import load_json, save_json, load_campaign_json, save_campaign_json, get_campaign_dir
from campaign_schema import CampaignSystem, BLOOMBURROW_SYSTEM, DEFAULT_SYSTEM

router = APIRouter()


@router.get("/campaigns/{campaign_id}/system")
def get_campaign_system(campaign_id: str):
    """Get the system configuration for a campaign"""
    # First check if campaign has a custom system
    system = load_campaign_json(campaign_id, "system.json")
    if system:
        return system

    # Fall back to Bloomburrow default for backwards compatibility
    return BLOOMBURROW_SYSTEM


@router.put("/campaigns/{campaign_id}/system")
def update_campaign_system(campaign_id: str, system: dict):
    """Update the system configuration for a campaign"""
    # Validate the system config
    try:
        CampaignSystem(**system)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid system config: {str(e)}")

    save_campaign_json(campaign_id, "system.json", system)
    return {"success": True}


@router.get("/campaigns")
def get_campaigns():
    """Get all campaigns with summary stats"""
    data = load_json("campaigns.json")
    if not data:
        # No campaigns yet, return empty
        return {"activeCampaignId": None, "campaigns": []}

    campaigns = []
    for campaign in data.get("campaigns", []):
        # Load campaign-specific data for stats
        roster = load_campaign_json(campaign["id"], "roster.json")
        town = load_campaign_json(campaign["id"], "town.json")

        campaigns.append({
            **campaign,
            "characterCount": len(roster.get("characters", [])),
            "currencyAmount": town.get("seeds", 0)
        })

    return {
        "activeCampaignId": data.get("activeCampaignId"),
        "campaigns": campaigns
    }

@router.get("/campaigns/{campaign_id}")
def get_campaign(campaign_id: str):
    """Get a specific campaign"""
    data = load_json("campaigns.json")
    for campaign in data.get("campaigns", []):
        if campaign["id"] == campaign_id:
            # Add stats
            roster = load_campaign_json(campaign_id, "roster.json")
            town = load_campaign_json(campaign_id, "town.json")
            return {
                **campaign,
                "characterCount": len(roster.get("characters", [])),
                "currencyAmount": town.get("seeds", 0)
            }
    raise HTTPException(status_code=404, detail="Campaign not found")

@router.post("/campaigns")
def create_campaign(campaign: CampaignCreate):
    """Create a new campaign"""
    data = load_json("campaigns.json")
    if not data:
        data = {"activeCampaignId": None, "campaigns": []}

    # Generate ID from name
    campaign_id = re.sub(r'[^a-z0-9]', '_', campaign.name.lower())
    campaign_id = f"{campaign_id}_{uuid.uuid4().hex[:6]}"

    # Load system config from template or use default
    system_config = None
    if campaign.template_id:
        template_path = os.path.join(TEMPLATES_DIR, f"{campaign.template_id}.json")
        if os.path.exists(template_path):
            with open(template_path, 'r') as f:
                template = json.load(f)
                system_config = template.get("system", BLOOMBURROW_SYSTEM)
        else:
            # Fall back to default if template not found
            system_config = DEFAULT_SYSTEM
    else:
        # No template specified, use Bloomburrow as default
        system_config = BLOOMBURROW_SYSTEM

    # Create campaign data directory
    campaign_dir = get_campaign_dir(campaign_id)
    os.makedirs(campaign_dir, exist_ok=True)
    os.makedirs(os.path.join(campaign_dir, "images"), exist_ok=True)

    # Initialize buildings from system config
    buildings_init = {}
    for i, building in enumerate(system_config.get("buildings", [])):
        # First building is free (unlocked by default)
        buildings_init[building["key"]] = (building.get("cost", 0) == 0)

    # Get currency config
    currency_config = system_config.get("currency", {"name": "Gold", "symbol": "\U0001fa99", "starting": 0})

    # Initialize campaign data files
    save_campaign_json(campaign_id, "roster.json", {"characters": []})
    save_campaign_json(campaign_id, "town.json", {
        "name": "",
        "currency": currency_config.get("starting", 0),
        "buildings": buildings_init
    })
    save_campaign_json(campaign_id, "stash.json", {"items": []})
    save_campaign_json(campaign_id, "current_session.json", {"active": False})
    save_campaign_json(campaign_id, "system.json", system_config)

    # Add to campaigns list
    now = datetime.utcnow().isoformat() + "Z"
    new_campaign = {
        "id": campaign_id,
        "name": campaign.name,
        "description": campaign.description,
        "bannerImage": None,
        "currencyName": campaign.currencyName,
        "lastPlayed": None,
        "createdAt": now,
        "isDraft": True  # New campaigns start as drafts
    }
    data["campaigns"].append(new_campaign)
    save_json("campaigns.json", data)

    return {**new_campaign, "characterCount": 0, "currencyAmount": 0}

@router.put("/campaigns/{campaign_id}")
def update_campaign(campaign_id: str, update: CampaignUpdate):
    """Update campaign metadata"""
    data = load_json("campaigns.json")

    for i, campaign in enumerate(data.get("campaigns", [])):
        if campaign["id"] == campaign_id:
            if update.name is not None:
                campaign["name"] = update.name
            if update.description is not None:
                campaign["description"] = update.description
            if update.currencyName is not None:
                campaign["currencyName"] = update.currencyName
            data["campaigns"][i] = campaign
            save_json("campaigns.json", data)
            return campaign

    raise HTTPException(status_code=404, detail="Campaign not found")

@router.delete("/campaigns/{campaign_id}")
def delete_campaign(campaign_id: str):
    """Delete a campaign and its data"""
    import shutil

    data = load_json("campaigns.json")

    # Find and remove campaign from list
    original_length = len(data.get("campaigns", []))
    data["campaigns"] = [c for c in data.get("campaigns", []) if c["id"] != campaign_id]

    if len(data["campaigns"]) == original_length:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # If deleted campaign was active, clear active
    if data.get("activeCampaignId") == campaign_id:
        data["activeCampaignId"] = None

    save_json("campaigns.json", data)

    # Delete campaign data directory
    campaign_dir = get_campaign_dir(campaign_id)
    if os.path.exists(campaign_dir):
        shutil.rmtree(campaign_dir)

    return {"deleted": campaign_id}

@router.put("/campaigns/{campaign_id}/select")
def select_campaign(campaign_id: str):
    """Set the active campaign and update lastPlayed"""
    data = load_json("campaigns.json")

    found = False
    for campaign in data.get("campaigns", []):
        if campaign["id"] == campaign_id:
            campaign["lastPlayed"] = datetime.utcnow().isoformat() + "Z"
            found = True
            break

    if not found:
        raise HTTPException(status_code=404, detail="Campaign not found")

    data["activeCampaignId"] = campaign_id
    save_json("campaigns.json", data)
    return {"activeCampaignId": campaign_id}

@router.post("/campaigns/{campaign_id}/banner")
async def upload_campaign_banner(campaign_id: str, file: UploadFile = File(...)):
    """Upload a banner image for a campaign"""
    data = load_json("campaigns.json")

    # Find campaign
    campaign_idx = None
    for i, campaign in enumerate(data.get("campaigns", [])):
        if campaign["id"] == campaign_id:
            campaign_idx = i
            break

    if campaign_idx is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Use JPEG, PNG, WebP, or GIF.")

    # Create campaign directory if needed
    campaign_dir = get_campaign_dir(campaign_id)
    os.makedirs(campaign_dir, exist_ok=True)

    # Determine file extension
    ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
    ext = ext_map.get(file.content_type, ".jpg")

    # Save as banner file (overwrite existing)
    banner_path = os.path.join(campaign_dir, f"banner{ext}")

    # Remove old banner if exists with different extension
    for old_ext in [".jpg", ".png", ".webp", ".gif"]:
        old_path = os.path.join(campaign_dir, f"banner{old_ext}")
        if old_path != banner_path and os.path.exists(old_path):
            os.remove(old_path)

    # Write new banner
    content = await file.read()
    with open(banner_path, "wb") as f:
        f.write(content)

    # Update campaign metadata
    banner_url = f"/api/campaigns/{campaign_id}/banner"
    data["campaigns"][campaign_idx]["bannerImage"] = banner_url
    save_json("campaigns.json", data)

    return {"bannerImage": banner_url}

@router.get("/campaigns/{campaign_id}/banner")
def get_campaign_banner(campaign_id: str):
    """Serve a campaign's banner image"""
    campaign_dir = get_campaign_dir(campaign_id)

    # Check for banner with any supported extension
    for ext in [".jpg", ".png", ".webp", ".gif"]:
        banner_path = os.path.join(campaign_dir, f"banner{ext}")
        if os.path.exists(banner_path):
            media_types = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}
            return FileResponse(banner_path, media_type=media_types[ext])

    raise HTTPException(status_code=404, detail="Banner not found")
