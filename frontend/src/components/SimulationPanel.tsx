import type { SimulationReport, SimulationStep } from '../lib/api';

const SPEEDS = [0.5, 1, 1.5, 2] as const;

/** Панель симуляции токена: запуск, шаги, автопроигрывание и журнал (этап 3). */
export function SimulationPanel({
  report,
  index,
  playing,
  speed,
  busy,
  error,
  variablesText,
  variablesError,
  onVariablesChange,
  onRun,
  onChooseBranch,
  onStep,
  onTogglePlay,
  onSpeedChange,
  onClose,
}: {
  report: SimulationReport | null;
  index: number;
  playing: boolean;
  speed: number;
  busy: boolean;
  error: string | null;
  variablesText: string;
  variablesError: string | null;
  onVariablesChange: (text: string) => void;
  onRun: () => void;
  onChooseBranch: (flowId: string) => void;
  onStep: (index: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
}) {
  const steps = report?.steps ?? [];
  const total = steps.length;
  const current = total === 0 ? 0 : Math.min(index, total - 1);
  const currentStep: SimulationStep | undefined = steps[current];
  const atEnd = total > 0 && current >= total - 1;

  const counts = report ? Object.entries(report.counts) : [];

  return (
    <aside className="comments-panel simulation-panel" aria-label="Симуляция процесса">
      <header className="simulation-panel__header">
        <h2 className="simulation-panel__title">Симуляция</h2>
        <button type="button" className="ghost-button ghost-button--small" onClick={onClose}>
          Закрыть
        </button>
      </header>

      <div className="simulation-panel__controls">
        <button
          type="button"
          className="ghost-button ghost-button--small ghost-button--primary"
          disabled={busy || Boolean(variablesError)}
          onClick={onRun}
        >
          {report ? 'Перезапустить' : 'Запустить'}
        </button>
        <button
          type="button"
          className="ghost-button ghost-button--small"
          title="Предыдущий шаг"
          aria-label="Предыдущий шаг"
          disabled={current === 0 || !report}
          onClick={() => onStep(current - 1)}
        >
          ‹
        </button>
        <button
          type="button"
          className="ghost-button ghost-button--small"
          title={playing ? 'Пауза' : 'Играть'}
          aria-label={playing ? 'Пауза' : 'Играть'}
          disabled={!report || atEnd}
          onClick={onTogglePlay}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button
          type="button"
          className="ghost-button ghost-button--small"
          title="Следующий шаг"
          aria-label="Следующий шаг"
          disabled={!report || atEnd}
          onClick={() => onStep(current + 1)}
        >
          ›
        </button>
        <label className="simulation-panel__speed">
          <span>Скорость</span>
          <select value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))}>
            {SPEEDS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <details className="simulation-panel__variables">
        <summary>Переменные</summary>
        <textarea
          value={variablesText}
          rows={3}
          spellCheck={false}
          aria-label="Переменные симуляции"
          placeholder={'approved = true\namount = 1200'}
          onChange={(event) => onVariablesChange(event.currentTarget.value)}
        />
        {variablesError ? (
          <p className="simulation-panel__error" role="alert">
            {variablesError}
          </p>
        ) : (
          <p className="simulation-panel__hint">
            По строке на переменную: <code>имя = значение</code>. Числа, <code>true</code>/
            <code>false</code> и строки; условия веток считаются по ним при запуске.
          </p>
        )}
      </details>

      {busy ? <p className="simulation-panel__hint">Считаем прогон…</p> : null}
      {error ? (
        <p className="simulation-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      {report?.decision ? (
        <div className="simulation-panel__decision" role="group" aria-label="Выбор ветки симуляции">
          <p className="simulation-panel__hint">
            {report.decision.reason === 'variables_missing'
              ? 'Условие ссылается на переменные, которых нет в прогоне.'
              : report.decision.reason === 'no_match'
                ? 'Ни одно условие не выполнилось.'
                : 'У ветвей не заданы условия.'}{' '}
            Выберите ветку у «{report.decision.node_name || report.decision.node_id}»:
          </p>
          <div className="simulation-panel__branches">
            {report.decision.branches.map((branch) => (
              <button
                key={branch.flow_id}
                type="button"
                className="ghost-button ghost-button--small"
                onClick={() => onChooseBranch(branch.flow_id)}
              >
                <span>{branch.flow_name || branch.target_name || branch.flow_id}</span>
                {branch.target_name && branch.flow_name ? (
                  <small> → {branch.target_name}</small>
                ) : null}
                <small>{branch.condition ? ` · ${branch.condition}` : ' · без условия'}</small>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {report ? (
        <>
          <p className="simulation-panel__summary" role="status" aria-live="polite">
            {report.completed
              ? `Завершено: ${total} шагов, токенов ${report.tokens_completed}/${report.tokens_started}`
              : `Не завершено: ${total} шагов, токенов ${report.tokens_completed}/${report.tokens_started}`}
          </p>

          {currentStep ? (
            <p className="simulation-panel__current">
              Шаг {currentStep.index}/{total}:{' '}
              <strong>{currentStep.node_name || currentStep.node_id}</strong>
              {currentStep.action === 'waiting' ? ' · ожидание веток' : ''}
            </p>
          ) : null}

          <ol className="simulation-panel__log" aria-label="Журнал симуляции">
            {steps.map((step, stepIndex) => (
              <li key={`${step.index}-${step.token}-${step.node_id}`}>
                <button
                  type="button"
                  className={
                    stepIndex === current
                      ? 'simulation-panel__step simulation-panel__step--active'
                      : stepIndex < current
                        ? 'simulation-panel__step simulation-panel__step--past'
                        : 'simulation-panel__step'
                  }
                  aria-current={stepIndex === current ? 'step' : undefined}
                  onClick={() => onStep(stepIndex)}
                >
                  <span className="simulation-panel__step-index">{step.index}</span>
                  <span className="simulation-panel__step-name">
                    {step.node_name || step.node_id}
                  </span>
                  <span className="simulation-panel__step-meta">
                    {step.node_type.replace(/^bpmn:/, '')} · токен {step.token}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          <div className="simulation-panel__counts">
            <h3 className="simulation-panel__subtitle">Прохождения</h3>
            {counts.length === 0 ? (
              <p className="simulation-panel__hint">Пока нет пройденных элементов.</p>
            ) : (
              <ul>
                {counts.map(([nodeId, count]) => {
                  const node = steps.find((step) => step.node_id === nodeId);
                  const name = node?.node_name || nodeId;
                  const busiest = Math.max(...counts.map(([, value]) => value));
                  return (
                    <li key={nodeId}>
                      <span className="simulation-panel__count-name">{name}</span>
                      <span
                        className="simulation-panel__count-bar"
                        style={{ width: `${Math.round((count / busiest) * 100)}%` }}
                        aria-hidden="true"
                      />
                      <span className="simulation-panel__count-value">{count}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <p className="simulation-panel__hint">
          Запустите прогон: токен пройдёт по сохранённой версии схемы. Подсветка покажет путь и
          текущий элемент, журнал — шаги и ожидания шлюзов.
        </p>
      )}
    </aside>
  );
}
