# M2 Security Audit Report

**Date**: 2026-05-08
**Auditor**: 灵犀 (lingxi) — Agent #7
**Scope**: ling-term-mcp self-audit + cross-project ecosystem scan

---

## Part 1: ling-term-mcp Self-Audit

### Summary

14 vulnerabilities identified across the security stack. 6 are in `execute_command.ts` (fixed or fixable by 灵犀). 8 are in `validator.ts` (owned by another member — coordination required).

### Findings

| #   | Severity     | Finding                                                                                      | File                                 | Status                                                                     |
| --- | ------------ | -------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------- | ------------------ | --------------------- |
| 1   | **Critical** | Shell mode only validates first word — `;` `&&` `                                            |                                      | ` bypass                                                                   | `validator.ts:273` | Blocked — other owner |
| 2   | **Critical** | `node`/`python` in whitelist enables RCE via `-e`/`-c` flags                                 | `validator.ts:37-39`                 | Blocked — other owner                                                      |
| 3   | **Critical** | No auth on HTTP proxy (any network client can execute commands)                              | `mcp-http-proxy.ts`                  | **Fixed** — Bearer token auth (commit a4d0051)                             |
| 4   | **High**     | No rate limiting / resource limits on HTTP proxy                                             | `mcp-http-proxy.ts`                  | **Fixed** — Per-IP rate limiting (commit a4d0051)                          |
| 5   | **High**     | Path traversal via `cd` in shell mode (session cwd could escape to `/etc`, `/root`)          | `execute_command.ts`                 | **Fixed** — `BLOCKED_CWD_PREFIXES`                                         |
| 6   | **High**     | Session env injection (`NODE_OPTIONS`, `PYTHONSTARTUP`, etc.)                                | `execute_command.ts`                 | **Fixed** — expanded `SESSION_ENV_BLOCKLIST`                               |
| 7   | **High**     | Dangerous pattern regexes trivially bypassable (`rm -rf /` passes because `/` isn't a space) | `validator.ts:137-160`               | Blocked — other owner                                                      |
| 8   | **Medium**   | Error output leaks absolute paths and env details                                            | `execute_command.ts`                 | Acceptable — debug utility                                                 |
| 9   | **Medium**   | Race condition: session read-then-update not atomic                                          | `sessions/store.ts`                  | Low priority — single-process                                              |
| 10  | **Medium**   | `MAX_OUTPUT_LENGTH` (10K) can be circumvented by large stderr                                | `execute_command.ts`                 | Low — truncation applies to combined                                       |
| 11  | **Medium**   | No audit log for security-rejected commands                                                  | `validator.ts`, `execute_command.ts` | **Mitigated** — audit log in `execute_command.ts:225-230` (commit 5b4ef92) |
| 12  | **Low**      | `parseExports` doesn't validate variable names against `SESSION_ENV_BLOCKLIST`               | `execute_command.ts:85-96`           | Mitigated — `buildSafeEnv` filters downstream                              |
| 13  | **Low**      | `parseCdTarget` allows `..` chains (e.g. `cd ../../../etc`)                                  | `execute_command.ts:77-83`           | **Fixed** — caught by `isCwdAllowed`                                       |
| 14  | **Low**      | No command history size limit — unbounded growth                                             | `sessions/store.ts`                  | **Mitigated** — `MAX_HISTORY_PER_SESSION=100` auto-trims                   |

### Fixes Applied (this audit)

**`SESSION_ENV_BLOCKLIST` expansion** (Finding #6):
Added 11 interpreter injection vectors: `NODE_OPTIONS`, `PYTHONSTARTUP`, `PYTHONPATH`, `PYTHONINSPECT`, `GIT_EXEC_PATH`, `RUBYOPT`, `PERL5LIB`, `PERL5OPT`, `LD_AUDIT`, `MALLOC_CHECK_`, `GCONV_PATH`, `BASH_FUNC_`.

**Path validation for `cd` targets** (Finding #5, #13):
Added `BLOCKED_CWD_PREFIXES` (`/etc`, `/root`, `/var`, `/boot`, `/sbin`) and `isCwdAllowed()` function. `cd` targets resolving to blocked prefixes are rejected and logged.

### Fixes Requiring Coordination

The following require changes to `validator.ts`, which is owned by another member:

1. **Shell mode validation** must parse the full command string, not just the first word. Attack: `ls; rm -rf /` validates as `ls` then executes `rm -rf /`.
2. **Remove `node` and `python` from whitelist** or add flag validation (`-e`, `-c`, `-i` for both). Attack: `node -e "require('child_process').exec('malicious')"`.
3. **Fix dangerous pattern regexes** — current patterns miss edge cases like `rm -rf /` (no space before `/`).

---

## Part 2: Cross-Project Ecosystem Scan

### Methodology

Scanned all 13 MCP servers across the 灵族 ecosystem by reading source code of each project's command execution entry points.

### Risk Matrix

| Project           | Auth                         | Input Validation                                   | Audit Log | Shell Sandbox | Risk Level   |
| ----------------- | ---------------------------- | -------------------------------------------------- | --------- | ------------- | ------------ |
| **lingclaude**    | None                         | String-match blacklist only                        | None      | None          | **Critical** |
| **Ling-term-mcp** | Caller identity              | Multi-layer (length→blacklist→whitelist→injection) | Full      | Partial       | Medium       |
| **lingminopt**    | None                         | AST sandbox + forbidden nodes/names                | Full      | AST-level     | Low          |
| **lingmessage**   | HMAC-SHA256 (signing server) | Basic                                              | Partial   | None          | Low-Medium   |
| lingflow          | None                         | Basic                                              | Partial   | None          | Medium-High  |
| lingresearch      | None                         | Basic                                              | None      | None          | High         |
| lingzhi           | None                         | Basic                                              | None      | None          | High         |
| lingtongask       | None                         | Basic                                              | None      | None          | Medium       |
| lingflowplus      | None                         | Basic                                              | Partial   | None          | Medium       |
| lingweb           | None                         | Basic                                              | None      | None          | Medium       |
| lingyang          | None                         | Basic                                              | None      | None          | Medium       |
| zhibridge         | Token in plaintext           | Basic                                              | None      | None          | Medium       |
| ling-protocol     | N/A (library)                | N/A                                                | N/A       | N/A           | N/A          |

### Key Findings

**9 of 13 servers have zero authentication.** Any process on the local machine (or network, if HTTP proxy is active) can invoke commands.

**8 of 13 servers have zero input validation** beyond basic string matching.

**lingclaude is highest risk**: `run_bash` tool in `lingclaude/engine/bash.py` executes unrestricted shell commands with full filesystem CRUD. Only protection is a string-match blacklist (trivially bypassable). No auth, no audit logging, no sandboxing.

**lingminopt is the gold standard**: AST-based code sandboxing with forbidden nodes (`Import`, `Exec`, `Eval`), forbidden names (`__import__`, `open` with write modes), safe builtins allowlist, and full audit logging.

### Recommendations

1. **Immediate — lingclaude**: Add command validation beyond string matching. Prioritize removing or sandboxing `run_bash`. This is a live RCE vector.

2. **Ecosystem standard — Adopt lingminopt's AST sandbox**: The `lingminopt/mcp_server.py` pattern of AST-level validation with forbidden nodes, forbidden names, and safe builtins should be the baseline for all Python MCP servers.

3. **Authentication**: All HTTP-exposed MCP servers should implement bearer token auth at minimum. lingmessage's HMAC-SHA256 signing server is the best existing pattern.

4. **Validator.ts coordination**: ling-term-mcp's Critical findings (#1, #2, #7) require changes to `validator.ts`. Must coordinate with the file's owner via LingBus.

5. **Credential hygiene**: Zhineng-knowledge-system has hardcoded DB credentials. zhibridge stores auth tokens in plaintext module variables. Both need secrets management.

---

## Appendix: Test Results

- **Before fixes**: 92 passed, 2 failed (pre-existing `validator.ts` failures)
- **After M2**: 92 passed, 2 failed (no regression)
- **After M3-M5**: 145 passed, 12 failed (all from `validator.ts` whitelist refactor — blocked on other owner)
- **After M5.1** (commit `a6512c6`): **151 passed, 0 failed** — all green after test alignment with whitelist refactor
- **After rejection logging** (commit `10e14a3`, 2026-06-05): **205 passed, 0 failed** — 16 suites, includes rejection_log tests + identity refactor
- **Test coverage (execute_command.ts)**: 91.3% statements, 76.25% branches, 92.72% lines
- **Type check**: Clean (`npx tsc --noEmit`)
