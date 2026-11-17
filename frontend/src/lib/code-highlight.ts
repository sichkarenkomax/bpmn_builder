// Небольшой подсветчик для блоков кода без внешних зависимостей.
// Возвращает текстовые токены, которые `MarkdownView` рисует React-элементами:
// поэтому HTML из кода никогда не исполняется.

export type CodeTokenKind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'tag' | 'attr';

export interface CodeToken {
  kind: CodeTokenKind;
  text: string;
}

const KEYWORDS: Record<string, string[]> = {
  javascript: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'new',
    'import',
    'export',
    'from',
    'async',
    'await',
    'try',
    'catch',
    'throw',
    'typeof',
    'instanceof',
    'interface',
    'type',
    'extends',
    'implements',
    'public',
    'private',
    'protected',
    'null',
    'undefined',
    'true',
    'false',
  ],
  typescript: [
    'const',
    'let',
    'var',
    'function',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'new',
    'import',
    'export',
    'from',
    'async',
    'await',
    'try',
    'catch',
    'throw',
    'typeof',
    'instanceof',
    'interface',
    'type',
    'enum',
    'extends',
    'implements',
    'public',
    'private',
    'protected',
    'readonly',
    'null',
    'undefined',
    'true',
    'false',
  ],
  json: ['true', 'false', 'null'],
  python: [
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'import',
    'from',
    'as',
    'try',
    'except',
    'finally',
    'with',
    'async',
    'await',
    'yield',
    'lambda',
    'None',
    'True',
    'False',
    'and',
    'or',
    'not',
    'in',
    'is',
  ],
  bash: [
    'if',
    'then',
    'else',
    'elif',
    'fi',
    'for',
    'while',
    'do',
    'done',
    'case',
    'esac',
    'function',
    'export',
    'local',
    'echo',
    'cd',
    'make',
    'sudo',
    'npm',
    'uv',
    'docker',
  ],
  sql: [
    'select',
    'from',
    'where',
    'join',
    'left',
    'right',
    'inner',
    'outer',
    'on',
    'group',
    'by',
    'order',
    'having',
    'insert',
    'into',
    'values',
    'update',
    'set',
    'delete',
    'create',
    'table',
    'alter',
    'drop',
    'as',
    'and',
    'or',
    'not',
    'null',
    'limit',
    'offset',
  ],
};

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  jsonc: 'json',
  xml: 'xml',
  html: 'xml',
  svg: 'xml',
  bpmn: 'xml',
  sql: 'sql',
};

interface Rule {
  kind: CodeTokenKind;
  pattern: RegExp;
}

export function highlightCode(code: string, language = ''): CodeToken[] {
  const lang = LANGUAGE_ALIASES[language.toLowerCase()] ?? language.toLowerCase();
  const rules = rulesFor(lang);
  if (rules.length === 0) {
    return [{ kind: 'plain', text: code }];
  }

  const tokens: CodeToken[] = [];
  let cursor = 0;
  while (cursor < code.length) {
    let best: { rule: Rule; match: RegExpExecArray } | null = null;
    for (const rule of rules) {
      rule.pattern.lastIndex = cursor;
      const match = rule.pattern.exec(code);
      if (match && (!best || match.index < best.match.index)) {
        best = { rule, match };
      }
    }
    if (!best) {
      tokens.push({ kind: 'plain', text: code.slice(cursor) });
      break;
    }
    if (best.match.index > cursor) {
      tokens.push({ kind: 'plain', text: code.slice(cursor, best.match.index) });
    }
    tokens.push({ kind: best.rule.kind, text: best.match[0] });
    cursor = best.match.index + best.match[0].length;
  }
  return mergePlain(tokens);
}

function rulesFor(language: string): Rule[] {
  if (language === 'xml') {
    return [
      { kind: 'comment', pattern: /<!--[\s\S]*?-->/g },
      { kind: 'string', pattern: /"[^"]*"|'[^']*'/g },
      { kind: 'tag', pattern: /<\/?[A-Za-z][\w:.-]*|\/?>/g },
      { kind: 'attr', pattern: /[A-Za-z_:][\w:.-]*(?=\s*=)/g },
    ];
  }

  const keywords = KEYWORDS[language];
  if (!keywords) {
    return [];
  }

  const hashComments = language === 'python' || language === 'bash';
  const dashComments = language === 'sql';
  const lineComment = hashComments ? /#[^\n]*/g : dashComments ? /--[^\n]*/g : /\/\/[^\n]*/g;

  return [
    { kind: 'comment', pattern: /\/\*[\s\S]*?\*\//g },
    { kind: 'comment', pattern: lineComment },
    { kind: 'string', pattern: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g },
    {
      kind: 'keyword',
      pattern: new RegExp(`\\b(?:${keywords.join('|')})\\b`, 'g'),
    },
    { kind: 'number', pattern: /\b\d+(?:\.\d+)?\b/g },
  ];
}

function mergePlain(tokens: CodeToken[]): CodeToken[] {
  const merged: CodeToken[] = [];
  for (const token of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.kind === 'plain' && token.kind === 'plain') {
      last.text += token.text;
    } else {
      merged.push({ ...token });
    }
  }
  return merged;
}
