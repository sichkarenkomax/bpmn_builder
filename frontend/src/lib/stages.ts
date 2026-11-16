// Этапы схемы (1.3.14): горизонтальные полосы поверх пулов.
// Хранятся в `bs:stages` на `bpmn:definitions` как JSON — по образцу своей темы.
// Свёрнутый этап скрывает фигуры, чей центр попал в полосу, и связи между ними.

export interface StageMilestone {
  id: string;
  name: string;
  /** Позиция вехи по горизонтали в координатах холста. */
  x: number;
}

export interface DiagramStage {
  id: string;
  name: string;
  /** Верхняя граница полосы в координатах холста. */
  y: number;
  height: number;
  collapsed: boolean;
  milestones: StageMilestone[];
}

export const STAGE_MIN_HEIGHT = 60;
export const STAGE_DEFAULT_HEIGHT = 180;
export const STAGE_HEADER_HEIGHT = 26;

export function createStage(stages: DiagramStage[], name?: string): DiagramStage {
  const bottom = stages.reduce(
    (max, stage) => Math.max(max, stage.y + (stage.collapsed ? STAGE_HEADER_HEIGHT : stage.height)),
    0,
  );
  const id = `Stage_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    name: name ?? `Этап ${stages.length + 1}`,
    y: Math.round(bottom + 24),
    height: STAGE_DEFAULT_HEIGHT,
    collapsed: false,
    milestones: [],
  };
}

export function createMilestone(stage: DiagramStage, index = 0): StageMilestone {
  return {
    id: `Milestone_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: `Веха ${stage.milestones.length + 1}`,
    x: 120 + index * 160,
  };
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
      typeof candidate['y'] !== 'number' ||
      !Number.isFinite(candidate['y']) ||
      candidate['y'] < 0 ||
      typeof candidate['height'] !== 'number' ||
      !Number.isFinite(candidate['height'])
    ) {
      continue;
    }
    stages.push({
      id: candidate['id'],
      name: candidate['name'],
      y: Math.round(candidate['y']),
      height: Math.max(STAGE_MIN_HEIGHT, Math.round(candidate['height'])),
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
      y: stage.y,
      height: stage.height,
      collapsed: stage.collapsed,
      milestones: stage.milestones.map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
        x: milestone.x,
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
    if (
      typeof candidate['id'] !== 'string' ||
      typeof candidate['name'] !== 'string' ||
      typeof candidate['x'] !== 'number' ||
      !Number.isFinite(candidate['x'])
    ) {
      continue;
    }
    milestones.push({
      id: candidate['id'],
      name: candidate['name'],
      x: Math.round(candidate['x']),
    });
  }
  return milestones;
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
    const centerY = element.y! + element.height! / 2;
    if (collapsed.some((stage) => centerY >= stage.y && centerY < stage.y + stage.height)) {
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
