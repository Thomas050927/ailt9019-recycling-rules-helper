"""Double-click this file to start the tool.

It runs the local server that serves the app and forwards questions to the
model. The key is read from .env in this same folder, so nothing needs typing.

Windows: double-click. If Windows asks what to open it with, choose Python.
macOS:   right-click -> Open With -> Python Launcher, or run `bash run.sh`.
"""

from __future__ import annotations

import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = 8787
URL = f"http://127.0.0.1:{PORT}"


def open_browser_when_ready() -> None:
    """Wait for the server to accept connections, then open the page."""
    import socket

    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.4):
                webbrowser.open(URL)
                return
        except OSError:
            time.sleep(0.3)


def ensure_key(env_path: Path) -> bool:
    """Create .env from a pasted key when it is missing. Returns True if a key exists."""
    if env_path.exists():
        text = env_path.read_text(encoding="utf-8", errors="ignore")
        if "BAILIAN_API_KEY=sk-" in text:
            return True

    print()
    print("One-time setup: this tool needs the group API key.")
    print("Paste it below and press Enter. Right-click in this window to paste.")
    print("It is saved to a local file called .env that is never uploaded anywhere.")
    print()
    try:
        key = input("API key: ").strip().strip("'\"")
    except (EOFError, KeyboardInterrupt):
        print()
        return False

    if not key:
        print("No key entered. The page will open, but questions cannot be answered.")
        return False

    env_path.write_text(f"BAILIAN_API_KEY={key}\n", encoding="utf-8")
    print("Saved. Starting the tool...")
    return True


def main() -> int:
    if not ensure_key(ROOT / ".env"):
        print()

    print("=" * 52)
    print("  Campus Waste Guide")
    print("=" * 52)
    print(f"  Address: {URL}")
    print("  Keep this window open. Press Ctrl+C to stop.")
    print("=" * 52)
    print()

    threading.Thread(target=open_browser_when_ready, daemon=True).start()

    # Reuse the proxy script exactly as if it had been run from a terminal.
    sys.argv = ["proxy.py", "--port", str(PORT)]
    import runpy

    runpy.run_path(str(ROOT / "tools" / "proxy.py"), run_name="__main__")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nStopped.")
