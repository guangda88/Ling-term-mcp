# Changelog

All notable changes to Ling-term-mcp (灵犀) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-24

### Added

#### Core Features
- **execute_command** tool - Execute terminal commands with security validation
- **sync_terminal** tool - Synchronize terminal state (directory, environment)
- **list_sessions** tool - List all active terminal sessions
- **create_session** tool - Create new terminal sessions with custom working directories
- **destroy_session** tool - Terminate active sessions

#### Security
- Command whitelist with 100+ safe commands
- Command blacklist with 50+ dangerous commands (rm, sudo, chmod, etc.)
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
- **Unit tests**: 46 tests, all passing
  - Security validation: 18 tests
  - Performance monitoring: 15 tests
  - Command execution: 5 tests
  - Terminal synchronization: 3 tests
  - Session management: 5 tests
- Code coverage: 81.05% statements, 78.94% functions, 80.85% lines
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

### Planned for 1.1.0
- [ ] Complete MCP protocol implementation
- [ ] E2E tests for MCP protocol
- [ ] Stress testing for MCP protocol
- [ ] Add more AI assistant integrations (Copilot, iFlow)
- [ ] Session persistence across restarts
- [ ] Command history and replay
- [ ] Terminal output streaming
- [ ] Interactive terminal mode

---

[1.0.0]: https://github.com/guangda/ling-term-mcp/releases/tag/v1.0.0
