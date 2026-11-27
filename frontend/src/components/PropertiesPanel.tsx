import {
  useEffect,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

import { ATTRIBUTE_TYPES, type AttributeType } from '../lib/attributes';
import {
  isScriptTaskType,
  isSequenceFlowType,
  isSubProcessType,
  isTaskType,
  isUserTaskType,
  validateElementId,
  type InspectorElement,
  type InspectorPatch,
} from '../lib/inspector';
import { elementTypeLabel } from '../lib/element-types';
import {
  DEFAULT_PROPERTIES_LAYOUT,
  MAX_PROPERTIES_WIDTH,
  MIN_PROPERTIES_HEIGHT,
  MIN_PROPERTIES_WIDTH,
  PROPERTIES_FIELDS,
  PROPERTIES_SECTIONS,
  loadPropertiesLayout,
  moveItem,
  normalizePropertiesLayout,
  reorderItem,
  savePropertiesLayout,
  type PropertiesFieldId,
  type PropertiesLayout,
  type PropertiesSectionId,
} from '../lib/properties-layout';
import { FILL_SWATCHES, STROKE_SWATCHES } from '../lib/style-palette';
import { DocumentationEditor } from './DocumentationEditor';
import { attributeValuePlaceholder, validateAttributeValue } from '../lib/attributes';

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="inspector__field">
      <span>{label}</span>
      {children}
      {hint ? <small className="inspector__hint">{hint}</small> : null}
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inspector__checkbox">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

type ReorderHandlers = {
  onDropSection: (dragged: PropertiesSectionId, target: PropertiesSectionId) => void;
  onMoveSection: (id: PropertiesSectionId, delta: number) => void;
  onDropField: (dragged: PropertiesFieldId, target: PropertiesFieldId) => void;
  onMoveField: (id: PropertiesFieldId, delta: number) => void;
};

/** Ручка перетаскивания: мышь — HTML5 drag, клавиатура — Alt+↑/↓ (1.5.19). */
function DragGrip({
  label,
  scope,
  id,
  onMove,
}: {
  label: string;
  scope: 'section' | 'field';
  id: string;
  onMove: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      className="inspector__grip"
      draggable
      title={`Перетащить «${label}», Alt+↑/↓ — изменить порядок`}
      aria-label={`Перетащить «${label}»`}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData('text/plain', `${scope}:${id}`);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onKeyDown={(event) => {
        if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) {
          return;
        }
        event.preventDefault();
        onMove(event.key === 'ArrowUp' ? -1 : 1);
      }}
    >
      ⠿
    </button>
  );
}

function dragScope(event: DragEvent): { scope: string; id: string } | null {
  const raw = event.dataTransfer.getData('text/plain');
  const [scope, id] = raw.split(':');
  return scope && id ? { scope, id } : null;
}

function InspectorBlock({
  id,
  label,
  handlers,
  children,
}: {
  id: PropertiesSectionId;
  label: string;
  handlers: ReorderHandlers;
  children: ReactNode;
}) {
  return (
    <fieldset
      className="inspector__section"
      data-inspector-section={id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const dragged = dragScope(event);
        if (dragged?.scope !== 'section') {
          return;
        }
        event.preventDefault();
        handlers.onDropSection(dragged.id as PropertiesSectionId, id);
      }}
    >
      <legend>
        <DragGrip
          label={label}
          scope="section"
          id={id}
          onMove={(delta) => handlers.onMoveSection(id, delta)}
        />
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function InspectorFieldBlock({
  id,
  label,
  handlers,
  children,
}: {
  id: PropertiesFieldId;
  label: string;
  handlers: ReorderHandlers;
  children: ReactNode;
}) {
  return (
    <div
      className="inspector__field-block"
      data-inspector-field={id}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        const dragged = dragScope(event);
        if (dragged?.scope !== 'field') {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        handlers.onDropField(dragged.id as PropertiesFieldId, id);
      }}
    >
      <DragGrip
        label={label}
        scope="field"
        id={id}
        onMove={(delta) => handlers.onMoveField(id, delta)}
      />
      {children}
    </div>
  );
}

const SECTION_LABELS = new Map(PROPERTIES_SECTIONS.map((item) => [item.id, item.label]));
const FIELD_LABELS = new Map(PROPERTIES_FIELDS.map((item) => [item.id, item.label]));

export function PropertiesPanel({
  element,
  onChange,
  onEnterSubProcess,
  hasDefaultStyle,
  onSaveDefaultStyle,
  onClearDefaultStyle,
  onClose,
  inspectorOpen,
  markdownToolbar,
  stageCount,
  onToggleStages,
}: {
  element: InspectorElement | null;
  onChange: (patch: InspectorPatch) => void;
  onEnterSubProcess: () => void;
  hasDefaultStyle: boolean;
  onSaveDefaultStyle: () => void;
  onClearDefaultStyle: () => void;
  onClose: () => void;
  inspectorOpen: boolean;
  markdownToolbar: boolean;
  stageCount: number;
  onToggleStages: (enabled: boolean) => void;
}) {
  const [idDraft, setIdDraft] = useState(element?.id ?? '');
  const [idError, setIdError] = useState<string | null>(null);
  // Пустые строки атрибутов живут только в панели: в модель попадают лишь заполненные.
  const [attrDraft, setAttrDraft] = useState(element?.customProperties ?? []);
  const [layout, setLayout] = useState<PropertiesLayout>(() => loadPropertiesLayout());
  const [wide, setWide] = useState(
    () => typeof window === 'undefined' || window.matchMedia('(min-width: 1101px)').matches,
  );

  useEffect(() => {
    setIdDraft(element?.id ?? '');
    setIdError(null);
  }, [element?.id]);

  useEffect(() => {
    const query = window.matchMedia('(min-width: 1101px)');
    const listener = () => setWide(query.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  // Список атрибутов меняется не только из панели (undo, смена выделения),
  // поэтому синхронизируем его с моделью, сохраняя ещё не заполненные строки.
  const attributeKey = JSON.stringify(element?.customProperties ?? []);
  useEffect(() => {
    setAttrDraft((current) => {
      const filled = current.filter((property) => property.name.trim() !== '');
      if (JSON.stringify(filled) === attributeKey) {
        return current;
      }
      return attributeKey
        ? (JSON.parse(attributeKey) as { name: string; value: string; type: AttributeType }[])
        : [];
    });
  }, [attributeKey]);

  const persistLayout = (next: PropertiesLayout) => {
    const normalized = savePropertiesLayout(next);
    setLayout(normalized);
  };

  const handlers: ReorderHandlers = {
    onDropSection: (dragged, target) =>
      persistLayout({ ...layout, sections: reorderItem(layout.sections, dragged, target) }),
    onMoveSection: (id, delta) => {
      const from = layout.sections.indexOf(id);
      persistLayout({ ...layout, sections: moveItem(layout.sections, from, delta) });
    },
    onDropField: (dragged, target) =>
      persistLayout({ ...layout, fields: reorderItem(layout.fields, dragged, target) }),
    onMoveField: (id, delta) => {
      const from = layout.fields.indexOf(id);
      persistLayout({ ...layout, fields: moveItem(layout.fields, from, delta) });
    },
  };

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!wide) {
      return;
    }
    event.preventDefault();
    const panel = event.currentTarget.closest('.inspector');
    if (!(panel instanceof HTMLElement)) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = rect.width;
    const startHeight = rect.height;

    const onMove = (move: PointerEvent) => {
      const width = Math.round(
        Math.min(
          MAX_PROPERTIES_WIDTH,
          Math.max(MIN_PROPERTIES_WIDTH, startWidth - (move.clientX - startX)),
        ),
      );
      const maxHeight = Math.max(MIN_PROPERTIES_HEIGHT, window.innerHeight - 160);
      const height = Math.round(
        Math.min(maxHeight, Math.max(MIN_PROPERTIES_HEIGHT, startHeight + (move.clientY - startY))),
      );
      const next = normalizePropertiesLayout({ ...layout, width, height });
      setLayout(next);
      savePropertiesLayout(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const commitAttributes = (next: { name: string; value: string; type: AttributeType }[]) => {
    setAttrDraft(next);
    onChange({ customProperties: next });
  };

  if (!element) {
    return (
      <aside
        className={inspectorOpen ? 'inspector inspector--open' : 'inspector'}
        aria-label="Свойства элемента"
      >
        <div className="inspector__header">
          <h2 className="inspector__title">Свойства</h2>
          <button
            type="button"
            className="inspector__close"
            aria-label="Закрыть свойства"
            title="Закрыть свойства"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p className="inspector__hint">
          Выберите элемент на холсте. Перетаскивайте фигуры из палитры, соединяйте их через context
          pad или правую кнопку мыши.
        </p>
        <p className="inspector__hint">
          Правый клик по холсту и по элементу открывает меню действий; комбинации клавиш
          настраиваются кнопкой «Настройки» на панели.
        </p>
      </aside>
    );
  }

  const commitId = () => {
    const trimmed = idDraft.trim();
    if (trimmed === element.id) {
      setIdError(null);
      return;
    }
    const error = validateElementId(trimmed);
    if (error) {
      setIdError(error);
      return;
    }
    setIdError(null);
    onChange({ id: trimmed });
  };

  const fieldNodes: Record<PropertiesFieldId, ReactNode> = {
    name: (
      <Field label="Название">
        <input value={element.name} onChange={(event) => onChange({ name: event.target.value })} />
      </Field>
    ),
    id: (
      <Field label="ID" hint={idError ?? undefined}>
        <input
          value={idDraft}
          onChange={(event) => setIdDraft(event.target.value)}
          onBlur={commitId}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitId();
            }
          }}
        />
      </Field>
    ),
    type: (
      <Field label="Тип" hint={element.type}>
        <output className="inspector__readonly">{elementTypeLabel(element.type)}</output>
      </Field>
    ),
    documentation: (
      <Field
        label={markdownToolbar ? 'Документация (Markdown)' : 'Документация'}
        hint={
          markdownToolbar
            ? 'Поддерживается Markdown: заголовки, списки, **жирный**, ссылки. Справка — «?» на панели.'
            : undefined
        }
      >
        {markdownToolbar ? (
          <DocumentationEditor
            value={element.documentation}
            title={element.name || element.id}
            onChange={(next) => onChange({ documentation: next })}
          />
        ) : (
          <textarea
            rows={3}
            value={element.documentation}
            onChange={(event) => onChange({ documentation: event.target.value })}
          />
        )}
      </Field>
    ),
  };

  const blocks: Partial<Record<PropertiesSectionId, ReactNode>> = {};

  blocks.element = (
    <InspectorBlock
      id="element"
      label={SECTION_LABELS.get('element') ?? 'Элемент'}
      handlers={handlers}
    >
      {layout.fields.map((fieldId) => (
        <InspectorFieldBlock
          key={fieldId}
          id={fieldId}
          label={FIELD_LABELS.get(fieldId) ?? fieldId}
          handlers={handlers}
        >
          {fieldNodes[fieldId]}
        </InspectorFieldBlock>
      ))}
      {isSubProcessType(element.type) ? (
        <>
          <Checkbox
            label="Развёрнут на холсте"
            checked={element.isExpanded}
            onChange={(checked) => onChange({ isExpanded: checked })}
          />
          <button type="button" className="ghost-button" onClick={onEnterSubProcess}>
            Войти внутрь подпроцесса
          </button>
        </>
      ) : null}
    </InspectorBlock>
  );

  if (element.type === 'bpmn:Participant') {
    blocks.stages = (
      <InspectorBlock id="stages" label="Этапы" handlers={handlers}>
        <Checkbox
          label={stageCount > 0 ? `Этапы (${stageCount})` : 'Этапы'}
          checked={stageCount > 0}
          onChange={onToggleStages}
        />
        <p className="inspector__hint">
          {stageCount > 0
            ? 'Первый этап занимает основную часть пула. Следующий добавляется кнопкой «+» у правой границы последнего этапа или через ПКМ по пулу.'
            : 'Включите, чтобы превратить основную часть пула в первый этап.'}
        </p>
      </InspectorBlock>
    );
  }

  blocks.style = (
    <InspectorBlock id="style" label="Стиль" handlers={handlers}>
      <div className="inspector__colors">
        {!isSequenceFlowType(element.type) ? (
          <label className="inspector__color">
            <span>Заливка</span>
            <input
              type="color"
              value={element.fillColor || '#ffffff'}
              onChange={(event) => onChange({ fillColor: event.target.value })}
            />
          </label>
        ) : null}
        <label className="inspector__color">
          <span>Обводка</span>
          <input
            type="color"
            value={element.strokeColor || '#22242a'}
            onChange={(event) => onChange({ strokeColor: event.target.value })}
          />
        </label>
      </div>
      {!isSequenceFlowType(element.type) ? (
        <div className="inspector__swatches" role="group" aria-label="Готовые цвета заливки">
          {FILL_SWATCHES.map((swatch) => (
            <button
              key={swatch.value}
              type="button"
              className="inspector__swatch"
              style={{ background: swatch.value }}
              title={`Заливка: ${swatch.name}`}
              aria-label={`Заливка: ${swatch.name}`}
              onClick={() => onChange({ fillColor: swatch.value })}
            />
          ))}
        </div>
      ) : null}

      <div className="inspector__swatches" role="group" aria-label="Готовые цвета обводки">
        {STROKE_SWATCHES.map((swatch) => (
          <button
            key={swatch.value}
            type="button"
            className="inspector__swatch inspector__swatch--stroke"
            style={{ borderColor: swatch.value }}
            title={`Обводка: ${swatch.name}`}
            aria-label={`Обводка: ${swatch.name}`}
            onClick={() => onChange({ strokeColor: swatch.value })}
          />
        ))}
      </div>

      <div className="inspector__style-grid">
        <label className="inspector__mini">
          <span>Шрифт</span>
          <select
            value={element.fontFamily}
            onChange={(event) => onChange({ fontFamily: event.target.value })}
          >
            <option value="">по умолчанию</option>
            <option value="Inter">Inter</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="system-ui">Системный</option>
          </select>
        </label>
        <label className="inspector__mini">
          <span>Размер</span>
          <input
            type="number"
            min={8}
            max={48}
            value={element.fontSize}
            placeholder="по умолч."
            onChange={(event) => onChange({ fontSize: event.target.value })}
          />
        </label>
        <label className="inspector__mini">
          <span>Цвет текста</span>
          <input
            type="color"
            value={element.fontColor || '#22242a'}
            onChange={(event) => onChange({ fontColor: event.target.value })}
          />
        </label>
        <label className="inspector__mini">
          <span>Выравнивание текста</span>
          <select
            value={element.textAlign || 'center'}
            onChange={(event) => onChange({ textAlign: event.target.value })}
          >
            <option value="left">слева</option>
            <option value="center">по центру</option>
            <option value="right">справа</option>
          </select>
        </label>
        <label className="inspector__mini">
          <span>Направление текста</span>
          <select
            aria-label="Направление текста"
            value={element.textDirection || ''}
            onChange={(event) => onChange({ textDirection: event.target.value })}
          >
            <option value="">горизонтально</option>
            <option value="vertical">вертикально</option>
            <option value="rotate">поворот</option>
          </select>
        </label>
        <label className="inspector__mini">
          <span>Толщина линии</span>
          <input
            type="number"
            min={1}
            max={6}
            value={element.strokeWidth}
            placeholder="1"
            onChange={(event) => onChange({ strokeWidth: event.target.value })}
          />
        </label>
        <label className="inspector__mini">
          <span>Линия</span>
          <select
            value={element.strokeStyle}
            onChange={(event) => onChange({ strokeStyle: event.target.value })}
          >
            <option value="">сплошная</option>
            <option value="dashed">пунктир</option>
            <option value="dotted">точки</option>
          </select>
        </label>
        <label className="inspector__mini">
          <span>Прозрачность</span>
          <select
            value={element.opacity || '1'}
            onChange={(event) => onChange({ opacity: event.target.value })}
          >
            {['1', '0.9', '0.8', '0.7', '0.6', '0.5', '0.4', '0.3', '0.2', '0.1'].map((value) => (
              <option key={value} value={value}>
                {Math.round(Number(value) * 100)}%
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="inspector__checkbox-row">
        <Checkbox
          label="Жирный"
          checked={element.isBold}
          onChange={(checked) => onChange({ isBold: checked })}
        />
        <Checkbox
          label="Курсив"
          checked={element.isItalic}
          onChange={(checked) => onChange({ isItalic: checked })}
        />
      </div>

      <div className="inspector__style-actions">
        <button
          type="button"
          className="ghost-button ghost-button--small"
          disabled={!element.fillColor && !element.strokeColor}
          onClick={() => onChange({ fillColor: '', strokeColor: '' })}
        >
          Сбросить стиль
        </button>
        <button
          type="button"
          className="ghost-button ghost-button--small"
          disabled={!element.fillColor && !element.strokeColor}
          title={`Новые элементы типа ${element.type} получат этот стиль`}
          onClick={onSaveDefaultStyle}
        >
          По умолчанию для типа
        </button>
        {hasDefaultStyle ? (
          <button
            type="button"
            className="ghost-button ghost-button--small"
            onClick={onClearDefaultStyle}
          >
            Убрать умолчание
          </button>
        ) : null}
      </div>
    </InspectorBlock>
  );

  blocks.attributes = (
    <InspectorBlock id="attributes" label="Атрибуты" handlers={handlers}>
      {element.customProperties.length === 0 ? (
        <p className="inspector__hint">
          Свои пары «ключ — значение» сохраняются в расширении camunda:properties. Тип значения
          (строка, число, дата, ссылка) пишется в атрибут bs:type и переживает сохранение.
        </p>
      ) : null}
      <div className="attr-list">
        {attrDraft.map((property, index) => {
          const error = validateAttributeValue(property.type, property.value);
          return (
            <div className="attr-row" key={index}>
              <input
                aria-label="Имя атрибута"
                value={property.name}
                placeholder="ключ"
                onChange={(event) => {
                  commitAttributes(
                    attrDraft.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, name: event.target.value } : item,
                    ),
                  );
                }}
              />
              <select
                aria-label="Тип атрибута"
                value={property.type}
                title="Тип значения"
                onChange={(event) => {
                  commitAttributes(
                    attrDraft.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, type: event.target.value as AttributeType }
                        : item,
                    ),
                  );
                }}
              >
                {ATTRIBUTE_TYPES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                aria-label="Значение атрибута"
                value={property.value}
                className={error ? 'attr-row__value--invalid' : undefined}
                placeholder={attributeValuePlaceholder(property.type)}
                onChange={(event) => {
                  commitAttributes(
                    attrDraft.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, value: event.target.value } : item,
                    ),
                  );
                }}
              />
              <button
                type="button"
                className="ghost-button ghost-button--small"
                title="Удалить атрибут"
                aria-label="Удалить атрибут"
                onClick={() =>
                  commitAttributes(attrDraft.filter((_item, itemIndex) => itemIndex !== index))
                }
              >
                ×
              </button>
              {error ? (
                <p className="attr-row__error" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="ghost-button ghost-button--small"
        onClick={() => setAttrDraft([...attrDraft, { name: '', value: '', type: 'string' }])}
      >
        Добавить атрибут
      </button>
    </InspectorBlock>
  );

  if (isUserTaskType(element.type)) {
    blocks.assignee = (
      <InspectorBlock id="assignee" label="Исполнитель" handlers={handlers}>
        <Field label="Assignee">
          <input
            value={element.assignee}
            placeholder="user@example.com"
            onChange={(event) => onChange({ assignee: event.target.value })}
          />
        </Field>
        <Field label="Candidate groups">
          <input
            value={element.candidateGroups}
            placeholder="sales, managers"
            onChange={(event) => onChange({ candidateGroups: event.target.value })}
          />
        </Field>
      </InspectorBlock>
    );
  }

  if (isScriptTaskType(element.type)) {
    blocks.script = (
      <InspectorBlock id="script" label="Скрипт" handlers={handlers}>
        <Field label="Формат">
          <input
            value={element.scriptFormat}
            placeholder="javascript"
            onChange={(event) => onChange({ scriptFormat: event.target.value })}
          />
        </Field>
        <Field label="Тело скрипта">
          <textarea
            rows={5}
            value={element.script}
            onChange={(event) => onChange({ script: event.target.value })}
          />
        </Field>
      </InspectorBlock>
    );
  }

  if (isSequenceFlowType(element.type)) {
    blocks.flow = (
      <InspectorBlock id="flow" label="Поток" handlers={handlers}>
        <Field label="Условие (expression)">
          <textarea
            rows={3}
            value={element.condition}
            placeholder="approved == true"
            onChange={(event) => onChange({ condition: event.target.value })}
          />
        </Field>
        <Checkbox
          label="Поток по умолчанию"
          checked={element.isDefaultFlow}
          onChange={(checked) => onChange({ isDefaultFlow: checked })}
        />
      </InspectorBlock>
    );
  }

  if (isTaskType(element.type)) {
    blocks.behavior = (
      <InspectorBlock id="behavior" label="Поведение" handlers={handlers}>
        <Checkbox
          label="Мульти-экземпляр"
          checked={element.isMultiInstance}
          onChange={(checked) => onChange({ isMultiInstance: checked })}
        />
        {element.isMultiInstance ? (
          <>
            <Checkbox
              label="Последовательно"
              checked={element.isSequential}
              onChange={(checked) => onChange({ isSequential: checked })}
            />
            <Field label="Коллекция">
              <input
                value={element.collection}
                placeholder="orderItems"
                onChange={(event) => onChange({ collection: event.target.value })}
              />
            </Field>
            <Field label="Переменная элемента">
              <input
                value={element.elementVariable}
                placeholder="item"
                onChange={(event) => onChange({ elementVariable: event.target.value })}
              />
            </Field>
          </>
        ) : null}
        <Checkbox
          label="Компенсация (isForCompensation)"
          checked={element.isForCompensation}
          onChange={(checked) => onChange({ isForCompensation: checked })}
        />
      </InspectorBlock>
    );
  }

  return (
    <aside
      className={inspectorOpen ? 'inspector inspector--open' : 'inspector'}
      aria-label="Свойства элемента"
      style={
        wide
          ? {
              width: layout.width,
              height: layout.height,
            }
          : undefined
      }
    >
      <div className="inspector__header">
        <h2 className="inspector__title">Свойства</h2>
        <button
          type="button"
          className="inspector__close"
          aria-label="Закрыть свойства"
          title="Закрыть свойства"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <p className="inspector__hint">
        <code>{element.id}</code>
      </p>

      {layout.sections.map((sectionId) => {
        const block = blocks[sectionId];
        return block ? <div key={sectionId}>{block}</div> : null;
      })}

      {wide ? (
        <button
          type="button"
          className="inspector__resize"
          aria-label="Изменить размер панели свойств"
          title="Потяните, чтобы изменить ширину и высоту панели"
          onPointerDown={startResize}
        >
          ⇲
        </button>
      ) : null}
    </aside>
  );
}

/** Сброс пользовательской раскладки (используется настройками и тестами). */
export function resetPropertiesLayout(): PropertiesLayout {
  const next = normalizePropertiesLayout(DEFAULT_PROPERTIES_LAYOUT);
  return savePropertiesLayout(next);
}
