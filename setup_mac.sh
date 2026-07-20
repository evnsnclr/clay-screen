#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3}"
"$PYTHON_BIN" -m venv .venv-mac
source .venv-mac/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-mac.txt
# Install the fork without its stale exact Transformers pin. The compatible
# runtime versions are declared above and verified in VALIDATION.md.
python -m pip install --no-deps \
  "streamdiffusion-mac @ git+https://github.com/patrickhartono/StreamDiffusion-Mac.git@99f146ecbe78e1d1f09044c5ca6e3d99b28b1000"

echo
echo "Mac runtime installed. Start SurfaceShift with:"
echo "  ./run_mac.sh"
