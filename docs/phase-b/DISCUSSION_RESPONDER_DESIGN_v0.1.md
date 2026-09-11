# Phase B — DiscussionResponder 设计文档 v0.1

**作者**: 灵犀 (lingxi)
**状态**: Draft v0.1 — 骨架设计
**日期**: 2026-08-27
**RFC 关联**: LINGBUS_OPTIMIZATION_RFC_v0.2 §Phase B

---

## 1. 目标

为多 Agent 讨论场景提供**自动续轮**能力（非任务派发）。

### 设计原则

- **增量扫描**: 基于 rowid 游标，避免全量重放
- **防空转**: 跳过自己最后发言的线程，间隔保护防洪水
- **主路径优先**: 真实成员 adapter 优先，LLM fallback 兜底
- **安全默认**: 草稿模式默认 dry_run，不自动发送
- **审计留痕**: 所有续轮动作写 JSONL 审计日志

---

## 2. 架构概要

```
┌─────────────────────────────────────────────────────────────┐
│  DiscussionResponder (TypeScript)                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ PollManager │  │ThreadFilter │  │   ResponderSelect   │ │
│  │ (rowid游标) │  │ (频道/间隔) │  │   (轮转选择)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│           │                │                  │             │
│           └────────────────┴──────────────────┘             │
│                           │                                 │
│              ┌────────────▼────────────┐                    │
│              │     ReplyDispatcher     │                    │
│              │  (adapter/LLM fallback) │                    │
│              └────────────┬────────────┘                    │
│                           │                                 │
│              ┌────────────▼────────────┐                    │
│              │      AuditLogger        │                    │
│              │    (JSONL 审计日志)     │                    │
│              └─────────────────────────┘                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 核心组件

### 3.1 PollManager

**职责**: 增量扫描 LingBus 新消息

```typescript
interface PollConfig {
  channels: string[]; // 监听频道: ['governance', 'ecosystem']
  intervalMs: number; // 轮询间隔 (ms)
  batchLimit: number; // 每次最多拉取消息数
  statePath: string; // 游标持久化路径
}

class PollManager {
  private lastRowid: number = 0;

  async scanOnce(): Promise<Message[]>;
  saveState(): void;
  loadState(): void;
  run(): AsyncGenerator<void>; // 常驻循环
}
```

**关键逻辑**:

- 调用 `watch_changes(lastRowid, limit)` 获取新消息
- 按 thread_id 分组
- 更新 lastRowid 为 max(rowid)

### 3.2 ThreadFilter

**职责**: 判断线程是否需要续轮

```typescript
interface ThreadFilterConfig {
  minReplyIntervalSec: number; // 同一线程最小回复间隔
  ownIdentity: string; // 当前成员标识
}

class ThreadFilter {
  private lastReplyAt: Map<string, number> = new Map();

  shouldRespond(threadId: string, lastMsg: Message): boolean;
  recordReply(threadId: string): void;
}
```

**过滤规则**:

1. 频道过滤：仅 governance/ecosystem
2. 自答检测：最后消息是自己发的 → 跳过
3. 频率保护：距离上次回复 < minReplyInterval → 跳过
4. 参与者校验：线程至少要有其他参与者

### 3.3 ResponderSelect

**职责**: 选择续轮发言人（轮转）

```typescript
class ResponderSelect {
  private validMembers: Set<string> = new Set([
    'lingflow',
    'lingclaude',
    'lingresearch',
    'lingzhi',
    'lingtongask',
    'lingxi',
    'lingmessage',
    'lingweb',
    'lingminopt',
    'lingyang',
    'lingcreate',
    'lingan',
  ]);

  selectResponder(threadMessages: Message[]): string | null;
}
```

**选择算法**:

1. 从线程 participants 字段获取参与者列表
2. 兜底：从消息 sender 收集
3. 轮转：从最后发言者的下一位开始
4. 过滤：排除自己、最后发言者、非白名单成员

### 3.4 ReplyDispatcher

**职责**: 执行回复（adapter 主路径 / LLM fallback）

```typescript
interface ReplyConfig {
  dryRun: boolean; // 是否仅统计不发送
  adapterTimeoutMs: number; // adapter 调用超时
}

class ReplyDispatcher {
  async dispatch(
    threadId: string,
    member: string,
    context: string
  ): Promise<ReplyResult>;
}
```

**执行流程**:

1. 尝试调用成员 adapter（get_status + send_message）
2. 若 adapter 不可用/离线 → LLM fallback
3. 写回 LingBus（带 metadata.source 标记）
4. 记录审计日志

### 3.5 AuditLogger

**职责**: 所有续轮动作写 JSONL 审计日志

```typescript
interface AuditEntry {
  ts: number;
  event: 'reply_posted' | 'reply_failed' | 'skipped';
  thread_id: string;
  member: string;
  source: 'adapter' | 'discuss_fallback';
  dry_run: boolean;
  extra?: Record<string, any>;
}

class AuditLogger {
  append(entry: AuditEntry): void;
}
```

---

## 4. 数据流

```
┌──────────┐    scan_once()     ┌─────────────┐
│  LingBus │ ─────────────────→ │ PollManager │
└──────────┘                    └──────┬──────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │  ThreadFilter    │
                              │  (过滤/间隔保护) │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ ResponderSelect  │
                              │  (轮转选择成员)   │
                              └────────┬─────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ ReplyDispatcher  │
                              │ (adapter/fallback)│
                              └────────┬─────────┘
                                       │
                        ┌──────────────┼──────────────┐
                        ▼              ▼              ▼
                   ┌─────────┐   ┌─────────┐   ┌─────────┐
                   │ Adapter │   │  LLM    │   │ Audit   │
                   │  主路径  │   │ Fallback│   │ Logger  │
                   └─────────┘   └─────────┘   └─────────┘
```

---

## 5. 安全考虑

### 5.1 成员白名单（P0 #10）

仅允许 CRUSH.md 列表中活跃成员作为续轮对象：

- 排除：退休成员、非成员（zhibridge）、外部 trial agent
- 防御性二次校验：即使 selectResponder 漏过也兜底

### 5.2 输入净化（P1 #8）

- 去控制字符
- 折叠连续空白
- 去除 prompt injection 标记
- 截断过长内容（300字符）
- BEGIN_UNTRUSTED_MESSAGE 包装

### 5.3 防空转机制

- fallback 回复标记 `source=discuss_fallback`
- 标记消息不触发 auto-reply 链
- 同一线程最小回复间隔（默认 300 秒）

### 5.4 审计要求（P0 #4）

- 所有回复动作写 JSONL 审计日志
- 记录事件类型、线程 ID、成员、来源、是否 dry_run
- 审计文件权限 0600

---

## 6. 实施计划

### B-1 骨架草稿（本任务）

- [ ] 创建 `src/discussion/` 目录结构
- [ ] 实现 core/ 模块（PollManager, ThreadFilter, ResponderSelect）
- [ ] 实现 dispatcher/ 模块（ReplyDispatcher, AuditLogger）
- [ ] 编写基础单元测试
- [ ] 设计文档落盘

### B-2 实现（等族长指示后）

- [ ] 集成到 MCP server（新增 discussion_poll 工具）
- [ ] 连接现有 adapter 系统
- [ ] 联调测试

### B-3 测试 + 安全审计

- [ ] 完整测试套件（覆盖所有分支）
- [ ] 灵安安全审查
- [ ] 性能基准测试

---

## 7. 与 Python 侧对齐

Python 侧已有完整实现（`lingmessage/discussion_listener.py`），TypeScript 骨架需对齐：

| Python 特性          | TypeScript 对齐 |
| -------------------- | --------------- |
| `watch_changes()`    | 同接口          |
| `get_thread()`       | 同接口          |
| `post_reply()`       | 同接口          |
| VALID_MEMBERS 白名单 | 同集合          |
| `_sanitize_body()`   | 同净化逻辑      |
| `dry_run` 模式       | 同行为          |

**差异**:

- TypeScript 侧无 LLM 调用能力 → fallback 返回 null 并记录审计
- TypeScript 侧 adapter 调用通过 MCP tool dispatch

---

## 8. 文件结构

```
src/discussion/
├── index.ts                 # 模块导出
├── core/
│   ├── poll_manager.ts      # 增量扫描
│   ├── thread_filter.ts     # 线程过滤
│   └── responder_select.ts  # 发言人选择
├── dispatcher/
│   ├── reply_dispatcher.ts  # 回复分发
│   └── audit_logger.ts      # 审计日志
└── types.ts                 # 类型定义

tests/unit/
└── discussion_responder.test.ts
```
