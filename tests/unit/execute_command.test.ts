/**
 * Tool: execute_command
 */

import { executeCommand } from '../../src/tools/execute_command';

describe('execute_command', () => {
  it('should execute simple command successfully', async () => {
    const result = await executeCommand.handler({
      command: 'echo',
      args: ['Hello, World!'],
    });

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    expect(result.content[0].text).toContain('Hello, World!');
  });

  it('should handle command errors', async () => {
    const result = await executeCommand.handler({
      command: 'nonexistent_command',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Error');
  });

  it('should require command parameter', async () => {
    await expect(executeCommand.handler({ command: '' })).rejects.toThrow();
  });
});
