#!/usr/bin/env python3
"""Приёмочный замер сохранения BPMN (v0.1, чек-лист §5.2).

Создаёт временную схему из 200 задач, выполняет 50 циклов
«открыл–изменил–сохранил», проверяет byte-round-trip и отсутствие лишних
версий при повторном PUT того же XML. Замеряет p95 PUT сохранения.

Запуск на локальном стеке:
    python3 scripts/measure_saves.py

Адрес API можно переопределить через API_URL.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from xml.etree import ElementTree

API_URL = os.environ.get("API_URL", "http://127.0.0.1:8000/api/v1").rstrip("/")
BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL"
BPMNDI = "http://www.omg.org/spec/BPMN/20100524/DI"
DC = "http://www.omg.org/spec/DD/20100524/DC"
DI = "http://www.omg.org/spec/DD/20100524/DI"
NS = {"bpmn": BPMN, "bpmndi": BPMNDI, "dc": DC, "di": DI}


def build_xml(count: int) -> str:
    """Схема из count задач и count-1 связей с геометрией BPMNDI."""
    columns = 20
    tasks: list[str] = []
    flows: list[str] = []
    shapes: list[str] = []
    edges: list[str] = []

    for index in range(count):
        number = index + 1
        column = index % columns
        row = index // columns
        x = 100 + column * 160
        y = 100 + row * 140
        tasks.append(f'    <bpmn:task id="Task_{number}" name="Задача {number}" />')
        shapes.append(
            f'      <bpmndi:BPMNShape id="Task_{number}_di" bpmnElement="Task_{number}">\n'
            f'        <dc:Bounds x="{x}" y="{y}" width="100" height="80" />\n'
            f"      </bpmndi:BPMNShape>"
        )

    for index in range(1, count):
        number = index + 1
        source_col = (index - 1) % columns
        source_row = (index - 1) // columns
        target_col = index % columns
        target_row = index // columns
        source_x = 100 + source_col * 160 + 50
        source_y = 100 + source_row * 140 + 40
        target_x = 100 + target_col * 160 + 50
        target_y = 100 + target_row * 140 + 40
        flows.append(
            f'    <bpmn:sequenceFlow id="Flow_{index}" '
            f'sourceRef="Task_{index}" targetRef="Task_{number}" />'
        )
        edges.append(
            f'      <bpmndi:BPMNEdge id="Flow_{index}_di" bpmnElement="Flow_{index}">\n'
            f'        <di:waypoint x="{source_x}" y="{source_y}" />\n'
            f'        <di:waypoint x="{target_x}" y="{target_y}" />\n'
            f"      </bpmndi:BPMNEdge>"
        )

    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f'<bpmn:definitions xmlns:bpmn="{BPMN}" xmlns:bpmndi="{BPMNDI}" '
        f'xmlns:dc="{DC}" xmlns:di="{DI}" id="Definitions_measure" '
        'targetNamespace="http://bpmn.io/schema/bpmn">\n'
        '  <bpmn:process id="Process_measure" isExecutable="false">\n'
        + "\n".join(tasks)
        + "\n"
        + "\n".join(flows)
        + "\n  </bpmn:process>\n"
        '  <bpmndi:BPMNDiagram id="BPMNDiagram_measure">\n'
        '    <bpmndi:BPMNPlane id="BPMNPlane_measure" bpmnElement="Process_measure">\n'
        + "\n".join(shapes)
        + "\n"
        + "\n".join(edges)
        + "\n    </bpmndi:BPMNPlane>\n"
        "  </bpmndi:BPMNDiagram>\n"
        "</bpmn:definitions>"
    )


def request(
    method: str,
    path: str,
    *,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(
        f"{API_URL}{path}", data=body, method=method, headers=headers or {}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path}: HTTP {exc.code}: {detail}") from exc


def header(headers: dict[str, str], name: str) -> str:
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return ""


def versions(diagram_id: str) -> list[dict[str, object]]:
    _, _, body = request("GET", f"/diagrams/{diagram_id}/versions?limit=200")
    return json.loads(body)


def assert_shape_count(xml: bytes, expected: int) -> None:
    root = ElementTree.fromstring(xml)
    tasks = root.findall(".//bpmn:task", NS)
    flows = root.findall(".//bpmn:sequenceFlow", NS)
    if len(tasks) != expected or len(flows) != expected - 1:
        raise AssertionError(
            f"ожидалось {expected} задач и {expected - 1} связей, "
            f"получено {len(tasks)} и {len(flows)}"
        )


def p95(values: list[float]) -> float:
    ordered = sorted(values)
    rank = math.ceil(0.95 * len(ordered))
    return ordered[rank - 1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--elements", type=int, default=200)
    parser.add_argument("--cycles", type=int, default=50)
    args = parser.parse_args()
    if args.elements < 2 or args.cycles < 1:
        parser.error("--elements >= 2 и --cycles >= 1")

    xml = build_xml(args.elements)
    payload = json.dumps(
        {"title": f"Acceptance saves {time.time_ns()}", "bpmn_xml": xml},
        ensure_ascii=False,
    ).encode("utf-8")
    created: dict[str, object] | None = None
    latencies: list[float] = []
    try:
        _, _, body = request(
            "POST", "/diagrams", body=payload, headers={"Content-Type": "application/json"}
        )
        created = json.loads(body)
        diagram_id = str(created["id"])
        print(f"diagram: {diagram_id}, elements: {args.elements}")

        for cycle in range(1, args.cycles + 1):
            _, get_headers, current = request("GET", f"/diagrams/{diagram_id}/bpmn")
            etag = header(get_headers, "ETag").strip('"')
            if not etag:
                raise AssertionError("GET /bpmn не вернул ETag")

            marker = f"Цикл {cycle}"
            previous = "Задача 1" if cycle == 1 else f"Цикл {cycle - 1}"
            changed = current.replace(
                f'name="{previous}"'.encode(),
                f'name="{marker}"'.encode(),
                1,
            )
            if changed == current:
                raise AssertionError("не удалось изменить XML перед сохранением")

            started = time.perf_counter()
            _, _, saved_body = request(
                "PUT",
                f"/diagrams/{diagram_id}/bpmn",
                body=changed,
                headers={"Content-Type": "application/xml", "If-Match": f'"{etag}"'},
            )
            latencies.append((time.perf_counter() - started) * 1000)
            saved = json.loads(saved_body)
            if saved["etag"] == etag:
                raise AssertionError(f"цикл {cycle}: ETag не изменился")

            _, reopened_headers, reopened = request("GET", f"/diagrams/{diagram_id}/bpmn")
            if reopened != changed:
                raise AssertionError(f"цикл {cycle}: XML после переоткрытия отличается")
            if header(reopened_headers, "ETag").strip('"') != saved["etag"]:
                raise AssertionError(f"цикл {cycle}: ETag переоткрытия не совпал")
            if marker.encode() not in reopened:
                raise AssertionError(f"цикл {cycle}: изменение потерялось")
            assert_shape_count(reopened, args.elements)

        cycles_versions = versions(diagram_id)
        expected_versions = 1 + args.cycles
        if len(cycles_versions) != expected_versions:
            raise AssertionError(
                f"ожидалось {expected_versions} версий, получено {len(cycles_versions)}"
            )

        _, noop_headers, current = request("GET", f"/diagrams/{diagram_id}/bpmn")
        current_etag = header(noop_headers, "ETag").strip('"')
        _, _, noop_body = request(
            "PUT",
            f"/diagrams/{diagram_id}/bpmn",
            body=current,
            headers={"Content-Type": "application/xml", "If-Match": f'"{current_etag}"'},
        )
        noop = json.loads(noop_body)
        noop_versions = versions(diagram_id)
        if len(noop_versions) != expected_versions:
            raise AssertionError(
                f"PUT того же XML создал версию: {len(noop_versions)} вместо {expected_versions}"
            )
        if noop["version_id"] != cycles_versions[0]["id"]:
            raise AssertionError("PUT того же XML вернул другую текущую версию")

        result = {
            "diagram_id": diagram_id,
            "elements": args.elements,
            "cycles": args.cycles,
            "versions": len(cycles_versions),
            "noop_put_created_version": False,
            "xml_bytes": len(xml.encode("utf-8")),
            "save_ms": {
                "min": round(min(latencies), 2),
                "median": round(statistics.median(latencies), 2),
                "p95": round(p95(latencies), 2),
                "max": round(max(latencies), 2),
            },
            "p95_method": "nearest-rank, ceil(0.95*n)",
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    finally:
        if created is not None:
            try:
                request("DELETE", f"/diagrams/{created['id']}")
                print(f"deleted: {created['id']}")
            except Exception as exc:  # noqa: BLE001 - cleanup не должен скрывать результат
                print(f"cleanup failed: {exc}", file=sys.stderr)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # noqa: BLE001 - CLI должен вернуть текст ошибки
        print(f"FAILED: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
