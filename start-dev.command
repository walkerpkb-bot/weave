#!/bin/bash
cd "$(dirname "$0")"

# Kill both servers on exit
trap 'kill 0' EXIT

# Backend
echo "Starting backend on :8000..."
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000 &

# Frontend
echo "Starting frontend on :3000..."
cd ../frontend
npm run dev &

wait
