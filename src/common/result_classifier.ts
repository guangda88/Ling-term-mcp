/**
 * Result Failure Classifier — stderr 方言归因（对齐 dsh ConfinedArgv 语义）
 *
 * dsh 的 ConfinedArgv 区分两类基础设施信号:
 *   - denialSignatures: 文件效应被拒的 stderr 方言（EROFS/EACCES/EPERM）
 *   - runnerFailureRules: runner 在命令执行前失败（ENOENT/command not found）
 *
 * 灵犀无 OS 级沙箱（sandboxGate fail-closed），但同一归因对原生错误同样适用:
 *   - runner_failure: 命令根本没跑起来（ENOENT / command not found）→ 基础设施问题
 *   - denied:         Permission denied / EACCES / EPERM / EROFS → 权限拒绝
 *   - task_failure:   命令已执行但退出非零 → 普通任务失败
 *
 * 分类是报告事实，不改写 stderr；消费方（execute_command error_meta）据此
 * 区分"重试是否有意义": runner_failure 重试无意义，task_failure 可重试。
 */

export type FailureClass = 'runner_failure' | 'denied' | 'task_failure';

/** runner 在命令执行前失败的致命 stderr 方言（大小写不敏感子串） */
const RUNNER_FAILURE_SIGNATURES: readonly string[] = [
  'no such file or directory',
  'command not found',
  'not found',
  'cannot execute',
  'exec format error',
  'enoent',
  // 中文 locale 方言（本机 LANG=zh_CN，实测 ls 报"没有那个文件或目录"）
  '没有那个文件或目录',
  '没有这个文件',
  '找不到命令',
  '未找到命令',
  '无法执行',
  '不是可执行文件',
];

/** 文件效应被拒的 stderr 方言（大小写不敏感子串） */
const DENIAL_SIGNATURES: readonly string[] = [
  'permission denied',
  'eacces',
  'eperm',
  'erofs',
  'read-only file system',
  'operation not permitted',
  // 中文 locale 方言
  '权限不够',
  '权限不足',
  '不允许的操作',
  '只读文件系统',
];

function matchAny(
  stderr: string,
  signatures: readonly string[]
): string | undefined {
  const lower = stderr.toLowerCase();
  for (const sig of signatures) {
    if (lower.includes(sig)) return sig;
  }
  return undefined;
}

/**
 * 对一次失败执行做结构化归因。
 *
 * @param stderr 命令或 runner 的 stderr 输出（可能为空）
 * @param exitCode 进程退出码；-1 表示超时/被 kill（由调用方先判 timeout）
 * @returns 归因类别；无法归因时返回 'task_failure'（保守，可重试）
 */
export function classifyFailure(
  stderr: string,
  exitCode: number
): FailureClass {
  // dsh: "Exit status alone never proves runner failure"——
  // 正常退出（0）不算失败归因；本分类器只处理非零退出
  if (exitCode === 0) return 'task_failure';
  if (!stderr) return 'task_failure';

  // 权限拒绝优先（文件效应被系统拒绝）
  const denied = matchAny(stderr, DENIAL_SIGNATURES);
  if (denied) return 'denied';

  // runner 未执行命令（二进制不存在/不可执行）
  const runner = matchAny(stderr, RUNNER_FAILURE_SIGNATURES);
  if (runner) return 'runner_failure';

  return 'task_failure';
}
