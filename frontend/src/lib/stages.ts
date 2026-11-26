// Этапы схемы: вертикальные фазы внутри пула, как phase в Bizagi.
// Пул — `bpmn:Participant`; первый этап занимает основную часть пула после
// ярлыка, следующие добавляются справа и расширяют пул. Этап хранится в
// `bs:stages` на `bpmn:definitions` как JSON.
//
// У этапа хранится только левая граница `x`: правая граница — следующий этап
// или правая граница пула. Так зоны всегда непрерывны и не оставляют пустот.

export interface DiagramStage {
  id: string;
  name: string;
  /** id пула (`bpmn:Participant`) или `PROCESS_POOL_ID` для процесса без пула. */
  poolId: string;
  /** Левая граница этапа относительно левой границы пула. */
  x: number;
  collapsed: boolean;
  /** Markdown-описание этапа (1.5.7); пустая строка не сохраняется. */
  description?: string;
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
/** Ширина полосы с названием пула в bpmn-js. */
export const POOL_LABEL_WIDTH = 30;
export const STAGE_MIN_WIDTH = 100;
export const STAGE_DEFAULT_WIDTH = 260;

export interface StageResizeResult {
  stages: DiagramStage[];
  /** Фактический сдвиг границы после ограничений. */
  delta: number;
  poolWidth: number;
}

/**
 * Двигает правую границу этапа. Следующие этапы сдвигаются вместе с ней,
 * поэтому их ширина не меняется, а пул расширяется или сжимается на `delta`.
 * У последнего этапа граница совпадает с краем пула.
 */
export function resizeStageBoundary(
  stages: DiagramStage[],
  pool: StagePool,
  stageId: string,
  delta: number,
  minWidth = STAGE_MIN_WIDTH,
): StageResizeResult {
  const samePool = stageForPool(stages, pool.id);
  const index = samePool.findIndex((stage) => stage.id === stageId);
  if (index === -1) {
    return { stages, delta: 0, poolWidth: pool.width };
  }
  const stage = samePool[index]!;
  const right = samePool[index + 1]?.x ?? pool.width;
  const width = Math.max(0, right - stage.x);
  // Не даём этапу стать уже минимальной ширины. Если он уже уже неё,
  // дальше сжимать нечего — но расширять по-прежнему можно.
  const applied = delta < 0 ? Math.max(delta, Math.min(0, minWidth - width)) : Math.max(0, delta);
  const shiftedIds = new Set(samePool.slice(index + 1).map((item) => item.id));
  return {
    stages: stages.map((item) =>
      shiftedIds.has(item.id) ? { ...item, x: item.x + applied } : item,
    ),
    delta: applied,
    poolWidth: pool.width + applied,
  };
}

/**
 * Правая граница содержимого этапа в координатах холста. Нужна, чтобы
 * при сжатии граница не проходила сквозь фигуры этапа.
 */
export function stageContentRight(
  stage: DiagramStage,
  elements: {
    id: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    source?: { id: string };
    target?: { id: string };
  }[],
  pools: StagePool[],
  stages: DiagramStage[],
): number | undefined {
  const bounds = stageBounds(stage, pools, stages);
  if (!bounds) {
    return undefined;
  }
  let right: number | undefined;
  for (const element of elements) {
    if (
      element.type === 'label' ||
      element.type === 'bpmn:Participant' ||
      element.type === 'bpmn:Lane' ||
      typeof element.x !== 'number' ||
      typeof element.y !== 'number' ||
      typeof element.width !== 'number' ||
      typeof element.height !== 'number' ||
      element.source ||
      element.target
    ) {
      continue;
    }
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    if (
      centerX >= bounds.x &&
      centerX < bounds.x + bounds.width &&
      centerY >= bounds.y &&
      centerY < bounds.y + bounds.height
    ) {
      right = Math.max(right ?? 0, element.x + element.width);
    }
  }
  return right;
}

/** Первый этап занимает весь пул после ярлыка, следующий добавляется справа. */
export function createStage(stages: DiagramStage[], pool: StagePool, name?: string): DiagramStage {
  const samePool = stageForPool(stages, pool.id);
  const first = samePool.length === 0;
  const id = `Stage_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name: name ?? `Этап ${samePool.length + 1}`,
    poolId: pool.id,
    x: first ? POOL_LABEL_WIDTH : Math.max(pool.width, samePool.at(-1)!.x + STAGE_MIN_WIDTH),
    collapsed: false,
  };
}

export function stageForPool(stages: DiagramStage[], poolId: string): DiagramStage[] {
  return stages.filter((stage) => stage.poolId === poolId).sort((left, right) => left.x - right.x);
}

export function stagesEnabled(stages: DiagramStage[], poolId: string): boolean {
  return stages.some((stage) => stage.poolId === poolId);
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
    stages.push({
      id: candidate['id'],
      name: candidate['name'],
      poolId: typeof candidate['poolId'] === 'string' ? candidate['poolId'] : PROCESS_POOL_ID,
      // Старый формат хранил `y` (верх горизонтальной полосы) и ширину.
      // Теперь этап — вертикальная граница, поэтому переносим его в начало
      // основной части пула; `width` и `milestones` больше не используются.
      x:
        typeof candidate['x'] === 'number' && Number.isFinite(candidate['x'])
          ? Math.max(0, Math.round(candidate['x']))
          : POOL_LABEL_WIDTH,
      collapsed: candidate['collapsed'] === true,
      ...(typeof candidate['description'] === 'string' && candidate['description'].trim()
        ? { description: candidate['description'] }
        : {}),
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
    stages.map((stage) => {
      const description = stage.description?.trim();
      return {
        id: stage.id,
        name: stage.name,
        poolId: stage.poolId,
        x: stage.x,
        collapsed: stage.collapsed,
        // Пустое описание не пишем: XML не должен копить пустые поля.
        ...(description ? { description } : {}),
      };
    }),
  );
}

/**
 * Границы пулов. Если пулов нет, возвращает один синтетический контейнер
 * по габаритам фигур процесса.
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

/** Правая граница этапа: следующий этап или край пула. */
export function stageBounds(
  stage: DiagramStage,
  pools: StagePool[],
  stages: DiagramStage[] = [stage],
): { x: number; y: number; width: number; height: number } | undefined {
  const pool = pools.find((item) => item.id === stage.poolId);
  if (!pool) {
    return undefined;
  }
  const samePool = stageForPool(stages, stage.poolId);
  const index = samePool.findIndex((item) => item.id === stage.id);
  const next = index === -1 ? undefined : samePool[index + 1];
  const left = Math.max(POOL_LABEL_WIDTH, stage.x);
  const right = next ? Math.max(left, next.x) : pool.width;
  return {
    x: pool.x + left,
    y: pool.y,
    width: Math.max(0, Math.min(right, pool.width) - left),
    height: pool.height,
  };
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
      const bounds = stageBounds(stage, pools, stages);
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
