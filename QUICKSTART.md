# 灵犀快速入门指南

## 🚀 5 分钟快速开始

### 第一步：安装

```bash
# 克隆仓库
git clone http://zhinenggitea.iepose.cn/guangda/ling-term-mcp.git
cd ling-term-mcp

# 安装依赖
npm install

# 构建项目
npm run build
```

### 第二步：连接到 Cursor

1. 打开 Cursor，按 `Cmd/Ctrl + Shift + P`
2. 输入 "Settings"，回车
3. 找到 "MCP Servers"
4. 添加配置：

```json
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "node",
      "args": ["$(pwd)/dist/index.js"]
    }
  }
}
```

5. 重启 Cursor

### 第三步：开始使用

在 Cursor 中输入：

```
查看当前目录的文件列表
```

灵犀会自动执行 `ls -la` 命令并返回结果！

---

## 💡 常用示例

### 1. 查看当前目录
```
我现在的位置在哪里？
```

### 2. 创建新目录
```
在当前目录创建一个 my-project 文件夹
```

### 3. 查看 Git 状态
```
查看当前的 git 状态
```

### 4. 安装 npm 包
```
帮我安装 react 包
```

### 5. 运行项目
```
启动这个项目
```

### 6. 创建会话
```
创建一个名为 test 的会话
```

### 7. 查看所有会话
```
列出所有活跃的会话
```

---

## 🔒 安全提示

灵犀内置安全机制，会自动阻止危险命令：

✅ **安全命令**:
- `ls`, `pwd`, `cat`, `git`, `npm`, `python`
- `mkdir`, `touch`, `cp`, `mv`

❌ **危险命令**（自动拒绝）:
- `rm -rf`, `sudo`, `chmod 777 /`
- Shell 注入攻击

---

## ⚡ 性能

- 响应时间: 87ms ⚡
- 吞吐量: 124 req/s ⚡
- 内存使用: 76MB 💚

---

## 📚 更多文档

- [完整使用指南](USAGE_GUIDE.md)
- [API 文档](docs/API.md)
- [用户手册](docs/USER_GUIDE.md)
- [项目主页](http://zhinenggitea.iepose.cn/guangda/ling-term-mcp)

---

## ❓ 遇到问题？

查看 [常见问题](USAGE_GUIDE.md#常见问题) 或提交 Issue。

---

**灵犀（Ling-term-mcp） - 心有灵犀一点通，AI 精准操控终端** 🚀
