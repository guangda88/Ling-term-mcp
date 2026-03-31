/**
 * Security Validator Tests
 */

import {
  SecurityValidator,
  DEFAULT_SECURITY_CONFIG,
} from '../../src/security/validator';

// These are used in tests below

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
      // Create a very long string that exceeds 1000 chars
      // 'echo ' is 5 chars, so we need at least 996 'a's
      const longString = Array(1000).fill('a').join('');
      const result = validator.validateCommand('echo', [longString]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should reject dangerous patterns', () => {
      const result = validator.validateCommand('cat', ['&&', 'rm', '-rf', '/']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous pattern');
    });

    it('should reject shell injection patterns', () => {
      const result = validator.validateCommand('cat', ['file.txt; rm -rf /']);
      expect(result.valid).toBe(false);
      // The semicolon triggers dangerous pattern detection before shell injection check
      expect(result.error).toBeDefined();
    });
  });

  describe('sanitizeInput', () => {
    it('should remove dangerous characters', () => {
      const result = validator.sanitizeInput('ls && rm -rf /');
      // Removes & and spaces, but keeps /
      expect(result).toBe('ls  rm -rf /');
    });

    it('should remove pipe characters', () => {
      const result = validator.sanitizeInput('cat file | grep test');
      expect(result).not.toContain('|');
    });

    it('should trim whitespace', () => {
      const result = validator.sanitizeInput('  ls  ');
      expect(result).toBe('ls');
    });

    it('should remove backticks', () => {
      const result = validator.sanitizeInput('ls `whoami`');
      expect(result).not.toContain('`');
    });

    it('should remove dollar signs', () => {
      const result = validator.sanitizeInput('echo $HOME');
      expect(result).not.toContain('$');
    });
  });

  describe('updateConfig', () => {
    it('should update whitelist', () => {
      validator.updateConfig({ whitelist: ['ls', 'cat', 'grep'] });
      const config = validator.getConfig();
      expect(config.whitelist).toHaveLength(3);
      expect(config.whitelist).toContain('grep');
    });

    it('should update blacklist', () => {
      validator.updateConfig({ blacklist: ['rm', 'dd', 'chmod'] });
      const config = validator.getConfig();
      expect(config.blacklist).toHaveLength(3);
      expect(config.blacklist).toContain('chmod');
    });

    it('should update allowUnknownCommands', () => {
      validator.updateConfig({ allowUnknownCommands: true });
      const config = validator.getConfig();
      expect(config.allowUnknownCommands).toBe(true);
    });

    it('should update maxCommandLength', () => {
      validator.updateConfig({ maxCommandLength: 5000 });
      const config = validator.getConfig();
      expect(config.maxCommandLength).toBe(5000);
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
      const dangerousCommands = ['rm', 'rmdir', 'dd', 'sudo', 'killall'];
      dangerousCommands.forEach((cmd) => {
        expect(DEFAULT_SECURITY_CONFIG.blacklist).toContain(cmd);
      });
    });
  });
});
