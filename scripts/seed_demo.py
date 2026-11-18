"""Создаёт демонстрационные диаграммы на запущенном стенде.

Запуск: make seed (или cd backend && uv run python ../scripts/seed_demo.py).
Скрипт идемпотентен: повторно те же названия не создаёт.
"""

from __future__ import annotations

import os
from pathlib import Path

import httpx

API = os.getenv("BPMN_API", "http://127.0.0.1:8000/api/v1")
ROOT = Path(__file__).resolve().parents[1]
DEMO_XML = (ROOT / "frontend" / "src" / "assets" / "demo-process.bpmn").read_text(encoding="utf-8")

DEMOS = [
    ("Демонстрационный процесс", "Клиент и банк: заявка, проверка, решение", DEMO_XML),
    ("Демонстрационный процесс — вариант 2", "Второй экземпляр для сравнения версий", DEMO_XML),
]


def main() -> None:
    with httpx.Client(timeout=30) as client:
        existing = {item["title"] for item in client.get(f"{API}/diagrams?limit=200").json()["items"]}
        for title, description, xml in DEMOS:
            if title in existing:
                print(f"пропуск: {title}")
                continue
            response = client.post(
                f"{API}/diagrams",
                json={"title": title, "description": description, "bpmn_xml": xml},
            )
            response.raise_for_status()
            print(f"создана: {title} ({response.json()['id']})")


if __name__ == "__main__":
    main()
