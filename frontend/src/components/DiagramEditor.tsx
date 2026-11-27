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
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import 'diagram-js-minimap/assets/diagram-js-minimap.css';

import {
  ApiError,
  createComment,
  createExportJob,
  deleteComment,
  downloadExportJob,
  downloadValidationReport,
  fetchComments,
  fetchExportJob,
  fetchValidation,
  saveDiagramXml,
  simulateDiagram,
  updateComment,
  type DiagramComment,
  type ExportJobSummary,
  type ServerExportFormat,
  type SimulationReport,
  type SimulationVariable,
  type ValidationFinding,
  type ValidationReport,
} from '../lib/api';
import { blobToBase64, downloadBlob, downloadText, modelerSvg, svgToPng } from '../lib/export';
import { ExportDialog, type ExportKind } from './ExportDialog';
import { useToast } from './ToastProvider';
import {
  COMMENT_OVERLAY_TYPE,
  commentsForElement,
  groupOpenComments,
  openCommentCount,
} from '../lib/comments';
import { CommentsPanel } from './CommentsPanel';
import { ProblemsPanel } from './ProblemsPanel';
import {
  summarizeFindingsByElement,
  validationBadgeText,
  validationBadgeTitle,
  validationFindingsCount,
  VALIDATION_OVERLAY_TYPE,
} from '../lib/validation';
import { clearAllPanelLayouts } from '../lib/panel-layout';
import { loadAutosaveSeconds, saveAutosaveSeconds } from '../lib/autosave';
import { loadMarkdownToolbarEnabled, saveMarkdownToolbarEnabled } from '../lib/markdown-settings';
import {
  loadValidationMode,
  saveValidationMode,
  type ValidationMode,
} from '../lib/validation-settings';
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
  laneBoundsOutsidePoolHeader,
  moveGroupsToFront,
  renderFrameBackgrounds,
  type FrameGraphics,
} from '../lib/pool-layout';
import {
  applyAnnotationStyle,
  applyThemeToGfx,
  buildLegendItems,
  hasManualColor,
  manualFill,
  manualStroke,
  themeById,
  type ThemeId,
} from '../lib/diagram-theme';
import {
  DEFAULT_COMPACT_BOUNDARY_EVENTS,
  DEFAULT_LEGEND_POSITION,
  DEFAULT_RESIZE_OTHERS,
  DEFAULT_RESIZE_TASKS,
  diagramSettingsProperties,
  readDiagramSettings,
  type CanvasTheme,
  type DefinitionsLike,
  type LegendPosition,
} from '../lib/diagram-settings';
import bsModdle from '../lib/bs-moddle.json';
import { attributeTypeForXml, parseAttributeType } from '../lib/attributes';
import { savePortalDefaults } from '../lib/portal-defaults';
import { loadTypePaletteEnabled, saveTypePaletteEnabled } from '../lib/type-palette';
import { isElementLocked } from '../lib/lock';
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
  type LocalDraft,
} from '../lib/draft-store';
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
import { DiagramResizeSettings } from './DiagramResizeSettings';
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
import { centerOf, type TokenPoint } from '../lib/simulation-token';
import { parseSimulationVariables } from '../lib/simulation-variables';
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu';
import { ReplaceMenu, type ReplaceEntry, type ReplaceMenuState } from './ReplaceMenu';
import { StageBands } from './StageBands';
import { StageDocumentationDialog } from './StageDocumentationDialog';
import { SimulationPanel } from './SimulationPanel';
import { SimulationTokens } from './SimulationTokens';
import {
  collectStagePools,
  createStage,
  hiddenStageElementIds,
  resizeStageBoundary,
  stageBounds,
  stageContentRight,
  stageForPool,
  STAGE_DEFAULT_WIDTH,
  STAGE_MIN_WIDTH,
  type DiagramStage,
  type StagePool,
  type StageResizeResult,
} from '../lib/stages';
import { PropertiesPanel } from './PropertiesPanel';
import { SettingsDialog } from './SettingsDialog';

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
    isHorizontal?: boolean;
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
  host?: DiagramElement;
  children?: DiagramElement[];
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
  getLayer: (name: string) => SVGGElement | undefined;
  getRootElement: () => DiagramElement;
  setRootElement: (element: DiagramElement) => void;
  findRoot: (id: string) => DiagramElement | undefined;
  scrollToElement: (element: DiagramElement, padding?: number) => void;
  viewbox: () => { x: number; y: number; width: number; height: number; scale: number };
  addMarker?: (element: DiagramElement, className: string) => void;
  removeMarker?: (element: DiagramElement, className: string) => void;
}

interface ModelingLike {
  updateProperties: (element: DiagramElement, properties: Record<string, unknown>) => void;
  updateWaypoints: (connection: DiagramElement, waypoints: { x: number; y: number }[]) => void;
  removeElements: (elements: DiagramElement[]) => void;
  toggleCollapse: (element: DiagramElement) => void;
  addLane: (element: DiagramElement, location: 'top' | 'bottom') => DiagramElement;
  reconnect: (connection: DiagramElement, source: DiagramElement, target: DiagramElement) => void;
  setColor: (elements: DiagramElement[], colors: { fill?: string; stroke?: string }) => void;
  resizeShape: (
    shape: DiagramElement,
    bounds: { x: number; y: number; width: number; height: number },
  ) => void;
  moveElements: (elements: DiagramElement[], delta: { x: number; y: number }) => void;
  updateAttachment: (shape: DiagramElement, newHost?: DiagramElement) => void;
  createShape: (
    shape: { type: string; host?: DiagramElement; width?: number; height?: number },
    position: { x: number; y: number },
    target: DiagramElement,
    hints?: { attach?: boolean },
  ) => DiagramElement;
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
  element?: DiagramElement;
  gfx?: SVGGElement;
  context?: {
    shape?: DiagramElement;
    connection?: DiagramElement;
    direction?: string;
    newBounds?: { x: number; y: number; width: number; height: number };
    frame?: SVGRectElement;
  };
  viewbox?: { x: number; y: number; width: number; height: number; scale: number };
  dx?: number;
  dy?: number;
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
      const source = (hints.source as unknown as DiagramElement | undefined) ?? association.source;
      const target = (hints.target as unknown as DiagramElement | undefined) ?? association.target;
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

/** Стандартные габариты элемента — для сброса размера из ПКМ. */
function defaultShapeSize(
  element: DiagramElement | null | undefined,
): { width: number; height: number } | null {
  const type = element?.type ?? '';
  if (
    !element ||
    type === 'label' ||
    type === 'bpmn:Participant' ||
    type === 'bpmn:Lane' ||
    type === 'bpmn:Group'
  ) {
    return null;
  }
  if (type === 'bpmn:DataObjectReference') {
    return {
      width: DATA_OBJECT_REFERENCE_STANDARD_SIZE.width,
      height: DATA_OBJECT_REFERENCE_STANDARD_SIZE.height,
    };
  }
  if (type === 'bpmn:DataStoreReference') {
    return {
      width: DATA_STORE_REFERENCE_STANDARD_SIZE.width,
      height: DATA_STORE_REFERENCE_STANDARD_SIZE.height,
    };
  }
  if (type.endsWith('Gateway')) {
    return { width: 50, height: 50 };
  }
  if (type.endsWith('Event')) {
    const size = type === 'bpmn:BoundaryEvent' && boundaryEventSettings.compact ? 18 : 36;
    return { width: size, height: size };
  }
  if (type === 'bpmn:TextAnnotation') {
    return { width: 100, height: 30 };
  }
  return { width: 100, height: 80 };
}

/** Центр события на правой границе активности. */
function boundaryEventPosition(host: DiagramElement): { x: number; y: number } {
  return {
    x: (host.x ?? 0) + (host.width ?? 100),
    y: (host.y ?? 0) + (host.height ?? 80) / 2,
  };
}

/** Любое событие BPMN: стартовое, промежуточное, граничное, финиш. */
function isEventElement(element: DiagramElement | null | undefined): boolean {
  return (element?.type ?? '').endsWith('Event');
}

/** События и шлюзы рисуются кругом/ромбом: держим их рамку квадратной. */
function keepsSquareFrame(element: DiagramElement | null | undefined): boolean {
  const type = element?.type ?? '';
  return type.endsWith('Event') || type.endsWith('Gateway');
}

/** Квадратная рамка с якорем на стороне, противоположной перетаскиваемой. */
function squareResizeBounds(
  old: { x: number; y: number; width: number; height: number },
  next: { x: number; y: number; width: number; height: number },
  direction: string,
): { x: number; y: number; width: number; height: number } {
  const size =
    direction.includes('e') || direction.includes('w')
      ? next.width
      : direction.includes('n') || direction.includes('s')
        ? next.height
        : Math.max(next.width, next.height);
  const centerX = old.x + old.width / 2;
  const centerY = old.y + old.height / 2;
  const x = direction.includes('w')
    ? old.x + old.width - size
    : direction.includes('e')
      ? old.x
      : centerX - size / 2;
  const y = direction.includes('n')
    ? old.y + old.height - size
    : direction.includes('s')
      ? old.y
      : centerY - size / 2;
  return { x, y, width: size, height: size };
}

/** Сырые рамки последнего превью: CommandStack копирует только свои поля. */
const resizeRawBounds = new Map<string, { x: number; y: number; width: number; height: number }>();

/**
 * Сдвигает рамку так, чтобы при повороте вокруг нового центра её
 * неподвижная сторона осталась на месте в осях холста.
 */
function compensateRotatedBounds(
  shape: DiagramElement,
  bounds: { x: number; y: number; width: number; height: number },
  angle: number,
): void {
  if (
    typeof shape.x !== 'number' ||
    typeof shape.y !== 'number' ||
    typeof shape.width !== 'number' ||
    typeof shape.height !== 'number'
  ) {
    return;
  }
  const radians = (angle * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const shiftX = bounds.x + bounds.width / 2 - (shape.x + shape.width / 2);
  const shiftY = bounds.y + bounds.height / 2 - (shape.y + shape.height / 2);
  bounds.x += shiftX * cos - shiftY * sin - shiftX;
  bounds.y += shiftX * sin + shiftY * cos - shiftY;
}

/** Поворот контура подписи/аннотации; при angle=0 возвращает штатный вид. */
function syncRotatedOutline(
  element: DiagramElement | null | undefined,
  gfx: SVGGElement | undefined,
): void {
  if (!element) {
    return;
  }
  const rotatesFrame =
    element.type === 'label' || element.businessObject?.$type === 'bpmn:TextAnnotation';
  if (!rotatesFrame) {
    return;
  }
  const outline = gfx?.querySelector<SVGGElement>('.djs-outline');
  if (!outline) {
    return;
  }
  const angle = rotatedFrameAngle(element);
  outline.style.transformBox = angle ? 'fill-box' : '';
  outline.style.transformOrigin = angle ? 'center' : '';
  outline.style.transform = angle ? `rotate(${angle}deg)` : '';
}

/** Угол поворота фрейма подписи/аннотации; 0 — фрейм не повёрнут. */
function rotatedFrameAngle(element: DiagramElement | null | undefined): number {
  if (!element) {
    return 0;
  }
  const rotatesFrame =
    element.businessObject.$type === 'bpmn:TextAnnotation' || element.type === 'label';
  if (!rotatesFrame) {
    return 0;
  }
  const carrier = element.type === 'label' ? element.labelTarget?.di : element.di;
  const direction = readExtendedStyle(carrier).textDirection;
  return direction === 'vertical' ? 90 : direction === 'rotate' ? -90 : 0;
}

/**
 * Ручки bpmn-js расставляет по неразвёрнутой рамке элемента, а повёрнутый
 * фрейм живёт только в SVG. Разворачиваем группы ручек вокруг центра, чтобы
 * они стояли на углах видимой рамки, а сами квадратики держим прямыми.
 */
function syncRotatedResizers(
  element: DiagramElement | null | undefined,
  layer: SVGGElement | null | undefined,
): void {
  if (!layer) {
    return;
  }
  const angle = rotatedFrameAngle(element);
  const centerX =
    typeof element?.x === 'number' && typeof element.width === 'number'
      ? element.x + element.width / 2
      : null;
  const centerY =
    typeof element?.y === 'number' && typeof element.height === 'number'
      ? element.y + element.height / 2
      : null;
  for (const group of layer.querySelectorAll<SVGGElement>('.djs-resizer')) {
    const stored = group.dataset['baseTransform'];
    const base = stored ?? group.getAttribute('transform') ?? '';
    if (stored === undefined) {
      group.dataset['baseTransform'] = base;
    }
    const children = group.querySelectorAll<SVGGraphicsElement>(
      '.djs-resizer-visual, .djs-resizer-hit',
    );
    if (angle === 0 || centerX === null || centerY === null) {
      group.setAttribute('transform', base);
      for (const child of children) {
        child.removeAttribute('transform');
      }
      continue;
    }
    group.setAttribute('transform', `rotate(${angle} ${centerX} ${centerY}) ${base}`);
    for (const child of children) {
      try {
        const box = child.getBBox();
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        child.setAttribute('transform', `rotate(${-angle} ${x} ${y})`);
      } catch {
        child.removeAttribute('transform');
      }
    }
  }
}

/** Стандартный значок заливки — ведро с каплей. */
function FillColorIcon() {
  return (
    <svg
      className="editor-toolbar__icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M16.56 8.94 7.62 0 6.21 1.41l2.38 2.38-5.15 5.15a1.49 1.49 0 0 0 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5a1.49 1.49 0 0 0 0-2.12ZM5.21 10 10 5.21 14.79 10H5.21ZM19 11.5s-2 2.17-2 3.5c0 1.1.9 2 2 2s2-.9 2-2c0-1.33-2-3.5-2-3.5Z"
      />
    </svg>
  );
}

/** Стандартный значок обводки — квадрат с толстым контуром. */
function StrokeColorIcon() {
  return (
    <svg
      className="editor-toolbar__icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
      />
    </svg>
  );
}

/** Значки направления текста: «А» со стрелкой, повёрнутой вместе с текстом. */
function DirectionIcon({ value }: { value: '' | 'vertical' | 'rotate' }) {
  // vertical — начало сверху (+90°), rotate — начало снизу (−90°).
  const angle = value === 'vertical' ? 90 : value === 'rotate' ? -90 : 0;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <g transform={angle ? `rotate(${angle} 8 8)` : undefined}>
        <text x="1" y="11.2" fontSize="9.5" fontWeight="700" fill="currentColor">
          А
        </text>
        <path
          d="M9.5 8h5M12 5.5 14.5 8 12 10.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

interface ReplaceMenuProviderLike {
  getPopupMenuEntries: (target: DiagramElement) => Record<string, ReplaceEntry>;
}

interface BpmnReplaceLike {
  replaceElement: (
    element: DiagramElement,
    target: { type: string; host?: DiagramElement },
    hints?: { layoutConnection?: boolean },
  ) => DiagramElement;
}

interface ResizeRuleContext {
  shape?: DiagramElement;
  newBounds?: { width: number; height: number };
}

/** Разрешает ресайз всем фигурам BPMN, не только задачам/пулам (1.3.27). */
/** Текущие разрешения на ресайз: их читают ручки и правило изменения размера. */
const resizePermissions = {
  tasks: DEFAULT_RESIZE_TASKS,
  others: DEFAULT_RESIZE_OTHERS,
};

/**
 * Компактные граничные события: 18×18 вместо стандартных 36×36. Пункт 1.5.12
 * отложен: переключатель и портальный дефолт скрыты, но поддержка атрибута
 * схемы сохранена для продолжения разработки.
 */
const boundaryEventSettings = {
  compact: DEFAULT_COMPACT_BOUNDARY_EVENTS,
};

function isTaskShape(type: string): boolean {
  return (
    type.endsWith('Task') ||
    type === 'bpmn:SubProcess' ||
    type === 'bpmn:CallActivity' ||
    type === 'bpmn:Transaction'
  );
}

function isOtherResizableShape(type: string): boolean {
  return (
    type.endsWith('Event') ||
    type.endsWith('Gateway') ||
    type === 'bpmn:DataObjectReference' ||
    type === 'bpmn:DataStoreReference'
  );
}

/** Дорожки и пулы — структура схемы, их размеры не прячем за настройкой. */
function mayResizeShape(type: string | undefined): boolean {
  if (!type || !type.startsWith('bpmn:')) {
    return true;
  }
  // Комментарии (аннотации) меняют размер вместе с задачами: общая настройка.
  if (isTaskShape(type) || type === 'bpmn:TextAnnotation') {
    return resizePermissions.tasks;
  }
  if (isOtherResizableShape(type)) {
    return resizePermissions.others;
  }
  return true;
}

class ResizeAllShapesRules extends RuleProvider {
  static override $inject = ['eventBus'];

  override init(): void {
    // Выше BpmnRules: иначе его запрет для событий/задач сработает раньше.
    this.addRule('shape.resize', 1500, (context: ResizeRuleContext) => {
      const shape = context.shape;
      if (!shape || shape.type === 'label') {
        return undefined;
      }
      if (!mayResizeShape(shape.type)) {
        return false;
      }
      if (context.newBounds && (context.newBounds.width < 12 || context.newBounds.height < 12)) {
        return false;
      }
      return shape.type?.startsWith('bpmn:') ? true : undefined;
    });
  }
}

/** Пересоздаёт ручки выбранного элемента после смены настроек ресайза. */
function refreshResizeHandles(modeler: Modeler): void {
  const selection = modeler.get<SelectionLike>('selection');
  const current = selection.get();
  selection.select([]);
  if (current.length > 0) {
    selection.select(current);
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
            Math.abs(point.x - next[index]!.x) < 0.5 && Math.abs(point.y - next[index]!.y) < 0.5,
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
  connection?: DiagramElement & {
    waypoints?: Point[];
    source?: DiagramElement;
    target?: DiagramElement;
  };
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
    on: (
      events: string,
      priority: number,
      handler: (event: { context?: LayoutContextLike }) => void,
    ) => void;
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
    if (isEventElement(element)) {
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
    if (isEventElement(element)) {
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
    // bpmn-js рисует событие кругом с r = (width + height) / 4: при ресайзе
    // одной стороны контур должен повторять именно эту окружность.
    outline.setAttribute(
      'r',
      String((width + height) / 4 + 6 + (element.type === 'bpmn:EndEvent' ? 1 : 0)),
    );
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

interface StageDragState {
  stageId: string;
  pool: StagePool;
  minWidth: number;
  movingElements: DiagramElement[];
  previewElements: { gfx: SVGGElement; transform: string }[];
  poolRects: { rect: SVGRectElement; width: number }[];
  preview: StageResizeResult;
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
  get?: () => Record<string, { type?: string; businessObject?: { $type?: string } }[]> | undefined;
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

type SaveState =
  { kind: 'saved' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'error'; message: string };

const AUTOSAVE_DEBOUNCE_MS = 1500;
const LOCAL_DRAFT_DEBOUNCE_MS = 400;

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
    fillColor: manualFill(element.di) ?? '',
    strokeColor: manualStroke(element.di) ?? '',
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

/**
 * Bizagi иногда отдаёт дорожку, начинающуюся под заголовком пула. Исправляем
 * геометрию при открытии, иначе подпись дорожки наезжает на имя участника.
 */
function normalizeImportedLaneBounds(modeler: Modeler): boolean {
  const registry = modeler.get<ElementRegistryLike>('elementRegistry');
  const modeling = modeler.get<ModelingLike>('modeling');
  let changed = false;
  for (const pool of registry.getAll()) {
    if (pool.type !== 'bpmn:Participant') {
      continue;
    }
    const poolBounds = shapeBounds(pool);
    if (!poolBounds) {
      continue;
    }
    for (const lane of pool.children ?? []) {
      if (lane.type !== 'bpmn:Lane') {
        continue;
      }
      const laneBounds = shapeBounds(lane);
      if (!laneBounds) {
        continue;
      }
      const next = laneBoundsOutsidePoolHeader(
        { ...poolBounds, isHorizontal: pool.di?.isHorizontal },
        laneBounds,
      );
      if (next) {
        modeling.resizeShape(lane, next);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Пул и его дорожки — фон: держим их группы ниже всех остальных фигур.
 *
 * Перестановки групп мало, когда пулы накладываются друг на друга: фон
 * верхнего пула всё равно рисуется после задач нижнего. Поэтому непрозрачные
 * части рам выносим в отдельный нижний слой, а в исходной группе оставляем
 * только подписи.
 */
function syncFrameBackgrounds(modeler: Modeler): void {
  const registry = modeler.get<ElementRegistryLike>('elementRegistry');
  const items: FrameGraphics[] = [];
  for (const element of registry.getAll()) {
    const gfx = registry.getGraphics(element);
    if (gfx) {
      items.push({ type: element.type, gfx });
    }
  }
  renderFrameBackgrounds(items);
}

/** Пул и его дорожки — фон: держим их группы ниже всех остальных фигур. */
function sendPoolsBehindElements(modeler: Modeler): void {
  const registry = modeler.get<ElementRegistryLike>('elementRegistry');
  const groupsByLayer = new Map<Element, Set<Element>>();
  for (const element of registry.getAll()) {
    if (element.type !== 'bpmn:Participant') {
      continue;
    }
    const group = registry.getGraphics(element)?.parentNode;
    const layer = group?.parentNode;
    if (group instanceof Element && layer instanceof Element) {
      const groups = groupsByLayer.get(layer) ?? new Set<Element>();
      groups.add(group);
      groupsByLayer.set(layer, groups);
    }
  }

  for (const [layer, groups] of groupsByLayer) {
    moveGroupsToFront(layer, groups);
  }
}

/**
 * Контейнер для вставки под курсором. Корень коллаборации для этого не
 * подходит: его ребёнок-задача не попадает в процесс и теряется при сохранении.
 */
function pasteTargetAt(
  modeler: Modeler,
  canvas: CanvasLike,
  point: { x: number; y: number } | undefined,
): DiagramElement {
  const root = canvas.getRootElement();
  if (root.type !== 'bpmn:Collaboration') {
    return root;
  }
  const registry = modeler.get<ElementRegistryLike>('elementRegistry');
  const containers = registry
    .getAll()
    .filter(
      (element) =>
        ['bpmn:Participant', 'bpmn:Lane', 'bpmn:SubProcess'].includes(element.type) &&
        !(element.type === 'bpmn:SubProcess' && element.di?.isExpanded === false),
    );
  const inside = point
    ? containers
        .filter((element) => {
          const { x, y, width, height } = element;
          return (
            x !== undefined &&
            y !== undefined &&
            width !== undefined &&
            height !== undefined &&
            point.x >= x &&
            point.x <= x + width &&
            point.y >= y &&
            point.y <= y + height
          );
        })
        .sort((a, b) => (a.width ?? 0) * (a.height ?? 0) - (b.width ?? 0) * (b.height ?? 0))[0]
    : undefined;
  // Вне пулов вставляем в первый пул: так элемент остаётся частью процесса.
  return inside ?? containers.find((element) => element.type === 'bpmn:Participant') ?? root;
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
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const { notify } = useToast();
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
  const [replaceInline, setReplaceInline] = useState(false);
  const [typePaletteEnabled, setTypePaletteEnabled] = useState<boolean>(() =>
    loadTypePaletteEnabled(),
  );
  const [shortcuts, setShortcuts] = useState<ShortcutMap>(() => loadShortcuts());
  const [autosaveSeconds, setAutosaveSeconds] = useState<number>(() => loadAutosaveSeconds());
  const [markdownToolbar, setMarkdownToolbar] = useState<boolean>(() =>
    loadMarkdownToolbarEnabled(),
  );
  const [styleDefaults, setStyleDefaults] = useState<StyleDefaults>(() => loadStyleDefaults());
  const styleDefaultsRef = useRef(styleDefaults);
  styleDefaultsRef.current = styleDefaults;
  const [themeId, setThemeId] = useState<ThemeId>('mono');
  const themeRef = useRef(themeId);
  themeRef.current = themeId;
  const [canvasTheme, setCanvasTheme] = useState<CanvasTheme>('light');
  const [resizeSettings, setResizeSettings] = useState({
    tasks: DEFAULT_RESIZE_TASKS,
    others: DEFAULT_RESIZE_OTHERS,
    compactBoundaryEvents: DEFAULT_COMPACT_BOUNDARY_EVENTS,
  });
  const [legendPosition, setLegendPosition] = useState<LegendPosition>(DEFAULT_LEGEND_POSITION);
  const [comments, setComments] = useState<DiagramComment[]>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsBusy, setCommentsBusy] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(true);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [highlightedFinding, setHighlightedFinding] = useState<ValidationFinding | null>(null);
  const [autoLayout, setAutoLayout] = useState(false);
  const [validation, setValidation] = useState<ValidationReport | null>(null);
  const [validationBusy, setValidationBusy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationNonce, setValidationNonce] = useState(0);
  const [reportDownloading, setReportDownloading] = useState(false);
  const lastValidationNonceRef = useRef(0);
  const [validationMode, setValidationMode] = useState<ValidationMode>(() => loadValidationMode());
  const validationCount = validationFindingsCount(validation);
  const validationState =
    validationBusy || save.kind === 'saving'
      ? 'checking'
      : save.kind !== 'saved'
        ? 'stale'
        : validationError
          ? 'error'
          : validation
            ? 'current'
            : 'idle';
  const validationStatusLabel =
    validationState === 'checking'
      ? 'Проверяется…'
      : validationState === 'stale'
        ? 'Устарело'
        : validationState === 'error'
          ? 'Ошибка проверки'
          : validationState === 'current'
            ? 'Актуально'
            : 'Не проверялось';
  const validationSummaryTitle = validation
    ? `Ошибки: ${validation.summary.errors}; предупреждения: ${validation.summary.warnings}; информация: ${validation.summary.infos}`
    : undefined;
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
  const [stages, setStages] = useState<DiagramStage[]>([]);
  const [stagePools, setStagePools] = useState<StagePool[]>([]);
  const [docsStage, setDocsStage] = useState<DiagramStage | null>(null);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulation, setSimulation] = useState<SimulationReport | null>(null);
  const [simulationChoices, setSimulationChoices] = useState<Record<string, string>>({});
  const [simulationRunId, setSimulationRunId] = useState(0);
  const [simulationIndex, setSimulationIndex] = useState(0);
  const [simulationPlaying, setSimulationPlaying] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState(1);
  const [simulationBusy, setSimulationBusy] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [simulationVariablesText, setSimulationVariablesText] = useState('');
  const [simulationHeatmap, setSimulationHeatmap] = useState(false);
  const simulationAbortRef = useRef<AbortController | null>(null);
  const [viewbox, setViewbox] = useState({ x: 0, y: 0, width: 0, height: 0, scale: 1 });
  const stageDragRef = useRef<StageDragState | null>(null);
  const frameBackgroundsRafRef = useRef<number | null>(null);

  const scheduleFrameBackgrounds = (modeler: Modeler) => {
    if (frameBackgroundsRafRef.current !== null) {
      return;
    }
    frameBackgroundsRafRef.current = window.requestAnimationFrame(() => {
      frameBackgroundsRafRef.current = null;
      syncFrameBackgrounds(modeler);
    });
  };

  const applyAllStyles = (modeler: Modeler) => {
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const theme = themeById(themeRef.current);
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
        const fill = manualFill(element.di);
        const stroke = manualStroke(element.di);
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
    sendPoolsBehindElements(modeler);
    syncFrameBackgrounds(modeler);
    syncRotatedResizers(
      modeler.get<SelectionLike>('selection').get()[0],
      modeler.get<CanvasLike>('canvas').getLayer('resizers'),
    );
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
    if (hasManualColor(element.di)) {
      return;
    }
    // setColor — отдельная команда: выполняем после завершения создания элемента.
    window.setTimeout(() => {
      modeler.get<ModelingLike>('modeling').setColor([element], style);
    }, 0);
  };
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportJob, setExportJob] = useState<ExportJobSummary | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [resizeSettingsOpen, setResizeSettingsOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [draft, setDraft] = useState<LocalDraft | null>(null);
  const [draftWarning, setDraftWarning] = useState<string | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const persistRef = useRef<() => Promise<void>>(async () => {});
  const saveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readLocalDraft(diagramId).then((stored) => {
      if (!cancelled && stored && stored.xml !== initialXml) {
        setDraft(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [diagramId, initialXml]);

  shortcutsRef.current = shortcuts;
  overlayOpenRef.current =
    settingsOpen || exportOpen || themeOpen || resizeSettingsOpen || menu !== null;

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
    if (saveInFlightRef.current) {
      // Правка во время PUT не должна запускать второй запрос с тем же ETag.
      pendingSaveRef.current = true;
      return;
    }
    if (serverTimerRef.current !== null) {
      window.clearTimeout(serverTimerRef.current);
      serverTimerRef.current = null;
    }
    saveInFlightRef.current = true;
    setSave({ kind: 'saving' });
    const controller = new AbortController();
    saveAbortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const result = (await modeler.saveXML({ format: true })) as { xml?: string };
      if (!result.xml) {
        throw new Error('bpmn-js вернул пустой XML');
      }
      const saved = await saveDiagramXml(diagramId, result.xml, etagRef.current, controller.signal);
      etagRef.current = saved.etag;
      lastServerSaveRef.current = Date.now();
      await clearLocalDraft(diagramId);
      setDraft(null);
      setDraftWarning(null);
      setSave({ kind: 'saved' });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === 'AbortError'
          ? 'сохранение не уложилось в 20 секунд: проверьте сеть'
          : error instanceof ApiError && error.status === 409
            ? 'диаграмму изменил кто-то другой: обновите страницу'
            : error instanceof ApiError && error.status === 428
              ? 'сервер требует подтвердить версию диаграммы: обновите страницу'
              : error instanceof Error
                ? error.message
                : 'не удалось сохранить';
      setSave({ kind: 'error', message });
      notify('error', `Сохранение не удалось: ${message}`);
    } finally {
      window.clearTimeout(timeout);
      if (saveAbortRef.current === controller) {
        saveAbortRef.current = null;
      }
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        window.setTimeout(() => void persistRef.current(), 0);
      }
    }
  }, [diagramId, notify]);
  persistRef.current = persist;

  const runExport = async (
    kind: ExportKind,
    options: { page: 'A4' | 'A3'; orientation: 'portrait' | 'landscape' },
  ) => {
    const modeler = modelerRef.current;
    if (!modeler || exportBusy) {
      return;
    }
    setExportBusy(true);
    setExportProgress(0);
    setExportJob(null);
    setExportError(null);
    const stem = `bpmn-${diagramId.slice(0, 8)}`;
    const done = (label: string) => notify('success', `Экспорт ${label} готов`);
    try {
      const xmlResult = (await modeler.saveXML({ format: true })) as { xml?: string };
      if (!xmlResult.xml) {
        throw new Error('bpmn-js вернул пустой XML');
      }
      const xml = xmlResult.xml;

      if (kind === 'bpmn') {
        downloadText(xml, `${stem}.bpmn`, 'application/xml');
        done('BPMN XML');
        return;
      }
      if (kind === 'svg') {
        downloadText(await modelerSvg(modeler), `${stem}.svg`, 'image/svg+xml');
        done('SVG');
        return;
      }
      if (kind === 'png1x' || kind === 'png2x' || kind === 'png4x') {
        const scale = kind === 'png1x' ? 1 : kind === 'png2x' ? 2 : 4;
        downloadBlob(await svgToPng(await modelerSvg(modeler), scale), `${stem}.png`);
        done(`PNG ${scale}×`);
        return;
      }

      const format: ServerExportFormat = kind;
      let created: ExportJobSummary;
      if (kind === 'pdf') {
        const svg = await modelerSvg(modeler);
        const png = await svgToPng(svg, 2);
        created = await createExportJob(diagramId, 'pdf', xml, {
          svg,
          pngBase64: await blobToBase64(png),
          page: options.page,
          orientation: options.orientation,
        });
      } else {
        created = await createExportJob(diagramId, format, xml);
      }

      let current = created;
      setExportJob(current);
      setExportProgress(current.progress);
      while (current.status === 'queued' || current.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        current = await fetchExportJob(diagramId, current.id);
        setExportJob(current);
        setExportProgress(current.progress);
      }
      if (current.status === 'failed') {
        throw new Error(current.error || 'задание экспорта завершилось ошибкой');
      }

      const blob = await downloadExportJob(diagramId, current.id);
      downloadBlob(blob, `${stem}.${format}`);
      done(format.toUpperCase());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'не удалось экспортировать';
      setExportError(message);
      notify('error', `Экспорт не удался: ${message}`);
    } finally {
      setExportBusy(false);
      setExportProgress(0);
    }
  };

  const downloadHistoryJob = async (item: ExportJobSummary) => {
    try {
      const blob = await downloadExportJob(diagramId, item.id);
      downloadBlob(blob, `bpmn-${diagramId.slice(0, 8)}.${item.format}`);
      notify('success', `Экспорт ${item.format.toUpperCase()} скачан`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'не удалось скачать файл';
      notify('error', `Скачивание не удалось: ${message}`);
    }
  };

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
          void writeLocalDraft(diagramId, {
            xml: result.xml,
            savedAt: Date.now(),
            etag: etagRef.current,
          }).then((outcome) => {
            if (outcome === 'failed') {
              const message = 'не удалось сохранить локальный черновик — проверьте квоту браузера';
              setDraftWarning(message);
              notify('error', message);
            } else {
              setDraftWarning(null);
            }
          });
        }
      });
    }, LOCAL_DRAFT_DEBOUNCE_MS);
  }, [diagramId, notify]);

  // Тема и позиция легенды хранятся в документе (1.3.5) как `bs:*` на
  // `bpmn:definitions`. Пишем в `$attrs`: так bpmn-js сериализует чужие
  // атрибуты, не меняя корневой тег (моддл-расширение на Definitions ломает
  // сериализацию: тэг становится `bpmn:Definitions` и XSD отклоняет файл).
  const writeDiagramSettings = (settings: {
    theme?: ThemeId;
    legend?: LegendPosition;
    canvas?: CanvasTheme;
    stages?: DiagramStage[];
    resizeTasks?: boolean;
    resizeOthers?: boolean;
    compactBoundaryEvents?: boolean;
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

  const updateCanvasTheme = (next: CanvasTheme) => {
    setCanvasTheme(next);
    writeDiagramSettings({ canvas: next });
  };

  const updateResizeSettings = (patch: {
    tasks?: boolean;
    others?: boolean;
    compactBoundaryEvents?: boolean;
  }) => {
    const next = { ...resizeSettings, ...patch };
    setResizeSettings(next);
    resizePermissions.tasks = next.tasks;
    resizePermissions.others = next.others;
    boundaryEventSettings.compact = next.compactBoundaryEvents;
    writeDiagramSettings({
      resizeTasks: next.tasks,
      resizeOthers: next.others,
      compactBoundaryEvents: next.compactBoundaryEvents,
    });
    const modeler = modelerRef.current;
    if (modeler) {
      refreshResizeHandles(modeler);
    }
  };

  const runSimulation = useCallback(
    async (
      choices: Record<string, string> = {},
      variables: Record<string, SimulationVariable> = {},
      options: { keepPosition?: boolean } = {},
    ) => {
      const keepPosition = options.keepPosition === true;
      simulationAbortRef.current?.abort();
      const controller = new AbortController();
      simulationAbortRef.current = controller;
      setSimulationBusy(true);
      setSimulationError(null);
      setSimulationChoices(choices);
      if (!keepPosition) {
        setSimulationPlaying(false);
      }
      try {
        const report = await simulateDiagram(diagramId, variables, choices, controller.signal);
        setSimulation(report);
        if (keepPosition) {
          // Ручной выбор ветки дописывает прогон с того же шага: токен не прыгает в начало.
          setSimulationIndex((current) => Math.min(current, Math.max(0, report.steps.length - 1)));
        } else {
          setSimulationIndex(0);
          setSimulationRunId((value) => value + 1);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setSimulation(null);
        const detail = error instanceof ApiError ? error.detail : undefined;
        const nested =
          detail && typeof detail === 'object' && 'detail' in detail
            ? (detail as { detail?: { message?: string } }).detail
            : undefined;
        setSimulationError(
          nested?.message ?? (error instanceof Error ? error.message : 'симуляция не удалась'),
        );
      } finally {
        if (!controller.signal.aborted) {
          setSimulationBusy(false);
        }
      }
    },
    [diagramId],
  );

  // Переменные процесса задаются по строке «имя = значение» перед прогоном.
  const simulationVariables = useMemo(
    () => parseSimulationVariables(simulationVariablesText),
    [simulationVariablesText],
  );

  // Ветка, которую не определить по условию, выбирается вручную в панели.
  const chooseSimulationBranch = (flowId: string) => {
    const decision = simulation?.decision;
    if (!decision) {
      return;
    }
    void runSimulation(
      { ...simulationChoices, [decision.node_id]: flowId },
      simulationVariables.variables,
      { keepPosition: true },
    );
  };

  // Автопроигрывание журнала: один шаг раз в 900 мс, скорость — множитель.
  // На шаге таймера ждём его длительность, но не дольше 3 с: час ожидания
  // в симуляции не должен останавливать просмотр.
  useEffect(() => {
    if (!simulationPlaying || !simulation || simulation.steps.length === 0) {
      return;
    }
    if (simulationIndex >= simulation.steps.length - 1) {
      setSimulationPlaying(false);
      return;
    }
    const waitMs = Math.min(simulation.steps[simulationIndex]?.wait_ms ?? 0, 3000);
    const timer = window.setTimeout(
      () => setSimulationIndex((current) => Math.min(current + 1, simulation.steps.length - 1)),
      Math.max(900, waitMs) / simulationSpeed,
    );
    return () => window.clearTimeout(timer);
  }, [simulationPlaying, simulation, simulationIndex, simulationSpeed]);

  // Тепловая карта: бейдж с числом прохождений поверх узла, цвет — по нагрузке.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || !ready) {
      return;
    }
    const overlays = modeler.get<OverlaysLike>('overlays');
    if (simulationOpen && simulation && simulationHeatmap) {
      const counts = Object.entries(simulation.counts);
      const busiest = Math.max(1, ...counts.map(([, count]) => count));
      for (const [nodeId, count] of counts) {
        const level = count / busiest >= 0.66 ? 3 : count / busiest >= 0.33 ? 2 : 1;
        overlays.add(nodeId, 'sim-heat', {
          position: { top: -10, right: -10 },
          html: `<span class="sim-heat sim-heat--${level}" title="Прохождений: ${count}">${count}</span>`,
        });
      }
    }
    return () => {
      overlays.remove({ type: 'sim-heat' });
    };
  }, [simulationOpen, simulation, simulationHeatmap, ready]);

  // Координаты элементов и ломаные потоков — для оверлея токена. Точки сразу
  // в пикселях относительно холста: viewBox переводится матрицей вьюпорта,
  // поэтому токен не отстаёт после зума, панорамы, перетаскивания и этапов.
  const simulationPoints = useMemo(() => {
    const nodes: Record<string, TokenPoint> = {};
    const flows: Record<string, TokenPoint[]> = {};
    const modeler = modelerRef.current;
    const canvasEl = canvasRef.current;
    if (!modeler || !ready || !simulation || !canvasEl) {
      return { nodes, flows };
    }
    const viewport = canvasEl.querySelector<SVGGElement>('.viewport');
    const matrix = viewport?.getScreenCTM();
    if (!viewport || !matrix) {
      return { nodes, flows };
    }
    const origin = canvasEl.getBoundingClientRect();
    const toCanvas = (x: number, y: number): TokenPoint => {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      return { x: point.x - origin.left, y: point.y - origin.top };
    };
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const elements = registry.getAll();
    // Свёрнутый этап или пул прячет фигуру: токену там не место.
    const hidden = hiddenStageElementIds(stages, elements);
    for (const element of elements) {
      const gfx = registry.getGraphics(element);
      if (hidden.has(element.id)) {
        continue;
      }
      if (gfx && (gfx as unknown as HTMLElement).style.display === 'none') {
        continue;
      }
      const waypoints = Array.isArray(element.waypoints) ? element.waypoints : null;
      if (waypoints) {
        const points = waypoints
          .map((point) => point as { x?: number; y?: number })
          .filter(
            (point): point is { x: number; y: number } =>
              typeof point.x === 'number' && typeof point.y === 'number',
          );
        if (points.length > 1) {
          flows[element.id] = points.map((point) => toCanvas(point.x, point.y));
        }
        continue;
      }
      const center = centerOf(element);
      if (center) {
        nodes[element.id] = toCanvas(center.x, center.y);
      }
    }
    return { nodes, flows };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- геометрия снимается с DOM, эти три — ключи пересчёта
  }, [simulation, ready, viewbox, revision, stages]);

  // Подсветка: пройденный путь — visited, текущий шаг — active.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || !ready) {
      return;
    }
    const canvas = modeler.get<CanvasLike>('canvas');
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const marked: DiagramElement[] = [];
    if (simulationOpen && simulation) {
      simulation.steps.slice(0, simulationIndex + 1).forEach((step, index) => {
        const element = registry.get(step.node_id);
        if (!element) {
          return;
        }
        canvas.addMarker?.(
          element,
          index === simulationIndex ? 'bpmn-sim-active' : 'bpmn-sim-visited',
        );
        marked.push(element);
      });
    }
    return () => {
      for (const element of marked) {
        canvas.removeMarker?.(element, 'bpmn-sim-active');
        canvas.removeMarker?.(element, 'bpmn-sim-visited');
      }
    };
  }, [simulationOpen, simulation, simulationIndex, ready]);

  const updateStages = (next: DiagramStage[]) => {
    setStages(next);
    writeDiagramSettings({ stages: next });
  };

  const toggleStage = (stage: DiagramStage) => {
    updateStages(
      stages.map((item) => (item.id === stage.id ? { ...item, collapsed: !item.collapsed } : item)),
    );
  };

  const renameStage = (stage: DiagramStage, name: string) => {
    updateStages(stages.map((item) => (item.id === stage.id ? { ...item, name } : item)));
  };

  // Новый этап добавляется справа: пул расширяется на ширину этапа, поэтому
  // уже нарисованные элементы и предыдущие фазы остаются на месте.
  const addStageToPool = (poolId: string) => {
    const pool = stagePools.find((item) => item.id === poolId);
    if (!pool) {
      return;
    }
    const next = createStage(stages, pool);
    const modeler = modelerRef.current;
    const element = modeler?.get<ElementRegistryLike>('elementRegistry').get(pool.id);
    if (modeler && element && element.type === 'bpmn:Participant') {
      const modeling = modeler.get<ModelingLike>('modeling');
      const targetWidth = Math.max(pool.width, next.x + STAGE_DEFAULT_WIDTH);
      const delta = targetWidth - pool.width;
      if (delta > 0) {
        modeling.resizeShape(element, {
          x: pool.x,
          y: pool.y,
          width: targetWidth,
          height: pool.height,
        });
        for (const lane of element.children ?? []) {
          if (lane.type !== 'bpmn:Lane') {
            continue;
          }
          modeling.resizeShape(lane, {
            x: lane.x ?? pool.x,
            y: lane.y ?? pool.y,
            width: (lane.width ?? pool.width) + delta,
            height: lane.height ?? pool.height,
          });
        }
      }
    }
    updateStages([...stages, next]);
  };

  const togglePoolStages = (poolId: string, enabled: boolean) => {
    const current = stageForPool(stages, poolId);
    if (!enabled) {
      updateStages(stages.filter((stage) => stage.poolId !== poolId));
      return;
    }
    if (current.length > 0) {
      return;
    }
    const pool = stagePools.find((item) => item.id === poolId);
    if (pool) {
      updateStages([...stages, createStage(stages, pool)]);
    }
  };

  const clearStagePreview = (drag: StageDragState) => {
    for (const item of drag.previewElements) {
      item.gfx.style.transform = item.transform;
    }
    for (const item of drag.poolRects) {
      item.rect.setAttribute('width', String(item.width));
    }
  };

  // На время перетаскивания фигуры и рамка пула двигаются только визуально:
  // в стек команд и в XML всё попадает одним действием при отпускании.
  const beginStageDrag = (stage: DiagramStage): StageDragState | null => {
    const modeler = modelerRef.current;
    const pool = stagePools.find((item) => item.id === stage.poolId);
    if (!modeler || !pool) {
      return null;
    }
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const samePool = stageForPool(stages, pool.id);
    const index = samePool.findIndex((item) => item.id === stage.id);
    if (index === -1) {
      return null;
    }
    const all = registry.getAll();
    const laterBounds = samePool.slice(index + 1).flatMap((item) => {
      const bounds = stageBounds(item, stagePools, stages);
      return bounds ? [bounds] : [];
    });
    const isStageShape = (element: DiagramElement) =>
      element.type !== 'label' &&
      element.type !== 'bpmn:Participant' &&
      element.type !== 'bpmn:Lane' &&
      typeof element.x === 'number' &&
      typeof element.y === 'number' &&
      typeof element.width === 'number' &&
      typeof element.height === 'number' &&
      !element.source &&
      !element.target;
    const movingElements = all.filter((element) => {
      if (!isStageShape(element)) {
        return false;
      }
      const centerX = element.x! + element.width! / 2;
      const centerY = element.y! + element.height! / 2;
      return laterBounds.some(
        (bounds) =>
          centerX >= bounds.x &&
          centerX < bounds.x + bounds.width &&
          centerY >= bounds.y &&
          centerY < bounds.y + bounds.height,
      );
    });
    const movedIds = new Set(movingElements.map((element) => element.id));
    const preview = all.filter(
      (element) =>
        movedIds.has(element.id) ||
        (element.labelTarget ? movedIds.has(element.labelTarget.id) : false) ||
        (element.source && element.target
          ? movedIds.has(element.source.id) && movedIds.has(element.target.id)
          : false),
    );
    const previewElements = preview.flatMap((element) => {
      const gfx = registry.getGraphics(element);
      return gfx ? [{ gfx, transform: gfx.style.transform }] : [];
    });
    const poolElement = registry.get(pool.id);
    const poolElements = [
      poolElement,
      ...(poolElement?.children ?? []).filter((element) => element.type === 'bpmn:Lane'),
    ].filter((element): element is DiagramElement => Boolean(element));
    const poolRects = poolElements.flatMap((element) => {
      const gfx = registry.getGraphics(element);
      const rect = gfx?.querySelector('rect');
      const width = rect ? Number(rect.getAttribute('width')) : Number.NaN;
      return rect && Number.isFinite(width) ? [{ rect, width }] : [];
    });
    const bounds = stageBounds(stage, stagePools, stages);
    const contentRight = stageContentRight(stage, all, stagePools, stages);
    const contentWidth = contentRight && bounds ? contentRight - bounds.x + 16 : 0;
    const minWidth = Math.max(STAGE_MIN_WIDTH, contentWidth);
    return {
      stageId: stage.id,
      pool,
      minWidth,
      movingElements,
      previewElements,
      poolRects,
      preview: resizeStageBoundary(stages, pool, stage.id, 0, minWidth),
    };
  };

  const previewStageResize = (stage: DiagramStage, rawDelta: number): number => {
    let drag = stageDragRef.current;
    if (!drag || drag.stageId !== stage.id) {
      drag = beginStageDrag(stage);
      if (!drag) {
        return 0;
      }
      stageDragRef.current = drag;
    }
    const result = resizeStageBoundary(
      stages,
      drag.pool,
      stage.id,
      Math.round(rawDelta),
      drag.minWidth,
    );
    drag.preview = result;
    for (const item of drag.previewElements) {
      item.gfx.style.transform = `translate(${result.delta}px, 0)`;
    }
    for (const item of drag.poolRects) {
      item.rect.setAttribute('width', String(item.width + result.delta));
    }
    return result.delta;
  };

  const commitStageResize = (stage: DiagramStage) => {
    const drag = stageDragRef.current;
    if (!drag || drag.stageId !== stage.id) {
      return;
    }
    stageDragRef.current = null;
    clearStagePreview(drag);
    const result = drag.preview;
    if (!result.delta) {
      return;
    }
    const modeler = modelerRef.current;
    if (!modeler) {
      return;
    }
    const modeling = modeler.get<ModelingLike>('modeling');
    if (drag.movingElements.length > 0) {
      modeling.moveElements(drag.movingElements, { x: result.delta, y: 0 });
    }
    const element = modeler.get<ElementRegistryLike>('elementRegistry').get(drag.pool.id);
    if (element && element.type === 'bpmn:Participant') {
      modeling.resizeShape(element, {
        x: drag.pool.x,
        y: drag.pool.y,
        width: result.poolWidth,
        height: drag.pool.height,
      });
      for (const lane of element.children ?? []) {
        if (lane.type !== 'bpmn:Lane') {
          continue;
        }
        modeling.resizeShape(lane, {
          x: lane.x ?? drag.pool.x,
          y: lane.y ?? drag.pool.y,
          width: (lane.width ?? drag.pool.width) + result.delta,
          height: lane.height ?? drag.pool.height,
        });
      }
    }
    updateStages(result.stages);
  };

  const cancelStageResize = () => {
    const drag = stageDragRef.current;
    if (!drag) {
      return;
    }
    stageDragRef.current = null;
    clearStagePreview(drag);
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

  useEffect(
    () => () => {
      saveAbortRef.current?.abort();
    },
    [],
  );

  const commentSignal = () => {
    const controller = new AbortController();
    window.setTimeout(() => controller.abort(), 15_000);
    return controller.signal;
  };

  const addComment = async (body: string) => {
    const element = selectedRef.current;
    if (!element) {
      return;
    }
    setCommentsBusy(true);
    try {
      const created = await createComment(diagramId, element.id, body, commentSignal());
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
      const updated = await updateComment(
        diagramId,
        comment.id,
        {
          resolved: !comment.resolved_at,
        },
        commentSignal(),
      );
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
      await deleteComment(diagramId, comment.id, commentSignal());
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
      // contenteditable обязателен: без него mousedown внутри прямого
      // редактирования отменяет нативное выделение слова двойным щелчком.
      if (
        target.closest(
          'button, a, input, select, textarea, [contenteditable="true"], .djs-direct-editing-parent, [role="button"], .djs-context-pad, .djs-popup, .djs-palette, .djs-overlay, .djs-minimap, .layer-resizers, .djs-resizer, .djs-bendpoint, .djs-segment-dragger',
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
    const elementRegistry = modeler.get<ElementRegistryLike>('elementRegistry');

    eventBus.on('selection.changed', (event) => {
      const element = event.newSelection?.[0] ?? null;
      selectedRef.current = element;
      setSelected(element);
      setRevision((value) => value + 1);
      // Ручки ресайза пересоздаются на это же событие: разворачиваем их
      // под повёрнутый фрейм уже после bpmn-js.
      syncRotatedResizers(element, modeler.get<CanvasLike>('canvas').getLayer('resizers'));
    });

    eventBus.on('shape.changed', (event) => {
      syncRotatedResizers(
        event.element ?? selectedRef.current,
        modeler.get<CanvasLike>('canvas').getLayer('resizers'),
      );
    });

    // Контур создаётся лениво на выделении. Разворачиваем его уже после
    // bpmn-js, иначе после перезагрузки он остаётся горизонтальным.
    eventBus.on('selection.changed', 500, (event) => {
      for (const element of event.newSelection ?? []) {
        syncRotatedOutline(
          element,
          elementRegistry.getGraphics(element) as SVGGElement | undefined,
        );
      }
    });
    eventBus.on('shape.changed', 400, (event) => {
      const element = event.element;
      if (element) {
        syncRotatedOutline(
          element,
          event.gfx ?? (elementRegistry.getGraphics(element) as SVGGElement | undefined),
        );
      }
    });

    // Снаппинг bpmn-js считает дельту в осях холста и на повёрнутой рамке
    // портит её; для таких элементов отключаем привязку на время ресайза.
    eventBus.on('resize.move', 1600, (event) => {
      if (!rotatedFrameAngle(event.context?.shape ?? selectedRef.current)) {
        return;
      }
      (event as { snapped?: { x: boolean; y: boolean } }).snapped = { x: true, y: true };
    });

    // Ручки стоят на повёрнутой рамке, поэтому движение мыши переводим
    // в оси самой рамки: иначе перетаскивание угла меняет не ту сторону.
    eventBus.on('resize.move', 1500, (event) => {
      const angle = rotatedFrameAngle(event.context?.shape ?? selectedRef.current);
      if (!angle || typeof event.dx !== 'number' || typeof event.dy !== 'number') {
        return;
      }
      const radians = (angle * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const dx = event.dx * cos + event.dy * sin;
      const dy = -event.dx * sin + event.dy * cos;
      event.dx = dx;
      event.dy = dy;
    });

    // Повёрнутый фрейм bpmn-js крутит вокруг центра. Когда меняется одна
    // сторона, центр смещается и весь фрейм «уезжает» вбок. Сдвигаем рамку
    // так, чтобы неподвижная сторона осталась на месте в осях холста.
    eventBus.on('resize.move', 900, (event) => {
      const shape = event.context?.shape;
      const bounds = event.context?.newBounds;
      const angle = rotatedFrameAngle(shape);
      if (!angle || !bounds || !shape) {
        return;
      }
      // Запоминаем рамку до сдвига: на коммите высота аннотации уже
      // подогнана под текст, и компенсацию нужно считать заново.
      if (shape.id) {
        resizeRawBounds.set(shape.id, {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        });
      }
      compensateRotatedBounds(shape, bounds, angle);
    });

    // Аннотация после ресайза подгоняет высоту под текст (TextAnnotationBehavior),
    // поэтому финальную рамку выравниваем уже по итоговым размерам.
    eventBus.on('commandStack.shape.resize.preExecute', 500, (event) => {
      const shape = event.context?.shape;
      const bounds = event.context?.newBounds;
      const angle = rotatedFrameAngle(shape);
      if (!angle || !bounds || !shape) {
        return;
      }
      const raw = shape.id ? resizeRawBounds.get(shape.id) : undefined;
      if (raw) {
        // Ширину и позицию берём из последнего превью, высоту — итоговую
        // (TextAnnotationBehavior уже подогнал её под текст).
        bounds.x = raw.x;
        bounds.width = raw.width;
        resizeRawBounds.delete(shape.id!);
      }
      compensateRotatedBounds(shape, bounds, angle);
    });

    // Круги событий и ромбы шлюзов рисуются по средней величине сторон:
    // при свободном ресайзе рамка расходится с фигурой, поэтому держим
    // такие элементы квадратными.
    eventBus.on('resize.move', 750, (event) => {
      const context = event.context;
      const shape = context?.shape;
      const next = context?.newBounds;
      const direction = context?.direction;
      if (
        !context ||
        !shape ||
        !next ||
        !direction ||
        !keepsSquareFrame(shape) ||
        typeof shape.x !== 'number' ||
        typeof shape.y !== 'number' ||
        typeof shape.width !== 'number' ||
        typeof shape.height !== 'number'
      ) {
        return;
      }
      context.newBounds = squareResizeBounds(
        { x: shape.x, y: shape.y, width: shape.width, height: shape.height },
        next,
        direction,
      );
    });

    // Превью ресайза diagram-js рисует по непревращённой рамке: разворачиваем
    // его вместе с фреймом, иначе при перетаскивании кажется, что он растёт
    // в ширину, а не вдоль текста.
    eventBus.on('resize.move', 400, (event) => {
      const frame = event.context?.frame;
      const bounds = event.context?.newBounds;
      const angle = rotatedFrameAngle(event.context?.shape ?? selectedRef.current);
      if (!frame) {
        return;
      }
      if (!angle || !bounds) {
        frame.removeAttribute('transform');
        return;
      }
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      frame.setAttribute('transform', `rotate(${angle} ${cx} ${cy})`);
    });

    eventBus.on('commandStack.shape.create.postExecuted', (event) => {
      applyDefaultStyle(event.context?.shape, modeler);
    });
    eventBus.on('commandStack.connection.create.postExecuted', (event) => {
      applyDefaultStyle(event.context?.connection, modeler);
    });

    // bpmn-js переупорядочивает группы по модели уже после commandStack.changed.
    // Возвращаем пул в начало слоя ещё раз, когда порядок окончательно собран.
    eventBus.on('elements.changed', 500, () => {
      sendPoolsBehindElements(modeler);
      scheduleFrameBackgrounds(modeler);
    });

    // При перетаскивании/изменении размера рам bpmn-js обновляет их gfx
    // каждый кадр: фоновый слой должен успевать за геометрией.
    eventBus.on('element.changed', 500, (event) => {
      if (
        event.element?.type &&
        ['bpmn:Participant', 'bpmn:Lane', 'bpmn:Group'].includes(event.element.type)
      ) {
        scheduleFrameBackgrounds(modeler);
      }
    });

    eventBus.on('commandStack.changed', () => {
      const stack = modeler.get<CommandStackLike>('commandStack');
      setCanUndo(stack.canUndo());
      setCanRedo(stack.canRedo());
      // Undo/redo может вернуть прежнюю тему или позицию легенды: состояние
      // панелей синхронизируем с документом до перерисовки стилей.
      const stored = readDiagramSettings(findDefinitions(modeler));
      const storedTheme = stored.theme ?? 'mono';
      if (storedTheme !== themeRef.current) {
        themeRef.current = storedTheme;
        setThemeId(storedTheme);
      }
      if (stored.legend) {
        setLegendPosition(stored.legend);
      }
      setCanvasTheme(stored.canvas);
      setStages(stored.stages ?? []);
      const resizeChanged =
        stored.resizeTasks !== resizePermissions.tasks ||
        stored.resizeOthers !== resizePermissions.others;
      resizePermissions.tasks = stored.resizeTasks;
      resizePermissions.others = stored.resizeOthers;
      boundaryEventSettings.compact = stored.compactBoundaryEvents;
      setResizeSettings({
        tasks: stored.resizeTasks,
        others: stored.resizeOthers,
        compactBoundaryEvents: stored.compactBoundaryEvents,
      });
      if (resizeChanged) {
        refreshResizeHandles(modeler);
      }
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
        const storedTheme = stored.theme ?? 'mono';
        themeRef.current = storedTheme;
        setThemeId(storedTheme);
        setLegendPosition(stored.legend ?? DEFAULT_LEGEND_POSITION);
        setCanvasTheme(stored.canvas);
        setStages(stored.stages ?? []);
        resizePermissions.tasks = stored.resizeTasks;
        resizePermissions.others = stored.resizeOthers;
        boundaryEventSettings.compact = stored.compactBoundaryEvents;
        setResizeSettings({
          tasks: stored.resizeTasks,
          others: stored.resizeOthers,
          compactBoundaryEvents: stored.compactBoundaryEvents,
        });
        setViewbox(modeler.get<CanvasLike>('canvas').viewbox());
        const normalized = normalizeImportedLaneBounds(modeler);
        const normalizedAssociations = normalizeImportedAssociations(modeler);
        applyAllStyles(modeler);
        setReady(true);
        // Миграция диагональных связей — реальное изменение, его нужно сохранить.
        setSave({ kind: normalized || normalizedAssociations ? 'dirty' : 'saved' });
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
      if (frameBackgroundsRafRef.current !== null) {
        window.cancelAnimationFrame(frameBackgroundsRafRef.current);
        frameBackgroundsRafRef.current = null;
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

  // Этапы привязаны к пулам: пересчитываем их границы после перетаскивания,
  // изменения размера пула и добавления/удаления участников.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!ready || !modeler) {
      return;
    }
    setStagePools(collectStagePools(modeler.get<ElementRegistryLike>('elementRegistry').getAll()));
  }, [ready, revision]);

  // Свёрнутый этап прячет фигуры внутри своей фазы; модель и XML не меняются.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!ready || !modeler) {
      return;
    }
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const hidden = hiddenStageElementIds(stages, registry.getAll(), stagePools);
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
  }, [stages, stagePools, ready, revision]);

  // Проверка идёт по сохранённой версии: после успешного PUT отчёт обновляется.
  useEffect(() => {
    if (!ready) {
      return;
    }
    if (save.kind !== 'saved') {
      // Пока есть несохранённые правки, старые значки и находки могут врать.
      setValidation(null);
      setValidationBusy(false);
      setValidationError(null);
      return;
    }
    if (validationMode === 'manual' && validationNonce === lastValidationNonceRef.current) {
      // В ручном режиме сохранение не запускает проверку: ждём кнопку или клавишу.
      setValidationBusy(false);
      return;
    }
    lastValidationNonceRef.current = validationNonce;
    const controller = new AbortController();
    setValidationBusy(true);
    setValidationError(null);
    // Небольшой дебаунс гасит лишние запросы, если сохранение и открытие
    // панели происходят почти одновременно.
    const timer = window.setTimeout(() => {
      fetchValidation(diagramId, controller.signal)
        .then((report) => setValidation(report))
        .catch(() => {
          // Значки не должны мешать редактированию, если проверка недоступна.
          if (!controller.signal.aborted) {
            setValidationError('Не удалось получить результаты проверки.');
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setValidationBusy(false);
          }
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [diagramId, ready, save.kind, validationNonce, validationMode]);

  const downloadReport = async () => {
    if (reportDownloading) {
      return;
    }
    setReportDownloading(true);
    try {
      const blob = await downloadValidationReport(diagramId);
      downloadBlob(blob, `bpmn-${diagramId.slice(0, 8)}-validation.docx`);
      notify('success', 'Отчёт проверки готов');
    } catch {
      setValidationError('Не удалось скачать отчёт проверки.');
    } finally {
      setReportDownloading(false);
    }
  };

  // Маркеры предупреждений/ошибок: цвет значка — худшая severity элемента.
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!ready || !warningsOpen || !modeler || !validation) {
      return;
    }
    const overlays = modeler.get<OverlaysLike>('overlays');
    const registry = modeler.get<ElementRegistryLike>('elementRegistry');
    const selection = modeler.get<SelectionLike>('selection');
    overlays.remove({ type: VALIDATION_OVERLAY_TYPE });
    for (const [elementId, summary] of summarizeFindingsByElement(validation.findings)) {
      const element = registry.get(elementId);
      if (!element) {
        continue;
      }
      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = `validation-pin validation-pin--${summary.severity}`;
      badge.textContent = validationBadgeText(summary.severity);
      badge.title = validationBadgeTitle(summary);
      badge.setAttribute('aria-label', badge.title);
      badge.dataset['validationElement'] = elementId;
      const badgeFinding =
        validation.findings.find(
          (finding) => finding.element_id === elementId && finding.severity === summary.severity,
        ) ?? validation.findings.find((finding) => finding.element_id === elementId);
      badge.addEventListener('click', (event) => {
        event.stopPropagation();
        selection.select([element]);
        setInspectorOpen(true);
        setProblemsOpen(true);
        setHighlightedFinding(badgeFinding ?? null);
      });
      overlays.add(elementId, VALIDATION_OVERLAY_TYPE, {
        position: { top: -12, left: -12 },
        html: badge,
      });
    }
    return () => {
      if (modelerRef.current === modeler) {
        overlays.remove({ type: VALIDATION_OVERLAY_TYPE });
      }
    };
  }, [validation, warningsOpen, ready]);

  const openFinding = (finding: ValidationFinding) => {
    const modeler = modelerRef.current;
    if (!finding.element_id || !modeler) {
      return;
    }
    const element = modeler.get<ElementRegistryLike>('elementRegistry').get(finding.element_id);
    if (!element) {
      return;
    }
    modeler.get<SelectionLike>('selection').select([element]);
    modeler.get<CanvasLike>('canvas').scrollToElement(element, 80);
    setInspectorOpen(true);
    setProblemsOpen(true);
    setHighlightedFinding(finding);
  };

  const checkValidation = useCallback(() => {
    setProblemsOpen(true);
    if (save.kind !== 'saved') {
      notify('info', 'Проверяется сохранённая версия. Сначала сохраните схему.');
      return;
    }
    setValidationNonce((value) => value + 1);
  }, [notify, save.kind]);

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
        // Лёгкое наложение на элемент делает привязку значка очевиднее.
        position: { top: -6, right: 6 },
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
    const point = pointAtPointer();
    const copyPaste = modeler.get<CopyPasteLike>('copyPaste');
    const clipboard = modeler.get<ClipboardLike>('clipboard', false);
    const copiesPool = Object.values(clipboard?.get?.() ?? {}).some((branch) =>
      branch.some((entry) => {
        const type = entry.type ?? entry.businessObject?.$type;
        return type === 'bpmn:Participant' || type === 'bpmn:Collaboration';
      }),
    );
    copyPaste.paste({
      element: copiesPool ? canvas.getRootElement() : pasteTargetAt(modeler, canvas, point),
      point,
    });
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
    const offset = point ? { x: point.x + 20, y: point.y + 20 } : undefined;
    const copiesPool = elements.some(
      (element) => element.type === 'bpmn:Participant' || element.type === 'bpmn:Collaboration',
    );
    modeler.get<CopyPasteLike>('copyPaste').duplicate(elements, {
      element: copiesPool ? canvas.getRootElement() : pasteTargetAt(modeler, canvas, offset),
      ...(offset ? { point: offset } : {}),
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
        case 'validate':
          checkValidation();
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
          setSettingsOpen(true);
          return;
        case 'editLabel': {
          const element = modeler.get<SelectionLike>('selection').get()[0];
          if (element) {
            modeler.get<DirectEditingLike>('directEditing').activate(element);
          }
          return;
        }
        case 'changeType': {
          const element = modeler.get<SelectionLike>('selection').get()[0];
          const provider = modeler.get<ReplaceMenuProviderLike>('replaceMenuProvider', false);
          if (!element || !provider) {
            return;
          }
          try {
            const entries = Object.values(provider.getPopupMenuEntries(element));
            if (entries.length > 0) {
              const point = pointerRef.current ?? { x: 240, y: 160 };
              setMenu(null);
              setReplaceInline(false);
              setReplaceMenu({ x: point.x, y: point.y, entries });
            }
          } catch {
            // Для типов без замены меню не открываем.
          }
          return;
        }
        case 'toggleDefaultFlow': {
          const element = modeler.get<SelectionLike>('selection').get()[0];
          const source = element?.source;
          if (!element || !source || !source.type.endsWith('Gateway')) {
            return;
          }
          const current = source.businessObject.default as { id?: string } | undefined;
          const isDefault =
            current === element.businessObject || current?.id === element.businessObject.id;
          modeler.get<ModelingLike>('modeling').updateProperties(source, {
            default: isDefault ? undefined : element.businessObject,
          });
          return;
        }
      }
    },
    [checkValidation, duplicateSelection, getCanvas, pasteAtPointer, persist],
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
        if (editable && action !== 'save') {
          continue;
        }
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
    const fill = manualFill(element.di);
    const stroke = manualStroke(element.di);
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
        {
          id: 'comment',
          label: 'Добавить комментарий',
          icon: '💬',
          disabled: target.type === 'label',
          onSelect: () => {
            selection.select([target]);
            setCommentsOpen(true);
            window.setTimeout(() => {
              document.querySelector<HTMLTextAreaElement>('.comments-panel__input')?.focus();
            }, 0);
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

      if (!target.waypoints && isTaskShape(target.type)) {
        items.push({
          id: 'add-boundary-event',
          label: 'Добавить граничное событие',
          icon: '◌',
          onSelect: () => {
            try {
              const replace = modeler.get<BpmnReplaceLike>('bpmnReplace', false);
              if (!replace) {
                throw new Error('bpmnReplace недоступен');
              }
              const event = modeling.createShape(
                { type: 'bpmn:IntermediateThrowEvent' },
                boundaryEventPosition(target),
                target.parent ?? target,
              );
              const boundary = replace.replaceElement(
                event,
                { type: 'bpmn:BoundaryEvent', host: target },
                { layoutConnection: false },
              );
              modeling.updateAttachment(boundary, target);
              if (boundaryEventSettings.compact) {
                // Ресайз событий может быть выключен настройкой, поэтому
                // разрешаем его только на время программного уменьшения.
                const previousOthers = resizePermissions.others;
                resizePermissions.others = true;
                try {
                  const size = 18;
                  modeling.resizeShape(boundary, {
                    x: (target.x ?? 0) + (target.width ?? 100) - size / 2,
                    y: (target.y ?? 0) + (target.height ?? 80) / 2 - size / 2,
                    width: size,
                    height: size,
                  });
                } finally {
                  resizePermissions.others = previousOthers;
                }
              }
              selection.select([boundary]);
            } catch {
              notify('error', 'Не удалось создать граничное событие');
            }
          },
        });
      }

      // Настройка выключена: палитра не показывается сразу, но остаётся
      // доступной пунктом «Сменить тип».
      if (replaceEntries.length > 0 && !typePaletteEnabled) {
        items.push({
          id: 'replace',
          label: 'Сменить тип',
          icon: '⟳',
          keepOpen: true,
          onSelect: () => {
            setMenu(null);
            setReplaceInline(false);
            setReplaceMenu({
              x: event.clientX,
              y: event.clientY,
              entries: replaceEntries,
            });
          },
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
        if (flowSource.type.endsWith('Gateway')) {
          const current = flowSource.businessObject.default as { id?: string } | undefined;
          const isDefault =
            current === target.businessObject || current?.id === target.businessObject.id;
          items.push({
            id: 'default-flow',
            label: isDefault ? 'Снять поток по умолчанию' : 'Сделать потоком по умолчанию',
            icon: isDefault ? '★' : '☆',
            hint: hint('toggleDefaultFlow'),
            onSelect: () => applyPatch({ isDefaultFlow: !isDefault }),
          });
        }
      }

      if (!target.waypoints) {
        items.push(
          {
            id: 'reset-formatting',
            label: 'Сбросить форматирование',
            onSelect: () =>
              applyPatch({
                fontFamily: '',
                fontSize: '',
                fontColor: '',
                isBold: false,
                isItalic: false,
                textAlign: '',
                textDirection: '',
                opacity: '',
                strokeWidth: '',
                strokeStyle: '',
                fillColor: '',
                strokeColor: '',
              }),
          },
          {
            id: 'reset-size',
            label: 'Сбросить размер',
            disabled: !defaultShapeSize(target),
            onSelect: () => {
              const size = defaultShapeSize(target);
              if (!size || typeof target.x !== 'number' || typeof target.y !== 'number') {
                return;
              }
              const centerX = target.x + (target.width ?? size.width) / 2;
              const centerY = target.y + (target.height ?? size.height) / 2;
              modeling.resizeShape(target, {
                x: centerX - size.width / 2,
                y: centerY - size.height / 2,
                width: size.width,
                height: size.height,
              });
            },
          },
        );
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
        items.push({
          id: 'add-stage',
          label: stageForPool(stages, target.id).length > 0 ? 'Добавить этап' : 'Включить этапы',
          onSelect: () => {
            if (stageForPool(stages, target.id).length > 0) {
              addStageToPool(target.id);
            } else {
              togglePoolStages(target.id, true);
            }
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

      // Палитра смены типа открывается сразу вместе с ПКМ-меню (1.5.8).
      if (replaceEntries.length > 0 && typePaletteEnabled) {
        setReplaceInline(true);
        setReplaceMenu({ x: event.clientX, y: event.clientY, entries: replaceEntries });
      } else {
        setReplaceInline(false);
        setReplaceMenu(null);
      }
    } else {
      setReplaceInline(false);
      setReplaceMenu(null);
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
          label: 'Настройки…',
          hint: hint('settings'),
          onSelect: () => setSettingsOpen(true),
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
    void clearLocalDraft(diagramId);
    setDraft(null);
  };

  const selectedInspector = selected ? toInspector(selected) : null;
  const selectedPoolStages =
    selected?.type === 'bpmn:Participant' ? stageForPool(stages, selected.id) : [];
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
      themeById(themeId),
    );
  })();

  return (
    <div className="workspace">
      <div className="workspace__main">
        <div
          className="editor-toolbar editor-toolbar--actions"
          role="toolbar"
          aria-label="Действия редактора"
        >
          <div className="editor-toolbar__section" role="group" aria-label="Правка">
            <span className="editor-toolbar__label">Правка</span>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title={`Отменить (${formatCombo(shortcuts.undo)})`}
              aria-label="Отменить"
              disabled={!canUndo}
              onClick={() => executeAction('undo')}
            >
              <span aria-hidden="true">↶</span>
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title={`Повторить (${formatCombo(shortcuts.redo)})`}
              aria-label="Повторить"
              disabled={!canRedo}
              onClick={() => executeAction('redo')}
            >
              <span aria-hidden="true">↷</span>
            </button>
          </div>

          <div className="editor-toolbar__section" role="group" aria-label="Вид">
            <span className="editor-toolbar__label">Вид</span>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title={`Вписать (${formatCombo(shortcuts.fit)})`}
              aria-label="Вписать"
              onClick={() => executeAction('fit')}
            >
              <span aria-hidden="true">⤢</span>
            </button>
            <button
              type="button"
              className={
                minimapOpen
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              title={`Мини-карта (${formatCombo(shortcuts.toggleMinimap)})`}
              aria-label="Мини-карта"
              aria-pressed={minimapOpen}
              onClick={() => executeAction('toggleMinimap')}
            >
              <span aria-hidden="true">▦</span>
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title="Тема"
              aria-label="Тема"
              onClick={() => setThemeOpen(true)}
            >
              <span aria-hidden="true">🎨</span>
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title="Настройки размеров"
              aria-label="Настройки размеров"
              onClick={() => setResizeSettingsOpen(true)}
            >
              <span aria-hidden="true">⚙</span>
            </button>
            <button
              type="button"
              className={
                legendOpen
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              title="Легенда"
              aria-label="Легенда"
              aria-pressed={legendOpen}
              onClick={() => setLegendOpen((value) => !value)}
            >
              <span aria-hidden="true">▤</span>
            </button>
          </div>

          <div className="editor-toolbar__section" role="group" aria-label="Проверка">
            <span className="editor-toolbar__label">Проверка</span>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title={`Проверить схему (${formatCombo(shortcuts.validate)})`}
              aria-label="Проверить схему"
              onClick={() => executeAction('validate')}
            >
              <span aria-hidden="true">✓</span>
              <span className="ghost-button__label">Проверить</span>
            </button>
            <span
              className={`validation-status validation-status--${validationState}`}
              role="status"
              aria-live="polite"
              aria-atomic="true"
              title={validationSummaryTitle}
            >
              {validationStatusLabel}
            </span>
            <button
              type="button"
              className={
                simulationOpen
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              title="Симуляция процесса: прогон токена по схеме"
              aria-label="Симуляция процесса"
              aria-pressed={simulationOpen}
              onClick={() => {
                setSimulationOpen((value) => !value);
                if (!simulation) {
                  void runSimulation();
                }
              }}
            >
              <span aria-hidden="true">▶</span>
              <span className="ghost-button__label">Симуляция</span>
            </button>
          </div>

          <div className="editor-toolbar__section" role="group" aria-label="Панели">
            <span className="editor-toolbar__label">Панели</span>
            <button
              type="button"
              className={
                warningsOpen
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              title="Предупреждения и ошибки на холсте (по сохранённой версии)"
              aria-label={
                validationCount > 0
                  ? `Предупреждения и ошибки: ${validationCount}`
                  : 'Предупреждения и ошибки'
              }
              aria-pressed={warningsOpen}
              onClick={() => setWarningsOpen((value) => !value)}
            >
              <span aria-hidden="true">⚠</span>
              {validationCount > 0 ? (
                <span
                  className="editor-toolbar__count editor-toolbar__count--warning"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {validationCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className={
                problemsOpen
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              title="Проблемы схемы"
              aria-label={validationCount > 0 ? `Проблемы: ${validationCount}` : 'Проблемы'}
              aria-pressed={problemsOpen}
              onClick={() => setProblemsOpen((value) => !value)}
            >
              <span aria-hidden="true">⚑</span>
              {validationCount > 0 ? (
                <span
                  className="editor-toolbar__count editor-toolbar__count--warning"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {validationCount}
                </span>
              ) : null}
            </button>
            <label
              className="editor-toolbar__auto"
              title="Вернуть панели на холст и расположить их автоматически"
            >
              <input
                type="checkbox"
                checked={autoLayout}
                aria-label="Автоположение окон"
                onChange={(event) => {
                  const next = event.currentTarget.checked;
                  if (next) {
                    clearAllPanelLayouts(diagramId);
                  }
                  setAutoLayout(next);
                }}
              />
              <span>Автоположение</span>
            </label>
            <button
              type="button"
              className={
                commentsOpen
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              title="Комментарии"
              aria-label="Комментарии"
              aria-pressed={commentsOpen}
              onClick={() => setCommentsOpen((value) => !value)}
            >
              <span aria-hidden="true">💬</span>
              {openCommentCount(comments) > 0 ? (
                <span className="editor-toolbar__count">{openCommentCount(comments)}</span>
              ) : null}
            </button>
            <button
              type="button"
              className={
                inspectorOpen
                  ? 'ghost-button ghost-button--small ghost-button--active'
                  : 'ghost-button ghost-button--small'
              }
              title="Свойства"
              aria-label="Свойства"
              aria-pressed={inspectorOpen}
              onClick={() => setInspectorOpen((value) => !value)}
            >
              <span aria-hidden="true">☰</span>
            </button>
          </div>

          <div className="editor-toolbar__section" role="group" aria-label="Выравнивание текста">
            <span className="editor-toolbar__label">Текст</span>
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
          </div>

          <div
            className="editor-toolbar__section editor-toolbar__section--end"
            role="group"
            aria-label="Сохранение"
          >
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title={`Настройки (${formatCombo(shortcuts.settings)})`}
              aria-label="Настройки редактора"
              onClick={() => setSettingsOpen(true)}
            >
              <span aria-hidden="true">⌨</span>
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title="Экспорт диаграммы"
              aria-label="Экспорт"
              onClick={() => {
                setExportError(null);
                setExportOpen(true);
              }}
            >
              <span aria-hidden="true">⤓</span>
              <span className="ghost-button__label">Экспорт</span>
            </button>
            <button
              type="button"
              className="ghost-button ghost-button--small"
              title={`Сохранить (${formatCombo(shortcuts.save)})`}
              aria-label="Сохранить"
              disabled={save.kind === 'saved' || save.kind === 'saving'}
              onClick={() => executeAction('save')}
            >
              <span aria-hidden="true">💾</span>
            </button>
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
              <FillColorIcon />
              <input
                type="color"
                aria-label="Заливка"
                disabled={!selectedInspector || isSequenceFlowType(selectedInspector.type)}
                value={selectedInspector?.fillColor || '#ffffff'}
                onChange={(event) => applyPatch({ fillColor: event.target.value })}
              />
            </label>
            <label className="editor-toolbar__color" title="Обводка">
              <StrokeColorIcon />
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

        {draftWarning ? (
          <p className="canvas__overlay--error" role="status">
            {draftWarning}
          </p>
        ) : null}
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

        <div className="canvas" ref={canvasRef}>
          <div
            ref={hostRef}
            className="canvas__host"
            data-testid="diagram-editor"
            data-canvas={canvasTheme}
            data-revision={revision}
            data-viewbox={`${viewbox.x} ${viewbox.y} ${viewbox.width} ${viewbox.height} ${viewbox.scale}`}
            onContextMenu={openContextMenu}
          />
          {simulationOpen && simulation ? (
            <SimulationTokens
              steps={simulation.steps}
              index={simulationIndex}
              speed={simulationSpeed}
              nodes={simulationPoints.nodes}
              flows={simulationPoints.flows}
              runId={simulationRunId}
            />
          ) : null}
          <StageBands
            stages={stages}
            pools={stagePools}
            viewbox={viewbox}
            onToggle={toggleStage}
            onAdd={(stage) => addStageToPool(stage.poolId)}
            onRename={renameStage}
            onDocumentation={setDocsStage}
            onResizePreview={previewStageResize}
            onResizeCommit={commitStageResize}
            onResizeCancel={cancelStageResize}
          />
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
          <div className="canvas-panels">
            {problemsOpen ? (
              <ProblemsPanel
                report={validation}
                stale={save.kind !== 'saved'}
                busy={validationBusy}
                error={validationError}
                onSelect={openFinding}
                onDownload={() => void downloadReport()}
                downloading={reportDownloading}
                onClose={() => setProblemsOpen(false)}
                highlighted={highlightedFinding}
                scope={diagramId}
                autoLayout={autoLayout}
              />
            ) : null}
            {simulationOpen ? (
              <SimulationPanel
                report={simulation}
                index={simulationIndex}
                playing={simulationPlaying}
                speed={simulationSpeed}
                busy={simulationBusy}
                error={simulationError}
                variablesText={simulationVariablesText}
                variablesError={simulationVariables.error}
                onVariablesChange={setSimulationVariablesText}
                heatmap={simulationHeatmap}
                onHeatmapChange={setSimulationHeatmap}
                onRun={() => void runSimulation({}, simulationVariables.variables)}
                onChooseBranch={chooseSimulationBranch}
                onStep={(next) => {
                  if (!simulation) {
                    return;
                  }
                  setSimulationPlaying(false);
                  setSimulationIndex(Math.max(0, Math.min(next, simulation.steps.length - 1)));
                }}
                onTogglePlay={() => setSimulationPlaying((value) => !value)}
                onSpeedChange={setSimulationSpeed}
                onClose={() => {
                  setSimulationOpen(false);
                  setSimulationPlaying(false);
                }}
                scope={diagramId}
                autoLayout={autoLayout}
                variables={simulationVariables.variables}
                choices={simulationChoices}
              />
            ) : null}
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
                scope={diagramId}
                autoLayout={autoLayout}
              />
            ) : null}
          </div>
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
        stageCount={selectedPoolStages.length}
        onToggleStages={(enabled) => {
          if (selected) {
            togglePoolStages(selected.id, enabled);
          }
        }}
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
          setReplaceMenu(null);
          setReplaceInline(false);
        }}
        aside={
          replaceInline && replaceMenu ? (
            <ReplaceMenu
              menu={replaceMenu}
              inline
              onClose={() => {
                setReplaceMenu(null);
                setReplaceInline(false);
                setMenu(null);
              }}
            />
          ) : undefined
        }
      />
      {!replaceInline ? (
        <ReplaceMenu
          menu={replaceMenu}
          onClose={() => {
            setReplaceMenu(null);
            setReplaceInline(false);
          }}
        />
      ) : null}
      <ExportDialog
        open={exportOpen}
        diagramId={diagramId}
        busy={exportBusy}
        progress={exportProgress}
        error={exportError}
        job={exportJob}
        onClose={() => setExportOpen(false)}
        onExport={(kind, options) => void runExport(kind, options)}
        onDownloadJob={(item) => void downloadHistoryJob(item)}
      />
      <ThemeSettings
        open={themeOpen}
        value={themeId}
        canvas={canvasTheme}
        onChange={updateTheme}
        onCanvasChange={updateCanvasTheme}
        onClose={() => setThemeOpen(false)}
      />
      <StageDocumentationDialog
        stage={docsStage}
        onSave={(stage, description) => {
          const value = description.trim();
          updateStages(
            stages.map((item) =>
              item.id === stage.id ? { ...item, description: value || undefined } : item,
            ),
          );
        }}
        onClose={() => setDocsStage(null)}
      />
      <DiagramResizeSettings
        open={resizeSettingsOpen}
        resizeTasks={resizeSettings.tasks}
        resizeOthers={resizeSettings.others}
        compactBoundaryEvents={resizeSettings.compactBoundaryEvents}
        onResizeChange={updateResizeSettings}
        onSavePortalDefaults={() => {
          savePortalDefaults({
            theme: themeId,
            canvas: canvasTheme,
            resizeTasks: resizeSettings.tasks,
            resizeOthers: resizeSettings.others,
            compactBoundaryEvents: resizeSettings.compactBoundaryEvents,
          });
          notify('success', 'Значения сохранены для новых схем');
        }}
        onClose={() => setResizeSettingsOpen(false)}
      />
      <SettingsDialog
        open={settingsOpen}
        shortcuts={shortcuts}
        onChange={updateShortcuts}
        autosaveSeconds={autosaveSeconds}
        onAutosaveChange={(seconds) => setAutosaveSeconds(saveAutosaveSeconds(seconds))}
        validationMode={validationMode}
        onValidationModeChange={(mode) => setValidationMode(saveValidationMode(mode))}
        markdownToolbar={markdownToolbar}
        onMarkdownToolbarChange={(enabled) =>
          setMarkdownToolbar(saveMarkdownToolbarEnabled(enabled))
        }
        mouseMode={mouseMode}
        onMouseModeChange={(mode) => setMouseMode(saveCanvasMouseMode(mode))}
        typePalette={typePaletteEnabled}
        onTypePaletteChange={(enabled) => {
          setTypePaletteEnabled(saveTypePaletteEnabled(enabled));
          if (!enabled) {
            setReplaceMenu(null);
          }
        }}
        onClose={() => setSettingsOpen(false)}
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
