/**
 * L10 Operation Gate
 * Protects sensitive files from unauthorized writes.
 * Requires source references for config file changes.
 *
 * Ported from lingminopt/lingyuan/l10_operation_gate.py
 * Responsibility: intercept write operations on protected files,
 * enforce source URL or record ID requirements.
 */

export interface GateCheckResult {
  passed: boolean;
  reason: string;
  missingSource: boolean;
  protectedFile: boolean;
  suggestions: string[];
}

export interface WriteIntent {
  filePath: string;
  content: string;
  author: string;
  commitMessage: string;
  sourceUrl: string;
  sourceRecordId: string;
  timestamp: string;
}

const PROTECTED_PATTERNS: string[] = [
  '**/routes.json',
  '**/providers.json',
  '**/config.yaml',
  '**/config.yml',
  '**/.audit/*.md',
  '**/CRUSH.md',
  '**/security_registry.yaml',
  '**/backends.json',
];

const REQUIRE_SOURCE_PATTERNS: string[] = [
  '**/routes.json',
  '**/providers.json',
  '**/config.yaml',
  '**/security_registry.yaml',
  '**/backends.json',
];

const SOURCE_URL_PATTERN = /https?:\/\/[^\s,;"']+/;
const LM_CREATE_PATTERN =
  /(?:lm_create|record|rowid)\s*(?:record_?)?(?:id)?\s*[:=]\s*([a-f0-9-]{8,36})/i;
const REFERENCE_PATTERN =
  /(?:参考|来源|引用|source|ref|from)\s*[:：]\s*(https?:\/\/[^\s,;"']+)/i;

function hasSourceUrl(
  commitMessage: string,
  content: string
): { found: boolean; url: string } {
  for (const text of [commitMessage, content]) {
    const match = text.match(SOURCE_URL_PATTERN);
    if (match) return { found: true, url: match[0] };
  }
  return { found: false, url: '' };
}

function hasSourceRecordId(
  commitMessage: string,
  content: string
): { found: boolean; recordId: string } {
  for (const text of [commitMessage, content]) {
    const match = text.match(LM_CREATE_PATTERN);
    if (match) return { found: true, recordId: match[1] };
  }
  return { found: false, recordId: '' };
}

function hasReference(
  commitMessage: string,
  content: string
): { found: boolean; url: string } {
  for (const text of [commitMessage, content]) {
    const match = text.match(REFERENCE_PATTERN);
    if (match) return { found: true, url: match[1] };
  }
  return { found: false, url: '' };
}

function matchGlob(filePath: string, pattern: string): boolean {
  let regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '§§DOUBLESTAR§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§DOUBLESTAR§§/g, '.*');
  // Make **/ prefix optional: **/routes.json should match both
  // "routes.json" and "some/path/routes.json"
  regexStr = '^(?:.*\\/)?' + regexStr.replace(/^\.\*\//, '') + '$';
  const regex = new RegExp(regexStr);
  return regex.test(filePath);
}

export function isProtected(filePath: string): boolean {
  for (const pattern of PROTECTED_PATTERNS) {
    if (matchGlob(filePath, pattern)) return true;
  }
  return false;
}

export function requiresSource(filePath: string): boolean {
  for (const pattern of REQUIRE_SOURCE_PATTERNS) {
    if (matchGlob(filePath, pattern)) return true;
  }
  return false;
}

export function checkWrite(intent: WriteIntent): GateCheckResult {
  const result: GateCheckResult = {
    passed: false,
    reason: '',
    missingSource: false,
    protectedFile: false,
    suggestions: [],
  };

  if (!isProtected(intent.filePath)) {
    result.passed = true;
    return result;
  }
  result.protectedFile = true;

  if (!requiresSource(intent.filePath)) {
    result.passed = true;
    return result;
  }

  const urlCheck = hasSourceUrl(intent.commitMessage, intent.content);
  const recordCheck = hasSourceRecordId(intent.commitMessage, intent.content);
  const refCheck = hasReference(intent.commitMessage, intent.content);

  if (urlCheck.found || recordCheck.found || refCheck.found) {
    result.passed = true;
    const source =
      urlCheck.url || `record:${recordCheck.recordId}` || refCheck.url;
    result.reason = `source verified: ${source}`;
    return result;
  }

  result.passed = false;
  result.missingSource = true;
  result.reason =
    `拒绝写入 ${intent.filePath}: 需要外部数据引用 ` +
    `(请在 commit message 中附 source URL 或 lm_create record id)`;
  result.suggestions = [
    '在 commit message 中添加 source: https://...',
    '引用 lm_create record_id: lm_create record_id: xxx',
    '使用 参考: 前缀标注来源',
    '如为内部修改，请标注参考 灵族讨论 thread_id',
  ];

  return result;
}

export function getProtectedPatterns(): string[] {
  return [...PROTECTED_PATTERNS];
}

export function getRequireSourcePatterns(): string[] {
  return [...REQUIRE_SOURCE_PATTERNS];
}
