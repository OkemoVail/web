#!/usr/bin/env bash
# Temp MLX backend — creates .venv on first run, then serves on 127.0.0.1:8001.
# First model load downloads ~2.5GB to ~/.cache/huggingface.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi
exec .venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
