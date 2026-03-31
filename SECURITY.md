# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately:

- **GitHub**: Open a private security advisory at https://github.com/guangda/ling-term-mcp/security/advisories/new
- **Email**: Contact the maintainer directly

Please do not file public issues for security vulnerabilities.

## Security Architecture

Ling-term-mcp implements a multi-layer security model for command execution:

### 1. Parameterized Execution

All commands are executed via `execFile()` (not `exec()`), passing arguments as an array. This bypasses shell interpretation entirely, eliminating shell injection vectors.

### 2. Command Blacklist (always enforced)

The following commands are **always blocked**, regardless of configuration:

```
rm, rmdir, del, format, mkfs, dd, fdisk, parted, shutdown, poweroff,
halt, reboot, init, telinit, systemctl, service, kill, killall, pkill,
chattr, chmod, chown, passwd, usermod, userdel, useradd, groupadd,
groupdel, su, sudo, visudo, crontab, at, batch
```

### 3. Command Whitelist (optional, disabled by default)

When `allowUnknownCommands` is set to `false`, only commands in the whitelist are permitted. The default whitelist includes 90+ commonly used safe commands (ls, git, npm, node, python, etc.).

### 4. Dangerous Pattern Detection

The validator detects and blocks dangerous patterns including:

- Combined destructive commands (`&& rm -rf`, `; rm -rf`)
- Piped execution (`curl | bash`, `wget | sh`)
- Fork bombs (`:(){:|:&};:`)
- `eval` and `exec` usage
- Output redirection to device files (`> /dev/sda`)
- Privilege escalation patterns (`chmod 777 /`, `chown root:root`)

### 5. Argument Sanitization

When `sanitizeUserInput` is enabled (default), arguments are checked for:

- Command chaining characters (`&&`, `||`, `;`)
- Pipe characters (`|`)
- Redirection operators (`>`, `<`)
- Variable expansion (`$`, `$()`)
- Command substitution (backticks)
- Newline injection (`\n`, `\r`)

## Default Configuration

```typescript
{
  allowUnknownCommands: true,   // Blacklist-only mode
  sanitizeUserInput: true,      // Filter injection characters
  maxCommandLength: 10000       // Max command length in characters
}
```

## Recommendations for Production

1. **Enable whitelist mode**: Set `allowUnknownCommands: false` to restrict execution to known safe commands only.

2. **Customize lists**: Review and adjust the blacklist and whitelist to match your environment's needs.

3. **Audit logging**: Monitor command execution logs for unusual activity.

4. **Principle of least privilege**: Run the MCP server under a user account with minimal system permissions.

5. **Network isolation**: Run in a containerized or sandboxed environment when possible.
