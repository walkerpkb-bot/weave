"""
DM Prep notes, pins, conversation, and coach message routes
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
import anthropic

from models import DMPrepMessageRequest, DMPrepNoteCreate, DMPrepNoteUpdate, DMPrepPinRequest
from helpers import load_campaign_json
from campaign_schema import DMPrepNote, BLOOMBURROW_SYSTEM
from campaign_logic import (
    load_campaign_content,
    load_campaign_state,
    load_dm_prep_data,
    save_dm_prep_data,
)
from prep_coach_builder import build_prep_coach_system_prompt, build_prep_coach_context

router = APIRouter()


@router.get("/campaigns/{campaign_id}/dm-prep")
def get_dm_prep(campaign_id: str):
    """Get all DM prep data for a campaign"""
    prep_data = load_dm_prep_data(campaign_id)
    # Update last accessed
    prep_data.last_accessed = datetime.utcnow().isoformat() + "Z"
    save_dm_prep_data(campaign_id, prep_data)
    return prep_data.dict()


@router.post("/campaigns/{campaign_id}/dm-prep/message")
def dm_prep_message(campaign_id: str, request: DMPrepMessageRequest):
    """Send a message to the Prep Coach AI"""
    # Load system config
    system_config = load_campaign_json(campaign_id, "system.json")
    if not system_config:
        system_config = BLOOMBURROW_SYSTEM

    # Load campaign content
    content = load_campaign_content(campaign_id)
    content_dict = content.dict() if content else None

    # Load campaign state
    state = load_campaign_state(campaign_id)
    state_dict = state.dict() if state else None

    # Load existing prep data
    prep_data = load_dm_prep_data(campaign_id)

    # Build system prompt and context
    system_prompt = build_prep_coach_system_prompt(system_config)
    context = build_prep_coach_context(content_dict, state_dict, prep_data.dict(), system_config)

    full_system = f"{system_prompt}\n\n---\n\n{context}" if context else system_prompt

    # Build messages from conversation history
    messages = []
    for msg in prep_data.conversation:
        messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})

    # Add new user message
    messages.append({"role": "user", "content": request.message})

    # Call Claude API
    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=full_system,
            messages=messages
        )

        assistant_response = response.content[0].text

        # Update conversation history
        prep_data.conversation.append({"role": "user", "content": request.message})
        prep_data.conversation.append({"role": "assistant", "content": assistant_response})
        prep_data.last_accessed = datetime.utcnow().isoformat() + "Z"
        save_dm_prep_data(campaign_id, prep_data)

        return {"response": assistant_response}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI error: {str(e)}")


@router.post("/campaigns/{campaign_id}/dm-prep/note")
def create_dm_prep_note(campaign_id: str, request: DMPrepNoteCreate):
    """Create a new author note"""
    prep_data = load_dm_prep_data(campaign_id)

    # Generate unique ID
    note_id = f"note_{uuid.uuid4().hex[:8]}"

    note = DMPrepNote(
        id=note_id,
        content=request.content,
        category=request.category,
        related_to=request.related_to,
        created_at=datetime.utcnow().isoformat() + "Z"
    )

    prep_data.author_notes.append(note)
    prep_data.last_accessed = datetime.utcnow().isoformat() + "Z"
    save_dm_prep_data(campaign_id, prep_data)

    return note.dict()


@router.put("/campaigns/{campaign_id}/dm-prep/note/{note_id}")
def update_dm_prep_note(campaign_id: str, note_id: str, request: DMPrepNoteUpdate):
    """Update an existing author note"""
    prep_data = load_dm_prep_data(campaign_id)

    # Find and update the note
    for i, note in enumerate(prep_data.author_notes):
        if note.id == note_id:
            if request.content is not None:
                prep_data.author_notes[i].content = request.content
            if request.category is not None:
                prep_data.author_notes[i].category = request.category
            if request.related_to is not None:
                prep_data.author_notes[i].related_to = request.related_to

            prep_data.last_accessed = datetime.utcnow().isoformat() + "Z"
            save_dm_prep_data(campaign_id, prep_data)
            return prep_data.author_notes[i].dict()

    raise HTTPException(status_code=404, detail="Note not found")


@router.delete("/campaigns/{campaign_id}/dm-prep/note/{note_id}")
def delete_dm_prep_note(campaign_id: str, note_id: str):
    """Delete an author note"""
    prep_data = load_dm_prep_data(campaign_id)

    # Find and remove the note
    original_count = len(prep_data.author_notes)
    prep_data.author_notes = [n for n in prep_data.author_notes if n.id != note_id]

    if len(prep_data.author_notes) == original_count:
        raise HTTPException(status_code=404, detail="Note not found")

    prep_data.last_accessed = datetime.utcnow().isoformat() + "Z"
    save_dm_prep_data(campaign_id, prep_data)
    return {"deleted": note_id}


@router.post("/campaigns/{campaign_id}/dm-prep/pin")
def pin_dm_prep_insight(campaign_id: str, request: DMPrepPinRequest):
    """Pin an insight from conversation as a note"""
    prep_data = load_dm_prep_data(campaign_id)

    # Generate unique ID
    pin_id = f"pin_{uuid.uuid4().hex[:8]}"

    pinned_note = DMPrepNote(
        id=pin_id,
        content=request.content,
        category=request.category,
        related_to=request.related_to,
        created_at=datetime.utcnow().isoformat() + "Z"
    )

    prep_data.pinned.append(pinned_note)
    prep_data.last_accessed = datetime.utcnow().isoformat() + "Z"
    save_dm_prep_data(campaign_id, prep_data)

    return pinned_note.dict()


@router.delete("/campaigns/{campaign_id}/dm-prep/pin/{pin_id}")
def delete_dm_prep_pin(campaign_id: str, pin_id: str):
    """Delete a pinned insight"""
    prep_data = load_dm_prep_data(campaign_id)

    # Find and remove the pin
    original_count = len(prep_data.pinned)
    prep_data.pinned = [p for p in prep_data.pinned if p.id != pin_id]

    if len(prep_data.pinned) == original_count:
        raise HTTPException(status_code=404, detail="Pinned note not found")

    prep_data.last_accessed = datetime.utcnow().isoformat() + "Z"
    save_dm_prep_data(campaign_id, prep_data)
    return {"deleted": pin_id}


@router.delete("/campaigns/{campaign_id}/dm-prep/conversation")
def clear_dm_prep_conversation(campaign_id: str):
    """Clear the prep coach conversation history"""
    prep_data = load_dm_prep_data(campaign_id)
    prep_data.conversation = []
    prep_data.last_accessed = datetime.utcnow().isoformat() + "Z"
    save_dm_prep_data(campaign_id, prep_data)
    return {"success": True}
