"""
File I/O and campaign data helpers
"""

import json
import os

from config import DATA_DIR, PROMPTS_DIR


def load_json(filename: str) -> dict:
    filepath = os.path.join(DATA_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return json.load(f)
    return {}

def save_json(filename: str, data: dict):
    filepath = os.path.join(DATA_DIR, filename)
    temp_filepath = filepath + ".tmp"
    # Atomic write: write to temp file, then rename
    with open(temp_filepath, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(temp_filepath, filepath)

def load_prompt(filename: str) -> str:
    filepath = os.path.join(PROMPTS_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return f.read()
    return ""


# === Campaign File Management ===

def get_campaign_dir(campaign_id: str) -> str:
    """Get the data directory path for a campaign"""
    return os.path.join(DATA_DIR, "campaigns", campaign_id)

def load_campaign_json(campaign_id: str, filename: str) -> dict:
    """Load JSON from a campaign's data directory"""
    filepath = os.path.join(get_campaign_dir(campaign_id), filename)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            return json.load(f)
    return {}

def save_campaign_json(campaign_id: str, filename: str, data: dict):
    """Save JSON to a campaign's data directory"""
    campaign_dir = get_campaign_dir(campaign_id)
    os.makedirs(campaign_dir, exist_ok=True)
    filepath = os.path.join(campaign_dir, filename)
    temp_filepath = filepath + ".tmp"
    with open(temp_filepath, "w") as f:
        json.dump(data, f, indent=2)
    os.replace(temp_filepath, filepath)

def get_campaign_images_dir(campaign_id: str) -> str:
    """Get the images directory path for a campaign"""
    return os.path.join(get_campaign_dir(campaign_id), "images")
