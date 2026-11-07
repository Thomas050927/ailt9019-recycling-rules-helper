#!/usr/bin/env python3
"""Local server: serves the app and proxies model calls so the key stays off GitHub.

    python tools/proxy.py

Why this exists: the Bailian Token Plan host sends no CORS headers, so a page
on github.io cannot call it. This process holds the key and forwards the
request server-side. It also serves the app, so one command gives you a working
UI at http://127.0.0.1:8787.

The key is read from (in order): --key, $BAILIAN_API_KEY, or a .env file next
to this script's parent directory. .env is gitignored.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
DEFAULT_BASE = "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"


def read_dotenv() -> dict[str, str]:
    env_path = ROOT / ".env"
    values: dict[str, str] = {}
    if not env_path.exists():
        return values
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip().strip("'\"")
    return values


class Handler(SimpleHTTPRequestHandler):
    api_key: str = ""
    base_url: str = DEFAULT_BASE

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self) -> None:
        if not self.path.rstrip("/").endswith("/chat/completions"):
            self.send_error(404, "Only POST .../chat/completions is proxied")
            return

        if not self.api_key:
            self._json_error(500, "No API key. Put BAILIAN_API_KEY=... in .env and restart.")
            return

        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        target = f"{self.base_url.rstrip('/')}/chat/completions"

        request = urllib.request.Request(
            target,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = response.read()
                status = response.status
        except urllib.error.HTTPError as error:
            payload = error.read()
            status = error.code
        except urllib.error.URLError as error:
            self._json_error(502, f"Could not reach {target}: {error.reason}")
            return

        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _json_error(self, status: int, message: str) -> None:
        payload = json.dumps({"error": {"message": message, "type": "proxy_error"}}).encode()
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--key", default="")
    parser.add_argument("--base-url", default="")
    args = parser.parse_args()

    dotenv = read_dotenv()
    Handler.api_key = args.key or os.environ.get("BAILIAN_API_KEY") or dotenv.get("BAILIAN_API_KEY", "")
    Handler.base_url = (
        args.base_url
        or os.environ.get("BAILIAN_BASE_URL")
        or dotenv.get("BAILIAN_BASE_URL")
        or DEFAULT_BASE
    )

    print(f"serving {APP_DIR}")
    print(f"proxying to {Handler.base_url}")
    print(f"key: {'loaded' if Handler.api_key else 'MISSING — add BAILIAN_API_KEY to .env'}")
    print(f"\nOpen http://{args.host}:{args.port}/ and choose 'Local proxy' as the endpoint.\n")

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
