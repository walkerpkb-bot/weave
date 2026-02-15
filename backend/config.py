"""
Path constants and directory initialization for Bloomburrow Hub
"""

import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
PROMPTS_DIR = os.path.join(os.path.dirname(__file__), "prompts")
IMAGES_DIR = os.path.join(DATA_DIR, "images")
TEMPLATES_DIR = os.path.join(DATA_DIR, "templates")

# Ensure images directory exists
os.makedirs(IMAGES_DIR, exist_ok=True)
