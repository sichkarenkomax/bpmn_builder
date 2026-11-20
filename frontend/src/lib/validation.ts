import type { ValidationFinding, ValidationReport } from './api';

export const VALIDATION_OVERLAY_TYPE = 'bs-validation';

export type ValidationSeverity = ValidationFinding['severity'];

const SEVERITY_RANK: Record<ValidationSeverity, number> = {
  info: 1,
  warning: 2,
  error: 3,
};

export interface ElementValidationSummary {
  severity: ValidationSeverity;
  count: number;
  messages: string[];
}

/** Сводка findings по элементу: худшая severity и все сообщения для подсказки. */
export function summarizeFindingsByElement(
  findings: ValidationFinding[],
): Map<string, ElementValidationSummary> {
  const result = new Map<string, ElementValidationSummary>();
  for (const finding of findings) {
    if (!finding.element_id) {
      continue;
    }
    const current = result.get(finding.element_id);
    if (!current) {
      result.set(finding.element_id, {
        severity: finding.severity,
        count: 1,
        messages: [finding.message],
      });
      continue;
    }
    current.count += 1;
    if (!current.messages.includes(finding.message)) {
      current.messages.push(finding.message);
    }
    if (SEVERITY_RANK[finding.severity] > SEVERITY_RANK[current.severity]) {
      current.severity = finding.severity;
    }
  }
  return result;
}

export function validationBadgeText(severity: ValidationSeverity): string {
  return severity === 'info' ? 'i' : '!';
}

export function validationBadgeTitle(summary: ElementValidationSummary): string {
  const noun =
    summary.severity === 'error'
      ? 'ошибка'
      : summary.severity === 'warning'
        ? 'предупреждение'
        : 'информация';
  return `${summary.count} ${noun}: ${summary.messages.join('; ')}`;
}

export function validationFindingsCount(report: ValidationReport | null): number {
  return report?.findings.length ?? 0;
}
