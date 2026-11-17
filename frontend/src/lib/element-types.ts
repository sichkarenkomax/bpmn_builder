// Человекочитаемые названия типов BPMN для инспектора.
// Технический `$type` остаётся рядом подсказкой — по нему удобно искать в XML.

const ELEMENT_TYPE_LABELS: Record<string, string> = {
  'bpmn:Task': 'Задача',
  'bpmn:UserTask': 'Пользовательская задача',
  'bpmn:ServiceTask': 'Сервисная задача',
  'bpmn:ScriptTask': 'Скрипт-задача',
  'bpmn:ManualTask': 'Ручная задача',
  'bpmn:BusinessRuleTask': 'Задача бизнес-правила',
  'bpmn:SendTask': 'Отправка сообщения',
  'bpmn:ReceiveTask': 'Получение сообщения',
  'bpmn:CallActivity': 'Вызов процесса',
  'bpmn:SubProcess': 'Подпроцесс',
  'bpmn:AdHocSubProcess': 'Ad-hoc подпроцесс',
  'bpmn:Transaction': 'Транзакция',
  'bpmn:StartEvent': 'Стартовое событие',
  'bpmn:EndEvent': 'Завершающее событие',
  'bpmn:IntermediateCatchEvent': 'Промежуточное событие (ожидание)',
  'bpmn:IntermediateThrowEvent': 'Промежуточное событие (отправка)',
  'bpmn:BoundaryEvent': 'Граничное событие',
  'bpmn:ExclusiveGateway': 'Эксклюзивный шлюз',
  'bpmn:InclusiveGateway': 'Инклюзивный шлюз',
  'bpmn:ParallelGateway': 'Параллельный шлюз',
  'bpmn:ComplexGateway': 'Комплексный шлюз',
  'bpmn:EventBasedGateway': 'Шлюз по событию',
  'bpmn:SequenceFlow': 'Поток управления',
  'bpmn:MessageFlow': 'Поток сообщений',
  'bpmn:Association': 'Ассоциация',
  'bpmn:DataInputAssociation': 'Связь входных данных',
  'bpmn:DataOutputAssociation': 'Связь выходных данных',
  'bpmn:DataObjectReference': 'Объект данных',
  'bpmn:DataStoreReference': 'Хранилище данных',
  'bpmn:TextAnnotation': 'Текстовая аннотация',
  'bpmn:Group': 'Группа',
  'bpmn:Participant': 'Пул',
  'bpmn:Lane': 'Дорожка',
  'bpmn:Collaboration': 'Коллаборация',
  'bpmn:Process': 'Процесс',
  label: 'Подпись',
};

export function elementTypeLabel(type: string): string {
  const exact = ELEMENT_TYPE_LABELS[type];
  if (exact) {
    return exact;
  }
  // События с определениями приходят как bpmn:StartEvent с eventDefinitions;
  // для неизвестного типа оставляем техническое имя без префикса.
  return type.replace(/^bpmn:/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}
