/** Автоответственный из дорожки: ручной assignee важнее названия дорожки. */

type LaneCarrier = {
  type?: string;
  businessObject?: { name?: string; $type?: string };
  parent?: LaneCarrier;
};

/** Ближайшая дорожка-предок элемента; пулы и процессы пропускаем. */
export function ancestorLane(element: LaneCarrier | null | undefined): LaneCarrier | null {
  let current = element?.parent;
  while (current) {
    if (current.type === 'bpmn:Lane' || current.businessObject?.$type === 'bpmn:Lane') {
      return current;
    }
    current = current.parent;
  }
  return null;
}

/** Название дорожки — источник ответственного по умолчанию. */
export function laneAssignee(element: LaneCarrier | null | undefined): string {
  return ancestorLane(element)?.businessObject?.name?.trim() ?? '';
}

/** Заполнять assignee можно только у user task без ручного значения. */
export function needsLaneAssignee(
  type: string | undefined,
  current: string | undefined,
  laneName: string,
): boolean {
  return type === 'bpmn:UserTask' && !(current ?? '').trim() && laneName !== '';
}
