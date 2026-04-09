# Ling-term-mcp（灵犀）

**让 AI 助手精准操控终端的 MCP 服务器**

---

## 项目简介

**Ling-term-mcp（灵犀）** 是一个基于 MCP（Model Context Protocol）标准的终端操作服务器，让 Claude、Cursor、Copilot 等 AI 助手能够安全、高效地执行终端命令和管理会话。

### 核心特性

- **MCP 原生**: 完全兼容 MCP 标准，无缝对接主流 AI 助手
- **双模式执行**: `execFile` 直接执行 + `shell` 模式支持管道、链式命令、内置命令
- **安全优先**: 命令黑名单、危险模式检测、环境变量过滤、Shell 注入防护
- **会话管理**: 多会话并发、持久化、工作目录追踪、环境变量继承、命令历史
- **性能监控**: 内置 PerformanceMonitor，实时追踪 P50/P95/P99 指标
- **高覆盖测试**: 95 个测试（87 单元 + 6 集成 + 2 E2E），语句覆盖率 98%

---

## 快速开始

### 安装

```bash
git clone https://github.com/guangda/ling-term-mcp.git
cd ling-term-mcp
npm install
```

### 启动

```bash
npm run dev        # 开发模式（tsx，无需构建）
npm run build      # 编译 TypeScript
npm start          # 生产模式
```

### 连接到 AI 助手

#### Cursor

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

#### Claude Desktop

在 `claude_desktop_config.json` 中添加：

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

#### Crush CLI

在 `~/.config/crush/crush.json` 的 `mcp` 中添加：

```json
"ling-term-mcp": {
  "command": "node",
  "args": ["/path/to/ling-term-mcp/dist/cli.js"]
}
```

---

## 可用工具

### 1. execute_command — 执行终端命令

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | string | 是 | 命令名称（非 shell）或完整命令字符串（shell 模式） |
| `args` | string[] | 否 | 命令参数（仅非 shell 模式使用） |
| `session_id` | string | 否 | 会话 ID，绑定工作目录和环境 |
| `shell` | boolean | 否 | `true` 使用 `/bin/sh -c` 执行，支持管道、`&&`、`cd`、`export` 等 |
| `timeout` | number | 否 | 超时毫秒数，默认 60000，最大 600000 |

**非 shell 模式**（默认）：使用 `execFile`，参数独立传递，无 shell 解析风险：

```json
{
  "command": "echo",
  "args": ["Hello, World!"],
  "session_id": "my-session"
}
```

**Shell 模式**：使用 `exec`，支持完整 shell 语法：

```json
{
  "command": "cd /var && ls -la | head -10",
  "shell": true,
  "session_id": "my-session"
}
```

Shell 模式下，`cd` 会自动更新会话工作目录，`export` 会更新会话环境变量。

### 2. create_session — 创建会话

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 会话名称 |
| `working_directory` | string | 否 | 工作目录，默认 `process.cwd()` |

### 3. destroy_session — 销毁会话

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | string | 是 | 要销毁的会话 ID |

### 4. list_sessions — 列出会话

无参数，返回所有活跃会话列表。

### 5. sync_terminal — 同步终端状态

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `session_id` | string | 是 | 会话 ID |

返回：工作目录、会话环境变量、命令历史、平台信息、时间戳。

---

## 项目结构

```
Ling-term-mcp/
├── src/
│   ├── index.ts              # MCP Server 入口
│   ├── cli.ts                # CLI 入口
│   ├── tools/                # MCP 工具
│   │   ├── execute_command.ts
│   │   ├── create_session.ts
│   │   ├── destroy_session.ts
│   │   ├── list_sessions.ts
│   │   └── sync_terminal.ts
│   ├── sessions/
│   │   └── store.ts          # 会话持久化（JSON 文件）
│   ├── security/
│   │   └── validator.ts      # 安全验证器
│   └── monitoring/
│       └── performance.ts    # 性能监控
├── tests/
│   ├── unit/                 # Jest 单元测试
│   ├── integration/          # Jest 集成测试
│   ├── e2e/                  # Node.js E2E 测试
│   └── stress/               # 压力测试
├── docs/
│   ├── API.md
│   └── USER_GUIDE.md
└── .lingflow/                # LingFlow 工作流
```

---

## 安全

### 安全架构

| 层级 | 机制 | 说明 |
|------|------|------|
| 命令长度 | `maxCommandLength: 10000` | 超长命令直接拒绝 |
| 黑名单 | rm, sudo, kill, dd, shutdown... | 始终生效 |
| 白名单 | ls, git, npm, node, python... | `allowUnknownCommands: false` 时启用 |
| 危险模式 | `rm -rf /`, fork bomb, curl|bash... | 正则检测 |
| Shell 注入 | `;`, 反引号, `$(...)` | 非 shell 模式参数检测 |
| 环境过滤 | SECRET/TOKEN/PASSWORD 关键字 | 阻止敏感变量传递给子进程 |
| 输出截断 | 10000 字符 | 防止内存溢出 |

### 双模式安全策略

- **非 shell 模式**（默认）：`execFile` 参数化执行，参数经过 shell 注入检测
- **Shell 模式**（`shell: true`）：允许 `&&`、`|`、`$` 等 shell 语法，但黑名单命令、危险模式、管道攻击仍被拦截

### 默认黑名单

```
rm, rmdir, sudo, su, kill, killall, pkill, dd, mkfs, fdisk,
shutdown, reboot, halt, chmod, chown, passwd, systemctl, ...
```

> Shell 解释器（bash, sh, zsh, fish）和网络工具（curl, wget）**不在黑名单中**，但 `curl|bash` 等管道攻击会被危险模式检测拦截。

---

## 测试

```bash
npm test              # 单元测试（87 tests）
npm run test:coverage # 覆盖率报告
npm run test:e2e      # E2E 测试（Node.js test runner）
npm run test:stress   # 压力测试
```

| 指标 | 覆盖率 |
|------|--------|
| Statements | 98% |
| Branches | 89% |
| Functions | 98% |
| Lines | 98% |

---

## 开发

```bash
npm run dev          # 开发模式
npm run dev:watch    # 开发 + watch
npm run build        # 编译
npm run lint         # 代码检查
npm run format       # 代码格式化
npm run clean        # 清理构建产物
```

### 添加新工具

1. 创建 `src/tools/my_tool.ts`（definition + handler）
2. 在 `src/index.ts` 注册 definition 和 handler
3. 创建 `tests/unit/my_tool.test.ts`
4. `npm run lint && npx tsc --noEmit && npm test`

---

## 技术栈

| 依赖 | 版本 | 用途 |
|------|------|------|
| TypeScript | 5.4+ | 类型安全 |
| Node.js | >=18.0 | 运行时 |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP 协议 |
| Jest | 29 | 测试框架 |
| ESLint + Prettier | - | 代码质量 |

---

## 贡献

1. Fork → 创建分支 → 开发 → 测试 → PR
2. 确保 `npm run lint && npx tsc --noEmit && npm test` 全部通过

---

## 许可证

MIT License

---

**Ling-term-mcp（灵犀）- 心有灵犀一点通，AI 精准操控终端**

**版本**: 1.1.0-dev
**基于**: LingMinOpt + LingFlow
