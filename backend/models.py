"""
Pydantic request/response models for API endpoints
"""

from pydantic import BaseModel
from typing import Optional, List


class Character(BaseModel):
    id: Optional[str] = None
    name: str
    species: str
    level: int = 1
    xp: int = 0
    stats: dict  # {"brave": 2, "clever": 2, "kind": 1}
    maxHearts: int = 5
    maxThreads: int = 3
    gear: list = []
    weavesKnown: list = []
    notes: str = ""

class TownUpdate(BaseModel):
    name: Optional[str] = None
    seeds: Optional[int] = None
    buildings: Optional[dict] = None

class SessionStart(BaseModel):
    quest: str
    location: str
    partyIds: list  # character IDs

class SessionUpdate(BaseModel):
    runState: Optional[str] = None
    roomNumber: Optional[int] = None
    party: Optional[list] = None
    enemies: Optional[list] = None
    lootCollected: Optional[list] = None

class DMMessage(BaseModel):
    message: str
    includeState: bool = True
    requestIllustration: bool = False

class DiceRoll(BaseModel):
    dieType: str  # "d4", "d6", "d8", "d10", "d20"
    result: int
    modifier: int = 0
    purpose: str = ""

class SessionEnd(BaseModel):
    outcome: str  # "victory", "retreat", "failed"

class ImageRequest(BaseModel):
    prompt: str
    style: str = "scene"  # "scene", "character", "enemy", "item"

class CampaignCreate(BaseModel):
    name: str
    description: str = ""
    currencyName: str = "gold"
    template_id: Optional[str] = None  # Optional template to use for system config

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    currencyName: Optional[str] = None

class CampaignContentRequest(BaseModel):
    """Request body for campaign content"""
    content: dict

class BeatHitRequest(BaseModel):
    """Request body for hitting a beat"""
    beat_id: str
    facts_learned: list = []
    npcs_met: list = []


# DM Prep request models
class DMPrepMessageRequest(BaseModel):
    message: str


class DMPrepNoteCreate(BaseModel):
    content: str
    category: str = "general"  # reminder, voice, pacing, secret, general
    related_to: Optional[str] = None


class DMPrepNoteUpdate(BaseModel):
    content: Optional[str] = None
    category: Optional[str] = None
    related_to: Optional[str] = None


class DMPrepPinRequest(BaseModel):
    content: str
    category: str = "general"
    related_to: Optional[str] = None


class GenerateFieldsRequest(BaseModel):
    content: dict
    generate: dict  # {threat: {name: bool}, npcs: [{field: bool}], locations: [...], beats: [...], character_arcs: [...]}
    available_species: list = []
    available_tags: list = []
