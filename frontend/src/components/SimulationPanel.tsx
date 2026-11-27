import { useCallback, useEffect, useState } from 'react';

import { usePanelDrag } from '../hooks/usePanelDrag';
import {
  createSimulationTestCase,
  deleteSimulationRun,
  deleteSimulationTestCase,
  fetchSimulationRuns,
  fetchSimulationTestCases,
  runSimulationTestCase,
  saveSimulationRun,
  updateSimulationTestCase,
  type SimulationReport,
  type SimulationRun,
  type SimulationStep,
  type SimulationTestCase,
  type SimulationTestCaseResult,
  type SimulationVariable,
} from '../lib/api';
import { formatSimulationVariable, parseSimulationVariables } from '../lib/simulation-variables';

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
  heatmap,
  onHeatmapChange,
  onRun,
  onChooseBranch,
  onStep,
  onTogglePlay,
  onSpeedChange,
  onClose,
  scope,
  autoLayout,
  variables,
  choices,
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
  heatmap: boolean;
  onHeatmapChange: (value: boolean) => void;
  onRun: () => void;
  onChooseBranch: (flowId: string) => void;
  onStep: (index: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
  scope: string;
  autoLayout: boolean;
  variables: Record<string, SimulationVariable>;
  choices: Record<string, string>;
}) {
  const steps = report?.steps ?? [];
  const total = steps.length;
  const current = total === 0 ? 0 : Math.min(index, total - 1);
  const currentStep: SimulationStep | undefined = steps[current];
  const atEnd = total > 0 && current >= total - 1;
  const stepVariables = Object.entries(currentStep?.variables ?? {});
  const changedNames = new Set(currentStep?.changed ?? []);

  const counts = report ? Object.entries(report.counts) : [];
  const drag = usePanelDrag('simulation', scope, autoLayout);

  return (
    <aside
      ref={drag.panelRef}
      className="comments-panel simulation-panel"
      style={drag.panelStyle}
      aria-label="Симуляция процесса"
    >
      <header className="simulation-panel__header" {...drag.handleProps}>
        <h2 className="simulation-panel__title">Симуляция</h2>
        <button
          type="button"
          className="ghost-button ghost-button--small"
          title="Закрыть"
          aria-label="Закрыть"
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
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
        <label className="simulation-panel__heatmap">
          <input
            type="checkbox"
            checked={heatmap}
            onChange={(event) => onHeatmapChange(event.currentTarget.checked)}
          />
          <span>Тепловая карта</span>
        </label>
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
              {currentStep.action === 'waiting'
                ? ` · ${currentStep.message ?? 'ожидание веток'}`
                : ''}
            </p>
          ) : null}

          <div className="simulation-panel__state">
            <h3 className="simulation-panel__subtitle">Переменные на шаге</h3>
            {stepVariables.length === 0 ? (
              <p className="simulation-panel__hint">На этом шаге переменных нет.</p>
            ) : (
              <ul aria-label="Переменные на шаге">
                {stepVariables.map(([name, value]) => (
                  <li
                    key={name}
                    className={
                      changedNames.has(name)
                        ? 'simulation-panel__state-item simulation-panel__state-item--changed'
                        : 'simulation-panel__state-item'
                    }
                    title={changedNames.has(name) ? 'Изменено на этом шаге' : undefined}
                  >
                    <span className="simulation-panel__state-name">{name}</span>
                    <span className="simulation-panel__state-value">
                      {formatSimulationVariable(value)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

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

      <SimulationLibrary
        diagramId={scope}
        report={report}
        variables={variables}
        choices={choices}
      />

      {autoLayout ? null : (
        <span
          className="comments-panel__resize"
          aria-hidden="true"
          title="Изменить размер"
          {...drag.resizeHandleProps}
        />
      )}
    </aside>
  );
}

function formatRunTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

/** Сохранённые прогоны и тест-кейсы диаграммы (этап 3.4). */
function SimulationLibrary({
  diagramId,
  report,
  variables,
  choices,
}: {
  diagramId: string;
  report: SimulationReport | null;
  variables: Record<string, SimulationVariable>;
  choices: Record<string, string>;
}) {
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [cases, setCases] = useState<SimulationTestCase[]>([]);
  const [caseName, setCaseName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    caseId: string;
    value: SimulationTestCaseResult;
  } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftSteps, setDraftSteps] = useState('');
  const [draftExpected, setDraftExpected] = useState('');
  const [repin, setRepin] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextRuns, nextCases] = await Promise.all([
        fetchSimulationRuns(diagramId),
        fetchSimulationTestCases(diagramId),
      ]);
      setRuns(nextRuns);
      setCases(nextCases);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'не удалось загрузить прогоны');
    }
  }, [diagramId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'операция не удалась');
    } finally {
      setBusy(false);
    }
  };

  const saveRun = () =>
    perform(async () => {
      if (!report) {
        return;
      }
      await saveSimulationRun(diagramId, variables, choices);
      await refresh();
    });

  const saveCase = () =>
    perform(async () => {
      if (!report) {
        return;
      }
      const lastStep = report.steps[report.steps.length - 1];
      const finalVariables = lastStep?.variables ?? {};
      await createSimulationTestCase(diagramId, {
        name: caseName.trim() || 'Тест-кейс',
        variables,
        choices,
        expected_steps: report.steps.map((step) => step.node_id),
        expected_variables: finalVariables,
      });
      setCaseName('');
      await refresh();
    });

  const runCase = (caseId: string) =>
    perform(async () => {
      const value = await runSimulationTestCase(diagramId, caseId);
      setResult({ caseId, value });
    });

  const startEdit = (item: SimulationTestCase) => {
    setEditing(item.id);
    setDraftName(item.name);
    setDraftSteps(item.expected_steps.join(', '));
    setDraftExpected(
      Object.entries(item.expected_variables)
        .map(([name, value]) => `${name} = ${formatSimulationVariable(value)}`)
        .join('\n'),
    );
    setRepin(false);
    setError(null);
  };

  const fillFromRun = () => {
    if (!report) {
      return;
    }
    setDraftSteps(report.steps.map((step) => step.node_id).join(', '));
    const lastStep = report.steps[report.steps.length - 1];
    setDraftExpected(
      Object.entries(lastStep?.variables ?? {})
        .map(([name, value]) => `${name} = ${formatSimulationVariable(value)}`)
        .join('\n'),
    );
  };

  const saveEdit = (item: SimulationTestCase) =>
    perform(async () => {
      const parsed = parseSimulationVariables(draftExpected);
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      const steps = draftSteps
        .split(',')
        .map((step) => step.trim())
        .filter((step) => step !== '');
      await updateSimulationTestCase(diagramId, item.id, {
        name: draftName.trim() || item.name,
        expected_steps: steps,
        expected_variables: parsed.variables,
        ...(repin ? { version_id: null } : {}),
      });
      setEditing(null);
      await refresh();
    });

  const removeCase = (caseId: string) =>
    perform(async () => {
      await deleteSimulationTestCase(diagramId, caseId);
      setResult((current) => (current?.caseId === caseId ? null : current));
      await refresh();
    });

  return (
    <section className="simulation-panel__library" aria-label="Сохранённые прогоны и тест-кейсы">
      <div className="simulation-panel__library-actions">
        <button
          type="button"
          className="ghost-button ghost-button--small"
          disabled={busy || !report}
          onClick={() => void saveRun()}
        >
          Сохранить прогон
        </button>
        <input
          className="simulation-panel__case-name"
          aria-label="Название тест-кейса"
          placeholder="Название тест-кейса"
          value={caseName}
          maxLength={255}
          onChange={(event) => setCaseName(event.currentTarget.value)}
        />
        <button
          type="button"
          className="ghost-button ghost-button--small"
          disabled={busy || !report}
          onClick={() => void saveCase()}
        >
          Сохранить как тест-кейс
        </button>
      </div>

      {error ? (
        <p className="simulation-panel__error" role="alert">
          {error}
        </p>
      ) : null}

      <h3 className="simulation-panel__subtitle">Сохранённые прогоны</h3>
      {runs.length === 0 ? (
        <p className="simulation-panel__hint">Прогонов пока нет.</p>
      ) : (
        <ul className="simulation-panel__library-list">
          {runs.map((run) => (
            <li key={run.id} data-testid="sim-run">
              <span>{formatRunTime(run.created_at)}</span>
              <span className="simulation-panel__hint">
                {' '}
                · {run.report.steps.length} шагов
                {run.report.completed ? '' : ' · не завершён'}
              </span>
              <button
                type="button"
                className="ghost-button ghost-button--small"
                aria-label="Удалить прогон"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await deleteSimulationRun(diagramId, run.id);
                    await refresh();
                  })
                }
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <h3 className="simulation-panel__subtitle">Тест-кейсы</h3>
      {cases.length === 0 ? (
        <p className="simulation-panel__hint">Тест-кейсов пока нет.</p>
      ) : (
        <ul className="simulation-panel__library-list">
          {cases.map((item) => (
            <li key={item.id} data-testid="sim-case">
              {editing === item.id ? (
                <div className="simulation-panel__case-edit">
                  <input
                    className="simulation-panel__case-name"
                    aria-label="Имя тест-кейса"
                    value={draftName}
                    maxLength={255}
                    onChange={(event) => setDraftName(event.currentTarget.value)}
                  />
                  <input
                    className="simulation-panel__case-name"
                    aria-label="Ожидаемые шаги"
                    placeholder="id шагов через запятую"
                    value={draftSteps}
                    onChange={(event) => setDraftSteps(event.currentTarget.value)}
                  />
                  <textarea
                    className="simulation-panel__case-name"
                    aria-label="Ожидаемые переменные"
                    rows={2}
                    spellCheck={false}
                    value={draftExpected}
                    onChange={(event) => setDraftExpected(event.currentTarget.value)}
                  />
                  <label className="simulation-panel__case-repin">
                    <input
                      type="checkbox"
                      checked={repin}
                      onChange={(event) => setRepin(event.currentTarget.checked)}
                    />
                    <span>Привязать к текущей версии</span>
                  </label>
                  <div className="simulation-panel__library-actions">
                    <button
                      type="button"
                      className="ghost-button ghost-button--small"
                      disabled={busy || !report}
                      onClick={fillFromRun}
                    >
                      Из прогона
                    </button>
                    <button
                      type="button"
                      className="ghost-button ghost-button--small ghost-button--primary"
                      disabled={busy}
                      onClick={() => void saveEdit(item)}
                    >
                      Сохранить
                    </button>
                    <button
                      type="button"
                      className="ghost-button ghost-button--small"
                      onClick={() => setEditing(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span>{item.name}</span>
                  <button
                    type="button"
                    className="ghost-button ghost-button--small"
                    aria-label={`Запустить тест-кейс ${item.name}`}
                    disabled={busy}
                    onClick={() => void runCase(item.id)}
                  >
                    Запустить
                  </button>
                  <button
                    type="button"
                    className="ghost-button ghost-button--small"
                    aria-label={`Изменить тест-кейс ${item.name}`}
                    disabled={busy}
                    onClick={() => startEdit(item)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className="ghost-button ghost-button--small"
                    aria-label={`Удалить тест-кейс ${item.name}`}
                    disabled={busy}
                    onClick={() => void removeCase(item.id)}
                  >
                    ×
                  </button>
                </>
              )}
              {result?.caseId === item.id ? (
                <div
                  className="simulation-panel__case-result"
                  role="status"
                  data-testid="sim-case-result"
                >
                  <strong>{result.value.passed ? 'Пройден' : 'Не пройден'}</strong>
                  {result.value.step_diffs.map((diff) => (
                    <span key={`step-${diff.index}`}>
                      шаг {diff.index + 1}: ожидалось {diff.expected ?? '—'}, получено{' '}
                      {diff.actual ?? '—'}
                    </span>
                  ))}
                  {result.value.variable_diffs.map((diff) => (
                    <span key={`variable-${diff.name}`}>
                      {diff.name}: ожидалось{' '}
                      {diff.expected === null ? '—' : formatSimulationVariable(diff.expected)},
                      получено {diff.actual === null ? '—' : formatSimulationVariable(diff.actual)}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
