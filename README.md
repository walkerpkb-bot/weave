# Weave

A web-based companion app for episodic tabletop RPGs. Author campaign stories with prerequisite-based beats, then play through them with an AI Dungeon Master, scene illustrations, and full party/town management. Supports fully customizable game systems for any setting.

## Features

- **Beat-Based Storytelling**: Author story beats with prerequisites, unlocking conditions, expiry timers, and finale flags — the AI weaves them into episodic sessions
- **AI Dungeon Master**: Claude-powered DM that adapts to your authored content, party state, and campaign progress
- **Scene Illustrations**: Flux image generation during play — Claude crafts optimized prompts, Replicate renders them
- **Campaign Authoring**: Full content editor with NPCs, locations, threats, and character arcs
- **DM Prep Coach**: AI assistant for campaign planning — author notes flow directly into gameplay DM context
- **Customizable Game Systems**: Configure species, stats, resources, currency, buildings, leveling, and mechanics per campaign
- **Character Roster**: Create and manage characters with campaign-specific species, stats, and arc progression
- **Town Management**: Currency, building upgrades, shared item stash
- **Session Runner**: Party HP/resource tracking, dice roller with threshold checking, episode phases
- **Templates**: Start from Bloomburrow (cozy woodland fantasy) or Generic Fantasy, or build from scratch
- **Multi-Campaign**: Full data isolation between campaigns
- **Docker Support**: `docker compose up` for the full stack

## Quick Start

### Local Development

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Add ANTHROPIC_API_KEY and REPLICATE_API_TOKEN
uvicorn main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- Frontend proxies `/api` to the backend via vite.config.js

### Docker

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys
docker compose up
```

Campaign data persists in a Docker volume (`backend-data`).

### Prerequisites

- Python 3.9+
- Node.js 18+
- `ANTHROPIC_API_KEY` — Claude API for DM and Prep Coach
- `REPLICATE_API_TOKEN` — Flux image generation (optional, for scene illustrations)

### Tests

```bash
cd backend
source venv/bin/activate
python -m pytest tests/ -v
```

93 tests covering beat logic, schema validation, session/beat lifecycle, routes, and town/character CRUD.

## How It Works

### Two-Layer Campaign Configuration

**System Config** (`system.json`) defines game mechanics — species, stats, resources, currency, buildings, leveling, dice thresholds, enemy tiers, art style, world lore, and DM tone. Start from a template or build from scratch.

**Campaign Content** (`campaign.json`) defines the story:

| Section | What it contains |
|---------|-----------------|
| `name`, `premise`, `tone` | Campaign identity |
| `threat` | Escalating danger with named stages, auto-advances each episode unless a beat is hit |
| `npcs` | Named characters with species, role, wants, and a secret |
| `locations` | Key places with vibe descriptions and content tags |
| `beats` | Story beats — the core progression system (see below) |
| `character_arcs` | Optional player arcs with milestones and rewards |

### Beats

Beats are the building blocks of campaign progression. Each beat has:

- **description** — what happens in this beat
- **hints** — things the AI must weave into the episode (up to 5)
- **revelation** — what the party learns when the beat is hit (added to "facts known")
- **prerequisites** — other beat IDs that must be hit first
- **unlocked_by** — episode count gate (e.g., `episode:3`)
- **closes_after_episodes** — expiry timer
- **is_finale** — marks the campaign-ending beat

The system dynamically calculates which beats are available based on the current state. When all beats are hit, a finale beat is completed, or the threat reaches max stage, the campaign is complete.

### Session Flow

1. **Start Episode** — select available beats or play freestyle
2. **Adventure** — chat with the AI DM, which has full context: campaign content, party state, available beats, author notes, and session history
3. **Roll Dice** — physical or digital, with automatic threshold checking
4. **Track Party** — click hearts/resources to update HP and abilities in real time
5. **Generate Scenes** — toggle illustration mode for AI-crafted scene images
6. **End Episode** — victory (2 XP), retreat (1 XP), or failed (0 XP)

### DM Prep

Before playing, use the Prep Coach:
- Chat with Claude about NPC voices, pacing, secrets, and scene ideas
- Create categorized author notes (voice, pacing, secret, reminder, general)
- Pin useful insights from conversations
- Everything flows into the gameplay DM's system prompt

## Project Structure

```
weave/
├── docker-compose.yml
├── backend/
│   ├── main.py                 # FastAPI app, CORS, router includes
│   ├── config.py               # Path constants
│   ├── models.py               # Pydantic request/response models
│   ├── helpers.py              # JSON file I/O helpers
│   ├── campaign_schema.py      # Beat, Threat, CampaignContent, CampaignState models
│   ├── campaign_logic.py       # Beat availability, expiry, threat advancement, DM context
│   ├── dm_context_builder.py   # Builds DM system prompts from campaign config
│   ├── prep_coach_builder.py   # Builds Prep Coach prompts
│   ├── migrate_episodes.py     # Data migration (anchor_runs → beats)
│   ├── requirements.txt
│   ├── routes/
│   │   ├── templates.py        # Template listing
│   │   ├── campaigns.py        # Campaign CRUD, select, banner, system config
│   │   ├── campaign_content.py # Content, drafts, state, beats, DM context
│   │   ├── dm_prep.py          # Prep notes, pins, coach conversation
│   │   ├── characters.py       # Character CRUD
│   │   ├── town.py             # Town + stash
│   │   ├── sessions.py         # Session lifecycle + dice
│   │   ├── dm_ai.py            # DM chat + image generation
│   │   └── generate.py         # AI-powered field generation
│   ├── tests/
│   │   ├── conftest.py         # Shared fixtures
│   │   ├── test_schema.py      # Beat/Threat/CampaignContent validation
│   │   ├── test_logic.py       # Beat availability, expiry, threat, DM context
│   │   ├── test_routes.py      # Session and beat lifecycle routes
│   │   └── test_town.py        # Town, character, stash, campaign CRUD
│   ├── data/                   # All campaign data (gitignored)
│   │   ├── campaigns.json      # Campaign registry
│   │   ├── templates/          # System templates (bloomburrow, default)
│   │   └── campaigns/{id}/     # Per-campaign data
│   │       ├── system.json     # Game system config
│   │       ├── campaign.json   # Authored story content
│   │       ├── state.json      # Runtime state (beats hit, threat, facts)
│   │       ├── roster.json     # Characters
│   │       ├── town.json       # Town state
│   │       ├── stash.json      # Shared items
│   │       ├── dm_prep.json    # Author notes + coach conversation
│   │       ├── current_session.json
│   │       ├── draft.json      # Content draft (pre-validation)
│   │       └── images/         # Generated scene images
│   └── prompts/                # Markdown prompt templates
├── frontend/
│   ├── vite.config.js          # Dev proxy: /api → localhost:8000
│   ├── src/
│   │   ├── App.jsx             # View routing, context provider
│   │   ├── styles.css          # Global styles (two themes)
│   │   ├── api/                # API client modules
│   │   ├── context/            # CampaignContext provider
│   │   ├── hooks/              # useCampaigns, useCampaignData
│   │   └── components/
│   │       ├── CampaignSelector.jsx  # Landing page
│   │       ├── CampaignCard.jsx
│   │       ├── CampaignForm.jsx      # Full system + content editor
│   │       ├── ChatWindow.jsx        # DM chat interface
│   │       ├── RosterView.jsx        # Characters + episode start
│   │       ├── CharacterSheet.jsx    # Character creation/editing
│   │       ├── TownView.jsx          # Buildings + currency
│   │       ├── SessionPanel.jsx      # Session controls
│   │       ├── PartyStatus.jsx       # HP/resource tracking
│   │       ├── ImagePanel.jsx        # Scene illustrations
│   │       ├── DiceRoller.jsx
│   │       ├── DMPrepSection.jsx     # Author notes + prep coach
│   │       └── PrepCoachChat.jsx
│   └── package.json
└── README.md
```

## API

49 endpoints across 9 route modules. Key endpoints:

### Campaigns & Content

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/campaigns` | GET/POST | List or create campaigns |
| `/campaigns/{id}` | GET/PUT/DELETE | Manage campaign |
| `/campaigns/{id}/select` | PUT | Set active campaign |
| `/campaigns/{id}/system` | GET/PUT | Game system config |
| `/campaigns/{id}/content` | GET/POST/PUT | Campaign story content |
| `/campaigns/{id}/draft` | GET/POST | Draft content (no validation) |
| `/campaigns/{id}/available-beats` | GET | List currently available beats |
| `/campaigns/{id}/hit-beat` | POST | Record a beat completion |
| `/campaigns/{id}/state` | GET | Campaign runtime state |
| `/campaigns/{id}/state/reset` | POST | Reset campaign progress |
| `/campaigns/{id}/dm-context` | GET | Current DM context |

### Gameplay

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/campaigns/{id}/dm/message` | POST | Chat with AI DM |
| `/campaigns/{id}/image/generate` | POST | Generate scene image |
| `/campaigns/{id}/session` | GET | Current session state |
| `/campaigns/{id}/session/start` | POST | Start episode |
| `/campaigns/{id}/session/end` | POST | End episode |
| `/campaigns/{id}/dice/roll` | POST | Log dice roll |
| `/campaigns/{id}/characters` | GET/POST | List or create characters |
| `/campaigns/{id}/town` | GET/PUT | Town state |
| `/campaigns/{id}/stash` | GET/PUT | Shared item stash |

### DM Prep

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/campaigns/{id}/dm-prep` | GET | Get prep data |
| `/campaigns/{id}/dm-prep/message` | POST | Chat with Prep Coach |
| `/campaigns/{id}/dm-prep/note` | POST | Create author note |
| `/campaigns/{id}/dm-prep/pin` | POST | Pin conversation insight |

### AI Generation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/campaigns/{id}/generate-fields` | POST | AI-generate flagged campaign fields |
| `/generate-fields` | POST | Standalone field generation |
| `/templates` | GET | List system templates |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.9+, FastAPI, Pydantic |
| Frontend | React 18, Vite 5, vanilla CSS |
| AI DM | Claude Sonnet 4 (via Anthropic SDK) |
| Image Gen | Flux Schnell (via Replicate) |
| Data | JSON files on disk (no database) |
| Deployment | Docker Compose (nginx + uvicorn) |

## Data

All campaign data lives in `backend/data/` as JSON files. Data is gitignored — back it up manually. Each campaign gets its own directory with full isolation.

To migrate data from the old anchor_runs format:

```bash
cd backend
python migrate_episodes.py
```

## Themes

- **Clean Slate**: Dark charcoal with gold accents (campaign selector)
- **Twilight Forest**: Plum/purple with amber glow (in-campaign play)

## License

Personal use. Bloomburrow setting is property of Wizards of the Coast.
