import { stageBounds, type DiagramStage, type StagePool } from '../lib/stages';

/** Этапы внутри пулов: вертикальные фазы, подписи, вехи и сворачивание. */
export function StageBands({
  stages,
  pools,
  viewbox,
  onToggle,
}: {
  stages: DiagramStage[];
  pools: StagePool[];
  viewbox: { x: number; y: number; scale: number };
  onToggle: (stage: DiagramStage) => void;
}) {
  if (stages.length === 0) {
    return null;
  }

  return (
    <div className="stage-bands" aria-label="Этапы схемы">
      {stages.map((stage) => {
        const bounds = stageBounds(stage, pools);
        if (!bounds) {
          return null;
        }
        const firstInPool =
          stages
            .filter((item) => item.poolId === stage.poolId)
            .sort((left, right) => left.x - right.x)[0]?.id === stage.id;
        const left = (bounds.x - viewbox.x) * viewbox.scale;
        const top = (bounds.y - viewbox.y) * viewbox.scale;
        const width = Math.max(1, bounds.width * viewbox.scale);
        const height = Math.max(1, bounds.height * viewbox.scale);
        return (
          <section
            key={stage.id}
            className={[
              'stage-band',
              firstInPool ? 'stage-band--first' : '',
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
            {!stage.collapsed && stage.milestones.length > 0
              ? stage.milestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className="stage-milestone"
                    style={{ top: milestone.y * viewbox.scale }}
                    data-milestone-id={milestone.id}
                  >
                    <span className="stage-milestone__label">{milestone.name}</span>
                  </div>
                ))
              : null}
            <header className="stage-band__header">
              <span className="stage-band__name" title={stage.name}>
                {stage.name || 'Без названия'}
              </span>
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
          </section>
        );
      })}
    </div>
  );
}
