from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib import request

API_BASE = os.getenv('TELEMETRY_API_BASE', 'http://127.0.0.1:8090').rstrip('/')
AUTOMATION_KEY = os.getenv('TELEMETRY_AUTOMATION_KEY', '')
QUEUE_FILE = os.getenv('TELEMETRY_QUEUE_FILE', '')


def _queue_path() -> Path:
    if QUEUE_FILE:
        return Path(QUEUE_FILE)
    return Path(__file__).resolve().parent / 'event_queue.jsonl'


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _send_event(event: dict[str, Any]) -> bool:
    if not AUTOMATION_KEY:
        return False
    url = f"{API_BASE}/api/v1/delegation/events"
    data = json.dumps(event).encode('utf-8')
    req = request.Request(
        url,
        data=data,
        headers={
            'Content-Type': 'application/json',
            'x-automation-key': AUTOMATION_KEY,
        },
        method='POST',
    )
    try:
        with request.urlopen(req, timeout=5) as resp:
            return 200 <= getattr(resp, 'status', 0) < 300
    except Exception:
        return False


def enqueue_event(event: dict[str, Any]) -> None:
    p = _queue_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open('a', encoding='utf-8') as f:
        f.write(json.dumps(event, ensure_ascii=True) + '\n')


def flush_queue() -> int:
    p = _queue_path()
    if not p.exists():
        return 0
    lines = [ln for ln in p.read_text(encoding='utf-8').splitlines() if ln.strip()]
    if not lines:
        return 0

    failed: list[str] = []
    sent = 0
    for ln in lines:
        try:
            ev = json.loads(ln)
        except Exception:
            continue
        if _send_event(ev):
            sent += 1
        else:
            failed.append(ln)

    if failed:
        p.write_text('\n'.join(failed) + '\n', encoding='utf-8')
    else:
        p.unlink(missing_ok=True)
    return sent


def post_event(event: dict[str, Any]) -> bool:
    event.setdefault('schema_version', 'agent_event_v1')
    event.setdefault('event_ts_utc', _now_iso())

    flush_queue()
    ok = _send_event(event)
    if not ok:
        enqueue_event(event)
    return ok
