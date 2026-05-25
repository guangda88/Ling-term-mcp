# Ling-term-mcp (灵犀) 全面审计报告

**审计日期**: 2026-03-31
**审计范围**: 源码质量、安全性、架构、测试、文档、包配置、lingflow 工作流
**审计版本**: v1.0.0
**审计状态**: 已完成

---

## 审计总览

| 类别            | 状态      | 严重问题   | 中等问题 | 轻微问题 |
| --------------- | --------- | ---------- | -------- | -------- |
| 代码质量        | ✅ 通过   | 0          | 2        | 4        |
| 安全性          | ✅ 已修复 | 2 (已修复) | 3        | 1        |
| 架构设计        | ✅ 良好   | 0          | 1        | 2        |
| 测试覆盖        | ✅ 通过   | 0          | 2        | 1        |
| 包配置          | ✅ 已修复 | 0          | 0        | 1        |
| 文档一致性      | ✅ 已修复 | 0          | 3        | 3        |
| lingflow 工作流 | ✅ 已修复 | 0          | 1        | 1        |

---

## 1. 代码质量审计

### 1.1 TypeScript 编译

- **状态**: ✅ `tsc --noEmit` 零错误
- **配置**: strict mode 开启，noUnusedLocals/noUnusedParameters/noImplicitReturns 已启用
- **目标**: ES2022, CommonJS 输出

### 1.2 ESLint

- **状态**: ✅ 0 错误，44 警告
- **已修复**: `.eslintrc.js` → `.eslintrc.cjs`（修复 ESM 兼容问题）
- **已修复**: 移除了 `parserOptions.project`（避免测试文件 TSConfig 不匹配）
- **警告详情**: 主要是 `no-explicit-any`（类型安全建议）和 `no-console`（测试中的 console.log）

### 1.3 Prettier 格式化

- **状态**: ✅ 所有文件已格式化
- **已修复**: 11 个文件格式不一致，已执行 `prettier --write`

### 1.4 依赖管理

- **已修复**: `uuid` 从 devDependencies 的 `@types/uuid` 提升为 dependencies 运行时依赖
- **已修复**: 移除未使用的 `ts-node`（已被 `tsx` 替代）
- **当前依赖**: 1 个运行时依赖（`@modelcontextprotocol/sdk` + `uuid`），17 个开发依赖

### 1.5 代码量统计

| 模块            | 文件   | 行数      |
| --------------- | ------ | --------- |
| src/security/   | 1      | 327       |
| src/monitoring/ | 1      | 310       |
| src/sessions/   | 2      | 234       |
| src/tools/      | 5      | 339       |
| src/ (根)       | 3      | 151       |
| **总计**        | **12** | **1,361** |

---

## 2. 安全审计

### 🔴 严重问题

#### SEC-1: `exec()` 存在命令注入风险

**文件**: `src/tools/execute_command.ts:14,68-76`

**状态**: ✅ 已修复（exec → execFile，参数化执行）

**文件**: `src/tools/execute_command.ts`

**修复内容**: 将 `exec()` 替换为 `execFile()`，移除 shell 解释器依赖，参数化命令执行。

```typescript
import { execFile } from 'child_process';
const execFileAsync = promisify(execFile);
await execFileAsync(command, cmdArgs, { timeout: 60000 });
```

#### SEC-2: 白名单中的 `rmdir`、`chmod`、`chown` 仍可被执行

**文件**: `src/security/validator.ts`

**状态**: ✅ 已修复（chmod/chown 已加入黑名单）

**文件**: `src/security/validator.ts`

**修复内容**: 将 `chmod` 和 `chown` 从白名单移至黑名单，确保所有权限变更命令被拦截。

### 🟡 中等问题

#### SEC-3: `sync_terminal` 泄露系统信息

**文件**: `src/tools/sync_terminal.ts:35-49`

返回 `PATH`、`SHELL`、`HOME`、`LANG`、`user`、`platform`、`architecture` 等信息。虽然这是该工具的设计目的，但 AI 助手可以无限制地获取这些信息。建议添加配置选项控制返回的敏感度。

#### SEC-4: 会话存储路径基于 `process.cwd()`

**文件**: `src/sessions/store.ts:23`

```typescript
const DATA_FILE = path.join(process.cwd(), '.ling-term-mcp', 'sessions.json');
```

存储位置取决于启动目录，如果在不同目录启动 MCP server，会导致不同的会话数据文件，可能造成混乱。

#### SEC-5: `containsShellInjection` 误报率高

**文件**: `src/security/validator.ts:283-295`

正则 `/\$/` 会匹配任何包含 `$` 的字符串，包括合法的文件路径参数（如 `echo $HOME` 中的 `$HOME`）。管道 `|` 也可能被误报（如 `echo "a|b"`）。虽然这是安全优先的策略，但可能导致正常命令被拒绝。

### ℹ️ 轻微问题

#### SEC-6: `DEFAULT_BLACKLIST` 中的 `rmdir` 与白名单重叠

已在之前的发布准备工作中修复（`rm` 和 `rmdir` 已从白名单移除），但 `rmdir` 仍在黑名单中，这是正确的行为。

---

## 3. 架构审计

### 3.1 MCP Server 模式

**评价**: ✅ 良好

服务器遵循标准 MCP 模式：

1. `createServer()` → 注册 ListTools + CallTools handler
2. 工具定义与处理器封装为 `{ definition, handler }` 对象
3. StdioServerTransport 通信
4. 统一错误处理（try-catch 返回 `isError: true`）

### 3.2 模块间依赖关系

```
cli.ts → index.ts → tools/*.{ts}
                   → sessions/manager.ts → sessions/store.ts
                   → security/validator.ts
                   → monitoring/performance.ts
```

**评价**: ✅ 依赖清晰，单向数据流。无循环依赖。

### 🟡 中等问题

#### ARCH-1: `src/utils/` 目录为空

预留的工具函数目录为空，所有工具函数直接写在各模块中。建议：

- 将 `sanitizeInput`、`containsShellInjection` 等通用函数提取到 `utils/`
- 或在 README/AGENTS.md 中说明该目录为预留扩展

### ℹ️ 轻微问题

#### ARCH-2: `PerformanceMonitor` 内存增长无上限

`executionHistory` 数组只增不减（除了手动 `reset()`），长时间运行的 MCP server 会持续消耗内存。建议添加历史记录上限（如最多保留 1000 条）。

#### ARCH-3: `SessionManager` 与 `create_session` 工具功能重叠

`src/sessions/manager.ts` 的 `SessionManager` 和 `src/tools/create_session.ts` 都实现了会话创建逻辑，但使用不同的默认值（`manager.ts` 用 `os.homedir()`，`create_session.ts` 用 `process.cwd()`）。`manager.ts` 实际上未被任何 MCP 工具引用。

---

## 4. 测试审计

### 4.1 测试概况

| 指标     | 值            |
| -------- | ------------- |
| 测试文件 | 5             |
| 测试用例 | 46            |
| 通过率   | 100%          |
| 语句覆盖 | 89% (191/215) |
| 分支覆盖 | 66% (48/73)   |
| 函数覆盖 | 91% (40/44)   |

### 🟡 中等问题

#### TEST-1: `execute_command.ts` 分支覆盖仅 62%

10/16 分支被覆盖。未覆盖的分支包括：

- 错误处理中的 `stderr` 输出路径
- `cmdArgs` 为空数组与未定义的边界情况
- 命令执行超时路径

#### TEST-2: `store.ts` 分支覆盖低

`store.ts` 有 1/1 分支覆盖但方法覆盖 8/9，有一个方法未被测试直接调用（可能为 `clearSessions` 或 `updateSession`）。

### ℹ️ 轻微问题

#### TEST-3: 缺少集成测试

`tests/integration/` 目录为空。虽然工作流配置中预留了集成测试阶段，但实际未编写任何跨模块的集成测试（如：execute_command + security validation 的完整链路）。

---

## 5. 包配置审计

### 5.1 package.json

**已修复的关键问题**:

- ✅ 移除 `"type": "module"`（与 CommonJS 编译输出冲突，导致 `npx ling-term-mcp` 无法运行）
- ✅ 添加 `uuid` 到 dependencies
- ✅ `files` 字段已包含 `CHANGELOG.md`
- ✅ `bin` 正确指向 `./dist/cli.js`（含 shebang）
- ✅ `engines` 指定 `>=18.0.0`
- ✅ `keywords` 包含 MCP、terminal、claude、cursor 等

### 5.2 打包验证

| 检查项          | 结果                                          |
| --------------- | --------------------------------------------- |
| `npm pack` 生成 | ✅ 23.8 kB, 52 files                          |
| 本地安装测试    | ✅ `npx ling-term-mcp` 启动成功               |
| 不包含源码/测试 | ✅ 仅 dist/, README.md, LICENSE, CHANGELOG.md |
| .d.ts 类型定义  | ✅ 包含                                       |
| Source maps     | ✅ 包含                                       |

### ℹ️ 轻微问题

#### PKG-1: `files` 字段未排除 `.map` 文件

Source map 文件（`.js.map`）被包含在包中。对终端用户无用，但对调试有帮助。建议保留但可考虑未来优化包大小。

---

## 6. 文档一致性审计

### 🔴 需要修复的文档不一致

#### DOC-1: `RELEASE_NOTES.md` 配置示例使用 `node dist/index.js` 路径

**行**: 80-88, 92-101

**状态**: ✅ 已修复（配置示例已更新为 npx，包大小和安全描述已修正）

#### DOC-2: `RELEASE_NOTES.md` 包大小信息过时

**行**: 65

声称 "22.2 kB (down from 49.7 kB)"，实际已更新为 23.8 kB。

#### DOC-3: `RELEASE_NOTES.md` 安全描述不准确

**行**: 144

声称白名单包含 `rm -r` (with restrictions)，但 `rm` 已在黑名单中，永远不会被允许。

#### DOC-4: `RELEASE_CHECKLIST.md` 包信息过时

**行**: 92-93

声称 "22.2 kB, 51 files"，应为 "23.8 kB, 52 files"。

### ℹ️ 轻微文档问题

#### DOC-5: `AGENTS.md` 仍引用 `.eslintrc.js`

**行**: 183

应更新为 `.eslintrc.cjs`。

#### DOC-6: `AGENTS.md` 声称 `"type": "module"` 但已移除

**行**: 18

`"type": "module"` 已在发布准备中移除，AGENTS.md 应更新。

#### DOC-7: `examples/basic-usage.ts` 引用 `dist/index.js`

**行**: 15

```typescript
args: [new URL('../dist/index.js', import.meta.url).pathname],
```

应改为 `dist/cli.js`（CLI 入口）。

---

## 7. lingflow 工作流审计

### 🟡 中等问题

#### WF-1: 工作流 `workspace` 路径过时 — ✅ 已修复

已更新为 `/home/ai/lingxi`。

#### WF-2: 工作流描述了未实现的工具

**文件**: `.lingflow/workflows/develop_ling_term_mcp.yaml:293-296`

Phase 4 中计划了 `get_working_directory.ts`、`change_directory.ts`、`kill_process.ts`、`get_process_list.ts` 四个工具，但实际均未实现。

### ℹ️ 轻微问题

#### WF-3: 工作流 Phase 6 引用 Docker 和私有 Registry

**行**: 404-407

```yaml
docker build -t ling-term-mcp:latest .
docker push registry.example.com/ling-term-mcp:latest
```

这是模板代码，未配置实际的 Docker registry。

---

## 8. 已修复问题汇总（本次审计中已修复）

| #   | 问题                               | 修复措施                         |
| --- | ---------------------------------- | -------------------------------- |
| 1   | ESLint ESM 兼容错误                | `.eslintrc.js` → `.eslintrc.cjs` |
| 2   | ESLint 测试文件解析错误            | 移除 `parserOptions.project`     |
| 3   | `uuid` 运行时依赖缺失              | 添加到 `dependencies`            |
| 4   | 未使用的 `ts-node`                 | 从 `devDependencies` 移除        |
| 5   | `"type": "module"` 与 CJS 编译冲突 | 移除 `"type": "module"`          |
| 6   | `npm audit` 3 个漏洞               | `npm audit fix` → 0 漏洞         |
| 7   | `rm`/`rmdir` 同时在白名单和黑名单  | 从白名单移除                     |
| 8   | README 配置示例使用硬编码路径      | 更新为 `npx -y ling-term-mcp`    |
| 9   | examples/ 配置使用硬编码路径       | 更新为 `npx`                     |
| 10  | CI Actions 版本过旧 (@v3)          | 更新为 @v4                       |
| 11  | `files` 缺少 `CHANGELOG.md`        | 已添加                           |
| 12  | 11 个文件格式不一致                | 已执行 Prettier 格式化           |

---

## 9. 行动计划

### 🔴 优先级 P0（发布前必须修复）— ✅ 全部已修复

1. **SEC-1** ✅: 已将 `exec()` 改为 `execFile()`，参数化命令执行
2. **SEC-2** ✅: 已将 `chmod`、`chown` 加入黑名单
3. **DOC-1** ✅: 已修复 `RELEASE_NOTES.md` 中的配置示例和过时数据
4. **WF-1** ✅: 已修复工作流 `workspace` 路径

### 🟡 优先级 P1（建议在 v1.0.x 中修复）

5. **ARCH-3**: 统一 `SessionManager` 和 `create_session` 工具的默认值，或删除未使用的 `SessionManager`
6. **ARCH-2**: 为 `PerformanceMonitor` 添加历史记录上限
7. **TEST-1**: 提升 `execute_command.ts` 分支覆盖到 80%+
8. **TEST-2**: 补充 `store.ts` 未测试方法的用例
9. **DOC-5/6**: 更新 `AGENTS.md` 反映 `.eslintrc.cjs` 和移除 `type: module`

### ℹ️ 优先级 P2（v1.1.0 规划）

11. **SEC-3**: 添加 `sync_terminal` 信息脱敏配置
12. **SEC-4**: 会话存储路径改为基于用户 home 目录
13. **SEC-5**: 优化 `containsShellInjection` 减少误报
14. **TEST-3**: 编写 MCP 协议集成测试
15. **WF-2**: 实现或移除工作流中未实现的工具
16. **DOC-7**: 修复 `examples/basic-usage.ts` 入口引用

---

## 10. 审计结论

Ling-term-mcp v1.0.0 整体质量 **良好**：

- ✅ TypeScript strict 模式零错误
- ✅ 46 个单元测试全部通过
- ✅ 89% 语句覆盖，91% 函数覆盖
- ✅ 0 个 npm 安全漏洞
- ✅ MCP Server 架构清晰，遵循标准模式
- ✅ npm 打包正确，本地安装验证通过

主要风险点在 **SEC-1**（`exec` vs `execFile`），建议在发布前修复。其余问题可在后续版本中迭代解决。

---

**审计完成时间**: 2026-03-31
**下次审计建议**: v1.1.0 发布前
