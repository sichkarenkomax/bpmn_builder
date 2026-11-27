import { describe, expect, it } from 'vitest';

import { ancestorLane, laneAssignee, needsLaneAssignee } from './lane-assignee';

const lane = { type: 'bpmn:Lane', businessObject: { $type: 'bpmn:Lane', name: ' Банк ' } };
const pool = { type: 'bpmn:Participant', businessObject: { name: 'Кредит' }, parent: lane };

describe('lane assignee', () => {
  it('находит ближайшую дорожку вверх по дереву', () => {
    const task = { type: 'bpmn:UserTask', parent: pool };
    expect(ancestorLane(task)).toBe(lane);
    expect(laneAssignee(task)).toBe('Банк');
  });

  it('не берёт имя пула вместо дорожки', () => {
    const poolOnly = { type: 'bpmn:Participant', businessObject: { name: 'Кредит' } };
    expect(laneAssignee({ type: 'bpmn:UserTask', parent: poolOnly })).toBe('');
  });

  it('заполняет только user task без ручного assignee', () => {
    expect(needsLaneAssignee('bpmn:UserTask', '', 'Банк')).toBe(true);
    expect(needsLaneAssignee('bpmn:UserTask', undefined, 'Банк')).toBe(true);
    expect(needsLaneAssignee('bpmn:UserTask', 'иван@example.com', 'Банк')).toBe(false);
    expect(needsLaneAssignee('bpmn:ServiceTask', '', 'Банк')).toBe(false);
    expect(needsLaneAssignee('bpmn:UserTask', '', '')).toBe(false);
  });
});
