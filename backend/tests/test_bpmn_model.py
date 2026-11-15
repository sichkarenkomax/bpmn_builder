"""Правила модели: то, что должно падать при неверной комбинации полей."""

from __future__ import annotations

import pytest
from app.bpmn import (
    Artifact,
    ArtifactType,
    Flow,
    FlowType,
    Node,
    NodeType,
    Participant,
    Process,
    create_empty_document,
    parse_bpmn,
    serialize_bpmn,
)
from app.bpmn.model import BpmnDocument, Collaboration
from pydantic import ValidationError


def test_boundary_event_requires_attachment() -> None:
    with pytest.raises(ValidationError, match="attachedToRef"):
        Node(id="Boundary_1", type=NodeType.BOUNDARY_EVENT)


def test_attachment_only_for_boundary_event() -> None:
    with pytest.raises(ValidationError, match="только для граничного"):
        Node(id="Task_1", type=NodeType.USER_TASK, attached_to="Task_2")


def test_script_only_for_script_task() -> None:
    with pytest.raises(ValidationError, match="скрипт-задачи"):
        Node(id="Task_1", type=NodeType.USER_TASK, script="print(1)")


def test_condition_only_for_sequence_flow() -> None:
    with pytest.raises(ValidationError, match="потока последовательности"):
        Flow(
            id="Message_1",
            type=FlowType.MESSAGE,
            source_ref="A",
            target_ref="B",
            condition="x > 1",
        )


def test_empty_document_is_serializable_and_parsable() -> None:
    document = create_empty_document("Проверка")

    xml = serialize_bpmn(document)
    parsed = parse_bpmn(xml)

    assert parsed.processes[0].name == "Проверка"
    assert parsed.processes[0].nodes == []


def test_document_equality_ignores_source_xml() -> None:
    document = create_empty_document()
    parsed = parse_bpmn(serialize_bpmn(document))

    assert parsed == document
    assert parsed.source_xml is not None
    assert document.source_xml is None


def test_detached_copy_drops_source() -> None:
    parsed = parse_bpmn(serialize_bpmn(create_empty_document()))

    detached = parsed.detached()

    assert detached.source_xml is None
    assert detached == parsed


def test_group_and_annotation_survive_roundtrip() -> None:
    document = BpmnDocument(
        id="Definitions_1",
        processes=[
            Process(
                id="Process_1",
                nodes=[Node(id="Task_1", type=NodeType.USER_TASK)],
                artifacts=[
                    Artifact(id="Annotation_1", type=ArtifactType.TEXT_ANNOTATION, text="Заметка"),
                    Artifact(
                        id="Group_1", type=ArtifactType.GROUP, category_value_ref="GroupVal_1"
                    ),
                ],
            )
        ],
        collaboration=Collaboration(
            id="Collaboration_1",
            participants=[
                Participant(id="Participant_1", process_ref="Process_1"),
                Participant(id="Participant_2"),
            ],
        ),
    )

    parsed = parse_bpmn(serialize_bpmn(document))

    assert parsed.processes[0].artifacts[0].text == "Заметка"
    assert parsed.processes[0].artifacts[1].category_value_ref == "GroupVal_1"
    assert parsed.collaboration is not None
    assert len(parsed.collaboration.participants) == 2
