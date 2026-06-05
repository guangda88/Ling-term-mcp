# Changelog

All notable changes to Ling-term-mcp (灵犀) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-06-05

### Added

#### Rejection Logging (Audit Blind Spot Fix)

- **`src/audit/rejection_log.ts`** — JSONL persistence for security-rejected commands with auto-rotation (max 10MB)
- **`execute_command.ts`** — all 5 rejection paths (blacklist, unknown command, red-zone, pattern, builtin pattern) now log to rejection_log
- **`gateway/queue.ts`** — 3 rejection paths (unknown source, rate limit, security validation) logged
- **`gateway/coordinator.ts`** — 2 rejection paths (unknown source, unauthorized critical) logged
- **`audit_report.ts`** — new `rejections` field (total, by_category, by_caller, recent)
- **`tests/unit/rejection_log.test.ts`** — 5 tests for write/rotation/read

#### Identity Refactor

- **`LING_FAMILY_MEMBERS`** reduced to 12 (zhibridge moved to `KNOWN_INFRASTRUCTURE`)
- **`KNOWN_INFRASTRUCTURE`** new export for non-member permitted callers (zhibridge)
- **`getMember()`** resolves both members and infrastructure

#### Gateway Health Endpoint

- **`/health`** endpoint on Streamable HTTP proxy (port 9529)

### Fixed

- **CRUSH.md** member table: zhibridge moved to non-member, lingcreate added as #12
- **safe-bash** fail-open → fail-closed (3 vulnerabilities patched)
- **identity.ts** lingcreate added to member list
- **README.md** test count updated 185→205, 15→16 suites

### Test Results

- **205 tests, 16 suites, all passing**
- TypeScript strict mode clean

---

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
- **87% line coverage**, 72% branches, 83% functions
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

- Command whitelist with 86 safe commands
- Command blacklist with 36 dangerous commands (rm, sudo, chmod, etc.)
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

- **lingminopt integration** for parameter optimization
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

#### Command Execution Gateway

- **Gateway server** (`src/gateway/`) — HTTP command execution gateway on port 9530
  - `server.ts` — Express server with source identity validation and rate limiting
  - `coordinator.ts` — Command dispatch with critical priority gate (lingflow_plus only)
  - `queue.ts` — Async command queue with per-source rate limiting (60 req/min)
  - `notify.ts` — Push notification client for gateway events
  - `types.ts` — Shared gateway types (DispatchRequest, DispatchResponse, CommandStatus)
- **CLI gateway mode** — `ling-term-mcp gateway` starts gateway server
- **audit_report MCP tool** — usage statistics, caller breakdown, command history, behavioral violations

#### Security Hardening

- **Shell metacharacter blocking** — `;`, backticks, `$()` rejected in shell mode
- **Per-segment validation** — shell commands split by `&&`/`||`/`|`, every segment validated
- **Interpreter RCE flag detection** — `node -e`, `python -c`, `perl -e`, `ruby -e`, `php -r` blocked
- **Whitelist-only mode** — `allowUnknownCommands: false` by default
- **Additional dangerous patterns** — `$(curl`, `$(wget`, `mkfifo`, `nc -el`, `socat`, `sudo`, `su`
- **Additional pipe patterns** — `| bash`, `| sh`, `| python`, `| perl`, `| ruby`, `| php`
- **Removed from whitelist** — `bash`, `sh`, `zsh`, `fish`, `curl`, `wget`, `env`, `printenv`, `docker`, `kubectl`, `terraform`, `ansible`
- **Added to whitelist** — `sleep`, `true`, `false`, `test`

#### Behavioral Contracts (SDTH Prevention)

- `self-driven-publish-guard` — blocks git push / external POST in self-driven task context
- `self-driven-scope-guard` — blocks writes outside declared output directory
- `self-driven-no-modify-shared` — blocks modification of other members' code

#### Authorization System (Red-Zone Hard Barrier)

- **require_authorization** MCP tool — request user approval for red-zone operations (modify shared code, publish, delete)
- **approve_authorization** MCP tool — approve/reject pending requests, only authorized callers can resolve
- **list_authorizations** MCP tool — list/filter authorization requests by status or caller
- In-memory request store with 10-minute TTL, auto-cleanup, max 100 pending
- 13 unit tests covering full lifecycle (create, approve, reject, expire, filter)

### Changed

- `identity.ts` — member directories updated to lowercase actual paths (`/home/ai/lingxi` etc.)
- `store.ts` — data directory follows XDG specification (`~/.local/share/ling-term-mcp`)
- `contracts.ts` — `checkBehavioralContracts()` now accepts optional `caller` parameter
- `CONTRIBUTING.md` — project structure updated with audit/, gateway/, protocol/, templates/
- `README.md` — test count updated (185), whitelist policy updated

### Fixed

- `src/tools/authorize.ts` — new file with require/approve/list authorization tools
- `src/index.ts` — register 3 new authorization MCP tools
- Shell injection tests for `cd $(cat /etc/passwd)` and `cd \`cat /etc/shadow\`` now correctly rejected by security validator

---

[1.0.0]: https://github.com/guangda/ling-term-mcp/releases/tag/v1.0.0
