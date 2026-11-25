#!/usr/bin/env python3
"""CI-проверка сохранённой диаграммы через API — задача 2.2.5.

Пример:
    BPMN_API_URL=http://localhost:8000/api/v1 \
    BPMN_DIAGRAM_ID=<id> python3 scripts/validate.py

Код возврата: 0 — valid=true, 1 — valid=false, 2 — HTTP/сетевая ошибка.
Токен читается из BPMN_API_TOKEN и никуда не пишется.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Проверить BPMN-диаграмму через API")
    parser.add_argument(
        "--diagram-id",
        default=os.environ.get("BPMN_DIAGRAM_ID"),
        help="id диаграммы (или переменная BPMN_DIAGRAM_ID)",
    )
    parser.add_argument(
        "--api-url",
        default=os.environ.get("BPMN_API_URL", "http://localhost:8000/api/v1"),
        help="базовый URL API (или BPMN_API_URL)",
    )
    parser.add_argument(
        "--include",
        default=None,
        help="категории правил: xsd,structure,gateway,event,lane",
    )
    parser.add_argument("--timeout", type=float, default=30.0, help="таймаут запроса, секунды")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    if not args.diagram_id:
        print("нужен --diagram-id или BPMN_DIAGRAM_ID", file=sys.stderr)
        return 2

    url = f"{args.api_url.rstrip('/')}/diagrams/{args.diagram_id}/validate"
    if args.include:
        url += f"?include={urllib.parse.quote(args.include)}"

    headers = {"Accept": "application/json"}
    token = os.environ.get("BPMN_API_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=args.timeout) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        print(f"API вернул {exc.code}: {body}", file=sys.stderr)
        return 2
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"не удалось проверить диаграмму: {exc}", file=sys.stderr)
        return 2

    summary = payload.get("summary", {})
    print(
        f"valid={payload.get('valid')} errors={summary.get('errors')} "
        f"warnings={summary.get('warnings')} infos={summary.get('infos')} "
        f"duration_ms={payload.get('duration_ms')}"
    )
    for finding in payload.get("findings", []):
        element = finding.get("element_id") or "схема"
        print(
            f"[{finding.get('severity')}] {finding.get('rule_id')} {element}: "
            f"{finding.get('message')}"
        )
    for message in payload.get("config_errors", []):
        print(f"[config] {message}", file=sys.stderr)
    return 0 if payload.get("valid") else 1


if __name__ == "__main__":
    raise SystemExit(main())
