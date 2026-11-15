#!/usr/bin/env python3
"""Сводка статусов задач из дорожной карты.

Трекер не используем: источник правды — чекбоксы в docs/ROADMAP.md,
этот скрипт их только читает и считает.

    python3 scripts/tasks.py            # сводка по этапам
    python3 scripts/tasks.py --stage 0  # список задач этапа
    python3 scripts/tasks.py --stage 1 --status todo
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROADMAP_PATH = Path(__file__).resolve().parent.parent / "docs" / "ROADMAP.md"

TASK_RE = re.compile(r"^- \[(?P<mark>[ x~!])\] (?P<task_id>\d+(?:\.\d+)+) (?P<title>.+)$")
STAGE_RE = re.compile(r"^## \d+\. ЭТАП (?P<number>\d+) — (?P<title>.+)$")
PARENS_RE = re.compile(r"\s*\([^)]*\)\s*$")

STATUS_BY_MARK = {" ": "todo", "x": "done", "~": "doing", "!": "blocked"}
MARK_BY_STATUS = {value: key for key, value in STATUS_BY_MARK.items()}
SYMBOL = {"todo": "[ ]", "doing": "[~]", "done": "[x]", "blocked": "[!]"}
ORDER = ("done", "doing", "todo", "blocked")


@dataclass(frozen=True)
class Task:
    task_id: str
    title: str
    status: str


@dataclass
class Stage:
    number: int
    title: str
    tasks: list[Task] = field(default_factory=list)


def parse(markdown: str) -> list[Stage]:
    """Возвращает все этапы в порядке номеров; задачи группируются по мажору ID.

    Этапы после первого расписываются крупно и могут не иметь задач с ID —
    они попадают в результат с пустым списком задач.
    """
    titles: dict[int, str] = {}
    stages: dict[int, Stage] = {}

    for line in markdown.splitlines():
        stage_match = STAGE_RE.match(line)
        if stage_match:
            number = int(stage_match.group("number"))
            titles[number] = PARENS_RE.sub("", stage_match.group("title")).strip()
            continue

        task_match = TASK_RE.match(line)
        if not task_match:
            continue

        task_id = task_match.group("task_id")
        major = int(task_id.split(".", 1)[0])
        stage = stages.setdefault(major, Stage(number=major, title=titles.get(major, "")))
        stage.tasks.append(
            Task(
                task_id=task_id,
                title=task_match.group("title").strip().rstrip("."),
                status=STATUS_BY_MARK[task_match.group("mark")],
            )
        )

    for number, title in titles.items():
        stages.setdefault(number, Stage(number=number, title=title))

    return [stages[number] for number in sorted(stages)]


def _counts(stage: Stage) -> dict[str, int]:
    counts = dict.fromkeys(ORDER, 0)
    for task in stage.tasks:
        counts[task.status] += 1
    return counts


def _bar(counts: dict[str, int], total: int, width: int = 12) -> str:
    filled = round(counts["done"] / total * width) if total else 0
    return "█" * filled + "·" * (width - filled)


def render_summary(stages: list[Stage]) -> str:
    width = max((len(f"Этап {stage.number} · {stage.title}") for stage in stages), default=20)
    width = max(width, len("Итого"))
    rows: list[str] = []

    for stage in stages:
        counts = _counts(stage)
        total = len(stage.tasks)
        label = f"Этап {stage.number} · {stage.title}"
        counters = " ".join(f"{SYMBOL[status]}{counts[status]}" for status in ORDER)
        rows.append(
            f"{label:<{width}}  {_bar(counts, total)}  "
            f"{counts['done']:>3}/{total:<3} {counts['done'] / total:>4.0%}  {counters}"
        )

    total = sum(len(stage.tasks) for stage in stages)
    done = sum(_counts(stage)["done"] for stage in stages)
    doing = sum(_counts(stage)["doing"] for stage in stages)
    rows.append(
        f"{'Итого':<{width}}  {_bar({'done': done}, total)}  {done:>3}/{total:<3} "
        f"{done / total:>4.0%}  в работе: {doing}, не начато: {total - done - doing}"
    )
    separator = "─" * max(len(row) for row in rows)
    return "\n".join([*rows[:-1], separator, rows[-1]])


def render_stage(stage: Stage, statuses: set[str] | None) -> str:
    counts = _counts(stage)
    header = (
        f"Этап {stage.number} · {stage.title} — {counts['done']}/{len(stage.tasks)} готово"
    )
    lines = [header]
    for task in stage.tasks:
        if statuses and task.status not in statuses:
            continue
        lines.append(f"  {SYMBOL[task.status]} {task.task_id:<6} {task.title}")
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Статусы задач из docs/ROADMAP.md")
    parser.add_argument("--stage", type=int, help="показать задачи конкретного этапа")
    parser.add_argument(
        "--status",
        choices=ORDER,
        action="append",
        help="фильтр по статусу (можно несколько раз)",
    )
    parser.add_argument("--path", type=Path, default=ROADMAP_PATH, help="путь к дорожной карте")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if not args.path.exists():
        print(f"Не найден файл дорожной карты: {args.path}", file=sys.stderr)
        return 2

    stages = parse(args.path.read_text(encoding="utf-8"))
    if not stages:
        print("Задачи в дорожной карте не найдены", file=sys.stderr)
        return 1

    measured = [stage for stage in stages if stage.tasks]
    if args.stage is None:
        print(render_summary(measured))
        return 0

    selected = next((stage for stage in stages if stage.number == args.stage), None)
    if selected is None:
        known = ", ".join(str(stage.number) for stage in measured)
        print(f"Нет этапа {args.stage}. Доступные: {known}", file=sys.stderr)
        return 2
    if not selected.tasks:
        print(
            f"У этапа {selected.number} ({selected.title}) пока нет задач с ID — "
            "он расписан крупно в разделе 7 дорожной карты",
            file=sys.stderr,
        )
        return 0

    print(render_stage(selected, set(args.status or [])))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
