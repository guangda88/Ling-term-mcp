# Ling-term-mcp（灵犀）

**让 AI 助手精准操控终端的 MCP 服务器**

---

## 🌟 项目简介

**Ling-term-mcp（灵犀）** 是一个基于 MCP（Model Context Protocol）标准的终端操作服务器，让 Claude、Cursor、Copilot 等 AI 助手能够安全、高效地执行终端命令和管理会话。

### 核心特性

- 🎯 **MCP 原生**: 完全兼容 MCP 标准，无缝对接主流 AI 助手
- 🔒 **安全优先**: 命令白名单/黑名单、沙箱执行、权限控制
- ⚡ **高性能**: 基于 LingMinOpt 自动优化，响应时间 < 100ms
- 🚀 **会话管理**: 支持多会话、会话持久化、状态同步
- 📊 **性能监控**: 内置性能监控，实时追踪指标
- 🧪 **严格测试**: 单元测试 + 集成测试 + E2E 测试，覆盖率 >= 85%

---

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/guangda/ling-term-mcp.git
cd ling-term-mcp

# 安装依赖
npm install
```

### 配置

```bash
# 生成配置文件
npm run config

# 或者使用 LingMinOpt 自动优化配置
cd optimization
python3 optimize_mcp_params.py
```

### 启动

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

### 连接到 AI 助手

#### Cursor

在 Cursor 设置中添加 MCP 服务器：

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "node",
      "args": ["/path/to/ling-term-mcp/dist/index.js"]
    }
  }
}
```

#### Claude

在 Claude Desktop 配置中添加：

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "node",
      "args": ["/path/to/ling-term-mcp/dist/index.js"]
    }
  }
}
```

---

## 📖 使用文档

### 可用工具

#### 1. execute_command - 执行终端命令

```json
{
  "name": "execute_command",
  "description": "执行终端命令",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "description": "要执行的命令"
      },
      "args": {
        "type": "array",
        "items": {"type": "string"},
        "description": "命令参数"
      },
      "session_id": {
        "type": "string",
        "description": "会话 ID（可选）"
      }
    },
    "required": ["command"]
  }
}
```

**示例**:
```
执行 ls -la 命令
```

#### 2. sync_terminal - 同步终端状态

```json
{
  "name": "sync_terminal",
  "description": "同步终端状态",
  "inputSchema": {
    "type": "object",
    "properties": {
      "session_id": {
        "type": "string",
        "description": "会话 ID"
      }
    },
    "required": ["session_id"]
  }
}
```

**示例**:
```
获取当前终端的工作目录和环境变量
```

#### 3. list_sessions - 列出会话

```json
{
  "name": "list_sessions",
  "description": "列出所有活跃会话",
  "inputSchema": {
    "type": "object",
    "properties": {}
  }
}
```

**示例**:
```
列出所有活跃的终端会话
```

#### 4. create_session - 创建会话

```json
{
  "name": "create_session",
  "description": "创建新的终端会话",
  "inputSchema": {
    "type": "object",
    "properties": {
      "name": {
        "type": "string",
        "description": "会话名称"
      },
      "working_directory": {
        "type": "string",
        "description": "工作目录"
      }
    }
  }
}
```

**示例**:
```
创建一个名为 "dev" 的会话，工作目录为 /home/user/projects
```

---

## 🏗️ 项目架构

```
Ling-term-mcp/
├── src/                    # 源代码
│   ├── index.ts            # MCP Server 入口
│   ├── tools/              # MCP 工具实现
│   │   ├── execute_command.ts
│   │   ├── sync_terminal.ts
│   │   ├── list_sessions.ts
│   │   └── ...
│   ├── sessions/           # 会话管理
│   │   ├── manager.ts
│   │   └── store.ts
│   ├── security/           # 安全层
│   │   ├── validator.ts
│   │   └── sandbox.ts
│   └── utils/              # 工具函数
├── tests/                  # 测试
│   ├── unit/               # 单元测试
│   ├── integration/        # 集成测试
│   └── e2e/                # E2E 测试
├── optimization/           # LingMinOpt 优化
│   ├── optimize_mcp_params.py
│   └── search_space.py
├── docs/                   # 文档
│   ├── API.md
│   └── USER_GUIDE.md
└── .lingflow/              # LingFlow 工作流
    └── workflows/
        └── develop_ling_term_mcp.yaml
```

---

## 🔧 开发

### 基于 LingFlow + LingMinOpt 的开发流程

```bash
# 1. 使用 LingFlow 执行开发工作流
lingflow workflow .lingflow/workflows/develop_ling_term_mcp.yaml

# 2. 运行 LingMinOpt 参数优化
cd optimization
python3 optimize_mcp_params.py

# 3. 应用优化参数
npm run apply-optimized-config

# 4. 运行测试
npm test

# 5. 构建生产版本
npm run build
```

### 添加新工具

```bash
# 使用 LingFlow 模板生成新工具
lingflow run skill-creator \
  --params '{
    "skill_type": "mcp-tool",
    "tool_name": "your_tool",
    "tool_description": "Your tool description"
  }'
```

---

## 📊 性能

### 优化结果（LingMinOpt）

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 响应时间 | < 100ms | 87ms | ✅ |
| 吞吐量 | > 100 req/s | 124 req/s | ✅ |
| 内存使用 | < 100MB | 76MB | ✅ |
| 错误率 | < 1% | 0.3% | ✅ |

### 最佳配置

```json
{
  "max_connections": 200,
  "ping_interval": 10,
  "command_timeout": 60,
  "output_buffer_size": 100000,
  "session_cache_ttl": 1800,
  "log_level": "info"
}
```

---

## 🔒 安全

### 安全特性

1. **命令白名单**: 只允许执行预定义的安全命令
2. **命令黑名单**: 禁止执行危险命令（rm, sudo 等）
3. **沙箱执行**: 隔离执行环境，防止系统污染
4. **权限控制**: 细粒度的权限管理
5. **审计日志**: 记录所有操作，便于追踪

### 默认黑名单

```
rm, rmdir, sudo, su, chmod, chown, dd, mkfs, fdisk, ...
```

---

## 🧪 测试

### 运行测试

```bash
# 所有测试
npm test

# 单元测试
npm run test:unit

# 集成测试
npm run test:integration

# E2E 测试
npm run test:e2e

# 性能测试
npm run test:performance

# 安全测试
npm run test:security
```

### 测试覆盖率

```bash
npm run test:coverage
```

目标覆盖率: **85%+**

---

## 📝 文档

- [API 文档](docs/API.md)
- [用户指南](docs/USER_GUIDE.md)
- [开发指南](docs/DEVELOPMENT.md)
- [LingMinOpt 集成](docs/LINGMINOPT_INTEGRATION.md)
- [LingFlow 工作流](.lingflow/workflows/develop_ling_term_mcp.yaml)

---

## 🤝 贡献

欢迎贡献！请遵循以下流程：

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 使用 LingFlow 执行开发工作流
4. 运行测试 (`npm test`)
5. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
6. 推送到分支 (`git push origin feature/AmazingFeature`)
7. 开启 Pull Request

---

## 📜 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

## 🙏 致谢

- **LingMinOpt** - 灵研极简自优化框架
- **LingFlow** - 灵研流式AI框架
- **灵研** - 极简自主研究哲学
- **Model Context Protocol** - MCP 标准协议

---

## 📞 联系方式

- GitHub: https://github.com/guangda/ling-term-mcp
- Gitea: http://zhinenggitea.iepose.cn/guangda/ling-term-mcp

---

**Ling-term-mcp（灵犀）- 心有灵犀一点通，AI 精准操控终端** 🚀

**版本**: 1.0.0
**发布日期**: 2026-03-24
**基于**: LingMinOpt + LingFlow
