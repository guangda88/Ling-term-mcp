# Changelog

All notable changes to Ling-term-mcp (灵犀) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-10

### Added

#### Dual-Mode Execution

- **Shell mode** (`shell: true`) — execute commands via `/bin/sh -c`, enabling pipes (`|`), chaining (`&&`, `||`), redirects, and shell builtins (`cd`, `export`, `source`)
- **Non-shell mode** (default) — direct binary execution via `execFile` for safety
- Shell-specific security validation path (`validateShellCommand`)

#### Session State Tracking

- Automatic `cd` target parsing — updates session `working_directory` after shell commands
- Automatic `export` parsing — captures env vars into session `environment`
- Per-session command history (max 100 entries, persisted to disk)

#### Security Improvements

- Relaxed `containsShellInjection()` — only blocks `;`, backticks, `$()`, `\n`, `\r` (removed over-aggressive `&&`, `||`, `|`, `$` blocks)
- New `DANGEROUS_PIPE_PATTERNS` — detects `curl|bash`, `wget|sh` injection patterns
- `bash`, `sh`, `zsh`, `fish`, `curl`, `wget` moved from blacklist to whitelist
- Unified `ALL_DANGEROUS_PATTERNS` array for consistent pattern matching

#### Reliability

- Env variable blacklist approach (filters SECRET/PASSWORD/TOKEN/API_KEY etc.) — passes ~50+ vars instead of old 9-var whitelist
- Output truncation at 10,000 chars (head 5K + tail 5K) to prevent memory issues
- Configurable `timeout` parameter (1s–600s, default 60s)
- Lazy session store initialization — reads disk once, skips on subsequent calls

### Changed

- Simplified `isWhitelisted`/`isBlacklisted` into unified `isInList(list)` method
- `containsShellInjection` patterns extracted to static class constant
- Error handler in `execute_command` compacted (12→7 lines)
- `BLOCKED_ENV_PATTERNS` array merged into single regex `BLOCKED_ENV_RE`
- Nested ternary for `fullCmd` flattened to simple conditional

### Removed

- `src/sessions/manager.ts` — dead code
- `src/types.ts` — dead code
- `test:integration` script from package.json

### Testing

- **95 tests** (87 unit + 8 integration), all passing
- **98% statement coverage**, 89% branches, 98% functions
- New integration test suite: full session lifecycle, shell mode, concurrent sessions, env isolation
- 0 lint errors, clean TypeScript build

## [1.0.0] - 2026-03-24

### Added

#### Core Features

- **execute_command** tool - Execute terminal commands with security validation
- **sync_terminal** tool - Synchronize terminal state (directory, environment)
- **list_sessions** tool - List all active terminal sessions
- **create_session** tool - Create new terminal sessions with custom working directories
- **destroy_session** tool - Terminate active sessions

#### Security

- Command whitelist with 74 safe commands
- Command blacklist with 41 dangerous commands (rm, sudo, chmod, etc.)
- Dangerous pattern detection:
  - Shell injection (`; | & $ ( ) <> \`)
  - Privilege escalation (`chmod 777 /`, `&& rm -rf`)
  - Fork bombs (`:(){:\|:&};:`)
  - `eval` and `exec` patterns
- Input sanitization (removes special shell characters)
- Configurable security settings:
  - `allowUnknownCommands`: boolean
  - `sanitizeUserInput`: boolean
  - `maxCommandLength`: number

#### Performance Monitoring

- Execution result tracking with timestamps
- Metrics calculation:
  - Average execution time
  - P50, P95, P99 percentiles
  - Error rate (per-command and overall)
- Performance report generation
- Threshold checking for SLA compliance
- Memory leak detection capabilities
- `withPerformanceTracking()` wrapper for automatic instrumentation
- Latency buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000] ms

#### Testing

- **Unit tests**: 74 tests, all passing
  - Security validation: 16 tests
  - Performance monitoring: 12 tests
  - Command execution: 14 tests
  - Terminal synchronization: 7 tests
  - Session store: 10 tests
  - Session management: 6 tests
  - List sessions: 5 tests
  - Destroy session: 4 tests
- Code coverage: 97%+ statements, 100% functions
- E2E test framework (deferred - needs MCP protocol rewrite)
- Stress testing framework (deferred - needs MCP protocol rewrite)

#### Optimization

- **LingMinOpt integration** for parameter optimization
- Search space: 4096 possible configurations
- Optimization completed in 47.05 seconds (23 experiments)
- Best configuration:
  ```json
  {
    "max_connections": 500,
    "ping_interval": 5,
    "command_timeout": 30,
    "output_buffer_size": 10000,
    "session_cache_ttl": 3600,
    "log_level": "warn"
  }
  ```
- Performance metrics:
  - Response time: 87ms (target: <100ms) ✅
  - Throughput: 124 req/s (target: >100 req/s) ✅
  - Memory usage: 76MB (target: <100MB) ✅
  - Error rate: 0.3% (target: <1%) ✅

#### Documentation

- Comprehensive README with quick start guide
- API documentation (`docs/API.md`)
- User guide (`docs/USER_GUIDE.md`)
- Implementation plan (`IMPLEMENTATION_PLAN.md`)
- Contributing guidelines (`CONTRIBUTING.md`)
- Release notes (`RELEASE_NOTES.md`)
- Release checklist (`RELEASE_CHECKLIST.md`)
- This CHANGELOG

#### Package

- Optimized npm package: 23.8 kB (52 files)
- TypeScript definitions included (.d.ts)
- Source maps included (.js.map)
- MIT license
- Node.js >=18.0.0 required
- Binary CLI: `ling-term-mcp`

### Changed

- Session management to support multiple concurrent sessions
- Command execution to integrate security validation
- Performance monitoring to track all tool executions

### Security

- All commands validated against whitelist/blacklist before execution
- Pattern matching prevents shell injection attacks
- Input sanitization removes dangerous characters

### Performance

- Response time optimized to <100ms average
- Memory usage optimized to <100MB
- Throughput optimized to >100 req/s

---

## [Unreleased]

### Added

#### HTTP Proxy Security (M3-M5)

- **Bearer token authentication** for HTTP proxy — opt-in via `authToken` param or `LING_TERM_AUTH_TOKEN` env var
- **Per-IP rate limiting** with sliding window — configurable `windowMs` + `maxRequests`, returns standard 429 + Retry-After
- **Reusable HTTP proxy template** (`src/templates/mcp-http-proxy.ts`) — wrap any MCP Server factory with auth + rate limiting
- **Audit log** on command rejection path — `console.error` with caller identity for forensic visibility
- **29 unit tests** for security middleware:
  - 22 tests for HTTP proxy auth + rate limiting (checkAuth, checkRateLimit, edge cases)
  - 7 critical-path tests for execute_command (audit log, env blocklist, cd injection, error classification)

### Changed

- `docs/SECURITY_AUDIT.md` — findings #3/#4 updated to "Fixed", #14 to "Mitigated"

### Fixed

- M2 finding #11 (partial): audit logging for rejected commands in `execute_command`

Assisted-by: GLM-5.1 via Crush <crush@charm.land>

---

[1.0.0]: https://github.com/guangda/ling-term-mcp/releases/tag/v1.0.0
