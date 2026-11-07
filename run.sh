#!/usr/bin/env bash
# macOS / Linux launcher. Run with:  bash run.sh
set -u
cd "$(dirname "$0")" || exit 1

PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then PY="$candidate"; break; fi
done

if [ -z "$PY" ]; then
  echo "Python 3 is required."
  echo "macOS: brew install python   (or download from https://www.python.org/downloads/)"
  exit 1
fi

if [ ! -f .env ]; then
  echo "No .env file found. The app will load, but the AI cannot answer without a key."
  echo "Ask Cyrus for the key, then create .env here containing:"
  echo "  BAILIAN_API_KEY=the-key-goes-here"
  echo
fi

echo "Starting on http://127.0.0.1:8787"
echo "Open that address in your browser. Press Ctrl+C to stop."
echo
exec "$PY" tools/proxy.py --port 8787
