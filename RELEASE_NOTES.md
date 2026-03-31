# Ling-term-mcp v1.0.0 Release Notes

## 🎉 Initial Release

Ling-term-mcp (灵犀) v1.0.0 is now available! This is the first production-ready release of the AI terminal operations MCP server.

---

## ✨ New Features

### Core MCP Tools
- **execute_command**: Execute terminal commands with security validation
- **sync_terminal**: Synchronize terminal state (working directory, environment)
- **list_sessions**: List all active terminal sessions
- **create_session**: Create new terminal sessions with custom working directories
- **destroy_session**: Terminate active sessions

### Security Features
- **Command Whitelist**: Pre-defined list of 100+ safe commands
- **Command Blacklist**: 50+ dangerous commands blocked (rm, sudo, etc.)
- **Pattern Detection**: Detects shell injection, privilege escalation, fork bombs
- **Input Sanitization**: Removes special shell characters
- **Configurable Security**: AllowUnknownCommands, SanitizeUserInput, MaxCommandLength

### Performance Monitoring
- **Execution Tracking**: Record timestamps and results
- **Metrics Calculation**: Average, P50, P95, P99 percentiles
- **Error Rate Tracking**: Per-command and overall error rates
- **Latency Buckets**: 10ms to 10s classification
- **Memory Leak Detection**: Identify memory issues over time
- **Automatic Instrumentation**: `withPerformanceTracking()` wrapper

---

## 🔧 Technical Improvements

### LingMinOpt Integration
- **Parameter Optimization**: 23 experiments completed
- **Best Configuration**:
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
- **Search Space**: 4096 possible configurations
- **Optimization Time**: 47.05 seconds
- **Best Score**: 0.5770

### Testing Coverage
- **Unit Tests**: 46/46 passing ✅
- **Code Coverage**: 81.05% statements, 78.94% functions
- **Test Categories**:
  - Security validation (18 tests)
  - Performance monitoring (15 tests)
  - Command execution (5 tests)
  - Terminal synchronization (3 tests)
  - Session management (5 tests)

### Package Optimization
- **Package Size**: 23.8 kB (down from 49.7 kB)
- **Package Files**: 52 files (down from 84)
- **Clean Distribution**: Only includes dist/, README.md, LICENSE
- **TypeScript Definitions**: Full .d.ts support

---

## 📖 Installation

```bash
npm install ling-term-mcp
```

### Configure for Cursor

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

### Configure for Claude Desktop

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

---

## 🚀 Usage Examples

### Execute a Command

```
执行 ls -la 命令
```

### Create a Session

```
创建一个名为 "dev" 的会话，工作目录为 /home/user/projects
```

### Sync Terminal State

```
获取当前终端的工作目录和环境变量
```

---

## 📊 Performance Metrics

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Response Time | < 100ms | 87ms | ✅ |
| Throughput | > 100 req/s | 124 req/s | ✅ |
| Memory Usage | < 100MB | 76MB | ✅ |
| Error Rate | < 1% | 0.3% | ✅ |

---

## 🔒 Security

### Default Whitelist (100+ commands)
- `ls`, `pwd`, `cat`, `echo`, `grep`, `find`, `head`, `tail`
- `git`, `npm`, `node`, `python`, `python3`
- `mkdir`, `touch`, `cp`, `mv` (with restrictions)
- And many more...

### Default Blacklist (50+ commands)
- `rm -rf`, `sudo`, `su`, `chmod 777 /`
- `dd`, `mkfs`, `fdisk`, `killall`
- Shell injection patterns, fork bombs, `eval` and `exec`

---

## 🛠️ Development

```bash
# Clone repository
git clone https://github.com/guangda/ling-term-mcp.git
cd ling-term-mcp

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Start server
npm start
```

---

## 📚 Documentation

- [README.md](README.md) - Project overview and quick start
- [docs/API.md](docs/API.md) - Complete API reference
- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) - User guide with examples
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

---

## 🙏 Acknowledgments

- **LingMinOpt** - 极简自优化框架
- **LingFlow** - 灵研流式AI框架
- **Model Context Protocol** - MCP 标准协议
- **灵研** - 极简自主研究哲学

---

## 📜 License

MIT License - See [LICENSE](LICENSE) file

---

## 📞 Contact

- GitHub: https://github.com/guangda/ling-term-mcp
- Gitea: http://zhinenggitea.iepose.cn/guangda/ling-term-mcp

---

**Ling-term-mcp (灵犀) - 心有灵犀一点通，AI 精准操控终端** 🚀

*Version: 1.0.0 | Release Date: 2026-03-24*
