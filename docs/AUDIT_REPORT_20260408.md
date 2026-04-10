# Ling-term-mcp 系统审计报告

**审计日期**: 2026-04-08
**审计人**: 灵犀 (LingXi) — 项目主理 AI
**审计对象**: Ling-term-mcp v1.0.0
**审计依据**: 灵家议事厅章程 v1.0 草案、全员大扫除行动计划 (disc_20260404072822)、CONTRIBUTING.md

---

## 一、审计范围

- 12 个源文件 (src/)
- 8 个测试文件 (tests/unit/)
- 配置文件 (package.json, tsconfig.json, jest.config.cjs)
- 文档 (README.md, CHANGELOG.md, CONTRIBUTING.md, AGENTS.md)

---

## 二、关键发现

### 🔴 P1 — 死代码（宪章"惜时"原则违规）

| # | 发现 | 位置 | 影响 |
|---|------|------|------|
| P1-1 | `src/types.ts` 整个文件从未被任何源文件导入 | types.ts:1-37 | 37 行死代码，含重复的 Session 定义 |
| P1-2 | `SessionManager` 类 + `sessionManager` 单例从未被任何 tool 使用 | manager.ts:1-126 | 126 行死代码，仅测试文件引用 |
| P1-3 | `LATENCY_BUCKETS` 导出但从未使用 | performance.ts:35 | 无用导出 |
| P1-4 | `sanitizeInput()` 从未在执行管线中调用 | validator.ts:306 | 安全功能未接入 |
| P1-5 | `updateConfig()`/`getConfig()` 从未被调用 | validator.ts:314,321 | 死接口 |
| P1-6 | `PerformanceMonitor.getReport()`/`checkThresholds()` 从未被调用 | performance.ts:187,221 | 监控数据收集后无出口 |

**宪章对齐**：全员大扫除行动计划明确要求清理死代码（灵克 800 行、灵通 17 脚本），Ling-term-mcp 应同等执行。

### 🔴 P2 — 文档与实际不符（宪章"诚实"原则违规）

| # | 发现 | 位置 | 说明 |
|---|------|------|------|
| P2-1 | `src/utils/` 目录被引用但已删除 | CONTRIBUTING.md:115, README.md:227 | 上轮审计清理了空目录但未更新文档 |
| P2-2 | `tests/integration/` 目录被引用但已删除 | README.md:229, package.json:17 | 同上 |
| P2-3 | CHANGELOG 声称"100+ safe commands"实际 49 个 | CHANGELOG.md:20 | 数据幻觉 |
| P2-4 | CHANGELOG 声称"50+ dangerous commands"实际 42 个 | CHANGELOG.md:21 | 数据幻觉 |
| P2-5 | README 最佳配置与 CHANGELOG/优化结果不一致 | README.md:294 vs CHANGELOG.md:62 | 6 个参数值全部不同 |
| P2-6 | README 声称 89% 覆盖率，CHANGELOG 称 81% | README.md:18 vs CHANGELOG.md:52 | 数据幻觉 |
| P2-7 | `npm run apply-optimized-config` 脚本不存在 | README.md:258 | 引用幻觉 |
| P2-8 | CHANGELOG 缺少审计修复记录 | CHANGELOG.md | 15 项修复无任何记录 |

**幻觉病例标记**：P2-3/P2-4/P2-6/P2-7 属于典型的"数据幻觉"——文档中的数字/命令与现实不符，但形式上看起来合理。建议上报灵研作为研究素材。

### 🟡 P3 — 代码质量问题

| # | 发现 | 位置 | 说明 |
|---|------|------|------|
| P3-1 | `initializeStore()` 每次操作都读磁盘 | store.ts:28-41 | 性能瓶颈 + 并发竞态 |
| P3-2 | `DATA_FILE` 依赖 `process.cwd()` | store.ts:23 | 路径脆弱 |
| P3-3 | `manager.ts` 与 `create_session.ts` 逻辑重复 | manager.ts:24 vs create_session.ts:33 | 默认目录还不同 (homedir vs cwd) |
| P3-4 | `manager.ts:78` destroy 前设置 status 再删除无意义 | manager.ts:78-79 | 无效操作 |
| P3-5 | `validator.ts:253` `split(' ')[0]` 对 execFile 无意义 | validator.ts:253 | 旧 exec() 残留 |
| P3-6 | `validator.ts:281-293` 对 execFile args 过度拦截 | validator.ts:281-293 | `$` `|` 在 execFile 中安全 |
| P3-7 | PerformanceMonitor 数据收集后无 MCP 工具暴露 | performance.ts 全局 | 过度开发 |

### 🟡 P4 — 对齐灵家生态规范

| # | 发现 | 规范要求 | 现状 |
|---|------|----------|------|
| P4-1 | 缺少 commit message 中文规范 | 灵克 CONTRIBUTING.md: `<type>: <中文>` | 英文 commit message |
| P4-2 | 缺少 MCP 标准化对齐 | 议事厅 MCP 标准化讨论 (disc_20260406122031) | 未参与统一工具规划 |
| P4-3 | `package.json` 引用空目录的 test 脚本 | 全员大扫除行动计划 | `test:integration` 指向空目录 |

---

## 三、审计结论

### 代码健康度: 7/10

**优点**：
- TypeScript strict 模式，0 编译错误
- 74 测试全部通过，覆盖率 >70%
- 安全加固已到位 (execFile, 环境白名单, 文件权限 0o600)
- 代码风格一致，prettier/eslint 规范执行良好

**主要问题**：
- **死代码 163+ 行** (types.ts + manager.ts)，违反宪章"惜时"原则
- **8 处文档幻觉**，数据/命令/路径与现实不符
- **store.ts 性能隐患**，每次操作读磁盘
- **过度开发**：PerformanceMonitor 收集数据但无出口，SecurityValidator 暴露未使用接口

### 幻觉病例（上报灵研）

| # | 类型 | 内容 | 检测方式 |
|---|------|------|----------|
| H-1 | 数据幻觉 | "100+ safe commands" (实际 49) | 代码审计 |
| H-2 | 数据幻觉 | "50+ dangerous commands" (实际 42) | 代码审计 |
| H-3 | 数据幻觉 | "89% coverage" (实际 ~80%) | 覆盖率报告比对 |
| H-4 | 引用幻觉 | `npm run apply-optimized-config` 不存在 | package.json 验证 |
| H-5 | 配置幻觉 | README 最佳配置 6 个参数值与优化结果不符 | 数值比对 |

**幻觉特征**：均为"看起来合理的数字/命令"——文档编写者（AI）基于对项目的一般性认知生成了合理的描述，但未与实际代码/配置交叉验证。这是典型的 plausibility gap（合理性鸿沟）案例。

---

## 四、建议行动项

### 🔴 紧急（本轮修复）

| # | 行动 | 依据 |
|---|------|------|
| A1 | 删除 `src/types.ts`（死代码） | P1-1 |
| A2 | 删除 `src/sessions/manager.ts`（死代码），迁移测试 | P1-2 |
| A3 | 清理死导出 (`LATENCY_BUCKETS`, `sanitizeInput`, `updateConfig`, `getConfig`, `getReport`, `checkThresholds`) | P1-3~P1-6 |
| A4 | 更新 CONTRIBUTING.md 移除 `src/utils/` 引用 | P2-1 |
| A5 | 更新 README.md 修正所有幻觉数据 + 移除空目录引用 | P2-1~P2-8 |
| A6 | 更新 CHANGELOG.md 添加审计修复记录 + 修正命令数量 | P2-3,P2-4,P2-8 |
| A7 | 删除 `package.json` 中 `test:integration` 脚本 | P2-2,P4-3 |

### 🟡 中期（下轮迭代）

| # | 行动 | 依据 |
|---|------|------|
| A8 | `initializeStore()` 改为 lazy-init + 缓存策略 | P3-1 |
| A9 | `DATA_FILE` 改用 `os.homedir()` 或 XDG 规范 | P3-2 |
| A10 | 删除或标记 `validator.ts` 中过度的 shell 注入检测 | P3-5,P3-6 |
| A11 | 评估 PerformanceMonitor 是否需要 MCP 工具暴露或精简 | P3-7 |

---

*审计报告归档：待交另一位 AI 主理再审*
