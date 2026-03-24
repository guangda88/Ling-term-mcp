# User Guide

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Connecting to AI Assistants](#connecting-to-ai-assistants)
4. [Using the Tools](#using-the-tools)
5. [Configuration](#configuration)
6. [Troubleshooting](#troubleshooting)

---

## Installation

### Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn

### Install via NPM

```bash
npm install -g ling-term-mcp
```

### Install from Source

```bash
git clone https://github.com/guangda/ling-term-mcp.git
cd ling-term-mcp
npm install
npm run build
npm link
```

---

## Quick Start

### 1. Verify Installation

```bash
ling-term-mcp --version
```

Expected output: `1.0.0`

### 2. Start the Server

```bash
ling-term-mcp
```

The server will start and wait for MCP client connections via stdio.

---

## Connecting to AI Assistants

### Cursor

1. Open Cursor Settings (`Cmd+,` or `Ctrl+,`)
2. Navigate to "MCP Servers" section
3. Add the following configuration:

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "ling-term-mcp",
      "args": []
    }
  }
}
```

4. Restart Cursor

### Claude Desktop

1. Open Claude Desktop Settings
2. Navigate to "MCP Servers" section
3. Add the following configuration:

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "ling-term-mcp",
      "args": []
    }
  }
}
```

4. Restart Claude Desktop

### Other MCP Clients

Any MCP-compatible client can connect to Ling-term-mcp. The server uses stdio transport, which is the most common and recommended method.

---

## Using the Tools

### Execute Commands

Ask your AI assistant to execute terminal commands:

```
Please list all files in the current directory
```

The AI assistant will use the `execute_command` tool to run `ls -la`.

### Manage Sessions

```
Create a new session named "my-project"
```

The AI assistant will use the `create_session` tool.

```
List all active sessions
```

The AI assistant will use the `list_sessions` tool.

### Sync Terminal State

```
What's my current working directory and environment?
```

The AI assistant will use the `sync_terminal` tool.

---

## Configuration

### Environment Variables

- `LING_TERM_MCP_LOG_LEVEL`: Logging level (debug, info, warn, error)
- `LING_TERM_MCP_MAX_CONNECTIONS`: Maximum concurrent connections (default: 100)
- `LING_TERM_MCP_TIMEOUT`: Command timeout in seconds (default: 60)

### Configuration File

Create a `.ling-term-mcp.json` file in your home directory:

```json
{
  "logLevel": "info",
  "maxConnections": 100,
  "timeout": 60,
  "workingDirectory": "/home/user"
}
```

---

## Troubleshooting

### Server won't start

**Problem**: `command not found: ling-term-mcp`

**Solution**: Make sure you've installed the package globally or linked it:
```bash
npm link
```

### Commands fail to execute

**Problem**: Tool returns error messages

**Solution**: 
1. Check if the command exists on your system
2. Verify you have the necessary permissions
3. Check the error message for specific details

### Session not found

**Problem**: "Session not found: xxx-xxx-xxx"

**Solution**: 
1. Use `list_sessions` to see available sessions
2. Create a new session if needed

### Permission denied

**Problem**: "Permission denied" when executing commands

**Solution**: 
1. Check file permissions
2. Run the server with appropriate user privileges
3. Avoid commands requiring `sudo`

### Connection issues with AI Assistant

**Problem**: AI assistant can't connect to the MCP server

**Solution**:
1. Verify the server is running
2. Check the command path in the configuration
3. Restart the AI assistant
4. Check AI assistant logs for connection errors

---

## Getting Help

- [GitHub Issues](https://github.com/guangda/ling-term-mcp/issues)
- [Documentation](https://github.com/guangda/ling-term-mcp/docs)
- [API Reference](API.md)

---

**Ling-term-mcp (灵犀) - 心有灵犀一点通，AI 精准操控终端** 🚀
