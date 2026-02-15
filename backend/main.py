"""
Weave - Backend Server
FastAPI application for managing game state and AI DM integration
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from config import IMAGES_DIR
from routes import templates, campaigns, campaign_content, dm_prep, characters, town, sessions, dm_ai

# Load environment variables from .env file
load_dotenv()

app = FastAPI(title="Weave", version="1.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files for serving images
app.mount("/images", StaticFiles(directory=IMAGES_DIR), name="images")

# Include all routers
app.include_router(templates.router)
app.include_router(campaigns.router)
app.include_router(campaign_content.router)
app.include_router(dm_prep.router)
app.include_router(characters.router)
app.include_router(town.router)
app.include_router(sessions.router)
app.include_router(dm_ai.router)


@app.get("/")
def root():
    return {"status": "ok", "app": "Weave", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
