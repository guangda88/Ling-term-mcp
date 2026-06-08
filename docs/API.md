# API Documentation

## Overview

Ling-term-mcp (灵犀) implements the Model Context Protocol (MCP) to provide terminal operations capabilities to AI assistants.

- **Version**: 1.3.0
- **Transport**: stdio (StdioServerTransport)

## Tools

### execute_command

Executes terminal commands safely with shell and non-shell modes.

**Name**: `execute_command`

**Description**: Execute terminal commands safely. Use shell=true for pipes, chaining (&&, ||), redirects, and shell builtins (cd, export, source). Use shell=false (default) for direct binary execution.

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The command to execute. When shell=true, this is the full shell command string. When shell=false, this is the binary name."
    },
    "args": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Command arguments (only used when shell=false). Ignored when shell=true."
    },
    "session_id": {
      "type": "string",
      "description": "Optional session ID for execution context (uses session working directory and environment)"
    },
    "shell": {
      "type": "boolean",
      "description": "Execute via shell (/bin/sh -c). Enables pipes, chaining, builtins (cd, export). Default: false."
    },
    "timeout": {
      "type": "number",
      "description": "Timeout in milliseconds (default: 60000, max: 600000)."
    },
    "reasoning": {
      "type": "string",
      "description": "Why this command is being executed (decision provenance)."
    },
    "expected_outcome": {
      "type": "string",
      "description": "What you expect this command to produce or return."
    },
    "caller": {
      "type": "string",
      "description": "Caller identity (e.g. 'lingflow', 'lingclaude'). Validated against the 灵族 member registry. Optional but recommended."
    }
  },
  "required": ["command"]
}
```

**Successful Response**:

```json
{
  "content": [
    {
      "type": "text",
      "text": "drwxr-xr-x  5 user  group  160 Mar 24 12:00 ."
    }
  ]
}
```

**Error Response**:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error output here..."
    },
    {
      "type": "text",
      "text": "--- error_meta ---\n{\"category\":\"execution\",\"retryable\":true,\"killed\":false,\"signal\":null}"
    }
  ],
  "isError": true
}
```

**Error categories**: `timeout` (killed by timeout), `not_found` (ENOENT), `signal` (killed by signal), `execution` (general failure).

**Session side effects** (shell mode with session_id):

- `cd <dir>` updates session working directory
- `export VAR=val` updates session environment

**Output truncation**: Output exceeding 10,000 characters is truncated to 5,000 head + 5,000 tail with omission count.

---

### session

Manages terminal sessions (consolidates list/create/destroy/sync).

**Name**: `session`

**Description**: Manage terminal sessions. Commands: list (list all), create (create new), destroy (destroy + behavioral snapshot), sync (sync terminal state).

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "enum": ["list", "create", "destroy", "sync"],
      "description": "Session operation to perform"
    },
    "session_id": {
      "type": "string",
      "description": "Session ID (required for destroy, sync; optional for create)"
    },
    "name": {
      "type": "string",
      "description": "Session name (optional, for create)"
    },
    "working_directory": {
      "type": "string",
      "description": "Working directory (optional, for create)"
    }
  },
  "required": ["command"]
}
```

**Subcommands**:

| Command   | Description                                                                                  |
| --------- | -------------------------------------------------------------------------------------------- |
| `list`    | List all active sessions                                                                     |
| `create`  | Create a new session with optional name and working_directory                                |
| `destroy` | Destroy session + generate behavioral snapshot (decision log, violations, outcome deviation) |
| `sync`    | Sync terminal state (working dir, environment, command history)                              |

---

### audit_report

Provides MCP tool usage statistics and audit summaries.

**Name**: `audit_report`

**Description**: Generate audit reports with statistics on command execution, caller identity, success rates, behavioral violations, rejection records, and kill-storm alerts.

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "format": {
      "type": "string",
      "enum": ["summary", "detailed", "caller"],
      "description": "Report format: summary (overview), detailed (full stats), caller (per-caller breakdown)",
      "default": "summary"
    },
    "caller": {
      "type": "string",
      "description": "Filter by caller identity (only used when format=caller)"
    }
  }
}
```

**Report includes**: tool usage stats, caller statistics, command history, decision records, rejection records (total/by_category/by_caller/recent), kill_storm_alerts (lingshell restart_count anomaly detection).

---

### authorize

Red-zone authorization management (consolidates require/approve/list).

**Name**: `authorize`

**Description**: Manage red-zone authorization requests. Commands: require (request approval), approve (approve/reject), list (list requests).

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "enum": ["require", "approve", "list"],
      "description": "Authorization operation to perform"
    },
    "caller": {
      "type": "string",
      "description": "Caller identity (required for require)"
    },
    "operation": {
      "type": "string",
      "description": "Operation description (required for require)"
    },
    "target": {
      "type": "string",
      "description": "Target of the operation (required for require)"
    },
    "command_bind": {
      "type": "string",
      "description": "Optional command string to bind this authorization to"
    },
    "authorization_id": {
      "type": "string",
      "description": "Authorization ID (required for approve)"
    },
    "decision": {
      "type": "string",
      "enum": ["approve", "reject"],
      "description": "Decision (required for approve)"
    },
    "status": {
      "type": "string",
      "enum": ["pending", "approved", "rejected", "expired"],
      "description": "Filter by status (optional, for list)"
    }
  },
  "required": ["command"]
}
```

**Authorization TTL**: 10 minutes. Max 100 pending requests.

---

### governance

Safe-bash command list governance with dual-sign (consolidates propose/review/list).

**Name**: `governance`

**Description**: Manage safe-bash command list changes with dual-sign. Commands: propose (create proposal), review (approve/reject), list (list proposals + current lists).

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "enum": ["propose", "review", "list"],
      "description": "Governance operation to perform"
    },
    "action": {
      "type": "string",
      "enum": ["add", "remove"],
      "description": "Add or remove entries (required for propose)"
    },
    "entries": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Command names (required for propose, max 20)"
    },
    "list_type": {
      "type": "string",
      "enum": ["whitelist", "blacklist", "red_zone"],
      "description": "Which list to modify (required for propose)"
    },
    "proposer": {
      "type": "string",
      "description": "Identity of the proposer (required for propose)"
    },
    "reason": {
      "type": "string",
      "description": "Justification (required for propose, min 10 chars)"
    },
    "proposal_id": {
      "type": "string",
      "description": "Proposal ID (required for review)"
    },
    "decision": {
      "type": "string",
      "enum": ["approve", "reject"],
      "description": "Review decision (required for review)"
    },
    "reviewer": {
      "type": "string",
      "description": "Reviewer identity (required for review)"
    },
    "status": {
      "type": "string",
      "enum": [
        "pending",
        "approved",
        "rejected",
        "applied",
        "failed",
        "expired"
      ],
      "description": "Filter by status (optional, for list)"
    }
  },
  "required": ["command"]
}
```

**Rules**: Proposer cannot self-review. IMMUTABLE_BLACKLIST protects rm/sudo/dd etc.

---

### proxy

MCP thin proxy for proxied backends (consolidates list/call/status).

**Name**: `proxy`

**Description**: MCP proxy: call tools on proxied backends (lingcreate/lingzhi/lingresearch/lingminopt/lingyang/lingtongask). Commands: call (call a tool), list (list backends/tools), status (backend health).

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "enum": ["call", "list", "status"],
      "description": "Proxy operation: call (invoke tool), list (discover tools), status (health check)"
    },
    "backend": {
      "type": "string",
      "description": "Backend name (required for call; optional for list to filter)"
    },
    "tool": {
      "type": "string",
      "description": "Tool name to call on the backend (required for call)"
    },
    "args": {
      "type": "object",
      "description": "Arguments to pass to the tool (optional, for call)",
      "additionalProperties": true
    }
  },
  "required": ["command"]
}
```

**Backends**: Configured in `backends.json`. Lazy-start with auto-restart.

---

## Security

- **Command validation**: Length check → Blacklist (always enforced) → Whitelist (when `allowUnknownCommands: false`) → Dangerous patterns → Argument sanitization
- **Shell mode**: Blacklist and whitelist checked against first word of command
- **Session environment**: Injection-safe (PATH, LD_PRELOAD, SHELL, etc. blocked from session env vars)
- **Caller identity**: `caller` param required for execute_command, validated against 灵族 member registry
- **Red-zone authorization**: Dangerous commands (ssh, curl, npm, etc.) require prior approval via `authorize` tool
- **Rejection logging**: All security-rejected commands persisted to `~/.ling-term-mcp/rejections.jsonl`
- **Kill-storm detection**: Scans lingshell restart_count anomalies (≥3 WARNING, ≥8 CRITICAL)
- **Audit logging**: Decision records with reasoning, expected/actual outcomes, source traces, and behavioral contract checks
- **Session isolation**: Each session has independent working directory and environment

---

## Error Handling

All tool errors follow MCP error response format. `execute_command` additionally includes `error_meta` with `category`, `retryable`, `killed`, and `signal` fields.

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Session not found"
    }
  ],
  "isError": true
}
```

---

## Server Capabilities

- **Tools**: execute_command, session, audit_report, authorize, governance, proxy
- **Resources**: None
- **Prompts**: None
