import { useEffect, useState } from 'react';

import {
  createMilestone,
  createStage,
  STAGE_MIN_WIDTH,
  type DiagramStage,
  type StageMilestone,
  type StagePool,
} from '../lib/stages';

/** Настройка этапов: фазы внутри пула, их ширина/сдвиг, вехи и сворачивание. */
export function StagesDialog({
  open,
  stages,
  pools,
  onChange,
  onClose,
}: {
  open: boolean;
  stages: DiagramStage[];
  pools: StagePool[];
  onChange: (stages: DiagramStage[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DiagramStage[]>(stages);
  const [poolId, setPoolId] = useState(pools[0]?.id ?? '');

  useEffect(() => {
    if (open) {
      setDraft(stages);
      setPoolId((current) =>
        pools.some((pool) => pool.id === current) ? current : (pools[0]?.id ?? ''),
      );
    }
  }, [open, stages, pools]);

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

  const poolFor = (stage: DiagramStage) => pools.find((pool) => pool.id === stage.poolId);

  const patch = (id: string, next: Partial<DiagramStage>) => {
    setDraft((current) =>
      current.map((stage) => (stage.id === id ? { ...stage, ...next } : stage)),
    );
  };

  const patchPool = (stage: DiagramStage, nextPoolId: string) => {
    const pool = pools.find((item) => item.id === nextPoolId);
    if (!pool) {
      return;
    }
    patch(stage.id, {
      poolId: nextPoolId,
      x: Math.min(stage.x, Math.max(0, pool.width - STAGE_MIN_WIDTH)),
      width: Math.min(stage.width, Math.max(STAGE_MIN_WIDTH, pool.width - 12)),
    });
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
          Этап — вертикальная фаза внутри пула, как milestone в Bizagi. Он проходит через все
          дорожки и ограничен границами пула; элементы внутри этапа можно свернуть, не меняя XML.
          Веха — горизонтальная отметка внутри этапа.
        </p>

        {draft.length === 0 ? (
          <p className="settings-section__empty">Этапов пока нет.</p>
        ) : (
          <div className="stage-list">
            {draft.map((stage, index) => {
              const pool = poolFor(stage);
              const maxX = Math.max(0, (pool?.width ?? 0) - STAGE_MIN_WIDTH);
              const maxWidth = Math.max(STAGE_MIN_WIDTH, (pool?.width ?? 0) - stage.x);
              return (
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
                    <label className="stage-row__pool">
                      <span>Пул</span>
                      <select
                        value={stage.poolId}
                        aria-label={`Пул этапа ${index + 1}`}
                        disabled={pools.length < 2}
                        onChange={(event) => patchPool(stage, event.target.value)}
                      >
                        {pools.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.name}
                          </option>
                        ))}
                        {!pool ? <option value={stage.poolId}>Пул не найден</option> : null}
                      </select>
                    </label>
                    <label className="stage-row__number">
                      <span>Слева</span>
                      <input
                        type="number"
                        min={0}
                        max={maxX}
                        step={10}
                        value={stage.x}
                        aria-label={`Сдвиг этапа ${index + 1}`}
                        onChange={(event) =>
                          patch(stage.id, {
                            x: Math.min(maxX, Math.max(0, Number(event.target.value) || 0)),
                          })
                        }
                      />
                    </label>
                    <label className="stage-row__number">
                      <span>Ширина</span>
                      <input
                        type="number"
                        min={STAGE_MIN_WIDTH}
                        max={maxWidth}
                        step={10}
                        value={stage.width}
                        aria-label={`Ширина этапа ${index + 1}`}
                        onChange={(event) =>
                          patch(stage.id, {
                            width: Math.min(
                              maxWidth,
                              Math.max(STAGE_MIN_WIDTH, Number(event.target.value) || 0),
                            ),
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
                                patchMilestone(stage.id, milestone.id, {
                                  name: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="stage-row__number">
                            <span>Y</span>
                            <input
                              type="number"
                              min={0}
                              max={Math.max(0, (pool?.height ?? 0) - 20)}
                              step={10}
                              value={milestone.y}
                              aria-label={`Позиция вехи ${milestoneIndex + 1} этапа ${index + 1}`}
                              onChange={(event) =>
                                patchMilestone(stage.id, milestone.id, {
                                  y: Math.max(0, Math.round(Number(event.target.value) || 0)),
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
              );
            })}
          </div>
        )}

        <div className="stage-add">
          <label>
            <span>Пул для нового этапа</span>
            <select
              value={poolId}
              aria-label="Пул для нового этапа"
              onChange={(event) => setPoolId(event.target.value)}
            >
              {pools.map((pool) => (
                <option value={pool.id} key={pool.id}>
                  {pool.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="ghost-button stage-list__add"
            disabled={pools.length === 0}
            onClick={() => {
              const pool = pools.find((item) => item.id === poolId);
              if (pool) {
                setDraft((current) => [...current, createStage(current, pool)]);
              }
            }}
          >
            Добавить этап
          </button>
        </div>

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
