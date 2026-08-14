import { redZoneAuth } from '../../src/middleware/redzone';
import { securityValidator } from '../../src/security/validator';
import { checkRedZoneAuthorization } from '../../src/tools/authorize';
import { logRejection } from '../../src/audit/rejection_log';

jest.mock('../../src/security/validator', () => ({
  securityValidator: {
    categorize: jest.fn(),
  },
}));

jest.mock('../../src/tools/authorize', () => ({
  checkRedZoneAuthorization: jest.fn(),
}));

jest.mock('../../src/audit/rejection_log', () => ({
  logRejection: jest.fn(),
}));

describe('redZoneAuth middleware', () => {
  const mockCtx = {
    command: 'rm -rf /tmp/test',
    commandForValidation: 'rm -rf /tmp/test',
    caller: 'lingxi',
    authorization_id: undefined as string | undefined,
    session_id: 'test-session',
    shell: false,
    reject: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (securityValidator.categorize as jest.Mock).mockReturnValue('unknown');
  });

  it('should pass through non-red-zone commands', () => {
    (securityValidator.categorize as jest.Mock).mockReturnValue('whitelist');
    const result = redZoneAuth(mockCtx as any);
    expect(result).toBe(mockCtx);
    expect(mockCtx.reject).not.toHaveBeenCalled();
  });

  it('should reject red-zone command without authorization', () => {
    (securityValidator.categorize as jest.Mock).mockReturnValue('red_zone');
    mockCtx.authorization_id = undefined;

    redZoneAuth(mockCtx as any);

    expect(logRejection).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'red_zone',
      })
    );
    expect(mockCtx.reject).toHaveBeenCalledWith(
      expect.stringContaining('requires authorization'),
      'red_zone'
    );
  });

  it('should check authorization when provided', () => {
    (securityValidator.categorize as jest.Mock).mockReturnValue('red_zone');
    mockCtx.authorization_id = 'auth-123';
    (checkRedZoneAuthorization as jest.Mock).mockReturnValue({
      allowed: true,
    });

    redZoneAuth(mockCtx as any);

    expect(checkRedZoneAuthorization).toHaveBeenCalledWith(
      'auth-123',
      mockCtx.command,
      mockCtx.caller
    );
    expect(mockCtx.reject).not.toHaveBeenCalled();
  });

  it('should reject when authorization fails', () => {
    (securityValidator.categorize as jest.Mock).mockReturnValue('red_zone');
    mockCtx.authorization_id = 'auth-123';
    (checkRedZoneAuthorization as jest.Mock).mockReturnValue({
      allowed: false,
      error: 'token expired',
    });

    redZoneAuth(mockCtx as any);

    expect(logRejection).toHaveBeenCalled();
    expect(mockCtx.reject).toHaveBeenCalledWith(
      expect.stringContaining('token expired'),
      'red_zone'
    );
  });
});
