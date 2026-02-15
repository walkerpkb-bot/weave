"""
Template listing routes
"""

import json
import os

from fastapi import APIRouter, HTTPException

from config import TEMPLATES_DIR

router = APIRouter()


@router.get("/templates")
def get_templates():
    """List all available system templates"""
    templates = []
    if os.path.exists(TEMPLATES_DIR):
        for filename in os.listdir(TEMPLATES_DIR):
            if filename.endswith('.json'):
                filepath = os.path.join(TEMPLATES_DIR, filename)
                try:
                    with open(filepath, 'r') as f:
                        template = json.load(f)
                        templates.append({
                            "id": template.get("id", filename.replace(".json", "")),
                            "name": template.get("name", filename),
                            "description": template.get("description", "")
                        })
                except:
                    pass
    return {"templates": templates}


@router.get("/templates/{template_id}")
def get_template(template_id: str):
    """Get a specific system template"""
    filepath = os.path.join(TEMPLATES_DIR, f"{template_id}.json")
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    raise HTTPException(status_code=404, detail="Template not found")
