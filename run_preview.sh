#!/usr/bin/env bash
set -euo pipefail

export CLAY_SCREEN_BACKEND=preview
export PORT="${PORT:-7860}"

python app.py
