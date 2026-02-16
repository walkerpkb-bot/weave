"""
DM message route, image generation helpers, and image serving routes
"""

import os
import re
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
import httpx
import anthropic
import replicate

from config import IMAGES_DIR
from models import DMMessage, ImageRequest
from helpers import load_campaign_json, save_campaign_json, get_campaign_images_dir
from campaign_schema import BLOOMBURROW_SYSTEM
from campaign_logic import (
    load_campaign_content,
    load_campaign_state,
    load_dm_prep_data,
    build_dm_context,
)
from dm_context_builder import (
    build_dm_system_injection,
    build_dm_system_prompt,
    build_rules_reference,
    build_lore_section,
)
from campaign_logic import get_available_beats

router = APIRouter()

# Default style for backwards compatibility
DEFAULT_ART_STYLE = "fantasy illustration, detailed, atmospheric lighting"


# === Image Generation Helpers ===

def craft_image_prompt(scene_description: str, session: dict) -> str:
    """Use Claude to craft an optimized image generation prompt"""
    party_info = ""
    if session.get("party"):
        party_info = ", ".join([f"{m['name']} (a {m['species'].lower()})" for m in session["party"]])

    location = session.get("location", "a woodland location")

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-3-5-haiku-latest",
            max_tokens=200,
            messages=[{
                "role": "user",
                "content": f"""Convert this scene description into an optimized image generation prompt.

Scene: {scene_description}
Location: {location}
Characters present: {party_info}

Rules:
- Output ONLY the prompt, nothing else
- 1-2 sentences max
- Focus on composition, lighting, mood, key visual elements
- Describe it as a rich, atmospheric fantasy illustration with earthy tones
- Include specific details about any characters (species, clothing, expressions)
- No action verbs - describe a frozen moment
- Be specific about colors and lighting"""
            }]
        )
        return response.content[0].text.strip()
    except Exception as e:
        print(f"Prompt crafting failed: {e}")
        return scene_description  # Fall back to original


def download_image(url: str, campaign_id: str = None) -> str:
    """Download image from URL and save locally, return local path"""
    try:
        response = httpx.get(url, timeout=30.0)
        response.raise_for_status()

        # Generate unique filename
        filename = f"{uuid.uuid4().hex}.webp"

        # Save to campaign-specific directory if campaign_id provided
        if campaign_id:
            images_dir = get_campaign_images_dir(campaign_id)
            os.makedirs(images_dir, exist_ok=True)
            filepath = os.path.join(images_dir, filename)
            url_path = f"/api/campaigns/{campaign_id}/images/{filename}"
        else:
            filepath = os.path.join(IMAGES_DIR, filename)
            url_path = f"/api/images/{filename}"

        with open(filepath, "wb") as f:
            f.write(response.content)

        return url_path
    except Exception as e:
        print(f"Failed to download image: {e}")
        return None

def generate_scene_image(scene_description: str, session: dict, campaign_id: str = None, art_style: str = None) -> tuple[str, str]:
    """Generate an image for a scene and return (local_URL, crafted_prompt)"""

    # First, craft an optimized prompt
    crafted_prompt = craft_image_prompt(scene_description, session)

    # Use provided art style or fall back to default
    style = art_style or "fantasy illustration, detailed, atmospheric lighting"

    # Add style prefix
    full_prompt = f"{style}, {crafted_prompt}"

    try:
        output = replicate.run(
            "black-forest-labs/flux-schnell",
            input={
                "prompt": full_prompt,
                "num_outputs": 1,
                "aspect_ratio": "16:9",
                "output_format": "webp",
                "output_quality": 80
            }
        )
        # Convert FileOutput to string URL and download locally
        if output and len(output) > 0:
            remote_url = str(output[0])
            local_url = download_image(remote_url, campaign_id)
            if local_url:
                return local_url, crafted_prompt
            # Fallback to remote URL if download fails
            return remote_url, crafted_prompt
        return None, crafted_prompt
    except Exception as e:
        print(f"Image generation failed: {e}")
        return None, crafted_prompt


# === DM Message Route ===

@router.post("/campaigns/{campaign_id}/dm/message")
def dm_message(campaign_id: str, msg: DMMessage):
    """Send a message to Claude as DM, get response"""

    # Load campaign system config
    system_config = load_campaign_json(campaign_id, "system.json")
    if not system_config:
        # Fall back to Bloomburrow for backwards compatibility
        system_config = BLOOMBURROW_SYSTEM

    # Build prompts from system config
    system_prompt = build_dm_system_prompt(system_config)
    rules = build_rules_reference(system_config)
    lore = build_lore_section(system_config)

    # Get current session
    session = load_campaign_json(campaign_id, "current_session.json")

    # Check for authored campaign content
    campaign_context_section = ""
    content = load_campaign_content(campaign_id)
    if content:
        state = load_campaign_state(campaign_id)

        # Load author notes for DM guidance
        prep_data = load_dm_prep_data(campaign_id)
        author_notes = []
        if prep_data.author_notes:
            author_notes.extend([n.dict() for n in prep_data.author_notes])
        if prep_data.pinned:
            author_notes.extend([n.dict() for n in prep_data.pinned])

        # Build episode details from current state
        episode_details = state.current_episode or {"description": "Freeform episode", "tone": content.tone}
        dm_context = build_dm_context(content, state, episode_details)
        campaign_context_section = build_dm_system_injection(dm_context, session, author_notes)

    # Get current state if requested (for freestyle campaigns or fallback)
    state_context = ""
    if msg.includeState and session.get("active") and not campaign_context_section:
        state_context = f"""
## Current Session State
- Run State: {session.get('runState', 'unknown')}
- Quest: {session.get('quest', 'none')}
- Location: {session.get('location', 'unknown')}
- Room: {session.get('roomNumber', 0)} of {session.get('roomsTotal', 4)}

## Party Status
"""
        for member in session.get("party", []):
            state_context += f"- {member['name']} ({member['species']}): {member['currentHearts']} Hearts, {member['currentThreads']} Threads\n"

        if session.get("enemies"):
            state_context += "\n## Current Enemies\n"
            for enemy in session["enemies"]:
                state_context += f"- {enemy['name']}: {enemy['currentHearts']}/{enemy['maxHearts']} Hearts\n"

        # Include previously generated images for context
        if session.get("images"):
            state_context += "\n## Previously Generated Scenes\n"
            for img in session.get("images", [])[-5:]:  # Last 5 images
                state_context += f"- {img.get('prompt', 'unknown scene')}\n"

    # Combine into full system prompt
    full_system = f"""{system_prompt}

{campaign_context_section}

{state_context}

## Rules Reference
{rules}

## World Lore (Brief)
{lore}
"""

    # Build conversation history from session log
    messages = []
    if session.get("active") and session.get("log"):
        for entry in session["log"]:
            if entry.get("type") == "chat":
                role = "user" if entry["role"] == "player" else "assistant"
                messages.append({"role": role, "content": entry["content"]})

    # Add current message, with illustration request if needed
    user_content = msg.message
    if msg.requestIllustration:
        user_content += "\n\n[Please include a vivid, painterly description of the scene in your response, and include a [SCENE: ...] tag with visual details for illustration.]"
    messages.append({"role": "user", "content": user_content})

    # Call Claude API
    try:
        client = anthropic.Anthropic()  # Uses ANTHROPIC_API_KEY env var

        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=full_system,
            messages=messages
        )

        dm_response = response.content[0].text
        image_url = None

        # Get art style from system config
        art_style = system_config.get("art_style", "fantasy illustration, detailed, atmospheric lighting")

        # Check for [SCENE: ...] tag and generate image
        scene_match = re.search(r'\[SCENE:\s*(.+?)\]', dm_response, re.IGNORECASE | re.DOTALL)
        if scene_match:
            scene_description = scene_match.group(1).strip()
            image_url, crafted_prompt = generate_scene_image(scene_description, session, campaign_id, art_style)

            # Store image in session
            if image_url and session.get("active"):
                session.setdefault("images", []).append({
                    "url": image_url,
                    "prompt": crafted_prompt
                })
                session["currentImage"] = image_url

            # Remove the [SCENE:] tag from the response shown to users
            dm_response_clean = re.sub(r'\[SCENE:\s*.+?\]', '', dm_response, flags=re.IGNORECASE | re.DOTALL).strip()
        else:
            dm_response_clean = dm_response
            # If illustration was requested but no SCENE tag, generate from first paragraph
            if msg.requestIllustration and session.get("active"):
                # Use first paragraph as scene description
                first_para = dm_response.split('\n\n')[0][:500]
                image_url, crafted_prompt = generate_scene_image(first_para, session, campaign_id, art_style)
                if image_url:
                    session.setdefault("images", []).append({
                        "url": image_url,
                        "prompt": crafted_prompt
                    })
                    session["currentImage"] = image_url

        # Check for [PHASE: ...] tag and update session
        phase_match = re.search(r'\[PHASE:\s*(\w+)\]', dm_response, re.IGNORECASE)
        if phase_match and session.get("active"):
            new_phase = phase_match.group(1).strip().lower()
            session["runState"] = new_phase
            # Remove tag from response
            dm_response_clean = re.sub(r'\[PHASE:\s*\w+\]', '', dm_response_clean, flags=re.IGNORECASE).strip()

        # Check for [ROOM: ...] tag and update session
        room_match = re.search(r'\[ROOM:\s*(\d+)\]', dm_response, re.IGNORECASE)
        if room_match and session.get("active"):
            new_room = int(room_match.group(1))
            session["roomNumber"] = new_room
            # Remove tag from response
            dm_response_clean = re.sub(r'\[ROOM:\s*\d+\]', '', dm_response_clean, flags=re.IGNORECASE).strip()

        # Log to session
        if session.get("active"):
            session.setdefault("log", []).append({
                "type": "chat",
                "role": "player",
                "content": msg.message
            })
            session.setdefault("log", []).append({
                "type": "chat",
                "role": "dm",
                "content": dm_response_clean
            })
            save_campaign_json(campaign_id, "current_session.json", session)

        return {
            "response": dm_response_clean,
            "image_url": image_url
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


# === Image Generation Routes ===

@router.post("/campaigns/{campaign_id}/image/generate")
def generate_image(campaign_id: str, request: ImageRequest):
    """Generate an image using Replicate Flux"""

    # Load campaign system config for art style
    system_config = load_campaign_json(campaign_id, "system.json")
    art_style = system_config.get("art_style", DEFAULT_ART_STYLE) if system_config else DEFAULT_ART_STYLE

    # Build the full prompt with style
    if request.style == "scene":
        full_prompt = f"{art_style}, scenic landscape view, {request.prompt}"
    elif request.style == "character":
        full_prompt = f"{art_style}, character portrait, {request.prompt}"
    elif request.style == "enemy":
        full_prompt = f"{art_style}, creature design, slightly menacing but not scary, {request.prompt}"
    else:
        full_prompt = f"{art_style}, {request.prompt}"

    try:
        output = replicate.run(
            "black-forest-labs/flux-schnell",
            input={
                "prompt": full_prompt,
                "num_outputs": 1,
                "aspect_ratio": "16:9",
                "output_format": "webp",
                "output_quality": 80
            }
        )

        # Flux returns a list of URLs - download to campaign directory
        if output and len(output) > 0:
            remote_url = str(output[0])
            local_url = download_image(remote_url, campaign_id)
            return {"image_url": local_url or remote_url, "prompt": full_prompt}

        return {"image_url": None, "prompt": full_prompt}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image generation error: {str(e)}")


@router.get("/campaigns/{campaign_id}/images/{filename}")
def get_campaign_image(campaign_id: str, filename: str):
    """Serve images from a campaign's images directory"""
    filepath = os.path.join(get_campaign_images_dir(campaign_id), filename)
    if os.path.exists(filepath):
        return FileResponse(filepath, media_type="image/webp")
    raise HTTPException(status_code=404, detail="Image not found")
