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
  'bash',
  'zsh',
  'fish',
  'sh',
  'curl',
  'wget',
  'tar',
  'gzip',
  'gunzip',
  'zip',
  'unzip',
  'xz',
  'bzip2',
  'file',
  'stat',
  'chmod',
  'chown',
  'touch',
  'mkdir',
  'rmdir',
  'cp',
  'mv',
  'rm',
  'ln',
  'tree',
  'diff',
  'cmp',
  'patch',
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
 * Dangerous patterns
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /&&\s*rm\s+-rf/,  // rm -rf combined with && or ||
  /\|\|\s*rm\s+-rf/,
  /;.*rm\s+-rf/,
  />\s*\/dev\/null/,
  />\s*\/dev\/sda/,
  />\s*\/dev\/hda/,
  /&&\s*dd\s+if=/,
  /\|\|\s*dd\s+if=/,
  /;\s*dd\s+if=/,
  /chmod\s+777\s+\//,
  /chown\s+root:root/,
  /curl.*\|\s*bash/,
  /wget.*\|\s*bash/,
  /curl.*\|\s*sh/,
  /wget.*\|\s*sh/,
  /:(){:\|:&};:/,  // fork bomb
  /eval\s*\(/,
  /exec\s+\$/,
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
  allowUnknownCommands: true, // Warning: setting to true is less secure
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
   */
  validateCommand(command: string, args: string[] = []): {
    valid: boolean;
    error?: string;
  } {
    // Check command length
    const fullCommand = args.length > 0 ? [command, ...args].join(' ') : command;
    if (fullCommand.length > this.config.maxCommandLength) {
      return {
        valid: false,
        error: `Command exceeds maximum length of ${this.config.maxCommandLength}`,
      };
    }

    // Check blacklist first (always deny)
    if (this.isBlacklisted(command)) {
      return {
        valid: false,
        error: `Command '${command}' is blacklisted for security reasons`,
      };
    }

    // Check whitelist if unknown commands are not allowed
    if (!this.config.allowUnknownCommands && !this.isWhitelisted(command)) {
      return {
        valid: false,
        error: `Command '${command}' is not in the whitelist`,
      };
    }

    // Check for dangerous patterns
    const dangerousPattern = this.findDangerousPattern(fullCommand);
    if (dangerousPattern) {
      return {
        valid: false,
        error: `Command contains dangerous pattern: ${dangerousPattern}`,
      };
    }

    // Sanitize arguments if enabled
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
   * Check if a command is in the whitelist
   */
  private isWhitelisted(command: string): boolean {
    const commandName = command.split(' ')[0];
    return this.config.whitelist.includes(commandName);
  }

  /**
   * Check if a command is in the blacklist
   */
  private isBlacklisted(command: string): boolean {
    const commandName = command.split(' ')[0];
    return this.config.blacklist.includes(commandName);
  }

  /**
   * Find dangerous patterns in command
   */
  private findDangerousPattern(command: string): string | null {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        return pattern.source;
      }
    }
    return null;
  }

  /**
   * Check for shell injection patterns
   */
  private containsShellInjection(input: string): boolean {
    const injectionPatterns = [
      /&&/,       // Command chaining
      /\|\|/,     // OR chaining
      /;/,        // Command separator
      /\|/,       // Pipe (may be legitimate, but check context)
      />\s*\w+/,  // Output redirection
      /<\s*\w+/,  // Input redirection
      /\$/,       // Variable expansion
      /`/,        // Command substitution
      /\$\(/,     // Command substitution
      /\\n/,      // Newline
      /\\r/,      // Carriage return
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.test(input)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input: string): string {
    // Remove dangerous characters
    return input
      .replace(/[;&|`$()<>\\]/g, '')
      .trim();
  }

  /**
   * Update security configuration
   */
  updateConfig(config: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const securityValidator = new SecurityValidator();
