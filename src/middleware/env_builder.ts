/**
 * Build a sanitized environment for command execution.
 * Filters out secret-bearing env vars and shell injection vectors.
 */

// 对齐 dsh 防御模式: spawn 时清洗 *KEY*/*SECRET*/*TOKEN*/*PASSWORD*。
// 裸 KEY 通配覆盖 MY_KEY/KEYSTONE 等 API_KEY/PRIVATE_KEY/ACCESS_KEY 之外的键名变体。
const BLOCKED_ENV_RE = /KEY|SECRET|PASSWORD|TOKEN|AUTH|CREDENTIAL/i;

const SESSION_ENV_BLOCKLIST = new Set([
  'PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'SHELL',
  'HOME',
  'USER',
  'IFS',
  'ENV',
  'BASH_ENV',
  'NODE_OPTIONS',
  'PYTHONSTARTUP',
  'PYTHONPATH',
  'PYTHONINSPECT',
  'GIT_EXEC_PATH',
  'RUBYOPT',
  'PERL5LIB',
  'PERL5OPT',
  'LD_AUDIT',
  'MALLOC_CHECK_',
  'GCONV_PATH',
  'BASH_FUNC_',
]);

export function buildSafeEnv(
  sessionEnv?: Record<string, string>
): NodeJS.ProcessEnv {
  const safeEnv: NodeJS.ProcessEnv = { TERM: 'xterm-256color' };
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (BLOCKED_ENV_RE.test(key)) continue;
    safeEnv[key] = value;
  }
  if (sessionEnv) {
    for (const [key, value] of Object.entries(sessionEnv)) {
      if (SESSION_ENV_BLOCKLIST.has(key)) continue;
      if (BLOCKED_ENV_RE.test(key)) continue;
      safeEnv[key] = value;
    }
  }
  return safeEnv;
}
