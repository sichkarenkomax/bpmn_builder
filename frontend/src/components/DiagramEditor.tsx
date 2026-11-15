import DrilldownModule from 'bpmn-js/lib/features/drilldown';
import Modeler from 'bpmn-js/lib/Modeler';
import { getPlaneIdFromShape } from 'bpmn-js/lib/util/DrilldownUtil';
import camundaModdle from 'camunda-bpmn-moddle/resources/camunda.json';
import minimapModule from 'diagram-js-minimap';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import 'diagram-js-minimap/assets/diagram-js-minimap.css';

import {
  ApiError,
  createComment,
  deleteComment,
  fetchComments,
  saveDiagramXml,
  updateComment,
  type DiagramComment,
} from '../lib/api';
import {
  COMMENT_OVERLAY_TYPE,
  commentsForElement,
  groupOpenComments,
  openCommentCount,
} from '../lib/comments';
import { CommentsPanel } from './CommentsPanel';
import { loadAutosaveSeconds, saveAutosaveSeconds } from '../lib/autosave';
import {
  clearDefaultStyle,
  getDefaultStyle,
  loadStyleDefaults,
  saveStyleDefaults,
  withDefaultStyle,
  type ElementStyle,
  type StyleDefaults,
} from '../lib/style-palette';
import {
  applyExternalLabelLayout,
  applyStyleToGfx,
  readExtendedStyle,
  toStyleAttributes,
} from '../lib/style-extra';
import {
  applyThemeToGfx,
  buildLegendItems,
  DEFAULT_CUSTOM_COLORS,
  hasManualColor,
  themeById,
  type ThemeColorsMap,
  type ThemeId,
} from '../lib/diagram-theme';
import {
  DEFAULT_LEGEND_POSITION,
  diagramSettingsProperties,
  readDiagramSettings,
  type CanvasTheme,
  type DefinitionsLike,
  type LegendPosition,
} from '../lib/diagram-settings';
import bsModdle from '../lib/bs-moddle.json';
import { isElementLocked } from '../lib/lock';
import { DiagramLegend } from './DiagramLegend';
import { ThemeSettings } from './ThemeSettings';
import {
  isSequenceFlowType,
  isSubProcessType,
  type InspectorElement,
  type InspectorPatch,
} from '../lib/inspector';
import {
  DEFAULT_SHORTCUTS,
  EDITOR_BUILTIN_COMBOS,
  formatCombo,
  loadShortcuts,
  matchesCombo,
  saveShortcuts,
  SHORTCUT_DEFINITIONS,
  type ShortcutAction,
  type ShortcutMap,
} from '../lib/shortcuts';
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu';
import { PropertiesPanel } from './PropertiesPanel';
import { ShortcutSettings } from './ShortcutSettings';

interface ModdleDocumentation {
  text?: string;
}

interface ModdleLoopCharacteristics {
  $type?: string;
  isSequential?: boolean;
  collection?: string;
  elementVariable?: string;
}

interface ModdleProperty {
  $type?: string;
  name?: string;
  value?: string;
  values?: ModdleProperty[];
}

interface BusinessObject {
  $type: string;
  id: string;
  $parent?: BusinessObject;
  name?: string;
  extensionElements?: ModdleProperty;
  documentation?: ModdleDocumentation[];
  assignee?: string;
  candidateGroups?: string;
  script?: string;
  scriptFormat?: string;
  conditionExpression?: { body?: string };
  default?: { id?: string };
  isForCompensation?: boolean;
  loopCharacteristics?: ModdleLoopCharacteristics;
}

interface DiagramElement {
  id: string;
  type: string;
  businessObject: BusinessObject;
  di?: {
    isExpanded?: boolean;
    fontFamily?: string;
    fontSize?: string;
    fontColor?: string;
    fontBold?: boolean | string;
    fontItalic?: boolean | string;
    opacity?: string;
    strokeWidth?: string;
    strokeStyle?: string;
    $attrs?: Record<string, string>;
    get?: (name: string) => string | undefined;
  };
  parent?: DiagramElement;
  source?: DiagramElement;
  target?: DiagramElement;
  labelTarget?: DiagramElement;
  waypoints?: unknown[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface CanvasLike {
  zoom: (value?: number | 'fit-viewport') => number;
  getRootElement: () => DiagramElement;
  setRootElement: (element: DiagramElement) => void;
  findRoot: (id: string) => DiagramElement | undefined;
  viewbox: () => { x: number; y: number; scale: number };
}

interface ModelingLike {
  updateProperties: (element: DiagramElement, properties: Record<string, unknown>) => void;
  removeElements: (elements: DiagramElement[]) => void;
  toggleCollapse: (element: DiagramElement) => void;
  addLane: (element: DiagramElement, location: 'top' | 'bottom') => DiagramElement;
  reconnect: (connection: DiagramElement, source: DiagramElement, target: DiagramElement) => void;
  setColor: (elements: DiagramElement[], colors: { fill?: string; stroke?: string }) => void;
}

interface ElementRegistryLike {
  get: (id: string) => DiagramElement | undefined;
  getAll: () => DiagramElement[];
  getGraphics: (element: DiagramElement) => SVGGElement | undefined;
}

interface SelectionLike {
  get: () => DiagramElement[];
  select: (elements: DiagramElement[]) => void;
}

interface EditorEvent {
  newSelection?: DiagramElement[];
  context?: { shape?: DiagramElement; connection?: DiagramElement };
}

interface EventBusLike {
  on: (event: string, handler: (event: EditorEvent) => void) => void;
}

interface LockEventBus {
  on: (
    event: string,
    priority: number,
    handler: (event: { context?: { shapes?: DiagramElement[] } }) => boolean | undefined,
  ) => void;
}

/** Правило движения: закреплённый элемент не сдвигается мышью. */
class LockRulesProvider {
  static $inject = ['eventBus'];

  constructor(eventBus: LockEventBus) {
    // bpmn-js спрашивает правила через commandStack, поэтому запрет нужен
    // именно на событии `canExecute`, а не на самом `elements.move`.
    eventBus.on('commandStack.elements.move.canExecute', 1500, (event) => {
      if ((event.context?.shapes ?? []).some((shape) => isElementLocked(shape.di))) {
        return false;
      }
      return undefined;
    });
  }
}

const lockModule = {
  __init__: ['lockRules'],
  lockRules: ['type', LockRulesProvider],
};

interface ModdleLike {
  create: (type: string, attrs: Record<string, unknown>) => unknown;
}

interface CommandStackLike {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  execute: (event: string, context: Record<string, unknown>) => void;
}

interface EditorActionsLike {
  trigger: (action: string, options?: Record<string, unknown>) => void;
}

interface CopyPasteLike {
  paste: (context?: { element?: DiagramElement; point?: { x: number; y: number } }) => void;
  duplicate: (
    elements: DiagramElement[],
    context?: { element?: DiagramElement; point?: { x: number; y: number } },
  ) => void;
}

interface ClipboardLike {
  isEmpty: () => boolean;
}

interface DirectEditingLike {
  activate: (element: DiagramElement) => void;
  isActive: () => boolean;
  cancel: () => void;
}

interface MinimapLike {
  toggle: (open?: boolean) => void;
  isOpen: () => boolean;
}

interface OverlaysLike {
  add: (
    element: string | DiagramElement,
    type: string,
    options: {
      position?: { top?: number; right?: number; bottom?: number; left?: number };
      html: HTMLElement | string;
    },
  ) => string;
  remove: (options?: { type?: string }) => void;
}

interface LocalDraft {
  xml: string;
  savedAt: number;
  etag: string | null;
}

type SaveState =
  { kind: 'saved' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'error'; message: string };

const AUTOSAVE_DEBOUNCE_MS = 1500;
const LOCAL_DRAFT_DEBOUNCE_MS = 400;
const DRAFT_PREFIX = 'bpmn-studio.draft.';

function draftKey(diagramId: string): string {
  return `${DRAFT_PREFIX}${diagramId}`;
}

function readDraft(diagramId: string): LocalDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(diagramId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof parsed.xml !== 'string' || typeof parsed.savedAt !== 'number') {
      return null;
    }
    return { xml: parsed.xml, savedAt: parsed.savedAt, etag: parsed.etag ?? null };
  } catch {
    return null;
  }
}

function writeDraft(diagramId: string, draft: LocalDraft): void {
  try {
    window.localStorage.setItem(draftKey(diagramId), JSON.stringify(draft));
  } catch {
    // Черновик — страховка, а не источник истины: переполнение хранилища не должно ломать редактор.
  }
}

function clearDraft(diagramId: string): void {
  try {
    window.localStorage.removeItem(draftKey(diagramId));
  } catch {
    // см. writeDraft
  }
}

function toInspector(element: DiagramElement): InspectorElement {
  const bo = element.businessObject;
  const loop = bo.loopCharacteristics;
  const isDefaultFlow =
    bo.$type === 'bpmn:SequenceFlow' && element.source?.businessObject.default?.id === bo.id;

  return {
    id: element.id,
    type: bo.$type,
    name: bo.name ?? '',
    documentation: bo.documentation?.[0]?.text ?? '',
    assignee: bo.assignee ?? '',
    candidateGroups: bo.candidateGroups ?? '',
    script: bo.script ?? '',
    scriptFormat: bo.scriptFormat ?? '',
    condition: bo.conditionExpression?.body ?? '',
    isDefaultFlow,
    isForCompensation: bo.isForCompensation ?? false,
    isMultiInstance: loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics',
    isSequential: loop?.isSequential ?? false,
    collection: loop?.collection ?? '',
    elementVariable: loop?.elementVariable ?? '',
    isExpanded: element.di?.isExpanded ?? true,
    fillColor: element.di?.get?.('color:background-color') ?? '',
    strokeColor: element.di?.get?.('color:border-color') ?? '',
    ...readExtendedStyle(element.di),
    customProperties: (bo.extensionElements?.values ?? [])
      .filter((value) => value.$type === 'camunda:Properties')
      .flatMap((value) => value.values ?? [])
      .map((value) => ({ name: value.name ?? '', value: value.value ?? '' })),
  };
}

function findDefinitions(modeler: Modeler): DefinitionsLike | undefined {
  let businessObject: BusinessObject | undefined = modeler
    .get<CanvasLike>('canvas')
    .getRootElement().businessObject;
  while (businessObject) {
    if (businessObject.$type === 'bpmn:Definitions') {
      return businessObject as unknown as DefinitionsLike;
    }
    businessObject = businessObject.$parent;
  }
  return undefined;
}

function findElementAt(
  target: EventTarget | null,
  registry: ElementRegistryLike,
): DiagramElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const host = target.closest('[data-element-id]');
  const id = host?.getAttribute('data-element-id');
  return id ? (registry.get(id) ?? null) : null;
}

export function DiagramEditor({
  diagramId,
  initialXml,
  initialEtag,
}: {
  diagramId: string;
  initialXml: string;
  initialEtag: string | null;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const modelerRef = useRef<Modeler | null>(null);
  const etagRef = useRef<string | null>(initialEtag);
  const selectedRef = useRef<DiagramElement | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const serverTimerRef = useRef<number | null>(null);
  const localTimerRef = useRef<number | null>(null);
  const lastServerSaveRef = useRef(0);
  const shortcutsRef = useRef<ShortcutMap>(DEFAULT_SHORTCUTS);
  const overlayOpenRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'saved' });
  const [selected, setSelected] = useState<DiagramElement | null>(null);
  const [revision, setRevision] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => loadShortcuts());
  const [autosaveSeconds, setAutosaveSeconds] = useState<number>(() => loadAutosaveSeconds());
  const [styleDefaults, setStyleDefaults] = useState<StyleDefaults>(() => loadStyleDefaults());
  const styleDefaultsRef = useRef(styleDefaults);
  styleDefaultsRef.current = styleDefaults;
  const [themeId, setThemeId] = useState<ThemeId>('none');
  const themeRef = useRef(themeId);
  themeRef.current = themeId;
  const [customColors, setCustomColors] = useState<ThemeColorsMap>(DEFAULT_CUSTOM_COLORS);
  const customColorsRef = useRef(customColors);
  customColorsRef.current = customColors;
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>('light');
  const [legendPosition, setLegendPosition] = useState<LegendPosition>(DEFAULT_LEGEND_POSITION);
  const [comments, setComments] = useState<DiagramComment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsBusy, setCommentsBusy] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);

  const applyAllStyles = (modeler: Modeler) => {
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const theme = themeById(themeRef.current, customColorsRef.current);
    for (const element of registry.getAll()) {
      const gfx = registry.getGraphics(element);
      if (gfx) {
        gfx.dataset['locked'] = isElementLocked(element.di) ? 'true' : '';
      }
      applyStyleToGfx(gfx, element.di);
      applyExternalLabelLayout(
        gfx,
        element,
        element.type === 'label' ? readExtendedStyle(element.labelTarget?.di).textAlign : '',
      );
      if (hasManualColor(element.di)) {
        // Ручной цвет важнее темы: переносим его в inline-стиль поверх возможного оверрайда.
        const fill = element.di?.get?.('color:background-color');
        const stroke = element.di?.get?.('color:border-color');
        for (const child of gfx?.querySelectorAll<SVGElement>('.djs-visual > *') ?? []) {
          if (child.tagName === 'text') {
            continue;
          }
          if (fill) {
            child.style.fill = fill;
          }
          if (stroke) {
            child.style.stroke = stroke;
          }
        }
      } else {
        applyThemeToGfx(gfx, element.businessObject.$type, theme, {
          strokeWidth: readExtendedStyle(element.di).strokeWidth,
        });
      }
    }
  };

  const applyDefaultStyle = (element: DiagramElement | undefined, modeler: Modeler) => {
    if (!element || element.type.endsWith('Label')) {
      return;
    }
    const style = getDefaultStyle(styleDefaultsRef.current, element.businessObject.$type);
    if (!style || (!style.fill && !style.stroke)) {
      return;
    }
    // Не перекрашиваем то, что пришло с собственным цветом (копии, вставка).
    if (element.di?.get?.('color:background-color') || element.di?.get?.('color:border-color')) {
      return;
    }
    // setColor — отдельная команда: выполняем после завершения создания элемента.
    window.setTimeout(() => {
      modeler.get<ModelingLike>('modeling').setColor([element], style);
    }, 0);
  };
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [draft, setDraft] = useState<LocalDraft | null>(() => {
    const stored = readDraft(diagramId);
    return stored && stored.xml !== initialXml ? stored : null;
  });

  shortcutsRef.current = shortcuts;
  overlayOpenRef.current = shortcutsOpen || themeOpen || menu !== null;

  const updateShortcuts = useCallback((next: ShortcutMap) => {
    setShortcuts(next);
    shortcutsRef.current = next;
    saveShortcuts(next);
  }, []);

  const persist = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) {
      return;
    }
    if (serverTimerRef.current !== null) {
      window.clearTimeout(serverTimerRef.current);
      serverTimerRef.current = null;
    }
    setSave({ kind: 'saving' });
    try {
      const result = (await modeler.saveXML({ format: true })) as { xml?: string };
      if (!result.xml) {
        throw new Error('bpmn-js вернул пустой XML');
      }
      const saved = await saveDiagramXml(diagramId, result.xml, etagRef.current);
      etagRef.current = saved.etag;
      lastServerSaveRef.current = Date.now();
      clearDraft(diagramId);
      setDraft(null);
      setSave({ kind: 'saved' });
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 409
          ? 'диаграмму изменил кто-то другой: обновите страницу'
          : error instanceof Error
            ? error.message
            : 'не удалось сохранить';
      setSave({ kind: 'error', message });
    }
  }, [diagramId]);

  const scheduleServerSave = useCallback(() => {
    if (serverTimerRef.current !== null) {
      return;
    }
    const sinceLastSave = Date.now() - lastServerSaveRef.current;
    const interval = autosaveSeconds * 1000;
    const delay = Math.max(AUTOSAVE_DEBOUNCE_MS, interval - sinceLastSave);
    serverTimerRef.current = window.setTimeout(() => {
      serverTimerRef.current = null;
      void persist();
    }, delay);
  }, [autosaveSeconds, persist]);

  const scheduleLocalDraft = useCallback(() => {
    const modeler = modelerRef.current;
    if (!modeler) {
      return;
    }
    if (localTimerRef.current !== null) {
      window.clearTimeout(localTimerRef.current);
    }
    const scheduledAt = Date.now();
    localTimerRef.current = window.setTimeout(() => {
      localTimerRef.current = null;
      void modeler.saveXML({ format: false }).then((result: { xml?: string }) => {
        // За время снимка могло пройти ручное сохранение: его черновик не нужен,
        // иначе после перезагрузки появится баннер «найден локальный черновик».
        if (result.xml && lastServerSaveRef.current <= scheduledAt) {
          writeDraft(diagramId, { xml: result.xml, savedAt: Date.now(), etag: etagRef.current });
        }
      });
    }, LOCAL_DRAFT_DEBOUNCE_MS);
  }, [diagramId]);

  // Тема и позиция легенды хранятся в документе (1.3.5) как `bs:*` на
  // `bpmn:definitions`. Пишем в `$attrs`: так bpmn-js сериализует чужие
  // атрибуты, не меняя корневой тег (моддл-расширение на Definitions ломает
  // сериализацию: тэг становится `bpmn:Definitions` и XSD отклоняет файл).
  const writeDiagramSettings = (settings: {
    theme?: ThemeId;
    legend?: LegendPosition;
    customColors?: ThemeColorsMap;
    canvas?: CanvasTheme;
  }) => {
    const modeler = modelerRef.current;
    const definitions = modeler ? findDefinitions(modeler) : undefined;
    if (!modeler || !definitions) {
      return;
    }
    const attrs = (definitions.$attrs ??= {});
    // Обёртка get/set позволяет провести запись через стек команд:
    // тема и позиция легенды отменяются вместе с остальными действиями.
    const target = {
      get: (name: string) => attrs[name],
      set: (name: string, value?: string) => {
        if (value === undefined) {
          delete attrs[name];
        } else {
          attrs[name] = value;
        }
      },
    };
    const properties: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(diagramSettingsProperties(settings))) {
      properties[`bs:${key}`] = value;
    }
    modeler.get<CommandStackLike>('commandStack').execute('element.updateModdleProperties', {
      element: modeler.get<CanvasLike>('canvas').getRootElement(),
      moddleElement: target,
      properties,
    });
  };

  const updateTheme = (next: ThemeId) => {
    setThemeId(next);
    themeRef.current = next;
    writeDiagramSettings({ theme: next });
  };

  const updateCustomColors = (next: ThemeColorsMap) => {
    setCustomColors(next);
    customColorsRef.current = next;
    writeDiagramSettings({ customColors: next });
  };

  const updateCanvasTheme = (next: CanvasTheme) => {
    setCanvasTheme(next);
    writeDiagramSettings({ canvas: next });
  };

  // Комментарии живут в БД отдельно от XML (1.3.8): загрузка/мутации идут
  // через API, а не через стек команд — обсуждение не отменяется Ctrl+Z.
  const loadComments = useCallback(async () => {
    try {
      setComments(await fetchComments(diagramId));
      setCommentsError(null);
    } catch {
      setCommentsError('не удалось загрузить комментарии');
    }
  }, [diagramId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const addComment = async (body: string) => {
    const element = selectedRef.current;
    if (!element) {
      return;
    }
    setCommentsBusy(true);
    try {
      const created = await createComment(diagramId, element.id, body);
      setComments((current) => [...current, created]);
      setCommentsError(null);
    } catch {
      setCommentsError('комментарий не отправился');
    } finally {
      setCommentsBusy(false);
    }
  };

  const toggleCommentResolved = async (comment: DiagramComment) => {
    setCommentsBusy(true);
    try {
      const updated = await updateComment(diagramId, comment.id, {
        resolved: !comment.resolved_at,
      });
      setComments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setCommentsError(null);
    } catch {
      setCommentsError('не удалось изменить комментарий');
    } finally {
      setCommentsBusy(false);
    }
  };

  const removeComment = async (comment: DiagramComment) => {
    setCommentsBusy(true);
    try {
      await deleteComment(diagramId, comment.id);
      setComments((current) => current.filter((item) => item.id !== comment.id));
      setCommentsError(null);
    } catch {
      setCommentsError('не удалось удалить комментарий');
    } finally {
      setCommentsBusy(false);
    }
  };

  useEffect(() => {
    const container = hostRef.current;
    if (!container) {
      return;
    }

    const modeler = new Modeler({
      container,
      additionalModules: [minimapModule, DrilldownModule, lockModule],
      // assignee/candidateGroups — атрибуты Camunda: без расширения bpmn-js
      // пишет их в пустом неймспейсе, и XML перестаёт проходить XSD.
      moddleExtensions: { camunda: camundaModdle, bs: bsModdle },
      // 11 px — компактнее штатных 12 px и лучше помещается в фигуры.
      textRenderer: { defaultStyle: { fontSize: 11 } },
    });
    modelerRef.current = modeler;
    let disposed = false;

    const eventBus = modeler.get<EventBusLike>('eventBus');
    const commandStack = modeler.get<CommandStackLike>('commandStack');

    eventBus.on('selection.changed', (event) => {
      const element = event.newSelection?.[0] ?? null;
      selectedRef.current = element;
      setSelected(element);
      setRevision((value) => value + 1);
    });

    eventBus.on('commandStack.shape.create.postExecuted', (event) => {
      applyDefaultStyle(event.context?.shape, modeler);
    });
    eventBus.on('commandStack.connection.create.postExecuted', (event) => {
      applyDefaultStyle(event.context?.connection, modeler);
    });

    eventBus.on('commandStack.changed', () => {
      const stack = modeler.get<CommandStackLike>('commandStack');
      setCanUndo(stack.canUndo());
      setCanRedo(stack.canRedo());
      // Undo/redo может вернуть прежнюю тему или позицию легенды: состояние
      // панелей синхронизируем с документом до перерисовки стилей.
      const stored = readDiagramSettings(findDefinitions(modeler));
      const storedTheme = stored.theme ?? 'none';
      if (storedTheme !== themeRef.current) {
        themeRef.current = storedTheme;
        setThemeId(storedTheme);
      }
      if (stored.legend) {
        setLegendPosition(stored.legend);
      }
      if (stored.customColors) {
        customColorsRef.current = stored.customColors;
        setCustomColors(stored.customColors);
      }
      setCanvasTheme(stored.canvas);
      applyAllStyles(modeler);
      setRevision((value) => value + 1);
      setSave((current) => (current.kind === 'saving' ? current : { kind: 'dirty' }));
      scheduleLocalDraft();
      scheduleServerSave();
    });

    modeler
      .importXML(initialXml)
      .then(() => {
        if (disposed) {
          return;
        }
        modeler.get<CanvasLike>('canvas').zoom('fit-viewport');
        setMinimapOpen(modeler.get<MinimapLike>('minimap').isOpen());
        const stored = readDiagramSettings(findDefinitions(modeler));
        const storedTheme = stored.theme ?? 'none';
        themeRef.current = storedTheme;
        setThemeId(storedTheme);
        setLegendPosition(stored.legend ?? DEFAULT_LEGEND_POSITION);
        if (stored.customColors) {
          customColorsRef.current = stored.customColors;
          setCustomColors(stored.customColors);
        }
        setCanvasTheme(stored.canvas);
        applyAllStyles(modeler);
        setReady(true);
        // Первая загрузка не считается изменением: сохраняем «чистое» состояние.
        setSave({ kind: 'saved' });
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setLoadError(reason instanceof Error ? reason.message : 'не удалось открыть диаграмму');
        }
      });

    const onPointerMove = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    container.addEventListener('pointermove', onPointerMove);

    return () => {
      disposed = true;
      container.removeEventListener('pointermove', onPointerMove);
      if (serverTimerRef.current !== null) {
        window.clearTimeout(serverTimerRef.current);
        serverTimerRef.current = null;
      }
      if (localTimerRef.current !== null) {
        window.clearTimeout(localTimerRef.current);
        localTimerRef.current = null;
      }
      selectedRef.current = null;
      modelerRef.current = null;
      commandStack.canUndo();
      modeler.destroy();
    };
  }, [initialXml, scheduleLocalDraft, scheduleServerSave]);

  // Маркеры открытых обсуждений: цифра на элементе открывает панель.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!ready || !modeler) {
      return;
    }
    const overlays = modeler.get<OverlaysLike>('overlays');
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const selection = modeler.get<SelectionLike>('selection');
    overlays.remove({ type: COMMENT_OVERLAY_TYPE });
    for (const [elementId, thread] of groupOpenComments(comments)) {
      const element = registry.get(elementId);
      if (!element) {
        continue;
      }
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'comment-pin';
      pin.textContent = String(thread.length);
      pin.title = `${thread.length} комментариев — открыть обсуждение`;
      pin.dataset['commentElement'] = elementId;
      pin.addEventListener('click', (event) => {
        event.stopPropagation();
        selection.select([element]);
        setCommentsOpen(true);
      });
      overlays.add(elementId, COMMENT_OVERLAY_TYPE, {
        position: { top: -12, right: -12 },
        html: pin,
      });
    }
    return () => {
      // При размонтировании редактор уже уничтожен — трогать его сервисы нельзя.
      if (modelerRef.current === modeler) {
        overlays.remove({ type: COMMENT_OVERLAY_TYPE });
      }
    };
  }, [comments, ready]);

  const getCanvas = useCallback((): CanvasLike | null => {
    return modelerRef.current?.get<CanvasLike>('canvas') ?? null;
  }, []);

  const pointAtPointer = useCallback(() => {
    const canvas = getCanvas();
    const host = hostRef.current;
    const pointer = pointerRef.current;
    if (!canvas || !host || !pointer) {
      return undefined;
    }
    const viewbox = canvas.viewbox();
    const rect = host.getBoundingClientRect();
    return {
      x: viewbox.x + (pointer.x - rect.left) / viewbox.scale,
      y: viewbox.y + (pointer.y - rect.top) / viewbox.scale,
    };
  }, [getCanvas]);

  const enterSubProcess = useCallback(
    (element: DiagramElement) => {
      const modeler = modelerRef.current;
      const canvas = getCanvas();
      if (!modeler || !canvas) {
        return;
      }
      // Внутренняя плоскость есть у свёрнутого подпроцесса. Развёрнутый
      // сначала сворачиваем (bpmn-js создаёт плоскость), затем входим в неё.
      let plane = canvas.findRoot(getPlaneIdFromShape(element));
      if (!plane) {
        modeler.get<ModelingLike>('modeling').toggleCollapse(element);
        plane = canvas.findRoot(getPlaneIdFromShape(element));
      }
      if (plane) {
        canvas.setRootElement(plane);
      }
    },
    [getCanvas],
  );

  const pasteAtPointer = useCallback(() => {
    const modeler = modelerRef.current;
    const canvas = getCanvas();
    if (!modeler || !canvas) {
      return;
    }
    const copyPaste = modeler.get<CopyPasteLike>('copyPaste');
    copyPaste.paste({ element: canvas.getRootElement(), point: pointAtPointer() });
  }, [getCanvas, pointAtPointer]);

  const duplicateSelection = useCallback(() => {
    const modeler = modelerRef.current;
    const canvas = getCanvas();
    if (!modeler || !canvas) {
      return;
    }
    const elements = modeler.get<SelectionLike>('selection').get();
    if (elements.length === 0) {
      return;
    }
    const point = pointAtPointer();
    modeler.get<CopyPasteLike>('copyPaste').duplicate(elements, {
      element: canvas.getRootElement(),
      ...(point ? { point: { x: point.x + 20, y: point.y + 20 } } : {}),
    });
  }, [getCanvas, pointAtPointer]);

  const executeAction = useCallback(
    (action: ShortcutAction) => {
      const modeler = modelerRef.current;
      if (!modeler) {
        return;
      }
      const actions = modeler.get<EditorActionsLike>('editorActions');
      switch (action) {
        case 'save':
          void persist();
          return;
        case 'undo':
        case 'redo':
        case 'copy':
        case 'cut':
        case 'delete':
        case 'selectAll':
          actions.trigger(action === 'delete' ? 'removeSelection' : action);
          return;
        case 'duplicate':
          duplicateSelection();
          return;
        case 'paste':
          pasteAtPointer();
          return;
        case 'zoomIn':
          actions.trigger('stepZoom', { value: 1 });
          return;
        case 'zoomOut':
          actions.trigger('stepZoom', { value: -1 });
          return;
        case 'fit':
          getCanvas()?.zoom('fit-viewport');
          return;
        case 'toggleMinimap': {
          const minimap = modeler.get<MinimapLike>('minimap');
          minimap.toggle();
          setMinimapOpen(minimap.isOpen());
          return;
        }
        case 'settings':
          setShortcutsOpen(true);
          return;
        case 'editLabel': {
          const element = modeler.get<SelectionLike>('selection').get()[0];
          if (element) {
            modeler.get<DirectEditingLike>('directEditing').activate(element);
          }
          return;
        }
      }
    },
    [duplicateSelection, getCanvas, pasteAtPointer, persist],
  );

  // Горячие клавиши перехватываются до bpmn-js: так переназначение реально работает.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (overlayOpenRef.current) {
        return;
      }
      const target = event.target;
      const editable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const active = shortcutsRef.current;
      for (const [action, combo] of Object.entries(EDITOR_BUILTIN_COMBOS) as [
        ShortcutAction,
        string,
      ][]) {
        if (active[action] !== combo && matchesCombo(event, combo)) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      for (const definition of SHORTCUT_DEFINITIONS) {
        if (!matchesCombo(event, active[definition.action])) {
          continue;
        }
        if (editable && definition.action !== 'save') {
          continue;
        }
        event.preventDefault();
        event.stopPropagation();
        executeAction(definition.action);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [executeAction]);

  const setElementLocked = useCallback((element: DiagramElement, locked: boolean) => {
    const modeler = modelerRef.current;
    if (!modeler || !element.di) {
      return;
    }
    modeler.get<CommandStackLike>('commandStack').execute('element.updateModdleProperties', {
      element,
      moddleElement: element.di,
      properties: { locked: locked ? true : undefined },
    });
  }, []);

  const applyPatch = useCallback((patch: InspectorPatch) => {
    const modeler = modelerRef.current;
    const element = selectedRef.current;
    if (!modeler || !element) {
      return;
    }
    const modeling = modeler.get<ModelingLike>('modeling');
    const moddle = modeler.get<ModdleLike>('moddle');
    const bo = element.businessObject;
    const props: Record<string, unknown> = {};

    if (patch.name !== undefined) {
      props['name'] = patch.name || undefined;
    }
    if (patch.id !== undefined) {
      props['id'] = patch.id;
    }
    if (patch.documentation !== undefined) {
      props['documentation'] = patch.documentation
        ? [moddle.create('bpmn:Documentation', { text: patch.documentation })]
        : [];
    }
    if (patch.assignee !== undefined) {
      props['assignee'] = patch.assignee || undefined;
    }
    if (patch.candidateGroups !== undefined) {
      props['candidateGroups'] = patch.candidateGroups || undefined;
    }
    if (patch.script !== undefined) {
      props['script'] = patch.script || undefined;
    }
    if (patch.scriptFormat !== undefined) {
      props['scriptFormat'] = patch.scriptFormat || undefined;
    }
    if (patch.isForCompensation !== undefined) {
      props['isForCompensation'] = patch.isForCompensation || undefined;
    }
    if (patch.condition !== undefined) {
      props['conditionExpression'] = patch.condition
        ? moddle.create('bpmn:Expression', { body: patch.condition })
        : undefined;
    }
    if (
      patch.isMultiInstance !== undefined ||
      patch.isSequential !== undefined ||
      patch.collection !== undefined ||
      patch.elementVariable !== undefined
    ) {
      const current = bo.loopCharacteristics;
      if (patch.isMultiInstance === false) {
        props['loopCharacteristics'] = undefined;
      } else if (current || patch.isMultiInstance) {
        props['loopCharacteristics'] = moddle.create('bpmn:MultiInstanceLoopCharacteristics', {
          isSequential: patch.isSequential ?? current?.isSequential ?? false,
          collection: (patch.collection ?? current?.collection) || undefined,
          elementVariable: (patch.elementVariable ?? current?.elementVariable) || undefined,
        });
      }
    }
    if (patch.isExpanded !== undefined && isSubProcessType(element.type)) {
      const expanded = element.di?.isExpanded ?? true;
      if (expanded !== patch.isExpanded) {
        modeling.toggleCollapse(element);
      }
    }
    if (patch.isDefaultFlow !== undefined && element.source) {
      modeling.updateProperties(element.source, {
        default: patch.isDefaultFlow ? bo : undefined,
      });
    }
    if (patch.fillColor !== undefined || patch.strokeColor !== undefined) {
      const colors: { fill?: string; stroke?: string } = {};
      if (patch.fillColor !== undefined) {
        colors.fill = patch.fillColor || undefined;
      }
      if (patch.strokeColor !== undefined) {
        colors.stroke = patch.strokeColor || undefined;
      }
      modeling.setColor([element], colors);
    }

    const styleAttrs = toStyleAttributes(patch);
    if (Object.keys(styleAttrs).length > 0 && element.di) {
      modeler.get<CommandStackLike>('commandStack').execute('element.updateModdleProperties', {
        element,
        moddleElement: element.di,
        properties: styleAttrs,
      });
    }
    if (patch.customProperties) {
      const moddle = modeler.get<ModdleLike>('moddle');
      const clean = patch.customProperties
        .map((property) => ({ name: property.name.trim(), value: property.value }))
        .filter((property) => property.name !== '');
      const values = (bo.extensionElements?.values ?? []).filter(
        (value) => value.$type !== 'camunda:Properties',
      );
      if (clean.length > 0) {
        values.push(
          moddle.create('camunda:Properties', {
            values: clean.map((property) => moddle.create('camunda:Property', property)),
          }) as ModdleProperty,
        );
      }
      // Всегда новый объект: мутация старого не попадает в историю команд,
      // и undo не возвращает прежний набор свойств.
      props.extensionElements =
        values.length > 0 ? moddle.create('bpmn:ExtensionElements', { values }) : undefined;
    }
    if (Object.keys(props).length > 0) {
      modeling.updateProperties(element, props);
    }
    setRevision((value) => value + 1);
  }, []);

  const saveDefaultStyleForSelected = useCallback(() => {
    const element = selectedRef.current;
    if (!element) {
      return;
    }
    const style: ElementStyle = {};
    const fill = element.di?.get?.('color:background-color');
    const stroke = element.di?.get?.('color:border-color');
    if (fill) {
      style.fill = fill;
    }
    if (stroke) {
      style.stroke = stroke;
    }
    const next = withDefaultStyle(styleDefaultsRef.current, element.businessObject.$type, style);
    setStyleDefaults(next);
    saveStyleDefaults(next);
  }, []);

  const clearDefaultStyleForSelected = useCallback(() => {
    const element = selectedRef.current;
    if (!element) {
      return;
    }
    const next = clearDefaultStyle(styleDefaultsRef.current, element.businessObject.$type);
    setStyleDefaults(next);
    saveStyleDefaults(next);
  }, []);

  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const modeler = modelerRef.current;
    const host = hostRef.current;
    if (!modeler || !host) {
      return;
    }
    pointerRef.current = { x: event.clientX, y: event.clientY };

    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const selection = modeler.get<SelectionLike>('selection');
    const clipboard = modeler.get<ClipboardLike>('clipboard', false);
    const modeling = modeler.get<ModelingLike>('modeling');
    const actions = modeler.get<EditorActionsLike>('editorActions');
    const directEditing = modeler.get<DirectEditingLike>('directEditing', false);
    const wasEditingLabel =
      event.target instanceof Element &&
      event.target.closest('.djs-direct-editing-parent') !== null;
    if (wasEditingLabel && directEditing?.isActive()) {
      directEditing.cancel();
    }
    const target =
      findElementAt(event.target, registry) ??
      (wasEditingLabel && selection.get().length === 1 ? (selection.get()[0] ?? null) : null);
    const canPaste = !(clipboard?.isEmpty() ?? true);
    const hint = (action: ShortcutAction) => formatCombo(shortcuts[action]);

    let items: ContextMenuItem[];

    if (target) {
      if (!selection.get().includes(target)) {
        selection.select([target]);
      }
      const isParticipant = target.type === 'bpmn:Participant';
      const isLane = target.type === 'bpmn:Lane';
      const isSubProcess = isSubProcessType(target.type);
      items = [
        {
          id: 'rename',
          label: 'Переименовать',
          hint: hint('editLabel'),
          onSelect: () => modeler.get<DirectEditingLike>('directEditing').activate(target),
        },
        {
          id: 'properties',
          label: 'Свойства элемента',
          onSelect: () => {
            selection.select([target]);
            setInspectorOpen(true);
            window.requestAnimationFrame(() => {
              document
                .querySelector<HTMLElement>('.inspector')
                ?.scrollIntoView({ block: 'nearest' });
            });
          },
        },
        ...(target.waypoints
          ? []
          : [
              {
                id: 'lock',
                label: isElementLocked(target.di) ? 'Открепить элемент' : 'Закрепить элемент',
                onSelect: () => setElementLocked(target, !isElementLocked(target.di)),
              },
            ]),
        { id: 'sep-1', label: '', separator: true },
        {
          id: 'duplicate',
          label: 'Дублировать',
          hint: hint('duplicate'),
          onSelect: () => executeAction('duplicate'),
        },
        {
          id: 'copy',
          label: 'Копировать',
          hint: hint('copy'),
          onSelect: () => executeAction('copy'),
        },
        {
          id: 'paste',
          label: 'Вставить',
          hint: hint('paste'),
          disabled: !canPaste,
          onSelect: () => pasteAtPointer(),
        },
      ];

      const isDirectedFlow =
        target.type === 'bpmn:SequenceFlow' || target.type === 'bpmn:MessageFlow';
      const flowSource = target.source;
      const flowTarget = target.target;
      if (isDirectedFlow && flowSource && flowTarget) {
        items.push({
          id: 'reverse-flow',
          label: 'Изменить направление',
          onSelect: () => modeling.reconnect(target, flowTarget, flowSource),
        });
      }

      if (selection.get().length > 1) {
        items.push(
          { id: 'sep-align', label: '', separator: true },
          {
            id: 'align-left',
            label: 'Выровнять по левому краю',
            onSelect: () => actions.trigger('alignElements', { type: 'left' }),
          },
          {
            id: 'align-center',
            label: 'Выровнять по центру',
            onSelect: () => actions.trigger('alignElements', { type: 'center' }),
          },
          {
            id: 'align-top',
            label: 'Выровнять по верху',
            onSelect: () => actions.trigger('alignElements', { type: 'top' }),
          },
          {
            id: 'distribute-x',
            label: 'Распределить по горизонтали',
            onSelect: () => actions.trigger('distributeElements', { type: 'horizontal' }),
          },
          {
            id: 'distribute-y',
            label: 'Распределить по вертикали',
            onSelect: () => actions.trigger('distributeElements', { type: 'vertical' }),
          },
        );
      }

      if (isParticipant) {
        items.push({
          id: 'add-lane',
          label: 'Добавить дорожку',
          onSelect: () => {
            modeling.addLane(target, 'bottom');
          },
        });
      }
      if (isLane) {
        items.push({
          id: 'remove-lane',
          label: 'Удалить дорожку',
          danger: true,
          onSelect: () => modeling.removeElements([target]),
        });
      }
      if (isSubProcess) {
        items.push({
          id: 'toggle-collapse',
          label: target.di?.isExpanded === false ? 'Развернуть подпроцесс' : 'Свернуть подпроцесс',
          onSelect: () => modeling.toggleCollapse(target),
        });
        items.push({
          id: 'enter-subprocess',
          label: 'Войти внутрь',
          onSelect: () => enterSubProcess(target),
        });
      }

      items.push(
        { id: 'sep-2', label: '', separator: true },
        {
          id: 'delete',
          label: 'Удалить',
          hint: hint('delete'),
          danger: true,
          onSelect: () => executeAction('delete'),
        },
      );
    } else {
      items = [
        {
          id: 'paste',
          label: 'Вставить',
          hint: hint('paste'),
          disabled: !canPaste,
          onSelect: () => pasteAtPointer(),
        },
        {
          id: 'select-all',
          label: 'Выделить всё',
          hint: hint('selectAll'),
          onSelect: () => executeAction('selectAll'),
        },
        { id: 'sep-1', label: '', separator: true },
        {
          id: 'fit',
          label: 'Вписать диаграмму',
          hint: hint('fit'),
          onSelect: () => executeAction('fit'),
        },
        {
          id: 'minimap',
          label: minimapOpen ? 'Скрыть мини-карту' : 'Показать мини-карту',
          hint: hint('toggleMinimap'),
          onSelect: () => executeAction('toggleMinimap'),
        },
        { id: 'sep-2', label: '', separator: true },
        {
          id: 'undo',
          label: 'Отменить',
          hint: hint('undo'),
          disabled: !canUndo,
          onSelect: () => executeAction('undo'),
        },
        {
          id: 'redo',
          label: 'Повторить',
          hint: hint('redo'),
          disabled: !canRedo,
          onSelect: () => executeAction('redo'),
        },
        { id: 'sep-3', label: '', separator: true },
        {
          id: 'shortcuts',
          label: 'Горячие клавиши…',
          hint: hint('settings'),
          onSelect: () => setShortcutsOpen(true),
        },
      ];
    }

    setMenu({ x: event.clientX, y: event.clientY, items });
  };

  const restoreDraft = async () => {
    const modeler = modelerRef.current;
    if (!modeler || !draft) {
      return;
    }
    try {
      await modeler.importXML(draft.xml);
      modeler.get<CanvasLike>('canvas').zoom('fit-viewport');
      setReady(true);
      setDraft(null);
      setSave({ kind: 'dirty' });
      etagRef.current = draft.etag;
      scheduleLocalDraft();
      void persist();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'черновик не открылся');
    }
  };

  const discardDraft = () => {
    clearDraft(diagramId);
    setDraft(null);
  };

  const selectedInspector = selected ? toInspector(selected) : null;
  const legendItems = (() => {
    const modeler = modelerRef.current;
    if (!ready || !legendOpen || !modeler) {
      return [];
    }
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    return buildLegendItems(
      registry.getAll().map((element) => ({
        type: element.businessObject.$type,
        di: element.di,
      })),
      themeById(themeId, customColors),
    );
  })();

  return (
    <div className="workspace">
      <div className="workspace__main">
        <div className="editor-toolbar">
          <div className="editor-toolbar__group">
            <button
              type="button"
              className="ghost-button"
              onClick={() => executeAction('undo')}
              disabled={!canUndo}
              title={`Отменить (${formatCombo(shortcuts.undo)})`}
            >
              Отменить
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => executeAction('redo')}
              disabled={!canRedo}
              title={`Повторить (${formatCombo(shortcuts.redo)})`}
            >
              Повторить
            </button>
            <span className="editor-toolbar__divider" aria-hidden="true" />
            <button
              type="button"
              className="ghost-button"
              onClick={() => executeAction('fit')}
              title={`Вписать диаграмму (${formatCombo(shortcuts.fit)})`}
            >
              Вписать
            </button>
            <button
              type="button"
              className={minimapOpen ? 'ghost-button ghost-button--active' : 'ghost-button'}
              onClick={() => executeAction('toggleMinimap')}
              title={`Мини-карта (${formatCombo(shortcuts.toggleMinimap)})`}
            >
              Мини-карта
            </button>
            <button type="button" className="ghost-button" onClick={() => setThemeOpen(true)}>
              Тема
            </button>
            <button
              type="button"
              className={legendOpen ? 'ghost-button ghost-button--active' : 'ghost-button'}
              onClick={() => setLegendOpen((value) => !value)}
            >
              Легенда
            </button>
            <button
              type="button"
              className={commentsOpen ? 'ghost-button ghost-button--active' : 'ghost-button'}
              onClick={() => setCommentsOpen((value) => !value)}
              title="Обсуждение выбранного элемента"
            >
              Комментарии{openCommentCount(comments) ? ` (${openCommentCount(comments)})` : ''}
            </button>
            <button
              type="button"
              className={
                inspectorOpen
                  ? 'ghost-button ghost-button--active narrow-only'
                  : 'ghost-button narrow-only'
              }
              onClick={() => setInspectorOpen((value) => !value)}
              title="Показать свойства элемента"
            >
              Свойства
            </button>
          </div>
          <div className="editor-toolbar__group">
            <SaveBadge state={save} />
            <button
              type="button"
              className="ghost-button"
              onClick={() => setShortcutsOpen(true)}
              title={`Горячие клавиши (${formatCombo(shortcuts.settings)})`}
            >
              Клавиши
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => executeAction('save')}
              disabled={save.kind === 'saved' || save.kind === 'saving'}
              title={`Сохранить (${formatCombo(shortcuts.save)})`}
            >
              Сохранить
            </button>
          </div>
        </div>

        <div
          className="editor-toolbar editor-toolbar--format"
          role="toolbar"
          aria-label="Форматирование"
        >
          <div className="editor-toolbar__section" role="group" aria-label="Текст">
            <span className="editor-toolbar__label">Текст</span>
            <button
              type="button"
              className={
                selectedInspector?.isBold
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              disabled={!selectedInspector}
              aria-pressed={selectedInspector?.isBold ?? false}
              title="Жирный текст"
              onClick={() => applyPatch({ isBold: !selectedInspector?.isBold })}
            >
              <strong>Ж</strong>
            </button>
            <button
              type="button"
              className={
                selectedInspector?.isItalic
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              disabled={!selectedInspector}
              aria-pressed={selectedInspector?.isItalic ?? false}
              title="Курсив"
              onClick={() => applyPatch({ isItalic: !selectedInspector?.isItalic })}
            >
              <em>К</em>
            </button>
            <select
              className="editor-toolbar__size"
              aria-label="Размер шрифта"
              disabled={!selectedInspector}
              value={selectedInspector?.fontSize ?? ''}
              onChange={(event) => applyPatch({ fontSize: event.target.value })}
            >
              <option value="">11</option>
              {[8, 9, 10, 12, 14, 16, 18, 24, 32, 48].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <label className="editor-toolbar__color" title="Цвет текста">
              <span aria-hidden="true">А</span>
              <input
                type="color"
                aria-label="Цвет текста"
                disabled={!selectedInspector}
                value={selectedInspector?.fontColor || '#22242a'}
                onChange={(event) => applyPatch({ fontColor: event.target.value })}
              />
            </label>
            <span className="editor-toolbar__divider" aria-hidden="true" />
            {(
              [
                ['left', 'Л', 'По левому краю'],
                ['center', 'Ц', 'По центру'],
                ['right', 'П', 'По правому краю'],
              ] as const
            ).map(([value, label, title]) => (
              <button
                key={value}
                type="button"
                className={
                  (selectedInspector?.textAlign || 'center') === value
                    ? 'ghost-button ghost-button--small ghost-button--active'
                    : 'ghost-button ghost-button--small'
                }
                disabled={!selectedInspector}
                title={title}
                aria-pressed={(selectedInspector?.textAlign || 'center') === value}
                onClick={() => applyPatch({ textAlign: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="editor-toolbar__section" role="group" aria-label="Стиль элементов">
            <span className="editor-toolbar__label">Стиль</span>
            <label className="editor-toolbar__color" title="Заливка">
              <span aria-hidden="true">З</span>
              <input
                type="color"
                aria-label="Заливка"
                disabled={!selectedInspector || isSequenceFlowType(selectedInspector.type)}
                value={selectedInspector?.fillColor || '#ffffff'}
                onChange={(event) => applyPatch({ fillColor: event.target.value })}
              />
            </label>
            <label className="editor-toolbar__color" title="Обводка">
              <span aria-hidden="true">О</span>
              <input
                type="color"
                aria-label="Обводка"
                disabled={!selectedInspector}
                value={selectedInspector?.strokeColor || '#22242a'}
                onChange={(event) => applyPatch({ strokeColor: event.target.value })}
              />
            </label>
            <span className="editor-toolbar__divider" aria-hidden="true" />
            <select
              className="editor-toolbar__size editor-toolbar__size--wide"
              aria-label="Шрифт"
              disabled={!selectedInspector}
              value={selectedInspector?.fontFamily ?? ''}
              onChange={(event) => applyPatch({ fontFamily: event.target.value })}
            >
              <option value="">Шрифт</option>
              <option value="Inter">Inter</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Courier New">Courier New</option>
              <option value="system-ui">Системный</option>
            </select>
            <label className="editor-toolbar__cell" title="Толщина линии">
              <span>Толщина</span>
              <input
                type="number"
                aria-label="Толщина линии"
                min={1}
                max={6}
                disabled={!selectedInspector}
                value={selectedInspector?.strokeWidth ?? ''}
                placeholder="1"
                onChange={(event) => applyPatch({ strokeWidth: event.target.value })}
              />
            </label>
            <select
              className="editor-toolbar__size"
              aria-label="Линия"
              disabled={!selectedInspector}
              value={selectedInspector?.strokeStyle ?? ''}
              onChange={(event) => applyPatch({ strokeStyle: event.target.value })}
            >
              <option value="">сплошная</option>
              <option value="dashed">пунктир</option>
              <option value="dotted">точки</option>
            </select>
            <select
              className="editor-toolbar__size"
              aria-label="Прозрачность"
              disabled={!selectedInspector}
              value={selectedInspector?.opacity || '1'}
              onChange={(event) => applyPatch({ opacity: event.target.value })}
            >
              {['1', '0.9', '0.8', '0.7', '0.6', '0.5', '0.4', '0.3', '0.2', '0.1'].map((value) => (
                <option key={value} value={value}>
                  {Math.round(Number(value) * 100)}%
                </option>
              ))}
            </select>
            <span className="editor-toolbar__divider" aria-hidden="true" />
            <button
              type="button"
              className="ghost-button ghost-button--small"
              disabled={
                !selectedInspector ||
                (!selectedInspector.fillColor && !selectedInspector.strokeColor)
              }
              onClick={() => applyPatch({ fillColor: '', strokeColor: '' })}
            >
              Сбросить стиль
            </button>
          </div>
        </div>

        {draft ? (
          <div className="draft-banner" role="status">
            <span>
              Найден локальный черновик от{' '}
              {new Date(draft.savedAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              .
            </span>
            <button type="button" className="ghost-button" onClick={() => void restoreDraft()}>
              Восстановить
            </button>
            <button type="button" className="ghost-button" onClick={discardDraft}>
              Отбросить
            </button>
          </div>
        ) : null}

        <div className="canvas">
          <div
            ref={hostRef}
            className="canvas__host"
            data-testid="diagram-editor"
            data-canvas={canvasTheme}
            data-revision={revision}
            onContextMenu={openContextMenu}
          />
          {loadError ? <p className="canvas__overlay canvas__overlay--error">{loadError}</p> : null}
          {!ready && !loadError ? <p className="canvas__overlay">открываю диаграмму…</p> : null}
          <p className="canvas-hint" aria-hidden="true">
            ПКМ — меню элемента · {formatCombo(shortcuts.editLabel)} — переименовать
          </p>
          {commentsOpen ? (
            <CommentsPanel
              key={selected?.id ?? 'none'}
              elementName={selected ? selected.businessObject.name || selected.id : null}
              comments={commentsForElement(comments, selected?.id ?? null)}
              busy={commentsBusy}
              error={commentsError}
              onCreate={(body) => void addComment(body)}
              onToggleResolved={(comment) => void toggleCommentResolved(comment)}
              onDelete={(comment) => void removeComment(comment)}
              onClose={() => setCommentsOpen(false)}
            />
          ) : null}
          {legendOpen ? (
            <DiagramLegend
              items={legendItems}
              position={legendPosition}
              onMove={setLegendPosition}
              onDragEnd={(next) => {
                setLegendPosition(next);
                writeDiagramSettings({ legend: next });
              }}
              onClose={() => setLegendOpen(false)}
            />
          ) : null}
        </div>
      </div>

      <PropertiesPanel
        key={selected?.id ?? 'empty'}
        element={selectedInspector}
        onClose={() => setInspectorOpen(false)}
        inspectorOpen={inspectorOpen}
        onChange={applyPatch}
        hasDefaultStyle={
          selected ? Boolean(getDefaultStyle(styleDefaults, selected.businessObject.$type)) : false
        }
        onSaveDefaultStyle={saveDefaultStyleForSelected}
        onClearDefaultStyle={clearDefaultStyleForSelected}
        onEnterSubProcess={() => {
          if (selected) {
            enterSubProcess(selected);
          }
        }}
      />

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <ThemeSettings
        open={themeOpen}
        value={themeId}
        customColors={customColors}
        canvas={canvasTheme}
        onChange={updateTheme}
        onCustomColorsChange={updateCustomColors}
        onCanvasChange={updateCanvasTheme}
        onClose={() => setThemeOpen(false)}
      />
      <ShortcutSettings
        open={shortcutsOpen}
        shortcuts={shortcuts}
        onChange={updateShortcuts}
        autosaveSeconds={autosaveSeconds}
        onAutosaveChange={(seconds) => setAutosaveSeconds(saveAutosaveSeconds(seconds))}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state.kind === 'saving') {
    return <span className="badge badge--muted">сохраняю…</span>;
  }
  if (state.kind === 'dirty') {
    return <span className="badge badge--muted">есть изменения</span>;
  }
  if (state.kind === 'error') {
    return (
      <span className="badge badge--error" title={state.message}>
        не сохранено
      </span>
    );
  }
  return <span className="badge badge--ok">сохранено</span>;
}
