/**
 * Build a sanitized environment for command execution.
 * Filters out secret-bearing env vars and shell injection vectors.
 */

const BLOCKED_ENV_RE =
  /SECRET|PASSWORD|TOKEN|API_KEY|PRIVATE_KEY|AUTH|CREDENTIAL|ACCESS_KEY/i;

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
