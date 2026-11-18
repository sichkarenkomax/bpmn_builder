import { useEffect, useState } from 'react';

import {
  createMilestone,
  createStage,
  STAGE_MIN_HEIGHT,
  type DiagramStage,
  type StageMilestone,
} from '../lib/stages';

/** Настройка этапов: полосы, высота/отступ, сворачивание и вехи. */
export function StagesDialog({
  open,
  stages,
  onChange,
  onClose,
}: {
  open: boolean;
  stages: DiagramStage[];
  onChange: (stages: DiagramStage[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DiagramStage[]>(stages);

  useEffect(() => {
    if (open) {
      setDraft(stages);
    }
  }, [open, stages]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const patch = (id: string, next: Partial<DiagramStage>) => {
    setDraft((current) =>
      current.map((stage) => (stage.id === id ? { ...stage, ...next } : stage)),
    );
  };

  const patchMilestone = (stageId: string, milestoneId: string, next: Partial<StageMilestone>) => {
    setDraft((current) =>
      current.map((stage) =>
        stage.id === stageId
          ? {
              ...stage,
              milestones: stage.milestones.map((milestone) =>
                milestone.id === milestoneId ? { ...milestone, ...next } : milestone,
              ),
            }
          : stage,
      ),
    );
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="dialog dialog--stages"
        role="dialog"
        aria-modal="true"
        aria-label="Этапы схемы"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="dialog__header">
          <h2 className="dialog__title">Этапы схемы</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <p className="dialog__hint">
          Этап — горизонтальная полоса поверх пулов, а не элемент внутри пула. Нажмите «Добавить
          этап» ниже, задайте название, отступ и высоту в координатах холста. Свёрнутый этап прячет
          фигуры внутри полосы, не меняя XML. Веха — вертикальная отметка внутри этапа.
        </p>

        {draft.length === 0 ? (
          <p className="settings-section__empty">Этапов пока нет.</p>
        ) : (
          <div className="stage-list">
            {draft.map((stage, index) => (
              <div className="stage-item" key={stage.id}>
                <div className="stage-row">
                  <label className="stage-row__name">
                    <span>Название</span>
                    <input
                      value={stage.name}
                      aria-label={`Название этапа ${index + 1}`}
                      onChange={(event) => patch(stage.id, { name: event.target.value })}
                    />
                  </label>
                  <label className="stage-row__number">
                    <span>Отступ</span>
                    <input
                      type="number"
                      min={0}
                      step={10}
                      value={stage.y}
                      aria-label={`Отступ этапа ${index + 1}`}
                      onChange={(event) =>
                        patch(stage.id, { y: Math.max(0, Number(event.target.value) || 0) })
                      }
                    />
                  </label>
                  <label className="stage-row__number">
                    <span>Высота</span>
                    <input
                      type="number"
                      min={STAGE_MIN_HEIGHT}
                      step={10}
                      value={stage.height}
                      aria-label={`Высота этапа ${index + 1}`}
                      onChange={(event) =>
                        patch(stage.id, {
                          height: Math.max(STAGE_MIN_HEIGHT, Number(event.target.value) || 0),
                        })
                      }
                    />
                  </label>
                  <label className="settings-field settings-field--checkbox stage-row__flag">
                    <input
                      type="checkbox"
                      checked={stage.collapsed}
                      aria-label={`Свернуть этап ${index + 1}`}
                      onChange={(event) => patch(stage.id, { collapsed: event.target.checked })}
                    />
                    <span>свёрнут</span>
                  </label>
                  <button
                    type="button"
                    className="ghost-button ghost-button--small"
                    aria-label={`Удалить этап ${index + 1}`}
                    onClick={() =>
                      setDraft((current) => current.filter((item) => item.id !== stage.id))
                    }
                  >
                    Удалить
                  </button>
                </div>

                {stage.milestones.length > 0 ? (
                  <div className="milestone-list">
                    {stage.milestones.map((milestone, milestoneIndex) => (
                      <div className="milestone-row" key={milestone.id}>
                        <label>
                          <span>Веха</span>
                          <input
                            value={milestone.name}
                            aria-label={`Название вехи ${milestoneIndex + 1} этапа ${index + 1}`}
                            onChange={(event) =>
                              patchMilestone(stage.id, milestone.id, { name: event.target.value })
                            }
                          />
                        </label>
                        <label className="stage-row__number">
                          <span>X</span>
                          <input
                            type="number"
                            step={10}
                            value={milestone.x}
                            aria-label={`Позиция вехи ${milestoneIndex + 1} этапа ${index + 1}`}
                            onChange={(event) =>
                              patchMilestone(stage.id, milestone.id, {
                                x: Math.round(Number(event.target.value) || 0),
                              })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="ghost-button ghost-button--small"
                          aria-label={`Удалить веху ${milestoneIndex + 1} этапа ${index + 1}`}
                          onClick={() =>
                            patch(stage.id, {
                              milestones: stage.milestones.filter(
                                (item) => item.id !== milestone.id,
                              ),
                            })
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="ghost-button ghost-button--small stage-item__add"
                  aria-label={`Добавить веху к этапу ${index + 1}`}
                  onClick={() =>
                    patch(stage.id, {
                      milestones: [
                        ...stage.milestones,
                        createMilestone(stage, stage.milestones.length),
                      ],
                    })
                  }
                >
                  Добавить веху
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          className="ghost-button stage-list__add"
          onClick={() => setDraft((current) => [...current, createStage(current)])}
        >
          Добавить этап
        </button>

        <footer className="dialog__footer">
          <button type="button" className="ghost-button" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="ghost-button ghost-button--primary"
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Применить
          </button>
        </footer>
      </section>
    </div>
  );
}
