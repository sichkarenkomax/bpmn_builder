import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { stageBounds, stageForPool, type DiagramStage, type StagePool } from '../lib/stages';

/** Этапы внутри пулов: границы, названия, изменение ширины и сворачивание. */
export function StageBands({
  stages,
  pools,
  viewbox,
  onToggle,
  onAdd,
  onRename,
  onResizePreview,
  onResizeCommit,
  onResizeCancel,
}: {
  stages: DiagramStage[];
  pools: StagePool[];
  viewbox: { x: number; y: number; scale: number };
  onToggle: (stage: DiagramStage) => void;
  onAdd: (stage: DiagramStage) => void;
  onRename: (stage: DiagramStage, name: string) => void;
  onResizePreview: (stage: DiagramStage, delta: number) => number;
  onResizeCommit: (stage: DiagramStage, delta: number) => void;
  onResizeCancel: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [drag, setDrag] = useState<{ stageId: string; delta: number } | null>(null);
  const dragRef = useRef<{ stageId: string; startX: number; delta: number } | null>(null);

  if (stages.length === 0) {
    return null;
  }

  const commitName = (stage: DiagramStage) => {
    const name = draftName.trim();
    if (name && name !== stage.name) {
      onRename(stage, name);
    }
    setEditingId(null);
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>, stage: DiagramStage) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { stageId: stage.id, startX: event.clientX, delta: 0 };
    setDrag({ stageId: stage.id, delta: 0 });
  };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>, stage: DiagramStage) => {
    const current = dragRef.current;
    if (!current || current.stageId !== stage.id) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const scale = Math.max(0.01, viewbox.scale);
    const delta = onResizePreview(stage, (event.clientX - current.startX) / scale);
    current.delta = delta;
    setDrag({ stageId: stage.id, delta });
  };

  const finishResize = (event: ReactPointerEvent<HTMLDivElement>, stage: DiagramStage) => {
    const current = dragRef.current;
    if (!current || current.stageId !== stage.id) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onResizeCommit(stage, current.delta);
    setDrag(null);
  };

  const cancelResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onResizeCancel();
    dragRef.current = null;
    setDrag(null);
  };

  return (
    <div className="stage-bands" aria-label="Этапы схемы">
      {stages.map((stage) => {
        const bounds = stageBounds(stage, pools, stages);
        if (!bounds || bounds.width <= 0) {
          return null;
        }
        const samePool = stageForPool(stages, stage.poolId);
        const index = samePool.findIndex((item) => item.id === stage.id);
        const dragIndex =
          drag && samePool.some((item) => item.id === drag.stageId)
            ? samePool.findIndex((item) => item.id === drag.stageId)
            : -1;
        const previewDelta = drag && dragIndex !== -1 && index > dragIndex ? drag.delta : 0;
        const widthDelta = drag?.stageId === stage.id ? drag.delta : 0;
        const left = (bounds.x + previewDelta - viewbox.x) * viewbox.scale;
        const top = (bounds.y - viewbox.y) * viewbox.scale;
        const width = Math.max(1, (bounds.width + widthDelta) * viewbox.scale);
        const height = Math.max(1, bounds.height * viewbox.scale);
        const lastInPool = samePool.at(-1)?.id === stage.id;
        return (
          <section
            key={stage.id}
            className={[
              'stage-band',
              lastInPool ? 'stage-band--last' : '',
              stage.collapsed ? 'stage-band--collapsed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ left, top, width, height }}
            data-stage-id={stage.id}
            data-pool-id={stage.poolId}
            data-collapsed={stage.collapsed ? 'true' : 'false'}
            aria-label={`Этап «${stage.name}»`}
          >
            <svg
              className={['stage-band__line', lastInPool ? 'stage-band__line--pool' : '']
                .filter(Boolean)
                .join(' ')}
              width="16"
              height={height}
              viewBox={`0 0 16 ${height}`}
              aria-hidden="true"
            >
              <path d={`M 8 0 L 8 4 L 15 10 L 8 16 L 8 ${height}`} />
            </svg>
            <div
              className="stage-band__resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label={`Изменить ширину этапа «${stage.name}»`}
              title="Перетащите, чтобы изменить ширину этапа"
              onPointerDown={(event) => startResize(event, stage)}
              onPointerMove={(event) => moveResize(event, stage)}
              onPointerUp={(event) => finishResize(event, stage)}
              onPointerCancel={cancelResize}
              onLostPointerCapture={cancelResize}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            />
            <header className="stage-band__header">
              {editingId === stage.id ? (
                <input
                  className="stage-band__name-input"
                  value={draftName}
                  aria-label={`Название этапа «${stage.name}»`}
                  autoFocus
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setDraftName(event.target.value)}
                  onBlur={() => commitName(stage)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitName(stage);
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="stage-band__name"
                  title={`${stage.name} — двойной щелчок, чтобы переименовать`}
                  onDoubleClick={() => {
                    setDraftName(stage.name);
                    setEditingId(stage.id);
                  }}
                >
                  {stage.name || 'Без названия'}
                </button>
              )}
              {stage.collapsed ? (
                <span className="stage-band__collapsed-note">· свёрнут</span>
              ) : null}
              <button
                type="button"
                className="stage-band__toggle"
                aria-label={
                  stage.collapsed
                    ? `Развернуть этап «${stage.name}»`
                    : `Свернуть этап «${stage.name}»`
                }
                title={stage.collapsed ? 'Развернуть этап' : 'Свернуть этап'}
                onClick={() => onToggle(stage)}
              >
                {stage.collapsed ? '▸' : '▾'}
              </button>
            </header>
            {lastInPool ? (
              <button
                type="button"
                className="stage-band__add"
                aria-label={`Добавить этап после «${stage.name}»`}
                title="Добавить этап"
                onClick={() => onAdd(stage)}
              >
                +
              </button>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
