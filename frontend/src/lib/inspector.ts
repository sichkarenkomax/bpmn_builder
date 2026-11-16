import { ATTRIBUTE_TYPES, type AttributeType } from './attributes';

export interface InspectorElement {
  id: string;
  type: string;
  name: string;
  documentation: string;
  assignee: string;
  candidateGroups: string;
  script: string;
  scriptFormat: string;
  condition: string;
  isDefaultFlow: boolean;
  isForCompensation: boolean;
  isMultiInstance: boolean;
  isSequential: boolean;
  collection: string;
  elementVariable: string;
  isExpanded: boolean;
  fillColor: string;
  strokeColor: string;
  fontFamily: string;
  fontSize: string;
  fontColor: string;
  isBold: boolean;
  isItalic: boolean;
  textAlign: string;
  textDirection: string;
  opacity: string;
  strokeWidth: string;
  strokeStyle: string;
  customProperties: { name: string; value: string; type: AttributeType }[];
}

export { ATTRIBUTE_TYPES };

export type InspectorPatch = Partial<InspectorElement>;

const TASK_TYPES = new Set([
  'bpmn:Task',
  'bpmn:UserTask',
  'bpmn:ServiceTask',
  'bpmn:ScriptTask',
  'bpmn:ManualTask',
  'bpmn:BusinessRuleTask',
  'bpmn:SendTask',
  'bpmn:ReceiveTask',
  'bpmn:SubProcess',
  'bpmn:CallActivity',
]);

export function isTaskType(type: string): boolean {
  return TASK_TYPES.has(type);
}

export function isUserTaskType(type: string): boolean {
  return type === 'bpmn:UserTask';
}

export function isScriptTaskType(type: string): boolean {
  return type === 'bpmn:ScriptTask';
}

export function isSequenceFlowType(type: string): boolean {
  return type === 'bpmn:SequenceFlow';
}

export function isSubProcessType(type: string): boolean {
  return type === 'bpmn:SubProcess';
}

const ID_PATTERN = /^[A-Za-z_][\w.-]*$/;

/** Возвращает текст ошибки или null, если id допустим. */
export function validateElementId(id: string): string | null {
  if (!ID_PATTERN.test(id)) {
    return 'ID: латиница, цифры, «_», «-», «.», начинать с буквы или «_»';
  }
  return null;
}
