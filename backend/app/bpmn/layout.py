"""Канонические правила: id плоскостей и геометрия связей по умолчанию.

Правила вынесены отдельно, потому что их используют двое: сериализатор (когда
пишет DI) и нормализация (когда сравнивает модель с тем, что вернулось после
round-trip). Одна реализация — один канон.
"""

from __future__ import annotations

from app.bpmn.model import Artifact, ArtifactType, Bounds, Waypoint

#: Канонический порядок артефактов: он же порядок в XML (XSD: flowElement* → artifact*).
ARTIFACT_ORDER = {
    ArtifactType.DATA_OBJECT: 0,
    ArtifactType.TEXT_ANNOTATION: 1,
    ArtifactType.GROUP: 2,
}


def sorted_artifacts(artifacts: list[Artifact]) -> list[Artifact]:
    """Стабильная сортировка: внутри одного типа исходный порядок сохраняется."""
    return sorted(artifacts, key=lambda artifact: ARTIFACT_ORDER[artifact.type])


def plane_ids(element_id: str) -> tuple[str, str]:
    """Идентификаторы диаграммы и плоскости для процесса или коллаборации."""
    return f"BPMNDiagram_{element_id}", f"BPMNPlane_{element_id}"


def fallback_waypoints(source: Bounds | None, target: Bounds | None) -> list[Waypoint]:
    """Две точки, если у связи нет своей геометрии.

    BPMN DI требует минимум две точки у каждой связи, поэтому «пусто» — не вариант.
    Тянем от правой грани источника к левой грани цели, а при обратном направлении —
    наоборот.
    """
    if source is None or target is None:
        return [Waypoint(x=0, y=0), Waypoint(x=100, y=0)]

    left_to_right = source.x + source.width / 2 <= target.x + target.width / 2
    if left_to_right:
        start = Waypoint(x=source.x + source.width, y=source.y + source.height / 2)
        end = Waypoint(x=target.x, y=target.y + target.height / 2)
    else:
        start = Waypoint(x=source.x, y=source.y + source.height / 2)
        end = Waypoint(x=target.x + target.width, y=target.y + target.height / 2)
    return [start, end]
