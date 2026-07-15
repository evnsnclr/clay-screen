#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -x .venv-mac/bin/python ]]; then
  echo "Mac runtime not installed. Run ./setup_mac.sh first." >&2
  exit 1
fi

export CLAY_SCREEN_BACKEND=mac
export PYTORCH_ENABLE_MPS_FALLBACK=1
exec .venv-mac/bin/python app.py
