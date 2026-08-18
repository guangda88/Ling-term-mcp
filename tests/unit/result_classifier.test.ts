/**
 * result_classifier — stderr 方言归因单元测试
 * 对齐 dsh ConfinedArgv: denialSignatures / runnerFailureRules 语义
 */

import { classifyFailure } from '../../src/common/result_classifier';

describe('classifyFailure', () => {
  it('exit_code=0 不算失败归因（task_failure 保守兜底）', () => {
    expect(classifyFailure('everything fine', 0)).toBe('task_failure');
  });

  it('空 stderr 归为 task_failure（保守，可重试）', () => {
    expect(classifyFailure('', 1)).toBe('task_failure');
  });

  it('permission denied 归为 denied（文件效应被拒）', () => {
    expect(classifyFailure('cat: /etc/shadow: Permission denied', 1)).toBe(
      'denied'
    );
  });

  it('EACCES 归为 denied', () => {
    expect(classifyFailure('EACCES: permission denied', 1)).toBe('denied');
  });

  it('EPERM / operation not permitted 归为 denied', () => {
    expect(classifyFailure('Operation not permitted', 1)).toBe('denied');
  });

  it('EROFS / read-only file system 归为 denied', () => {
    expect(classifyFailure('Read-only file system', 1)).toBe('denied');
  });

  it('command not found 归为 runner_failure（命令未跑起来）', () => {
    expect(classifyFailure('/bin/sh: foo: command not found', 1)).toBe(
      'runner_failure'
    );
  });

  it('ENOENT / no such file 归为 runner_failure', () => {
    expect(classifyFailure('spawn foo ENOENT', 1)).toBe('runner_failure');
    expect(classifyFailure('No such file or directory', 1)).toBe(
      'runner_failure'
    );
  });

  it('cannot execute / exec format error 归为 runner_failure', () => {
    expect(classifyFailure('cannot execute binary file', 1)).toBe(
      'runner_failure'
    );
    expect(classifyFailure('Exec format error', 1)).toBe('runner_failure');
  });

  it('普通任务失败（exit 非零 + 业务 stderr）归为 task_failure', () => {
    // 业务错误（如 grep 无匹配、测试失败）不匹配任何签名 → task_failure
    expect(classifyFailure('grep: no lines matched', 1)).toBe('task_failure');
    expect(classifyFailure('test suite failed: 3 errors', 1)).toBe(
      'task_failure'
    );
  });

  it('大小写不敏感匹配', () => {
    expect(classifyFailure('PERMISSION DENIED', 1)).toBe('denied');
    expect(classifyFailure('Command Not Found', 1)).toBe('runner_failure');
  });
});
