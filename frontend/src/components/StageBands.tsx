import { STAGE_HEADER_HEIGHT, type DiagramStage } from '../lib/stages';

/** Полосы этапов поверх холста: подписи, сворачивание, масштаб вместе с viewbox. */
export function StageBands({
  stages,
  viewbox,
  onToggle,
}: {
  stages: DiagramStage[];
  viewbox: { x: number; y: number; scale: number };
  onToggle: (stage: DiagramStage) => void;
}) {
  if (stages.length === 0) {
    return null;
  }

  return (
    <div className="stage-bands" aria-label="Этапы схемы">
      {stages.map((stage) => {
        const top = (stage.y - viewbox.y) * viewbox.scale;
        const height = stage.collapsed
          ? STAGE_HEADER_HEIGHT
          : Math.max(STAGE_HEADER_HEIGHT, stage.height * viewbox.scale);
        return (
          <section
            key={stage.id}
            className={stage.collapsed ? 'stage-band stage-band--collapsed' : 'stage-band'}
            style={{ top, height }}
            data-stage-id={stage.id}
            data-collapsed={stage.collapsed ? 'true' : 'false'}
          >
            {!stage.collapsed && stage.milestones.length > 0
              ? stage.milestones.map((milestone) => (
                  <div
                    key={milestone.id}
                    className="stage-milestone"
                    style={{ left: (milestone.x - viewbox.x) * viewbox.scale }}
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
              {stage.collapsed ? <span className="stage-band__collapsed-note">свёрнут</span> : null}
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
