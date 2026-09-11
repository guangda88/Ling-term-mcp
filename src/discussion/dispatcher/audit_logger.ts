/**
 * AuditLogger — JSONL 审计日志
 *
 * 所有续轮动作写 JSONL 审计日志到指定路径。
 * 文件权限 0600。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditEntry } from '../types.js';

export class AuditLogger {
  private readonly auditPath: string;
  private writes: number = 0;
  private failures: number = 0;

  constructor(auditPath?: string) {
    this.auditPath =
      auditPath ?? path.join(os.homedir(), '.lingxi', 'discussion_audit.jsonl');
  }

  append(entry: AuditEntry): void {
    try {
      const line = JSON.stringify(entry, null, 2) + '\n';
      fs.mkdirSync(path.dirname(this.auditPath), { recursive: true });
      fs.appendFileSync(this.auditPath, line, 'utf8');
      this.writes++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[AuditLogger] write failed: ${msg}`);
      this.failures++;
    }
  }

  get writesCount(): number {
    return this.writes;
  }

  get failuresCount(): number {
    return this.failures;
  }
}
