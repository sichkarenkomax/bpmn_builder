"""4.0.6: границы ядра и модулей проверяются до запуска приложения.

Правила ADR-006: ядро не импортирует модули, модуль импортирует только
контракты ядра (`app.core.contracts`) и собственный пакет. Нарушение валит
pytest, а значит и CI, без отдельного линтера.
"""

from __future__ import annotations

import ast
from collections.abc import Iterator
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1] / "app"
MODULES = APP / "modules"

#: Единственное место ядра, которому разрешено собрать модули.
CORE_ALLOWED = {APP / "main.py"}


def _python_files(root: Path) -> Iterator[Path]:
    yield from sorted(path for path in root.rglob("*.py") if "__pycache__" not in path.parts)


def _imports(path: Path) -> Iterator[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield alias.name
        elif isinstance(node, ast.ImportFrom) and node.module:
            yield node.module


def _is_module(path: Path) -> bool:
    """`app/modules/__init__.py` и `registry.py` — инфраструктура, не модуль."""
    return path.parent != MODULES


def _module_name(path: Path) -> str:
    """`app/modules/pilot/routes.py` → `pilot`."""
    return path.relative_to(MODULES).parts[0]


def test_core_never_imports_modules() -> None:
    violations: list[str] = []
    for path in _python_files(APP):
        if MODULES in path.parents or path in CORE_ALLOWED:
            continue
        for imported in _imports(path):
            if imported == "app.modules" or imported.startswith("app.modules."):
                violations.append(f"{path.relative_to(APP)} → {imported}")
    assert violations == [], "ядро импортирует модули: " + ", ".join(violations)


def test_modules_import_only_core_contracts_and_self() -> None:
    violations: list[str] = []
    for path in _python_files(MODULES):
        if not _is_module(path):
            continue
        own = f"app.modules.{_module_name(path)}"
        for imported in _imports(path):
            if not imported.startswith("app."):
                continue
            if imported in {"app.core.contracts", own} or imported.startswith(f"{own}."):
                continue
            violations.append(f"{path.relative_to(APP)} → {imported}")
    assert violations == [], "модуль вышел за контракты ядра: " + ", ".join(violations)


def test_modules_do_not_import_each_other() -> None:
    for path in _python_files(MODULES):
        if not _is_module(path):
            continue
        own = _module_name(path)
        for imported in _imports(path):
            if not imported.startswith("app.modules."):
                continue
            other = imported.split(".")[2]
            if other != own:
                pytest.fail(f"{path.relative_to(APP)} импортирует чужой модуль {imported}")
