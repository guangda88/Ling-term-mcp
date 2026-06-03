export const DEFAULT_TIMEOUT = 60000;
export const MAX_TIMEOUT = 600000;
export const MAX_OUTPUT_LENGTH = 10000;
export const OUTPUT_HEAD = 5000;
export const OUTPUT_TAIL = 5000;

export const BLOCKED_CWD_PREFIXES = ['/etc', '/root', '/var', '/boot', '/sbin'];

export function isCwdAllowed(resolvedPath: string): boolean {
  for (const prefix of BLOCKED_CWD_PREFIXES) {
    if (resolvedPath.startsWith(prefix + '/') || resolvedPath === prefix) {
      return false;
    }
  }
  return true;
}

export function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_LENGTH) return output;
  const head = output.slice(0, OUTPUT_HEAD);
  const tail = output.slice(-OUTPUT_TAIL);
  const omitted = output.length - OUTPUT_HEAD - OUTPUT_TAIL;
  return `${head}\n\n... [${omitted} characters omitted] ...\n\n${tail}`;
}
