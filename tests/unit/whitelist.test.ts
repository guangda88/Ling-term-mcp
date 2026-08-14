import { whitelistCheck } from '../../src/middleware/whitelist';
import { securityValidator } from '../../src/security/validator';
import { logRejection } from '../../src/audit/rejection_log';

jest.mock('../../src/security/validator', () => ({
  securityValidator: {
    categorize: jest.fn(),
    validateCommand: jest.fn(),
  },
}));

jest.mock('../../src/audit/rejection_log', () => ({
  logRejection: jest.fn(),
}));

describe('whitelistCheck middleware', () => {
  const mockCtx = {
    command: 'unknown-cmd --flag',
    commandForValidation: 'unknown-cmd --flag',
    cmdArgs: ['--flag'],
    caller: 'lingxi',
    session_id: 'test-session',
    shell: false,
    reject: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (securityValidator.categorize as jest.Mock).mockReturnValue('unknown');
  });

  it('should pass through non-unknown commands', () => {
    (securityValidator.categorize as jest.Mock).mockReturnValue('whitelist');
    const result = whitelistCheck(mockCtx as any);
    expect(result).toBe(mockCtx);
    expect(mockCtx.reject).not.toHaveBeenCalled();
  });

  it('should validate unknown commands', () => {
    (securityValidator.validateCommand as jest.Mock).mockReturnValue({
      valid: true,
    });

    whitelistCheck(mockCtx as any);

    expect(securityValidator.validateCommand).toHaveBeenCalledWith(
      mockCtx.commandForValidation,
      mockCtx.cmdArgs,
      mockCtx.shell
    );
    expect(mockCtx.reject).not.toHaveBeenCalled();
  });

  it('should reject invalid unknown commands', () => {
    (securityValidator.validateCommand as jest.Mock).mockReturnValue({
      valid: false,
      error: 'dangerous pattern detected',
    });

    whitelistCheck(mockCtx as any);

    expect(logRejection).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'unknown',
      })
    );
    expect(mockCtx.reject).toHaveBeenCalledWith(
      'dangerous pattern detected',
      'unknown'
    );
  });

  it('should handle shell mode with empty cmdArgs', () => {
    const shellCtx = { ...mockCtx, shell: true, cmdArgs: undefined };
    (securityValidator.validateCommand as jest.Mock).mockReturnValue({
      valid: true,
    });

    whitelistCheck(shellCtx as any);

    expect(securityValidator.validateCommand).toHaveBeenCalledWith(
      shellCtx.commandForValidation,
      [],
      true
    );
  });
});
