import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = join(SRC, 'modules');

//: Оболочка приложения — единственное место, где ядро знает о модулях.
const SHELL_ALLOWED = new Set(['App.tsx', 'components/Layout.tsx']);
const FORBIDDEN_MODULE_IMPORTS = ['components/DiagramEditor', 'pages/DiagramPage', 'lib/inspector'];

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function importTargets(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  return [...source.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)].map(
    (match) => match[1] ?? '',
  );
}

describe('границы frontend-модулей (4.0.6)', () => {
  it('модули не импортируют редактор и его внутренности', () => {
    const violations: string[] = [];
    for (const path of sourceFiles(MODULES)) {
      for (const target of importTargets(path)) {
        if (FORBIDDEN_MODULE_IMPORTS.some((forbidden) => target.includes(forbidden))) {
          violations.push(`${relative(SRC, path)} → ${target}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('ядро импортирует модули только в оболочке приложения', () => {
    const violations: string[] = [];
    for (const path of sourceFiles(SRC)) {
      if (path.startsWith(MODULES)) {
        continue;
      }
      const name = relative(SRC, path);
      if (SHELL_ALLOWED.has(name)) {
        continue;
      }
      for (const target of importTargets(path)) {
        if (target.includes('/modules/') || target.includes('./modules')) {
          violations.push(`${name} → ${target}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
