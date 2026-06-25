/**
 * Command Context
 * Data carrier passed through the CommandPipeline
 */

export interface SourceTrace {
  type: 'verified' | 'inferred' | 'generated';
  timestamp: string;
  origin: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface CommandCtx {
  // Input
  command: string;
  cmdArgs?: string[];
  caller: string;
  session_id?: string;
  shell: boolean;
  timeout?: number;
  reasoning?: string;
  expected_outcome?: string;
  authorization_id?: string;

  // Validation surrogate (e.g., shell builtin 'export ...' → 'echo ...' for security check only)
  commandForValidation: string;

  // Runtime state (flow control)
  rejected: boolean;
  rejectReason?: string;
  rejectCategory?: string;

  // Output
  result?: {
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
  };
  sourceTrace?: SourceTrace[];

  // Session context (loaded by middleware)
  session?: {
    id: string;
    working_directory?: string;
    environment?: Record<string, string>;
  };

  reject(reason: string, category?: string): void;
}

export function createCommandCtx(args: Record<string, unknown>): CommandCtx {
  const command = (args['command'] as string) || '';
  const ctx: CommandCtx = {
    command,
    commandForValidation: command,
    cmdArgs: (args['args'] as string[]) || [],
    caller: (args['caller'] as string) || '',
    session_id: args['session_id'] as string | undefined,
    shell: (args['shell'] as boolean) || false,
    timeout: args['timeout'] as number | undefined,
    reasoning: args['reasoning'] as string | undefined,
    expected_outcome: args['expected_outcome'] as string | undefined,
    authorization_id: args['authorization_id'] as string | undefined,
    rejected: false,
    reject(reason: string, category?: string) {
      this.rejected = true;
      this.rejectReason = reason;
      this.rejectCategory = category;
    },
  };
  return ctx;
}
