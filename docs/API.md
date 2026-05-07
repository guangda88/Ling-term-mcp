# API Documentation

## Overview

Ling-term-mcp (灵犀) implements the Model Context Protocol (MCP) to provide terminal operations capabilities to AI assistants.

- **Version**: 1.1.0
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

### sync_terminal

Synchronizes terminal state (working directory, environment, command history).

**Name**: `sync_terminal`

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Session ID to sync"
    }
  },
  "required": ["session_id"]
}
```

**Response**:

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"session_id\":\"xxx\",\"working_directory\":\"/home/user\",\"environment\":{},\"command_history\":[],\"user\":\"user\",\"home_directory\":\"/home/user\",\"platform\":\"linux\",\"architecture\":\"x64\",\"system_info\":{\"PATH\":\"...\",\"SHELL\":\"...\",\"LANG\":\"...\",\"HOME\":\"...\"},\"timestamp\":\"2026-01-01T00:00:00.000Z\"}"
    }
  ]
}
```

---

### list_sessions

Lists all active terminal sessions.

**Name**: `list_sessions`

**Input Schema**:

```json
{
  "type": "object",
  "properties": {}
}
```

**Response**:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 2 active session(s):\n\n[{\"id\":\"...\",\"name\":\"...\",\"created_at\":\"...\",\"status\":\"active\",\"working_directory\":\"...\"}]"
    }
  ]
}
```

---

### create_session

Creates a new terminal session.

**Name**: `create_session`

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "description": "Session name"
    },
    "working_directory": {
      "type": "string",
      "description": "Working directory for the session"
    }
  }
}
```

**Response**:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Session created successfully:\n\n{\"id\":\"uuid\",\"name\":\"session-xxxx\",\"working_directory\":\"/home/user\",\"created_at\":\"2026-01-01T00:00:00.000Z\",\"status\":\"active\"}"
    }
  ]
}
```

---

### destroy_session

Destroys a terminal session and generates a behavioral snapshot with decision log, behavioral violations, and outcome deviation analysis.

**Name**: `destroy_session`

**Input Schema**:

```json
{
  "type": "object",
  "properties": {
    "session_id": {
      "type": "string",
      "description": "Session ID to destroy"
    }
  },
  "required": ["session_id"]
}
```

**Response**:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Session destroyed successfully: <session_id>\n\n--- Session Behavioral Snapshot ---\nDuration: 120s\nCommands executed: 15\nOutcome deviation rate: 12.5%\nDirectories accessed: 3\nNetwork commands: 0\nDecision records: 15\n  With reasoning: 12/15"
    }
  ]
}
```

---

## Security

- **Command validation**: Length check → Blacklist (always enforced) → Whitelist (when `allowUnknownCommands: false`) → Dangerous patterns → Argument sanitization
- **Shell mode**: Blacklist and whitelist checked against first word of command
- **Session environment**: Injection-safe (PATH, LD_PRELOAD, SHELL, etc. blocked from session env vars)
- **Caller identity**: Optional `caller` param validated against 灵族 member registry
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

- **Tools**: execute_command, sync_terminal, list_sessions, create_session, destroy_session
- **Resources**: None
- **Prompts**: None
