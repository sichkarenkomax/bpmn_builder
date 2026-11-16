import { useEffect, useState, type ReactNode } from 'react';

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
}) {
  const [idDraft, setIdDraft] = useState(element?.id ?? '');
  const [idError, setIdError] = useState<string | null>(null);
  // Пустые строки атрибутов живут только в панели: в модель попадают лишь заполненные.
  const [attrDraft, setAttrDraft] = useState(element?.customProperties ?? []);

  useEffect(() => {
    setIdDraft(element?.id ?? '');
    setIdError(null);
  }, [element?.id]);

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
          настраиваются кнопкой «Клавиши» на панели.
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
        {element.type} · <code>{element.id}</code>
      </p>

      <fieldset className="inspector__section">
        <legend>Элемент</legend>

        <Field label="Название">
          <input
            value={element.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field>

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

        <Field
          label={markdownToolbar ? 'Документация (Markdown)' : 'Документация'}
          hint={
            markdownToolbar
              ? 'Поддерживается Markdown: заголовки, списки, **жирный**, ссылки.'
              : undefined
          }
        >
          {markdownToolbar ? (
            <DocumentationEditor
              value={element.documentation}
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
      </fieldset>

      <fieldset className="inspector__section">
        <legend>Стиль</legend>
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
      </fieldset>

      <fieldset className="inspector__section">
        <legend>Атрибуты</legend>
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
      </fieldset>

      {isUserTaskType(element.type) ? (
        <fieldset className="inspector__section">
          <legend>Исполнитель</legend>
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
        </fieldset>
      ) : null}

      {isScriptTaskType(element.type) ? (
        <fieldset className="inspector__section">
          <legend>Скрипт</legend>
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
        </fieldset>
      ) : null}

      {isSequenceFlowType(element.type) ? (
        <fieldset className="inspector__section">
          <legend>Поток</legend>
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
        </fieldset>
      ) : null}

      {isTaskType(element.type) ? (
        <fieldset className="inspector__section">
          <legend>Поведение</legend>
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
        </fieldset>
      ) : null}
    </aside>
  );
}
