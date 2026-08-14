#!/usr/bin/env python3
"""Serve Oracle JET static output with history-routing SPA fallback."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class SpaRequestHandler(SimpleHTTPRequestHandler):
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