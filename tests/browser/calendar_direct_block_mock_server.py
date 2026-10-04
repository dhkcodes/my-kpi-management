#!/usr/bin/env python3
"""Local authenticated Calendar browser-test server with in-memory CRUD persistence."""
from __future__ import annotations

import json
import mimetypes
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
PORT = int(os.environ.get("KAP_CALENDAR_TEST_PORT", "8124"))
EVENTS: list[dict] = []
REQUESTS: list[str] = []
NEXT_ID = 1


def event_from_body(body: dict, event_id: int, version: int = 1) -> dict:
    return {
        "id": event_id,
        "ownerUserKey": "browser-test-owner",
        "ownerBadgeColor": "#245b83",
        "title": body["title"],
        "description": body.get("description"),
        "location": body.get("location"),
        "startsAt": body["startsAt"],
        "endsAt": body.get("endsAt") or body["startsAt"],
        "allDay": bool(body.get("allDay")),
        "hasEndTime": body.get("endsAt") is not None,
        "timeUnknown": bool(body.get("timeUnknown")),
        "forcePrivate": bool(body.get("forcePrivate")),
        "status": "SCHEDULED",
        "timezone": body.get("timezone", "Asia/Seoul"),
        "visibility": body.get("visibility", "DETAILS"),
        "effectiveVisibility": body.get("visibility", "DETAILS"),
        "effectiveAccess": "EDIT",
        "versionNo": version,
        "accountId": body.get("accountId"),
        "relatedItemType": body.get("relatedItemType"),
        "relatedItemId": body.get("relatedItemId"),
        "relatedItemLabel": body.get("relatedItemLabel"),
        "recurrence": body.get("recurrence", "NONE"),
        "recurrenceUntil": body.get("recurrenceUntil"),
        "workingDays": body.get("workingDays", 1),
    }


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: object) -> None:
        print(f"calendar-test: {format % args}", flush=True)

    def json_response(self, payload: object, status: int = 200) -> None:
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        REQUESTS.append(self.path)
        if path == "/_test/state":
            return self.json_response({"events": EVENTS, "requests": REQUESTS})
        if path == "/api/v1/auth/session":
            return self.json_response({
                "userKey": "browser-test-owner", "displayName": "Browser Test", "loginId": "browser.test",
                "access": "Admin", "status": "ACTIVE", "menuPermissions": {}
            })
        if path == "/api/v1/calendar/events":
            return self.json_response({"items": EVENTS})
        if re.fullmatch(r"/api/v1/calendar/events/\d+/shares", path):
            return self.json_response({"items": []})
        if path == "/api/v1/calendar/shares":
            return self.json_response({"items": []})
        if path == "/api/v1/calendar/shares/preferences":
            return self.json_response({"ownColor": "#245b83", "privateColor": "#7b61a8", "cancelledColor": "#77818c"})
        if path == "/api/v1/calendar/holidays":
            return self.json_response({
                "year": 2026,
                "supportedYears": [2025, 2026, 2027],
                "holidays": [
                    {"date": "2026-10-05", "name": "개천절 대체공휴일", "type": "SUBSTITUTE_HOLIDAY"},
                    {"date": "2026-10-09", "name": "한글날", "type": "PUBLIC_HOLIDAY"},
                ],
                "source": {"publisher": "우주항공청·한국천문연구원", "document": "2026년 월력요항"},
            })
        if path == "/api/v1/collaboration/directory/related-items":
            return self.json_response({"items": [{
                "type": "ACCOUNT", "id": 101, "accountId": 101,
                "accountName": "Acme Cloud", "label": "Acme Cloud"
            }]})
        if path.endswith("/workload-options"):
            query = parse_qs(parsed.query)
            offset = int(query.get("offset", ["0"])[0])
            size = int(query.get("size", ["10"])[0])
            all_items = [{
                "accountId": 1000 + index,
                "workloadId": 2000 + index,
                "accountName": f"Search Account {index:02d}",
                "workloadName": f"Workload {index:02d}",
                "dealId": None,
                "opptyName": None,
                "opptyNo": None,
            } for index in range(25)]
            items = all_items[offset:offset + size]
            return self.json_response({"items": items, "total": len(all_items), "hasMore": offset + size < len(all_items)})
        if path == "/api/v1/collaboration/directory/users":
            return self.json_response({"items": [{"userKey": "share-user", "displayName": "Share User"}]})
        if path.startswith("/api/v1/"):
            return self.json_response({"items": []})
        return self.serve_static(path)

    def do_POST(self) -> None:
        global NEXT_ID
        path = urlparse(self.path).path
        REQUESTS.append(f"POST {self.path}")
        status_match = re.fullmatch(r"/api/v1/calendar/events/(\d+)/(cancel|reopen)", path)
        if status_match:
            event_id = int(status_match.group(1))
            status = "CANCELLED" if status_match.group(2) == "cancel" else "SCHEDULED"
            for event in EVENTS:
                if event["id"] == event_id:
                    event["status"] = status
                    event["versionNo"] += 1
                    return self.json_response(event)
            return self.json_response({"message": "not found"}, 404)
        if path == "/api/v1/calendar/events":
            body = self.read_json()
            event = event_from_body(body, NEXT_ID)
            NEXT_ID += 1
            EVENTS.append(event)
            return self.json_response(event, 201)
        return self.json_response({}, 200)

    def do_PUT(self) -> None:
        path = urlparse(self.path).path
        match = re.fullmatch(r"/api/v1/calendar/events/(\d+)", path)
        if match:
            event_id = int(match.group(1))
            body = self.read_json()
            for index, current in enumerate(EVENTS):
                if current["id"] == event_id:
                    event = event_from_body(body, event_id, current["versionNo"] + 1)
                    EVENTS[index] = event
                    return self.json_response(event)
            return self.json_response({"message": "not found"}, 404)
        if re.fullmatch(r"/api/v1/calendar/events/\d+/shares/[^/]+", path):
            body = self.read_json()
            return self.json_response({"userKey": body.get("userKey", "share-user"), "access": "VIEW", "visibility": body.get("visibility", "DETAILS")})
        return self.json_response({}, 200)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path
        REQUESTS.append(f"DELETE {self.path}")
        match = re.fullmatch(r"/api/v1/calendar/events/(\d+)", path)
        if match:
            event_id = int(match.group(1))
            EVENTS[:] = [event for event in EVENTS if event["id"] != event_id]
        self.send_response(204)
        self.end_headers()

    def serve_static(self, path: str) -> None:
        relative = path.lstrip("/")
        candidate = (WEB / relative).resolve() if relative else WEB / "index.html"
        if not str(candidate).startswith(str(WEB.resolve())):
            return self.send_error(403)
        if not candidate.is_file():
            candidate = WEB / "index.html"
        data = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    if not (WEB / "index.html").is_file():
        raise SystemExit("Build the release web bundle before starting this server.")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"calendar-test-ready http://127.0.0.1:{PORT}/calendar", flush=True)
    server.serve_forever()
