#!/usr/bin/env python3
"""Бенчмарк валидации — задача 2.4.3.

Строит процесс из N задач, сериализует его в BPMN XML и измеряет p50/p95
полного цикла «разбор + XSD + модель + правила». С `--check` падает, если
p95 превышает пороги 1 с для 200 элементов и 3 с для 1000.

Запуск: cd backend && uv run python ../scripts/benchmark_validation.py --check
"""

from __future__ import annotations

import argparse
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.bpmn.model import (  # noqa: E402
    BpmnDocument,
    Flow,
    FlowType,
    Node,
    NodeType,
    Process,
)
from app.bpmn.serialize import serialize_bpmn  # noqa: E402
from app.bpmn.validation import parse_and_validate_bpmn  # noqa: E402
from app.validation import ValidationEngine  # noqa: E402

THRESHOLDS_MS = {200: 1000.0, 500: 3000.0, 1000: 3000.0}


def build_xml(tasks: int) -> str:
    nodes = [Node(id="Start", type=NodeType.START_EVENT, name="Старт")]
    flows: list[Flow] = []
    previous = "Start"
    for index in range(tasks):
        task_id = f"Task_{index}"
        nodes.append(Node(id=task_id, type=NodeType.USER_TASK, name=f"Задача {index}"))
        flows.append(
            Flow(
                id=f"Flow_{index}",
                type=FlowType.SEQUENCE,
                source_ref=previous,
                target_ref=task_id,
            )
        )
        previous = task_id
    nodes.append(Node(id="End", type=NodeType.END_EVENT, name="Конец"))
    flows.append(
        Flow(id="Flow_End", type=FlowType.SEQUENCE, source_ref=previous, target_ref="End")
    )
    document = BpmnDocument(
        id="Definitions_Bench",
        processes=[Process(id="Process_Bench", name="Бенчмарк", nodes=nodes, flows=flows)],
    )
    return serialize_bpmn(document)


def measure(xml: str, iterations: int) -> tuple[float, float, int]:
    durations: list[float] = []
    findings = 0
    for _ in range(iterations):
        started = time.perf_counter()
        document, _ = parse_and_validate_bpmn(xml)
        report = ValidationEngine().validate(document)
        durations.append((time.perf_counter() - started) * 1000)
        findings = len(report.findings)
    durations.sort()
    p50 = statistics.median(durations)
    p95 = durations[max(0, int(len(durations) * 0.95) - 1)]
    return p50, p95, findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sizes", default="200,500,1000")
    parser.add_argument("--iterations", type=int, default=7)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    failed = False
    for raw in args.sizes.split(","):
        size = int(raw)
        xml = build_xml(size)
        p50, p95, findings = measure(xml, args.iterations)
        threshold = THRESHOLDS_MS.get(size, 3000.0)
        print(
            f"{size:>5} задач: XML {len(xml) / 1024:.0f} КиБ, "
            f"p50 {p50:.0f} мс, p95 {p95:.0f} мс, находок {findings}"
        )
        if args.check and p95 > threshold:
            print(f"  ПРЕВЫШЕН порог {threshold:.0f} мс", file=sys.stderr)
            failed = True
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
