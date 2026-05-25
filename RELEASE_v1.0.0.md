v1.0.0 – 让 AI 助手安全操控终端的 MCP 服务器

## 🎉 灵犀 (Ling-term-mcp) 首个稳定版发布

让 AI 助手精准、安全地执行终端命令，基于 MCP 标准，开箱即用。

### ✨ 核心亮点

- 🎯 **MCP 原生**：无缝对接 Claude Desktop、Cursor 等 AI 工具
- 🔒 **安全优先**：命令黑名单 + 白名单模式，参数化执行，防护注入攻击
- ⚡ **高性能**：lingminopt 自动优化，响应时间 < 100ms
- 🚀 **会话管理**：支持多会话、持久化、状态同步
- 📊 **内置监控**：实时性能指标，便于追踪

### 🚀 快速开始

```bash
# 一行命令，即刻使用（通过 npx）
npx ling-term-mcp
```

**Claude Desktop 配置示例**：

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "npx",
      "args": ["-y", "ling-term-mcp"]
    }
  }
}
```

### 🔒 安全提示

默认允许白名单外的命令执行（`allowUnknownCommands: true`），生产环境建议设置为 `false` 并自定义白名单。详见 [SECURITY.md](https://github.com/guangda88/Ling-tem-mcp/blob/main/SECURITY.md)。

### 📦 安装

```bash
npm install -g ling-term-mcp
```

### 📚 文档

- [README](https://github.com/guangda88/Ling-tem-mcp)
- [API 文档](https://github.com/guangda88/Ling-tem-mcp/blob/main/docs/API.md)
- [用户指南](https://github.com/guangda88/Ling-tem-mcp/blob/main/docs/USER_GUIDE.md)
- [安全策略](https://github.com/guangda88/Ling-tem-mcp/blob/main/SECURITY.md)
- [审计报告](https://github.com/guangda88/Ling-tem-mcp/blob/main/AUDIT_REPORT.md)

### 🙏 致谢

感谢 lingflow 工程流平台与 lingminopt 自优化引擎的支持。

---

**下一步**：欢迎使用、反馈、贡献！请访问 [GitHub Discussions](https://github.com/guangda88/Ling-tem-mcp/discussions) 交流。

---

## 宣发文案（各平台）

### Twitter / X

灵犀 (Ling-term-mcp) v1.0.0 发布！让 AI 助手安全操控终端的 MCP 服务器 🔥

✅ 基于 MCP 标准，无缝对接 Claude、Cursor
✅ 命令黑/白名单 + 参数化执行，防护注入
✅ 响应 <100ms，内置性能监控

一行命令：`npx ling-term-mcp`

GitHub: https://github.com/guangda88/Ling-tem-mcp
npm: https://www.npmjs.com/package/ling-term-mcp

@AnthropicClaude @cursor @mcp_dev

### Hacker News

标题：Show HN: Ling-term-mcp – A secure MCP server for terminal operations

I built a Model Context Protocol (MCP) server that allows AI assistants (Claude, Cursor, etc.) to safely execute terminal commands.

Key features:

- Security: command blacklist/whitelist, parameterized execution (execFile, not exec)
- Performance: lingminopt-tuned, <100ms response time
- Session management, state sync, built-in monitoring

Try it: `npx ling-term-mcp`
Repo: https://github.com/guangda88/Ling-tem-mcp
npm: https://www.npmjs.com/package/ling-term-mcp

Would love your feedback!

### Reddit (r/programming / r/ClaudeAI)

标题：Ling-term-mcp: Let AI assistants safely run terminal commands (MCP server)

I just released v1.0.0 of Ling-term-mcp, an MCP server that gives Claude, Cursor, etc. the ability to execute shell commands securely.

It comes with command blacklisting, optional whitelist mode, and uses parameterized execution to prevent injection. Performance is <100ms thanks to lingminopt auto-tuning.

Quick start:
`npx ling-term-mcp`

Config for Claude Desktop:

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "npx",
      "args": ["-y", "ling-term-mcp"]
    }
  }
}
```

GitHub: https://github.com/guangda88/Ling-tem-mcp
npm: https://www.npmjs.com/package/ling-term-mcp

Would love to hear your thoughts and use cases!

### MCP Discord (#showcase)

🚀 Ling-term-mcp v1.0.0 – MCP server for secure terminal operations

- Execute commands via AI with built-in safety (blacklist/whitelist)
- Session management, state sync, performance monitoring
- Ready for Claude Desktop, Cursor, etc.

Try it: `npx ling-term-mcp`
GitHub: https://github.com/guangda88/Ling-tem-mcp
npm: https://www.npmjs.com/package/ling-term-mcp
