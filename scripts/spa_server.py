#!/usr/bin/env python3
"""Serve Oracle JET static output with history-routing SPA fallback."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


LEGACY_REDIRECTS = {
    "/consumption": "/consumption/analysis",
    "/usage-insights": "/consumption/analysis",
    "/attainment": "/consumption/attainment",
    "/usage-records": "/consumption/records",
    "/consumption/usage-insights": "/consumption/analysis",
    "/consumption/usage-records": "/consumption/records",
}


class SpaRequestHandler(SimpleHTTPRequestHandler):
    def redirect_legacy_path(self):
        parsed = urlsplit(self.path)
        destination = LEGACY_REDIRECTS.get(parsed.path.rstrip("/") or "/")
        if not destination:
            return False
        if parsed.query:
            destination = f"{destination}?{parsed.query}"
        self.send_response(308)
        self.send_header("Location", destination)
        self.end_headers()
        return True

    def do_GET(self):
        if self.redirect_legacy_path():
            return
        super().do_GET()

    def do_HEAD(self):
        if self.redirect_legacy_path():
            return
        super().do_HEAD()

    def end_headers(self):
        requested_path = urlsplit(self.path).path
        # index.html, history-routed SPA documents, and the unversioned bundle.js
        # must revalidate so an immutable-release symlink switch is visible immediately.
        if requested_path in {"/", "/index.html", "/bundle.js"} or "." not in Path(requested_path).name:
            self.send_header("Cache-Control", "no-cache, max-age=0, must-revalidate")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def send_head(self):
        requested_path = urlsplit(self.path).path
        translated = Path(self.translate_path(requested_path))
        if not translated.exists() and "." not in Path(requested_path).name:
            original_path = self.path
            self.path = "/index.html"
            try:
                return super().send_head()
            finally:
                self.path = original_path
        return super().send_head()


def create_handler(root: Path):
    return partial(SpaRequestHandler, directory=str(root))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", type=Path, required=True)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8123)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.bind, args.port), create_handler(args.directory.resolve()))
    server.serve_forever()


if __name__ == "__main__":
    main()