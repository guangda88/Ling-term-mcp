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
  // Languages/runtimes: python, node retained for dev workflow
  'node',
  'python',
  'python3',
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
  'sed',
  'awk',
  'tr',
  'cut',
  'xargs',
  'tee',
  'jq',
  'sleep',
  'true',
  'false',
  'test',
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
  'mkswap',
  'iptables',
  'ufw',
  'ip',
];

export const RED_ZONE_COMMANDS: string[] = [
  'ssh',
  'scp',
  'rsync',
  'sftp',
  'curl',
  'wget',
  'nc',
  'ncat',
  'nmap',
  'dig',
  'nslookup',
  'host',
  'traceroute',
  'ping',
  'apt',
  'apt-get',
  'dnf',
  'yum',
  'pacman',
  'apk',
  'npm',
  'npx',
  'pip',
  'pip3',
  'docker',
  'podman',
  'kubectl',
  'helm',
  'terraform',
  'ansible',
];

export type CommandCategory =
  | 'whitelisted'
  | 'red_zone'
  | 'blacklisted'
  | 'unknown';

/**
 * Dangerous patterns — checked against the full command string
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*\s+\//,
  /rm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*\s+\//,
  /rm\s+-rf?\s+[^\s]/,
  /rm\s+-fr?\s+[^\s]/,
  />\s*\/dev\/sda/,
  />\s*\/dev\/hda/,
  />\s*\/dev\/null/,
  /chmod\s+777\s+/,
  /chown\s+root:root/,
  /:()\{:&};:/,
  /\beval\s*\(/,
  /\bexec\s+\$/,
  /\$\(\s*curl/,
  /\$\(\s*wget/,
  /python[3]?\s+-c\s+.*import\s+socket/,
  /python[3]?\s+-c\s+.*subprocess/,
  /python[3]?\s+-c\s+.*os\.system/,
  /perl\s+-e\s+.*socket/,
  /ruby\s+-e\s+.*TCPSocket/,
  /\bmkfifo\s+/,
  /\bnc\s+-[el]/,
  /\bsocat\s+/,
  /\bsudo\s+/,
  /\bsu\s+/,
  /\bfind\s+.*-(exec|execdir|ok|okdir)\s+/,
  /\bfind\s+.*-delete\b/,
  /\bxargs\s+rm\b/,
  /\brm\s+.*(\.git\/|\.crush\/|\.ling-term-mcp\/|crush\.db)/,
  /\brm\s+.*\/home\/ai\/$/,
  /\bgit\s+config\s+.*(--global|--system)\s+(core\.hooksPath|init\.templatedir|credential\.helper)\b/,
  /\bgit\s+.*core\.hooksPath/,
  /\bgit\s+push\s+.*(--force|-f\b)/,
  /\bgit\s+reset\s+--hard/,
  /\bmkswap\b/,
  /\biptables\s+-[AIFDRX]/,
  /\bufw\s+(disable|allow|deny|default)/,
  /\bip\s+(route|addr|link)\s+(del|flush)/,
];

const DANGEROUS_PIPE_PATTERNS: RegExp[] = [
  /curl.*\|\s*(bash|sh|zsh|fish)/i,
  /wget.*\|\s*(bash|sh|zsh|fish)/i,
  /curl.*\s+\|\s*.*sh\b/,
  /wget.*\s+\|\s*.*sh\b/,
  /\|\s*bash\b/,
  /\|\s*sh\b/,
  /\|\s*python\b/,
  /\|\s*perl\b/,
  /\|\s*ruby\b/,
  /\|\s*php\b/,
];

const ALL_DANGEROUS_PATTERNS: RegExp[] = [
  ...DANGEROUS_PATTERNS,
  ...DANGEROUS_PIPE_PATTERNS,
];

const INTERPRETER_RCE_FLAGS: Record<string, RegExp[]> = {
  node: [/^-e$/, /^--eval$/],
  python: [/^-c$/],
  python3: [/^-c$/],
  perl: [/^-e$/],
  ruby: [/^-e$/],
  php: [/^-r$/],
};

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
  allowUnknownCommands: false,
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

    if (shellMode && this.config.sanitizeUserInput) {
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
   * Validate a shell-mode command.
   * Splits by safe chaining operators (&&, ||, |) and validates EVERY command
   * in the chain, not just the first word. Blocks dangerous metacharacters.
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

    const BLOCKED_METACHARS = [/;/, /`/, /\$\(/];
    for (const metachar of BLOCKED_METACHARS) {
      if (metachar.test(fullCommand)) {
        return {
          valid: false,
          error: `Shell operator '${metachar.source}' is blocked for security reasons`,
        };
      }
    }

    const segments = fullCommand.split(/\s*(&&|\|\||\|)\s*/);
    const subCommands: string[] = [];
    for (let i = 0; i < segments.length; i += 2) {
      const cmd = segments[i].trim();
      if (cmd) subCommands.push(cmd);
    }

    if (subCommands.length === 0) {
      return { valid: false, error: 'No valid command found' };
    }

    for (const subCmd of subCommands) {
      const firstWord = subCmd.trim().split(/\s+/)[0];
      if (!firstWord) continue;

      if (this.isBlacklisted(firstWord)) {
        return {
          valid: false,
          error: `Command '${firstWord}' is blacklisted for security reasons`,
        };
      }

      if (!this.config.allowUnknownCommands && !this.isWhitelisted(firstWord)) {
        return {
          valid: false,
          error: `Command '${firstWord}' is not in the whitelist`,
        };
      }

      const rceError = this.checkInterpreterRceFlags(firstWord, subCmd);
      if (rceError) {
        return { valid: false, error: rceError };
      }
    }

    return { valid: true };
  }

  /**
   * Check if a whitelisted interpreter is called with RCE-enabling flags.
   * Prevents: node -e "code", python -c "code", perl -e "code", ruby -e "code"
   */
  private checkInterpreterRceFlags(
    command: string,
    fullCommand: string
  ): string | null {
    const patterns = INTERPRETER_RCE_FLAGS[command];
    if (!patterns) return null;

    const parts = fullCommand.trim().split(/\s+/);
    for (let i = 1; i < parts.length; i++) {
      for (const flagPattern of patterns) {
        if (flagPattern.test(parts[i])) {
          return `Interpreter '${command}' flag '${parts[i]}' allows arbitrary code execution and is blocked`;
        }
      }
    }
    return null;
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

  isRedZone(command: string): boolean {
    return RED_ZONE_COMMANDS.includes(command.split(' ')[0]);
  }

  categorize(command: string): CommandCategory {
    const cmd = command.split(' ')[0];
    if (this.isInList(cmd, this.config.blacklist)) return 'blacklisted';
    if (RED_ZONE_COMMANDS.includes(cmd)) return 'red_zone';
    if (this.findDangerousPattern(command)) return 'red_zone';
    if (this.isInList(cmd, this.config.whitelist)) return 'whitelisted';
    return 'unknown';
  }

  hasDangerousPattern(command: string): string | null {
    return this.findDangerousPattern(command);
  }

  private findDangerousPattern(command: string): string | null {
    for (const pattern of ALL_DANGEROUS_PATTERNS) {
      if (pattern.test(command)) return pattern.source;
    }
    return null;
  }

  /**
   * Check only dangerous patterns and blocked metacharacters,
   * without whitelist/blacklist validation. Used for shell builtins
   * which are not in the whitelist but are safe to execute.
   */
  validateCommandPatternsOnly(command: string): {
    valid: boolean;
    error?: string;
  } {
    const pattern = this.findDangerousPattern(command);
    if (pattern) {
      return {
        valid: false,
        error: `Command contains dangerous pattern: ${pattern}`,
      };
    }

    const BLOCKED_METACHARS = [/;/, /`/, /\$\(/];
    for (const metachar of BLOCKED_METACHARS) {
      if (metachar.test(command)) {
        return {
          valid: false,
          error: `Shell operator '${metachar.source}' is blocked for security reasons`,
        };
      }
    }

    return { valid: true };
  }

  private static readonly INJECTION_PATTERNS = [/;/, /`/, /\$\(/, /\\n/, /\\r/];

  private containsShellInjection(input: string): boolean {
    return SecurityValidator.INJECTION_PATTERNS.some((p) => p.test(input));
  }
}

// Export singleton instance
export const securityValidator = new SecurityValidator();
