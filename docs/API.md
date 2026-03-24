# API Documentation

## Overview

Ling-term-mcp (灵犀) implements the Model Context Protocol (MCP) to provide terminal operations capabilities to AI assistants.

## Tools

### execute_command

Executes terminal commands safely.

**Name**: `execute_command`

**Description**: Execute terminal commands safely

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "command": {
      "type": "string",
      "description": "The command to execute"
    },
    "args": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Command arguments"
    },
    "session_id": {
      "type": "string",
      "description": "Optional session ID for execution context"
    }
  },
  "required": ["command"]
}
```

**Example Usage**:
```
Execute ls -la command
```

**Response**:
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

---

### sync_terminal

Synchronizes terminal state (working directory, environment variables).

**Name**: `sync_terminal`

**Description**: Synchronize terminal state (working directory, environment)

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

**Example Usage**:
```
Get current terminal state
```

**Response**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"session_id\":\"xxx\",\"working_directory\":\"/home/user\",\"platform\":\"linux\"}"
    }
  ]
}
```

---

### list_sessions

Lists all active terminal sessions.

**Name**: `list_sessions`

**Description**: List all active terminal sessions

**Input Schema**:
```json
{
  "type": "object",
  "properties": {}
}
```

**Example Usage**:
```
List all active sessions
```

**Response**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 2 active session(s):\n\n[...]"
    }
  ]
}
```

---

### create_session

Creates a new terminal session.

**Name**: `create_session`

**Description**: Create a new terminal session

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

**Example Usage**:
```
Create a session named "dev" in /home/user/projects
```

**Response**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Session created successfully:\n\n{...}"
    }
  ]
}
```

---

### destroy_session

Destroys a terminal session.

**Name**: `destroy_session`

**Description**: Destroy a terminal session

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

**Example Usage**:
```
Destroy session with ID abc-123-def
```

**Response**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Session destroyed successfully: abc-123-def"
    }
  ]
}
```

---

## Server Capabilities

- **Tools**: All terminal operation tools
- **Resources**: None currently
- **Prompts**: None currently

## Error Handling

All tool calls follow the MCP error response format:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Invalid session ID"
    }
  ],
  "isError": true
}
```

---

## Rate Limiting

- Command execution timeout: 60 seconds
- Maximum concurrent connections: 100 (configurable)

---

## Security

- Command validation and sanitization
- Session isolation
- Audit logging (future)

---

## Version

Current version: **1.0.0**

Release date: **2026-03-24**
