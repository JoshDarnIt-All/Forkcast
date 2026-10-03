#!/bin/sh
# Run Forkcast on this Mac for testing (no Docker needed). Open http://localhost:8765
cd "$(dirname "$0")/backend" && FORKCAST_DATA="$(cd .. && pwd)/data" .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8765
