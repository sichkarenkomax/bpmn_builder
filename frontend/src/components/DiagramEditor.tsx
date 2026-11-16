import DrilldownModule from 'bpmn-js/lib/features/drilldown';
import {
  DATA_OBJECT_REFERENCE_OUTLINE_PATH,
  DATA_OBJECT_REFERENCE_STANDARD_SIZE,
  DATA_STORE_REFERENCE_OUTLINE_PATH,
  DATA_STORE_REFERENCE_STANDARD_SIZE,
} from 'bpmn-js/lib/features/outline/OutlineUtil';
import BpmnLayouter, {
  type BpmnLayoutConnectionHints,
} from 'bpmn-js/lib/features/modeling/BpmnLayouter';
import Modeler from 'bpmn-js/lib/Modeler';
import { is } from 'bpmn-js/lib/util/ModelUtil';
import RuleProvider from 'diagram-js/lib/features/rules/RuleProvider';
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
import { loadMarkdownToolbarEnabled, saveMarkdownToolbarEnabled } from '../lib/markdown-settings';
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
  applyAnnotationStyle,
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
import { attributeTypeForXml, parseAttributeType } from '../lib/attributes';
import { isElementLocked } from '../lib/lock';
import { anchorPoint, closestSide, type AnchorSide } from '../lib/connection-anchors';
import { hasDiagonalSegment, orthogonalAssociationWaypoints } from '../lib/association-route';
import { proportionalAnchor, type Bounds, type Point } from '../lib/resize-anchors';
import { ConnectionAnchors } from './ConnectionAnchors';
import {
  loadCanvasMouseMode,
  saveCanvasMouseMode,
  type CanvasMouseMode,
} from '../lib/mouse-settings';
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
import { ReplaceMenu, type ReplaceEntry, type ReplaceMenuState } from './ReplaceMenu';
import { StageBands } from './StageBands';
import { StagesDialog } from './StagesDialog';
import { hiddenStageElementIds, type DiagramStage } from '../lib/stages';
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
  type?: unknown;
  $attrs?: Record<string, string>;
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
  updateWaypoints: (connection: DiagramElement, waypoints: { x: number; y: number }[]) => void;
  removeElements: (elements: DiagramElement[]) => void;
  toggleCollapse: (element: DiagramElement) => void;
  addLane: (element: DiagramElement, location: 'top' | 'bottom') => DiagramElement;
  reconnect: (connection: DiagramElement, source: DiagramElement, target: DiagramElement) => void;
  setColor: (elements: DiagramElement[], colors: { fill?: string; stroke?: string }) => void;
}

interface LayouterLike {
  layoutConnection: (
    connection: DiagramElement,
    hints: {
      connectionStart?: { x: number; y: number };
      connectionEnd?: { x: number; y: number };
    },
  ) => { x: number; y: number }[];
}

interface ElementRegistryLike {
  get: (id: string) => DiagramElement | undefined;
  getAll: () => DiagramElement[];
  filter: (predicate: (element: DiagramElement) => boolean) => DiagramElement[];
  getGraphics: (element: DiagramElement) => SVGGElement | undefined;
}

interface SelectionLike {
  get: () => DiagramElement[];
  select: (elements: DiagramElement[]) => void;
}

interface EditorEvent {
  newSelection?: DiagramElement[];
  context?: { shape?: DiagramElement; connection?: DiagramElement };
  viewbox?: { x: number; y: number; scale: number };
}

interface EventBusLike {
  on(event: string, handler: (event: EditorEvent) => void): void;
  on(event: string, priority: number, handler: (event: EditorEvent) => void): void;
  off?: (event: string, handler: (event: EditorEvent) => void) => void;
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

interface DiProperties {
  get: (name: string) => unknown;
  set: (name: string, value: unknown) => void;
}

interface BulkPropertiesItem {
  element: DiagramElement;
  moddleElement: DiProperties;
  properties: Record<string, unknown>;
}

interface BulkPropertiesContext {
  items: BulkPropertiesItem[];
  previous?: Record<string, unknown>[];
}

/**
 * Одна команда на изменение свойств сразу нескольких DI-элементов
 * (сейчас — массовое закрепление). В снимок для undo попадают все ключи
 * из `properties`, а не только `locked`: команда останется корректной,
 * если набор свойств расширят.
 */
class ModdlePropertiesHandler {
  execute(context: BulkPropertiesContext): DiagramElement[] {
    context.previous = context.items.map((item) => {
      const snapshot: Record<string, unknown> = {};
      for (const key of Object.keys(item.properties)) {
        snapshot[key] = item.moddleElement.get(key);
      }
      return snapshot;
    });
    for (const item of context.items) {
      for (const [key, value] of Object.entries(item.properties)) {
        item.moddleElement.set(key, value);
      }
    }
    return context.items.map((item) => item.element);
  }

  revert(context: BulkPropertiesContext): DiagramElement[] {
    context.items.forEach((item, index) => {
      for (const [key, value] of Object.entries(context.previous?.[index] ?? {})) {
        item.moddleElement.set(key, value);
      }
    });
    return context.items.map((item) => item.element);
  }
}

class BulkPropertiesProvider {
  static $inject = ['commandStack'];

  constructor(commandStack: CommandStackLike) {
    commandStack.registerHandler('elements.updateModdleProperties', ModdlePropertiesHandler);
  }
}

const lockModule = {
  __init__: ['lockRules', 'bulkProperties'],
  lockRules: ['type', LockRulesProvider],
  bulkProperties: ['type', BulkPropertiesProvider],
};

interface LayoutPoint {
  x: number;
  y: number;
}

/** Связи-ассоциации идут по сторонам фигур и ортогонально, как потоки. */
class OrthogonalAssociationLayouter extends BpmnLayouter {
  override layoutConnection(
    connection: never,
    hints: BpmnLayoutConnectionHints = {},
  ): LayoutPoint[] {
    if (is(connection, 'bpmn:Association') || is(connection, 'bpmn:DataAssociation')) {
      const association = connection as unknown as DiagramElement;
      const source =
        (hints.source as unknown as DiagramElement | undefined) ?? association.source;
      const target =
        (hints.target as unknown as DiagramElement | undefined) ?? association.target;
      const sourceBounds = shapeBounds(source);
      const targetBounds = shapeBounds(target);
      if (sourceBounds && targetBounds) {
        return orthogonalAssociationWaypoints(sourceBounds, targetBounds);
      }
    }
    return super.layoutConnection(connection, hints as never);
  }
}

const ALIGN_LINES = {
  left: [
    [2, 14],
    [2, 10],
    [2, 14],
    [2, 8],
  ],
  center: [
    [1, 15],
    [4, 12],
    [1, 15],
    [3, 13],
  ],
  right: [
    [2, 14],
    [6, 14],
    [2, 14],
    [8, 14],
  ],
} as const;

/** Стандартные значки выравнивания текста (три строки у края/по центру). */
function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      {ALIGN_LINES[align].map(([x1, x2], index) => (
        <line
          key={index}
          x1={x1}
          x2={x2}
          y1={2.5 + index * 3.5}
          y2={2.5 + index * 3.5}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** Значки направления текста: горизонтально, вертикально, поворот. */
function DirectionIcon({ value }: { value: '' | 'vertical' | 'rotate' }) {
  if (value === 'vertical') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M8 13V2M5 5l3-3 3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (value === 'rotate') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 8h10M10 5l3 3-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ReplaceMenuProviderLike {
  getPopupMenuEntries: (target: DiagramElement) => Record<string, ReplaceEntry>;
}

interface ResizeRuleContext {
  shape?: DiagramElement;
  newBounds?: { width: number; height: number };
}

/** Разрешает ресайз всем фигурам BPMN, не только задачам/пулам (1.3.27). */
class ResizeAllShapesRules extends RuleProvider {
  static override $inject = ['eventBus'];

  override init(): void {
    // Выше BpmnRules: иначе его запрет для событий/задач сработает раньше.
    this.addRule('shape.resize', 1500, (context: ResizeRuleContext) => {
      const shape = context.shape;
      if (!shape || shape.type === 'label') {
        return undefined;
      }
      if (
        context.newBounds &&
        (context.newBounds.width < 12 || context.newBounds.height < 12)
      ) {
        return false;
      }
      return shape.type?.startsWith('bpmn:') ? true : undefined;
    });
  }
}

const associationRoutingModule = {
  bpmnLayouter: ['type', OrthogonalAssociationLayouter],
};

interface CommandEventLike {
  context?: {
    connection?: DiagramElement;
    shape?: DiagramElement;
    shapes?: DiagramElement[];
  };
}

interface GraphicsFactoryLike {
  update: (type: string, element: DiagramElement, gfx: unknown) => void;
}

interface BpmnUpdaterLike {
  updateConnectionWaypoints: (connection: DiagramElement) => void;
}

/**
 * Держит ассоциации ортогональными после создания, переноса и ресайза:
 * правит waypoints на месте, без лишних шагов undo.
 */
class AssociationRoutingProvider {
  static $inject = ['eventBus', 'elementRegistry', 'graphicsFactory', 'bpmnUpdater'];

  constructor(
    eventBus: {
      on: (
        events: string | string[],
        priority: number,
        handler: (event: CommandEventLike) => void,
      ) => void;
    },
    registry: ElementRegistryLike,
    graphicsFactory: GraphicsFactoryLike,
    bpmnUpdater: BpmnUpdaterLike,
  ) {
    const apply = (connection: DiagramElement) => {
      const sourceBounds = shapeBounds(connection.source);
      const targetBounds = shapeBounds(connection.target);
      if (!sourceBounds || !targetBounds) {
        return;
      }
      const next = orthogonalAssociationWaypoints(sourceBounds, targetBounds);
      const current = (connection.waypoints ?? []) as LayoutPoint[];
      if (
        current.length === next.length &&
        current.every(
          (point, index) =>
            Math.abs(point.x - next[index]!.x) < 0.5 &&
            Math.abs(point.y - next[index]!.y) < 0.5,
        )
      ) {
        return;
      }
      connection.waypoints = next;
      bpmnUpdater.updateConnectionWaypoints(connection);
      const gfx = registry.getGraphics(connection);
      if (gfx) {
        graphicsFactory.update('connection', connection, gfx);
      }
    };

    const reroute = (event: CommandEventLike) => {
      const context = event.context ?? {};
      const changedIds = new Set(
        [context.shape, ...(context.shapes ?? [])]
          .filter((shape): shape is DiagramElement => Boolean(shape))
          .map((shape) => shape.id),
      );
      for (const element of registry.getAll()) {
        if (!element.type.endsWith('Association')) {
          continue;
        }
        const affected =
          element === context.connection ||
          (element.source ? changedIds.has(element.source.id) : false) ||
          (element.target ? changedIds.has(element.target.id) : false);
        if (affected) {
          apply(element);
        }
      }
    };

    eventBus.on(
      [
        'commandStack.connection.create.postExecuted',
        'commandStack.connection.reconnect.postExecuted',
        'commandStack.shape.move.postExecuted',
        'commandStack.shape.resize.postExecuted',
        'commandStack.elements.move.postExecuted',
      ],
      1500,
      reroute,
    );
  }
}

const associationRoutingBehaviorModule = {
  __init__: ['associationRoutingBehavior'],
  associationRoutingBehavior: ['type', AssociationRoutingProvider],
};

interface ShapeLike extends Bounds {
  id: string;
}

interface LayoutHintsLike {
  connectionStart?: Point;
  connectionEnd?: Point;
}

interface LayoutContextLike {
  shape?: ShapeLike;
  connection?: DiagramElement & { waypoints?: Point[]; source?: DiagramElement; target?: DiagramElement };
  hints?: LayoutHintsLike;
}

/**
 * При ресайзе bpmn-js оставляет старую точку примыкания, если она попала
 * внутрь новой рамки (при сжатии снизу стрелка «съезжает» вниз).
 * Пересчитываем конец связи пропорционально старой рамке.
 */
class ResizeAnchorProvider {
  static $inject = ['eventBus'];

  constructor(eventBus: {
    on: (events: string, priority: number, handler: (event: { context?: LayoutContextLike }) => void) => void;
  }) {
    const oldBounds = new Map<string, Bounds>();

    eventBus.on('commandStack.shape.resize.preExecute', 1500, (event) => {
      const shape = event.context?.shape;
      if (shape) {
        oldBounds.set(shape.id, {
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
        });
      }
    });

    eventBus.on('commandStack.connection.layout.preExecute', 1500, (event) => {
      const context = event.context;
      const connection = context?.connection;
      const hints = context?.hints;
      if (!connection || !hints) {
        return;
      }
      const waypoints = connection.waypoints ?? [];
      const sourceNew = shapeBounds(connection.source);
      const sourceOld = connection.source ? oldBounds.get(connection.source.id) : undefined;
      if (hints.connectionStart && sourceOld && sourceNew && waypoints[0]) {
        hints.connectionStart = proportionalAnchor(waypoints[0], sourceOld, sourceNew);
      }
      const targetNew = shapeBounds(connection.target);
      const targetOld = connection.target ? oldBounds.get(connection.target.id) : undefined;
      const last = waypoints[waypoints.length - 1];
      if (hints.connectionEnd && targetOld && targetNew && last) {
        hints.connectionEnd = proportionalAnchor(last, targetOld, targetNew);
      }
    });

    // Чистим после завершения команды: вложенные connection.layout уже отработали.
    eventBus.on('commandStack.shape.resize.postExecuted', 100, () => oldBounds.clear());
    eventBus.on('commandStack.shape.resize.reverted', 100, () => oldBounds.clear());
  }
}

const resizeAnchorModule = {
  __init__: ['resizeAnchorBehavior'],
  resizeAnchorBehavior: ['type', ResizeAnchorProvider],
};

interface OutlineStylesLike {
  cls: (className: string, classes: string[]) => Record<string, string>;
}

interface OutlineLike {
  registerProvider: (priority: number, provider: ResizableOutlineProvider) => void;
}

/** Дорисовывает контур выделения под изменённые события, шлюзы и данные. */
class ResizableOutlineProvider {
  static $inject = ['outline', 'styles'];

  private readonly styles: Record<string, string>;

  constructor(outline: OutlineLike, styles: OutlineStylesLike) {
    this.styles = styles.cls('djs-outline', ['no-fill']);
    outline.registerProvider(1500, this);
  }

  private create(tag: 'circle' | 'rect' | 'path'): SVGElement {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(this.styles)) {
      node.setAttribute(name, value);
    }
    return node;
  }

  getOutline(element: DiagramElement): SVGElement | undefined {
    if (element.type === 'bpmn:EndEvent' || element.type === 'bpmn:Event') {
      const outline = this.create('circle');
      this.updateEventOutline(outline, element);
      return outline;
    }
    if (element.type === 'bpmn:Gateway') {
      const outline = this.create('rect');
      this.updateGatewayOutline(outline, element);
      return outline;
    }
    if (element.type === 'bpmn:DataObjectReference' || element.type === 'bpmn:DataStoreReference') {
      const outline = this.create('path');
      const standard =
        element.type === 'bpmn:DataObjectReference'
          ? DATA_OBJECT_REFERENCE_STANDARD_SIZE
          : DATA_STORE_REFERENCE_STANDARD_SIZE;
      outline.setAttribute(
        'd',
        element.type === 'bpmn:DataObjectReference'
          ? DATA_OBJECT_REFERENCE_OUTLINE_PATH
          : DATA_STORE_REFERENCE_OUTLINE_PATH,
      );
      outline.setAttribute('stroke-width', '2');
      this.updateDataOutline(outline, element, standard);
      return outline;
    }
    return undefined;
  }

  updateOutline(element: DiagramElement, outline: SVGElement): boolean {
    if (element.type === 'bpmn:EndEvent' || element.type === 'bpmn:Event') {
      this.updateEventOutline(outline, element);
      return true;
    }
    if (element.type === 'bpmn:Gateway') {
      this.updateGatewayOutline(outline, element);
      return true;
    }
    if (element.type === 'bpmn:DataObjectReference' || element.type === 'bpmn:DataStoreReference') {
      this.updateDataOutline(
        outline,
        element,
        element.type === 'bpmn:DataObjectReference'
          ? DATA_OBJECT_REFERENCE_STANDARD_SIZE
          : DATA_STORE_REFERENCE_STANDARD_SIZE,
      );
      return true;
    }
    return false;
  }

  private updateEventOutline(outline: SVGElement, element: DiagramElement): void {
    const width = element.width ?? 0;
    const height = element.height ?? 0;
    outline.setAttribute('cx', String(width / 2));
    outline.setAttribute('cy', String(height / 2));
    outline.setAttribute('r', String(width / 2 + 6 + (element.type === 'bpmn:EndEvent' ? 1 : 0)));
  }

  private updateGatewayOutline(outline: SVGElement, element: DiagramElement): void {
    outline.setAttribute('x', '2');
    outline.setAttribute('y', '2');
    outline.setAttribute('rx', '4');
    outline.setAttribute('width', String(Math.max(0, (element.width ?? 0) - 4)));
    outline.setAttribute('height', String(Math.max(0, (element.height ?? 0) - 4)));
    outline.style.transformBox = 'fill-box';
    outline.style.transform = 'rotate(45deg)';
    outline.style.transformOrigin = 'center';
  }

  private updateDataOutline(
    outline: SVGElement,
    element: DiagramElement,
    standard: { width: number; height: number },
  ): void {
    const scaleX = (element.width ?? standard.width) / standard.width;
    const scaleY = (element.height ?? standard.height) / standard.height;
    outline.setAttribute(
      'transform',
      `translate(${-6 * scaleX} ${-6 * scaleY}) scale(${scaleX} ${scaleY})`,
    );
  }
}

const resizableOutlineModule = {
  __init__: ['resizableOutlineProvider'],
  resizableOutlineProvider: ['type', ResizableOutlineProvider],
};

const resizeModule = {
  __init__: ['resizeAllRules'],
  resizeAllRules: ['type', ResizeAllShapesRules],
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
  registerHandler: (
    event: string,
    handler: new () => {
      execute: (context: BulkPropertiesContext) => DiagramElement[];
      revert: (context: BulkPropertiesContext) => DiagramElement[];
    },
  ) => void;
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
      .map((value) => ({
        name: value.name ?? '',
        value: value.value ?? '',
        type: parseAttributeType(value),
      })),
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

function shapeBounds(element: DiagramElement | undefined) {
  if (
    !element ||
    typeof element.x !== 'number' ||
    typeof element.y !== 'number' ||
    typeof element.width !== 'number' ||
    typeof element.height !== 'number'
  ) {
    return null;
  }
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

/** Чинит старые ассоциации с диагональными сегментами при открытии схемы. */
function normalizeImportedAssociations(modeler: Modeler): boolean {
  const registry = modeler.get<ElementRegistryLike>('elementRegistry');
  const modeling = modeler.get<ModelingLike>('modeling');
  let changed = false;
  for (const element of registry.getAll()) {
    if (!element.type.endsWith('Association')) {
      continue;
    }
    const sourceBounds = shapeBounds(element.source);
    const targetBounds = shapeBounds(element.target);
    if (!sourceBounds || !targetBounds) {
      continue;
    }
    if (!hasDiagonalSegment((element.waypoints ?? []) as LayoutPoint[])) {
      continue;
    }
    modeling.updateWaypoints(element, orthogonalAssociationWaypoints(sourceBounds, targetBounds));
    changed = true;
  }
  return changed;
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
  const [replaceMenu, setReplaceMenu] = useState<ReplaceMenuState | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => loadShortcuts());
  const [autosaveSeconds, setAutosaveSeconds] = useState<number>(() => loadAutosaveSeconds());
  const [markdownToolbar, setMarkdownToolbar] = useState<boolean>(() =>
    loadMarkdownToolbarEnabled(),
  );
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
  const [mouseMode, setMouseMode] = useState<CanvasMouseMode>(() => loadCanvasMouseMode());
  const mouseModeRef = useRef(mouseMode);
  mouseModeRef.current = mouseMode;
  const [marquee, setMarquee] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const suppressSelectionClickRef = useRef(false);
  const [anchorEditor, setAnchorEditor] = useState<{
    connection: DiagramElement;
    source: AnchorSide;
    target: AnchorSide;
  } | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsButtonRef = useRef<HTMLButtonElement | null>(null);
  const [stages, setStages] = useState<DiagramStage[]>([]);
  const [stagesOpen, setStagesOpen] = useState(false);
  const [viewbox, setViewbox] = useState({ x: 0, y: 0, scale: 1 });

  const applyAllStyles = (modeler: Modeler) => {
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const theme = themeById(themeRef.current, customColorsRef.current);
    for (const element of registry.getAll()) {
      const gfx = registry.getGraphics(element);
      if (gfx) {
        gfx.dataset['locked'] = isElementLocked(element.di) ? 'true' : '';
      }
      applyStyleToGfx(gfx, element.di, element.type);
      applyExternalLabelLayout(
        gfx,
        element,
        element.type === 'label' ? readExtendedStyle(element.labelTarget?.di).textAlign : '',
        element.type === 'label' ? readExtendedStyle(element.labelTarget?.di).textDirection : '',
      );
      if (hasManualColor(element.di)) {
        // Ручной цвет важнее темы: переносим его в inline-стиль поверх возможного оверрайда.
        const fill = element.di?.get?.('color:background-color');
        const stroke = element.di?.get?.('color:border-color');
        if (element.businessObject.$type === 'bpmn:TextAnnotation') {
          // У аннотации красим фон и скобку отдельно, не превращая её в квадрат.
          applyAnnotationStyle(gfx, { fill, stroke });
        } else {
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
  overlayOpenRef.current = shortcutsOpen || themeOpen || stagesOpen || menu !== null;

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
    stages?: DiagramStage[];
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

  const updateStages = (next: DiagramStage[]) => {
    setStages(next);
    writeDiagramSettings({ stages: next });
  };

  const toggleStage = (stage: DiagramStage) => {
    updateStages(
      stages.map((item) =>
        item.id === stage.id ? { ...item, collapsed: !item.collapsed } : item,
      ),
    );
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

  // Мышь на пустом холсте: ЛКМ — рамка выделения, средняя кнопка — панорама.
  // В режиме «панорама» ЛКМ остаётся за bpmn-js (MoveCanvas).
  useEffect(() => {
    const host = hostRef.current;
    const modeler = modelerRef.current;
    if (!ready || !host || !modeler) {
      return;
    }
    let drag: { startX: number; startY: number; add: boolean; moved: boolean } | null = null;
    const lastPointer = { current: null as { x: number; y: number } | null };
    const eventBus = modeler.get<EventBusLike>('eventBus');
    const onClick = (event: EditorEvent & { stopPropagation?: () => void }) => {
      if (!suppressSelectionClickRef.current) {
        return undefined;
      }
      suppressSelectionClickRef.current = false;
      event.stopPropagation?.();
      return false;
    };
    eventBus.on('element.click', 1500, onClick as (event: EditorEvent) => void);
    const onMove = (event: MouseEvent) => {
      if (!drag) {
        return;
      }
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) {
        return;
      }
      drag.moved = true;
      setMarquee({
        left: Math.min(drag.startX, event.clientX),
        top: Math.min(drag.startY, event.clientY),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    };
    const cleanup = () => {
      document.removeEventListener('mousemove', trackPointer, true);
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      drag = null;
      setMarquee(null);
    };
    const onUp = () => {
      const current = drag;
      if (!current) {
        return;
      }
      const selection = modeler.get<SelectionLike>('selection');
      const registry = modeler.get<ElementRegistryLike>('elementRegistry');
      const canvas = modeler.get<CanvasLike>('canvas');
      if (!current.moved) {
        cleanup();
        if (!current.add) {
          selection.select([]);
        }
        return;
      }
      const rect = host.getBoundingClientRect();
      const viewbox = canvas.viewbox();
      const toCanvas = (clientX: number, clientY: number) => ({
        x: viewbox.x + (clientX - rect.left) / viewbox.scale,
        y: viewbox.y + (clientY - rect.top) / viewbox.scale,
      });
      const start = toCanvas(current.startX, current.startY);
      const last = lastPointer.current ?? { x: current.startX, y: current.startY };
      const end = toCanvas(last.x, last.y);
      const box = { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
      const root = canvas.getRootElement();
      const enclosed = registry.filter(
        (element) =>
          element !== root &&
          element.type !== 'label' &&
          typeof element.x === 'number' &&
          typeof element.y === 'number' &&
          typeof element.width === 'number' &&
          typeof element.height === 'number' &&
          element.x >= Math.min(box.x1, box.x2) &&
          element.y >= Math.min(box.y1, box.y2) &&
          element.x + element.width <= Math.max(box.x1, box.x2) &&
          element.y + element.height <= Math.max(box.y1, box.y2),
      );
      const next = current.add ? [...selection.get(), ...enclosed] : enclosed;
      const unique = [...new Map(next.map((element) => [element.id, element])).values()];
      // Клик после протяжки не должен сбрасывать только что сделанное выделение.
      // Флаг снимается либо этим кликом (element.click), либо следующим
      // mousedown — без таймера, поэтому гонки с событием click нет.
      suppressSelectionClickRef.current = true;
      cleanup();
      selection.select(unique);
    };
    const trackPointer = (event: MouseEvent) => {
      lastPointer.current = { x: event.clientX, y: event.clientY };
    };
    const onDown = (event: MouseEvent) => {
      if (event.button !== 0 || mouseModeRef.current !== 'select') {
        return;
      }
      // Новое нажатие — новый жест: недоставленный клик прошлой рамки больше не актуален.
      suppressSelectionClickRef.current = false;
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      // Панели bpmn-js (context pad, палитра, popup) лежат внутри контейнера,
      // но не являются пустым холстом: иначе рамка съедает их клики.
      if (
        target.closest(
          'button, a, input, select, textarea, [role="button"], .djs-context-pad, .djs-popup, .djs-palette, .djs-overlay, .djs-minimap, .layer-resizers, .djs-resizer, .djs-bendpoint, .djs-segment-dragger',
        )
      ) {
        return;
      }
      const rootElement = modeler.get<CanvasLike>('canvas').getRootElement();
      const elementHost = target.closest('[data-element-id]');
      const elementId = elementHost?.getAttribute('data-element-id');
      if (
        elementId &&
        modeler.get<ElementRegistryLike>('elementRegistry').get(elementId) !== rootElement
      ) {
        return;
      }
      drag = {
        startX: event.clientX,
        startY: event.clientY,
        add: event.shiftKey,
        moved: false,
      };
      lastPointer.current = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      event.stopPropagation();
      document.addEventListener('mousemove', trackPointer, true);
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('mouseup', onUp, true);
    };
    host.addEventListener('mousedown', onDown, true);
    return () => {
      host.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('mousemove', trackPointer, true);
      cleanup();
    };
  }, [ready]);

  useEffect(() => {
    const container = hostRef.current;
    if (!container) {
      return;
    }

    const modeler = new Modeler({
      container,
      additionalModules: [
        minimapModule,
        DrilldownModule,
        lockModule,
        associationRoutingModule,
        associationRoutingBehaviorModule,
        resizeModule,
        resizeAnchorModule,
        resizableOutlineModule,
      ],
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
      setStages(stored.stages ?? []);
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
        setStages(stored.stages ?? []);
        setViewbox(modeler.get<CanvasLike>('canvas').viewbox());
        const normalized = normalizeImportedAssociations(modeler);
        applyAllStyles(modeler);
        setReady(true);
        // Миграция диагональных связей — реальное изменение, его нужно сохранить.
        setSave({ kind: normalized ? 'dirty' : 'saved' });
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

  // Полосы этапов живут в координатах холста: следим за зумом/панорамой.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!ready || !modeler) {
      return;
    }
    const canvas = modeler.get<CanvasLike>('canvas');
    const eventBus = modeler.get<EventBusLike>('eventBus');
    setViewbox(canvas.viewbox());
    const onViewboxChanged = (event: EditorEvent) => {
      if (event.viewbox) {
        setViewbox(event.viewbox);
      }
    };
    eventBus.on('canvas.viewbox.changed', onViewboxChanged);
    return () => eventBus.off?.('canvas.viewbox.changed', onViewboxChanged);
  }, [ready]);

  // Свёрнутый этап прячет фигуры внутри полосы; модель и XML не меняются.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!ready || !modeler) {
      return;
    }
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const hidden = hiddenStageElementIds(stages, registry.getAll());
    for (const element of registry.getAll()) {
      const gfx = registry.getGraphics(element);
      if (gfx) {
        gfx.style.display = hidden.has(element.id) ? 'none' : '';
      }
    }
    return () => {
      for (const element of registry.getAll()) {
        const gfx = registry.getGraphics(element);
        if (gfx) {
          gfx.style.display = '';
        }
      }
    };
  }, [stages, ready, revision]);

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

  const setElementsLocked = useCallback((elements: DiagramElement[], locked: boolean) => {
    const modeler = modelerRef.current;
    if (!modeler) {
      return;
    }
    const items = elements
      .filter((element) => element.di)
      .map((element) => ({
        element,
        moddleElement: element.di as unknown as DiProperties,
        properties: { locked: locked ? true : undefined },
      }));
    if (items.length === 0) {
      return;
    }
    modeler.get<CommandStackLike>('commandStack').execute('elements.updateModdleProperties', {
      items,
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
        .map((property) => ({
          name: property.name.trim(),
          value: property.value,
          type: attributeTypeForXml(property.type),
        }))
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
      const selectedShapes = selection.get().filter((element) => !element.waypoints && element.di);
      const lockTargets =
        !target.waypoints && selectedShapes.includes(target) ? selectedShapes : [target];
      const allLocked = lockTargets.every((element) => isElementLocked(element.di));
      const lockLabel =
        lockTargets.length > 1
          ? allLocked
            ? `Открепить выбранные (${lockTargets.length})`
            : `Закрепить выбранные (${lockTargets.length})`
          : allLocked
            ? 'Открепить элемент'
            : 'Закрепить элемент';
      const replaceProvider = modeler.get<ReplaceMenuProviderLike>('replaceMenuProvider', false);
      let replaceEntries: ReplaceEntry[] = [];
      try {
        replaceEntries = Object.values(replaceProvider?.getPopupMenuEntries(target) ?? {});
      } catch {
        replaceEntries = [];
      }

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
                label: lockLabel,
                onSelect: () => setElementsLocked(lockTargets, !allLocked),
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

      if (replaceEntries.length > 0) {
        items.push({
          id: 'replace',
          label: 'Сменить тип',
          icon: '⟳',
          onSelect: () =>
            setReplaceMenu({
              x: event.clientX,
              y: event.clientY,
              entries: replaceEntries,
            }),
        });
      }

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

      const sourceBounds = shapeBounds(target.source);
      const targetBounds = shapeBounds(target.target);
      if (target.waypoints && sourceBounds && targetBounds) {
        const waypoints = target.waypoints as { x: number; y: number }[];
        items.push({
          id: 'connection-anchors',
          label: 'Точки примыкания…',
          onSelect: () =>
            setAnchorEditor({
              connection: target,
              source: closestSide(sourceBounds, waypoints[0]!),
              target: closestSide(targetBounds, waypoints[waypoints.length - 1]!),
            }),
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

  // 1.3.22: все действия тулбара — в одном меню с подписями и значками.
  const openActionsMenu = () => {
    if (actionsMenuOpen) {
      setMenu(null);
      setActionsMenuOpen(false);
      return;
    }
    const rect = actionsButtonRef.current?.getBoundingClientRect();
    const active = (on: boolean) => (on ? ' · вкл' : '');
    const commentCount = openCommentCount(comments);
    setMenu({
      x: rect?.left ?? 8,
      y: (rect?.bottom ?? 8) + 4,
      items: [
        {
          id: 'undo',
          icon: '↶',
          label: 'Отменить',
          hint: formatCombo(shortcuts.undo),
          disabled: !canUndo,
          onSelect: () => executeAction('undo'),
        },
        {
          id: 'redo',
          icon: '↷',
          label: 'Повторить',
          hint: formatCombo(shortcuts.redo),
          disabled: !canRedo,
          onSelect: () => executeAction('redo'),
        },
        { id: 'sep-history', label: '', separator: true },
        {
          id: 'fit',
          icon: '⤢',
          label: 'Вписать',
          hint: formatCombo(shortcuts.fit),
          onSelect: () => executeAction('fit'),
        },
        {
          id: 'minimap',
          icon: '▦',
          label: `Мини-карта${active(minimapOpen)}`,
          hint: formatCombo(shortcuts.toggleMinimap),
          onSelect: () => executeAction('toggleMinimap'),
        },
        { id: 'sep-view', label: '', separator: true },
        {
          id: 'theme',
          icon: '🎨',
          label: 'Тема',
          onSelect: () => setThemeOpen(true),
        },
        {
          id: 'legend',
          icon: '▤',
          label: `Легенда${active(legendOpen)}`,
          onSelect: () => setLegendOpen((value) => !value),
        },
        {
          id: 'comments',
          icon: '💬',
          label: `Комментарии${commentCount ? ` (${commentCount})` : ''}${active(commentsOpen)}`,
          onSelect: () => setCommentsOpen((value) => !value),
        },
        {
          id: 'properties',
          icon: '☰',
          label: 'Свойства',
          onSelect: () => setInspectorOpen((value) => !value),
        },
        {
          id: 'stages',
          icon: '▥',
          label: 'Этапы…',
          onSelect: () => setStagesOpen(true),
        },
        { id: 'sep-settings', label: '', separator: true },
        {
          id: 'status',
          icon: '•',
          label: saveStateLabel(save),
          disabled: true,
        },
        {
          id: 'shortcuts',
          icon: '⌨',
          label: 'Клавиши',
          hint: formatCombo(shortcuts.settings),
          onSelect: () => setShortcutsOpen(true),
        },
        {
          id: 'save',
          icon: '💾',
          label: 'Сохранить',
          hint: formatCombo(shortcuts.save),
          disabled: save.kind === 'saved' || save.kind === 'saving',
          onSelect: () => executeAction('save'),
        },
      ],
    });
    setActionsMenuOpen(true);
  };

  return (
    <div className="workspace">
      <div className="workspace__main">
        <div className="editor-toolbar">
          <div className="editor-toolbar__group">
            <button
              ref={actionsButtonRef}
              type="button"
              className="ghost-button ghost-button--menu"
              aria-haspopup="menu"
              aria-expanded={actionsMenuOpen}
              onClick={openActionsMenu}
            >
              <span aria-hidden="true">☰</span> Действия
            </button>
          </div>
          <div className="editor-toolbar__group">
            <SaveBadge state={save} />
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
                ['left', 'По левому краю'],
                ['center', 'По центру'],
                ['right', 'По правому краю'],
              ] as const
            ).map(([value, title]) => (
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
                aria-label={title}
                aria-pressed={(selectedInspector?.textAlign || 'center') === value}
                onClick={() => applyPatch({ textAlign: value })}
              >
                <AlignIcon align={value} />
              </button>
            ))}
            <span className="editor-toolbar__divider" aria-hidden="true" />
            {(
              [
                ['', 'Направление текста: горизонтально'],
                ['vertical', 'Направление текста: вертикально'],
                ['rotate', 'Направление текста: поворот'],
              ] as const
            ).map(([value, title]) => (
              <button
                key={value}
                type="button"
                className={
                  (selectedInspector?.textDirection || '') === value
                    ? 'ghost-button ghost-button--small ghost-button--active'
                    : 'ghost-button ghost-button--small'
                }
                disabled={!selectedInspector}
                title={title}
                aria-label={title}
                aria-pressed={(selectedInspector?.textDirection || '') === value}
                onClick={() => applyPatch({ textDirection: value })}
              >
                <DirectionIcon value={value} />
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
          <StageBands stages={stages} viewbox={viewbox} onToggle={toggleStage} />
          {marquee ? (
            <div
              className="canvas-marquee"
              style={{
                left: marquee.left,
                top: marquee.top,
                width: marquee.width,
                height: marquee.height,
              }}
              aria-hidden="true"
            />
          ) : null}
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
        markdownToolbar={markdownToolbar}
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

      <StagesDialog
        open={stagesOpen}
        stages={stages}
        onChange={updateStages}
        onClose={() => setStagesOpen(false)}
      />
      <ConnectionAnchors
        open={anchorEditor !== null}
        sourceName={
          anchorEditor?.connection.source?.businessObject.name ||
          anchorEditor?.connection.source?.id ||
          ''
        }
        targetName={
          anchorEditor?.connection.target?.businessObject.name ||
          anchorEditor?.connection.target?.id ||
          ''
        }
        source={anchorEditor?.source ?? 'right'}
        target={anchorEditor?.target ?? 'left'}
        onApply={(source, target) => {
          if (!anchorEditor) {
            return;
          }
          const modeler = modelerRef.current;
          const connection = anchorEditor.connection;
          if (!modeler || !connection.source || !connection.target) {
            return;
          }
          const sourceBounds = shapeBounds(connection.source);
          const targetBounds = shapeBounds(connection.target);
          if (!sourceBounds || !targetBounds) {
            return;
          }
          const modeling = modeler.get<ModelingLike>('modeling');
          // Считаем маршрут layouter'ом с новыми концами — старые изломы
          // могут пересекать фигуры после переноса точки примыкания.
          // У `modeling.layoutConnection` нет возврата: это команда.
          const waypoints = modeler.get<LayouterLike>('layouter').layoutConnection(connection, {
            connectionStart: anchorPoint(sourceBounds, source),
            connectionEnd: anchorPoint(targetBounds, target),
          });
          modeling.updateWaypoints(connection, waypoints);
          setAnchorEditor(null);
        }}
        onClose={() => setAnchorEditor(null)}
      />
      <ContextMenu
        menu={menu}
        onClose={() => {
          setMenu(null);
          setActionsMenuOpen(false);
        }}
        ignoreRef={actionsButtonRef}
      />
      <ReplaceMenu menu={replaceMenu} onClose={() => setReplaceMenu(null)} />
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
        markdownToolbar={markdownToolbar}
        onMarkdownToolbarChange={(enabled) =>
          setMarkdownToolbar(saveMarkdownToolbarEnabled(enabled))
        }
        mouseMode={mouseMode}
        onMouseModeChange={(mode) => setMouseMode(saveCanvasMouseMode(mode))}
        onClose={() => setShortcutsOpen(false)}
      />
    </div>
  );
}

function saveStateLabel(state: SaveState): string {
  switch (state.kind) {
    case 'saving':
      return 'сохраняю…';
    case 'dirty':
      return 'есть изменения';
    case 'error':
      return 'не сохранено';
    default:
      return 'сохранено';
  }
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
