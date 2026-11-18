// Этапы схемы (1.3.14): вертикальные фазы внутри пула, как milestone в Bizagi.
// Пул — `bpmn:Participant`; для диаграммы без пула используется синтетический
// контейнер процесса. Этап хранится в `bs:stages` на `bpmn:definitions` как JSON.
// Этап проходит через все дорожки пула; свёрнутый этап прячет свои фигуры и связи.

export interface StageMilestone {
  id: string;
  name: string;
  /** Горизонтальная отметка внутри этапа, отступ от верха пула. */
  y: number;
}

export interface DiagramStage {
  id: string;
  name: string;
  /** id пула (`bpmn:Participant`) или `PROCESS_POOL_ID` для процесса без пула. */
  poolId: string;
  /** Левая граница этапа относительно левой границы пула. */
  x: number;
  /** Ширина этапа внутри пула. */
  width: number;
  collapsed: boolean;
  milestones: StageMilestone[];
}

export interface StagePool {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Синтетический контейнер процесса, когда в схеме нет пула. */
  synthetic?: boolean;
}

export const PROCESS_POOL_ID = '__process__';
export const STAGE_MIN_WIDTH = 100;
export const STAGE_DEFAULT_WIDTH = 260;
export const STAGE_HEADER_HEIGHT = 26;
const STAGE_GAP = 0;

export function createStage(stages: DiagramStage[], pool: StagePool, name?: string): DiagramStage {
  const samePool = stages.filter((stage) => stage.poolId === pool.id);
  const right = samePool.reduce((max, stage) => Math.max(max, stage.x + stage.width), 0);
  const x = Math.round(
    Math.min(
      Math.max(STAGE_GAP, right + (samePool.length > 0 ? STAGE_GAP : 0)),
      Math.max(0, pool.width - STAGE_MIN_WIDTH),
    ),
  );
  const available = Math.max(STAGE_MIN_WIDTH, pool.width - x - STAGE_GAP);
  const width = Math.round(Math.min(STAGE_DEFAULT_WIDTH, available));
  const id = `Stage_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name: name ?? `Этап ${stages.length + 1}`,
    poolId: pool.id,
    x,
    width,
    collapsed: false,
    milestones: [],
  };
}

export function createMilestone(stage: DiagramStage, index = 0): StageMilestone {
  return {
    id: `Milestone_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: `Веха ${stage.milestones.length + 1}`,
    y: 80 + index * 90,
  };
}

export function stageForPool(stages: DiagramStage[], poolId: string): DiagramStage[] {
  return stages.filter((stage) => stage.poolId === poolId);
}

/** Разбирает JSON из атрибута. Битый или чужой формат не ломает открытие схемы. */
export function parseStages(raw: string | undefined): DiagramStage[] | null {
  if (!raw) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const stages: DiagramStage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate['id'] !== 'string' ||
      typeof candidate['name'] !== 'string' ||
      (typeof candidate['x'] !== 'number' && typeof candidate['y'] !== 'number') ||
      !Number.isFinite(candidate['x'] ?? candidate['y'])
    ) {
      continue;
    }
    const x = candidate['x'];
    const width =
      typeof candidate['width'] === 'number' && Number.isFinite(candidate['width'])
        ? candidate['width']
        : STAGE_DEFAULT_WIDTH;
    stages.push({
      id: candidate['id'],
      name: candidate['name'],
      poolId: typeof candidate['poolId'] === 'string' ? candidate['poolId'] : PROCESS_POOL_ID,
      // Старый формат хранил `y` (верх горизонтальной полосы). Переносим такие
      // этапы в синтетический процесс, чтобы не потерять названия.
      x: typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0,
      width: Math.max(STAGE_MIN_WIDTH, Math.round(width)),
      collapsed: candidate['collapsed'] === true,
      milestones: parseMilestones(candidate['milestones']),
    });
  }
  return stages;
}

/** Пустой список удаляет атрибут, чтобы не копить пустой JSON в XML. */
export function serializeStages(stages: DiagramStage[]): string | undefined {
  if (stages.length === 0) {
    return undefined;
  }
  return JSON.stringify(
    stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      poolId: stage.poolId,
      x: stage.x,
      width: stage.width,
      collapsed: stage.collapsed,
      milestones: stage.milestones.map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
        y: milestone.y,
      })),
    })),
  );
}

function parseMilestones(value: unknown): StageMilestone[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const milestones: StageMilestone[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const candidate = item as Record<string, unknown>;
    const y = candidate['y'] ?? candidate['x'];
    if (
      typeof candidate['id'] !== 'string' ||
      typeof candidate['name'] !== 'string' ||
      typeof y !== 'number' ||
      !Number.isFinite(y)
    ) {
      continue;
    }
    milestones.push({
      id: candidate['id'],
      name: candidate['name'],
      y: Math.max(0, Math.round(y)),
    });
  }
  return milestones;
}

/**
 * Границы пулов для диалога этапов. Если пулов нет, возвращает один
 * синтетический контейнер по габаритам фигур процесса.
 */
export function collectStagePools(
  elements: {
    id: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    source?: { id: string };
    target?: { id: string };
    businessObject?: { name?: string };
  }[],
): StagePool[] {
  const pools = elements
    .filter(
      (element) =>
        element.type === 'bpmn:Participant' &&
        typeof element.x === 'number' &&
        typeof element.y === 'number' &&
        typeof element.width === 'number' &&
        typeof element.height === 'number',
    )
    .map((element) => ({
      id: element.id,
      name: element.businessObject?.name || 'Пул',
      x: element.x!,
      y: element.y!,
      width: element.width!,
      height: element.height!,
    }));
  if (pools.length > 0) {
    return pools;
  }

  const shapes = elements.filter(
    (element) =>
      element.type !== 'label' &&
      element.type !== 'bpmn:Participant' &&
      element.type !== 'bpmn:Lane' &&
      typeof element.x === 'number' &&
      typeof element.y === 'number' &&
      typeof element.width === 'number' &&
      typeof element.height === 'number' &&
      !element.source &&
      !element.target,
  );
  if (shapes.length === 0) {
    return [
      {
        id: PROCESS_POOL_ID,
        name: 'Процесс',
        x: 0,
        y: 0,
        width: 600,
        height: 400,
        synthetic: true,
      },
    ];
  }
  const left = Math.min(...shapes.map((element) => element.x!));
  const top = Math.min(...shapes.map((element) => element.y!));
  const right = Math.max(...shapes.map((element) => element.x! + element.width!));
  const bottom = Math.max(...shapes.map((element) => element.y! + element.height!));
  return [
    {
      id: PROCESS_POOL_ID,
      name: 'Процесс',
      x: Math.round(left - 24),
      y: Math.round(top - 24),
      width: Math.round(right - left + 48),
      height: Math.round(bottom - top + 48),
      synthetic: true,
    },
  ];
}

export function stageBounds(
  stage: DiagramStage,
  pools: StagePool[],
): { x: number; y: number; width: number; height: number } | undefined {
  const pool = pools.find((item) => item.id === stage.poolId);
  if (!pool) {
    return undefined;
  }
  const x = pool.x + stage.x;
  const width = Math.min(stage.width, Math.max(0, pool.width - stage.x));
  return { x, y: pool.y, width, height: pool.height };
}

/** id фигур, попадающих в свёрнутые этапы; пулы, дорожки и подписи не трогаем. */
export function hiddenStageElementIds(
  stages: DiagramStage[],
  elements: {
    id: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    source?: { id: string };
    target?: { id: string };
    labelTarget?: { id: string };
  }[],
  pools: StagePool[] = collectStagePools(elements),
): Set<string> {
  const collapsed = stages.filter((stage) => stage.collapsed);
  if (collapsed.length === 0) {
    return new Set();
  }
  const shapes = elements.filter(
    (element) =>
      element.type !== 'label' &&
      element.type !== 'bpmn:Participant' &&
      element.type !== 'bpmn:Lane' &&
      typeof element.x === 'number' &&
      typeof element.y === 'number' &&
      typeof element.width === 'number' &&
      typeof element.height === 'number' &&
      !element.source &&
      !element.target,
  );
  const hidden = new Set<string>();
  for (const element of shapes) {
    const centerX = element.x! + element.width! / 2;
    const centerY = element.y! + element.height! / 2;
    const inStage = collapsed.some((stage) => {
      const bounds = stageBounds(stage, pools);
      return (
        bounds !== undefined &&
        centerX >= bounds.x &&
        centerX < bounds.x + bounds.width &&
        centerY >= bounds.y &&
        centerY < bounds.y + bounds.height
      );
    });
    if (inStage) {
      hidden.add(element.id);
    }
  }
  // Связь прячем, только если оба конца скрыты; иначе линия ведёт в пустоту.
  for (const element of elements) {
    if (
      element.source &&
      element.target &&
      hidden.has(element.source.id) &&
      hidden.has(element.target.id)
    ) {
      hidden.add(element.id);
    }
    // Внешняя подпись скрытой фигуры тоже не должна висеть в воздухе.
    if (element.labelTarget && hidden.has(element.labelTarget.id)) {
      hidden.add(element.id);
    }
  }
  return hidden;
}
