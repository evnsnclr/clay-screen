#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -f .env.local ]]; then
  set -a
  source .env.local
  set +a
fi

export CLAY_SCREEN_BACKEND=preview
export PORT="${PORT:-7860}"

python app.py
