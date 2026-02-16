"""
Generate-fields routes: AI-powered field generation for campaign content
"""

import json
import re

from fastapi import APIRouter, HTTPException
import anthropic

from models import GenerateFieldsRequest
from helpers import load_campaign_json
from campaign_schema import BLOOMBURROW_SYSTEM

router = APIRouter()


def _build_generate_prompt(content: dict, generate: dict, species: list, tags: list, lore: str, tone: str) -> str:
    """Build Claude prompt from partial content + flagged fields + constraints"""
    prompt = "You are a campaign content generator for a tabletop RPG authoring tool.\n\n"

    if lore:
        prompt += f"## World Lore\n{lore}\n\n"
    if tone:
        prompt += f"## DM Tone\n{tone}\n\n"

    prompt += "## Existing Campaign Content (for context)\n"
    prompt += json.dumps(content, indent=2, default=str) + "\n\n"

    if species:
        prompt += f"## Available Species\nOnly use these species: {', '.join(species)}\n\n"
    if tags:
        prompt += f"## Available Location Tags\nOnly use these tags: {', '.join(tags)}\n\n"

    prompt += "## Fields to Generate\n"
    prompt += "Generate ONLY the fields marked below. Return a JSON object with the same structure.\n\n"

    sections = []

    # Threat
    if generate.get("threat"):
        threat_fields = generate["threat"]
        fields_list = [f for f, v in threat_fields.items() if v]
        if fields_list:
            sections.append(f"### Threat\nGenerate these fields: {', '.join(fields_list)}")

    # NPCs
    if generate.get("npcs"):
        for i, npc_gen in enumerate(generate["npcs"]):
            fields_list = [f for f, v in npc_gen.items() if v]
            if fields_list:
                existing = content.get("npcs", [{}] * (i + 1))[i] if i < len(content.get("npcs", [])) else {}
                sections.append(f"### NPC {i} (existing: {json.dumps(existing, default=str)})\nGenerate: {', '.join(fields_list)}")

    # Locations
    if generate.get("locations"):
        for i, loc_gen in enumerate(generate["locations"]):
            fields_list = [f for f, v in loc_gen.items() if v]
            if fields_list:
                existing = content.get("locations", [{}] * (i + 1))[i] if i < len(content.get("locations", [])) else {}
                sections.append(f"### Location {i} (existing: {json.dumps(existing, default=str)})\nGenerate: {', '.join(fields_list)}")

    # Anchor runs
    if generate.get("anchor_runs"):
        for i, run_gen in enumerate(generate["anchor_runs"]):
            fields_list = [f for f, v in run_gen.items() if v]
            if fields_list:
                existing = content.get("anchor_runs", [{}] * (i + 1))[i] if i < len(content.get("anchor_runs", [])) else {}
                sections.append(f"### Anchor Run {i} (existing: {json.dumps(existing, default=str)})\nGenerate: {', '.join(fields_list)}")

    # Character arcs
    if generate.get("character_arcs"):
        for i, arc_gen in enumerate(generate["character_arcs"]):
            fields_list = [f for f, v in arc_gen.items() if v]
            if fields_list:
                existing = content.get("character_arcs", [{}] * (i + 1))[i] if i < len(content.get("character_arcs", [])) else {}
                sections.append(f"### Character Arc {i} (existing: {json.dumps(existing, default=str)})\nGenerate: {', '.join(fields_list)}")

    prompt += "\n".join(sections) + "\n\n"

    prompt += """## Output Format
Return ONLY a JSON object with this structure (include only sections that have fields to generate):
{
  "threat": {"name": "...", "stages": ["..."]},
  "npcs": [{"name": "...", "species": "...", "role": "...", "wants": "...", "secret": "..."}],
  "locations": [{"name": "...", "vibe": "...", "contains": ["tag1"]}],
  "anchor_runs": [{"id": "...", "hook": "...", "goal": "...", "reveal": "..."}],
  "character_arcs": [{"id": "...", "name": "...", "milestones": ["..."], "reward_name": "...", "reward_description": "..."}]
}

For array sections (npcs, locations, anchor_runs, character_arcs), use the same indices as the input.
Only include fields you were asked to generate. Use null for indices that don't need generation.

Rules:
- IDs must be lowercase with underscores only (e.g., "brave_path")
- Keep names under 50 characters
- Keep descriptions concise but evocative
- Stages should be 5-150 characters each
- Milestones should be clear, achievable goals
- Be creative but consistent with existing content tone
"""

    return prompt


def _validate_generated(result: dict, species: list, tags: list, existing_ids: set) -> dict:
    """Constrain output: species from list, tags from list, IDs snake_case + unique, strings truncated"""
    id_pattern = re.compile(r'^[a-z][a-z0-9_]*$')

    # Validate threat
    if "threat" in result:
        t = result["threat"]
        if "name" in t and isinstance(t["name"], str):
            t["name"] = t["name"][:50]
        if "stages" in t and isinstance(t["stages"], list):
            t["stages"] = [s[:150] for s in t["stages"] if isinstance(s, str) and len(s) >= 5]

    # Validate NPCs
    if "npcs" in result:
        for npc in result["npcs"]:
            if npc is None:
                continue
            if "name" in npc and isinstance(npc["name"], str):
                npc["name"] = npc["name"][:50]
            if "species" in npc and species:
                if npc["species"] not in species:
                    npc["species"] = species[0]
            if "role" in npc and isinstance(npc["role"], str):
                npc["role"] = npc["role"][:100]
            if "wants" in npc and isinstance(npc["wants"], str):
                npc["wants"] = npc["wants"][:200]
            if "secret" in npc and isinstance(npc["secret"], str):
                npc["secret"] = npc["secret"][:300]

    # Validate locations
    if "locations" in result:
        for loc in result["locations"]:
            if loc is None:
                continue
            if "name" in loc and isinstance(loc["name"], str):
                loc["name"] = loc["name"][:50]
            if "vibe" in loc and isinstance(loc["vibe"], str):
                loc["vibe"] = loc["vibe"][:200]
            if "contains" in loc and tags:
                loc["contains"] = [t for t in loc["contains"] if t in tags]

    # Validate anchor runs
    if "anchor_runs" in result:
        for run in result["anchor_runs"]:
            if run is None:
                continue
            if "id" in run and isinstance(run["id"], str):
                run_id = run["id"][:30].lower().replace(" ", "_")
                run_id = re.sub(r'[^a-z0-9_]', '', run_id)
                if not id_pattern.match(run_id):
                    run_id = "run_" + run_id
                while run_id in existing_ids:
                    run_id = run_id + "_1"
                run["id"] = run_id
                existing_ids.add(run_id)
            if "hook" in run and isinstance(run["hook"], str):
                run["hook"] = run["hook"][:300]
            if "goal" in run and isinstance(run["goal"], str):
                run["goal"] = run["goal"][:200]
            if "reveal" in run and isinstance(run["reveal"], str):
                run["reveal"] = run["reveal"][:300]

    # Validate character arcs
    if "character_arcs" in result:
        for arc in result["character_arcs"]:
            if arc is None:
                continue
            if "id" in arc and isinstance(arc["id"], str):
                arc_id = arc["id"][:30].lower().replace(" ", "_")
                arc_id = re.sub(r'[^a-z0-9_]', '', arc_id)
                if not id_pattern.match(arc_id):
                    arc_id = "arc_" + arc_id
                while arc_id in existing_ids:
                    arc_id = arc_id + "_1"
                arc["id"] = arc_id
                existing_ids.add(arc_id)
            if "name" in arc and isinstance(arc["name"], str):
                arc["name"] = arc["name"][:50]
            if "milestones" in arc and isinstance(arc["milestones"], list):
                arc["milestones"] = [m[:200] for m in arc["milestones"] if isinstance(m, str)]
            if "reward_name" in arc and isinstance(arc["reward_name"], str):
                arc["reward_name"] = arc["reward_name"][:50]
            if "reward_description" in arc and isinstance(arc["reward_description"], str):
                arc["reward_description"] = arc["reward_description"][:200]

    return result


@router.post("/campaigns/{campaign_id}/generate-fields")
def generate_fields_for_campaign(campaign_id: str, req: GenerateFieldsRequest):
    """Generate AI content for flagged fields within an existing campaign"""
    # Load system config for lore/tone
    system_config = load_campaign_json(campaign_id, "system.json")
    if not system_config:
        system_config = BLOOMBURROW_SYSTEM

    lore = system_config.get("lore", "")
    tone = system_config.get("dm_tone", "")

    # Get available species/tags from system config
    species = req.available_species or [s["name"] for s in system_config.get("species", [])]
    tags = req.available_tags or [t["value"] for t in system_config.get("location_tags", [])]

    # Collect existing IDs for uniqueness check
    existing_ids = set()
    for run in req.content.get("anchor_runs", []):
        if run.get("id"):
            existing_ids.add(run["id"])
    for arc in req.content.get("character_arcs", []):
        if arc.get("id"):
            existing_ids.add(arc["id"])

    prompt = _build_generate_prompt(req.content, req.generate, species, tags, lore, tone)

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text.strip()
        # Extract JSON from response (handle markdown code blocks)
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(1)

        result = json.loads(response_text)
        validated = _validate_generated(result, species, tags, existing_ids)
        return {"generated": validated}

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation error: {str(e)}")


@router.post("/generate-fields")
def generate_fields_standalone(req: GenerateFieldsRequest):
    """Generate AI content for flagged fields (standalone, no campaign context)"""
    species = req.available_species
    tags = req.available_tags

    existing_ids = set()
    for run in req.content.get("anchor_runs", []):
        if run.get("id"):
            existing_ids.add(run["id"])
    for arc in req.content.get("character_arcs", []):
        if arc.get("id"):
            existing_ids.add(arc["id"])

    prompt = _build_generate_prompt(req.content, req.generate, species, tags, "", "")

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )

        response_text = response.content[0].text.strip()
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response_text, re.DOTALL)
        if json_match:
            response_text = json_match.group(1)

        result = json.loads(response_text)
        validated = _validate_generated(result, species, tags, existing_ids)
        return {"generated": validated}

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse AI response: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation error: {str(e)}")
