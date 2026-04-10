/**
 * Security Validator
 * Validates and sanitizes terminal commands for security
 */

/**
 * Default command whitelist (safe commands)
 */
export const DEFAULT_WHITELIST: string[] = [
  'ls',
  'pwd',
  'cd',
  'echo',
  'cat',
  'grep',
  'head',
  'tail',
  'wc',
  'sort',
  'uniq',
  'find',
  'which',
  'whereis',
  'date',
  'whoami',
  'id',
  'uname',
  'df',
  'du',
  'free',
  'ps',
  'top',
  'htop',
  'history',
  'git',
  'npm',
  'node',
  'python',
  'python3',
  'pip',
  'pip3',
  'pipenv',
  'poetry',
  'yarn',
  'cargo',
  'go',
  'rustc',
  'mvn',
  'gradle',
  'make',
  'cmake',
  'gcc',
  'g++',
  'clang',
  'clang++',
  'javac',
  'java',
  'javap',
  'scala',
  'ruby',
  'gem',
  'php',
  'perl',
  'r',
  'rscript',
  'tar',
  'gzip',
  'gunzip',
  'zip',
  'unzip',
  'xz',
  'bzip2',
  'file',
  'stat',
  'touch',
  'mkdir',
  'cp',
  'mv',
  'ln',
  'tree',
  'diff',
  'cmp',
  'patch',
  'bash',
  'sh',
  'zsh',
  'fish',
  'curl',
  'wget',
  'env',
  'printenv',
  'sed',
  'awk',
  'tr',
  'cut',
  'xargs',
  'tee',
  'jq',
  'docker',
  'kubectl',
  'terraform',
  'ansible',
];

/**
 * Default command blacklist (dangerous commands)
 */
export const DEFAULT_BLACKLIST: string[] = [
  'rm',
  'rmdir',
  'del',
  'format',
  'mkfs',
  'dd',
  'fdisk',
  'parted',
  'fdformat',
  'shutdown',
  'poweroff',
  'halt',
  'reboot',
  'init',
  'telinit',
  'systemctl',
  'service',
  'kill',
  'killall',
  'pkill',
  'chattr',
  'chmod',
  'chown',
  'passwd',
  'usermod',
  'userdel',
  'useradd',
  'groupadd',
  'groupdel',
  'su',
  'sudo',
  'visudo',
  'crontab',
  'at',
  'batch',
];

/**
 * Dangerous patterns — checked against the full command string
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+-rf\s+\//,
  />\s*\/dev\/sda/,
  />\s*\/dev\/hda/,
  /chmod\s+777\s+\//,
  /chown\s+root:root/,
  /:()\{:&};:/,
  /\beval\s*\(/,
  /\bexec\s+\$/,
  /python[3]?\s+-c\s+.*import\s+socket/,
  /python[3]?\s+-c\s+.*subprocess/,
  /perl\s+-e\s+.*socket/,
  /ruby\s+-e\s+.*TCPSocket/,
];

const DANGEROUS_PIPE_PATTERNS: RegExp[] = [
  /curl.*\|\s*(bash|sh|zsh|fish)/,
  /wget.*\|\s*(bash|sh|zsh|fish)/,
];

const ALL_DANGEROUS_PATTERNS: RegExp[] = [
  ...DANGEROUS_PATTERNS,
  ...DANGEROUS_PIPE_PATTERNS,
];

/**
 * Security configuration
 */
export interface SecurityConfig {
  whitelist: string[];
  blacklist: string[];
  allowUnknownCommands: boolean;
  sanitizeUserInput: boolean;
  maxCommandLength: number;
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  whitelist: DEFAULT_WHITELIST,
  blacklist: DEFAULT_BLACKLIST,
  allowUnknownCommands: true,
  sanitizeUserInput: true,
  maxCommandLength: 10000,
};

/**
 * Security validator class
 */
export class SecurityValidator {
  private config: SecurityConfig;

  constructor(config: SecurityConfig = DEFAULT_SECURITY_CONFIG) {
    this.config = config;
  }

  /**
   * Validate a command against security rules
   * @param command Command name (non-shell) or full command string (shell mode)
   * @param args Arguments (only used in non-shell mode)
   * @param shellMode Whether executing via shell
   */
  validateCommand(
    command: string,
    args: string[] = [],
    shellMode: boolean = false
  ): {
    valid: boolean;
    error?: string;
  } {
    const fullCommand =
      args.length > 0 ? [command, ...args].join(' ') : command;

    if (fullCommand.length > this.config.maxCommandLength) {
      return {
        valid: false,
        error: `Command exceeds maximum length of ${this.config.maxCommandLength}`,
      };
    }

    if (shellMode) {
      return this.validateShellCommand(fullCommand);
    }

    if (this.isBlacklisted(command)) {
      return {
        valid: false,
        error: `Command '${command}' is blacklisted for security reasons`,
      };
    }

    if (!this.config.allowUnknownCommands && !this.isWhitelisted(command)) {
      return {
        valid: false,
        error: `Command '${command}' is not in the whitelist`,
      };
    }

    const dangerousPattern = this.findDangerousPattern(fullCommand);
    if (dangerousPattern) {
      return {
        valid: false,
        error: `Command contains dangerous pattern: ${dangerousPattern}`,
      };
    }

    if (this.config.sanitizeUserInput) {
      for (let i = 0; i < args.length; i++) {
        if (this.containsShellInjection(args[i])) {
          return {
            valid: false,
            error: `Argument ${i + 1} contains potential shell injection`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate a shell-mode command
   */
  private validateShellCommand(fullCommand: string): {
    valid: boolean;
    error?: string;
  } {
    const pattern = this.findDangerousPattern(fullCommand);
    if (pattern) {
      return {
        valid: false,
        error: `Command contains dangerous pattern: ${pattern}`,
      };
    }

    const firstWord = fullCommand.trim().split(/\s+/)[0];
    if (this.isBlacklisted(firstWord)) {
      return {
        valid: false,
        error: `Command '${firstWord}' is blacklisted for security reasons`,
      };
    }

    return { valid: true };
  }

  private isInList(command: string, list: string[]): boolean {
    const commandName = command.split(' ')[0];
    return list.includes(commandName);
  }

  private isWhitelisted(command: string): boolean {
    return this.isInList(command, this.config.whitelist);
  }

  private isBlacklisted(command: string): boolean {
    return this.isInList(command, this.config.blacklist);
  }

  private findDangerousPattern(command: string): string | null {
    for (const pattern of ALL_DANGEROUS_PATTERNS) {
      if (pattern.test(command)) return pattern.source;
    }
    return null;
  }

  private static readonly INJECTION_PATTERNS = [/;/, /`/, /\$\(/, /\\n/, /\\r/];

  private containsShellInjection(input: string): boolean {
    return SecurityValidator.INJECTION_PATTERNS.some((p) => p.test(input));
  }
}

// Export singleton instance
export const securityValidator = new SecurityValidator();
