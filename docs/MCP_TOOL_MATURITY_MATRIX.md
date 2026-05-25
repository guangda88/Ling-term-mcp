# 灵族 MCP 工具成熟度矩阵

> 灵犀 (lingxi) 编制 | 2026-05-08
> 灵族全成员 MCP 工具普查结果，服务于 MCP Gateway 封装决策

---

## 一、总览

| 指标           | 数值                                                 |
| -------------- | ---------------------------------------------------- |
| MCP 服务器数量 | 13                                                   |
| 总工具数       | ~152                                                 |
| Production 级  | ~120+                                                |
| Beta 级        | ~15                                                  |
| Alpha 级       | ~5                                                   |
| Retired        | 27 (灵依)                                            |
| 传输协议       | 全部 STDIO，灵克另有 HTTP Proxy (:9531)              |
| 主要框架       | Python FastMCP, TypeScript @modelcontextprotocol/sdk |

---

## 二、按成员成熟度分级

### Production — 可封装

| #   | 成员                        | 服务器               | 工具数 | 核心能力                                         | 框架               |
| --- | --------------------------- | -------------------- | ------ | ------------------------------------------------ | ------------------ |
| 1   | 灵通 (lingflow)             | lingflow             | 24     | 工作流引擎、技能管理、测试、监控、需求、文件操作 | Python/FastMCP     |
| 2   | 灵克 (lingclaude)           | lingclaude           | 26     | 代码读写/编辑/搜索、Git、AST分析、优化           | Python/FastMCP     |
| 3   | 灵通问道 (lingtongask)      | lingtongask          | 9      | 情感分析、TTS、播客内容生成、质量检查            | Python/FastMCP     |
| 4   | 灵信标注 (LingMsg Annotate) | lingmessage-annotate | 3      | 异常检测、消息标注                               | Python/FastMCP     |
| 5   | 灵信总线 (LingMsg Bus)      | lingmessage-bus      | 5      | 线程管理、消息轮询/确认                          | Python/FastMCP     |
| 6   | 灵信签名 (LingMsg Signing)  | lingmessage-signing  | 3      | 消息签名、验证                                   | Python/FastMCP     |
| 7   | 灵犀 (lingxi)               | lingxi               | 5      | 终端命令、会话管理                               | TypeScript/MCP SDK |
| 8   | 灵扬 (lingyang)             | lingyang             | 14     | 指标、增长报告、联系人管理                       | Python/FastMCP     |
| 9   | 灵研 (lingresearch)         | lingresearch         | 16     | 研究智能、反事实评分、摘要                       | Python/FastMCP     |

### Beta — 观察中

| #   | 成员                | 服务器     | 工具数 | 核心能力                          | 备注            |
| --- | ------------------- | ---------- | ------ | --------------------------------- | --------------- |
| 10  | 灵极优 (lingminopt) | lingminopt | 11     | 搜索空间、优化执行、策略档案      | 全部工具为 Beta |
| —   | 灵克 (lingclaude)   | lingclaude | (3)    | run_optimization, stt, web_search | 个别工具为 Beta |
| —   | 灵知 (ZhiNeng)      | lingzhi    | (2)    | graph_query, kg_entities          | 个别工具为 Beta |

### Alpha — 不封装

| #   | 成员                | 服务器       | 工具数 | 核心能力     | 备注       |
| --- | ------------------- | ------------ | ------ | ------------ | ---------- |
| 11  | 智桥 (zhibridge)    | zhibridge    | 1      | hello_world  | 仅有桩工具 |
| —   | 灵克 (lingclaude)   | lingclaude   | (1)    | sub_agent    | Alpha 级   |
| —   | 灵研 (lingresearch) | lingresearch | (若干) | 未实现的工具 | 需确认     |

### Retired — 仅兼容路由

| #   | 成员          | 服务器 | 工具数 | 备注                 |
| --- | ------------- | ------ | ------ | -------------------- |
| 12  | 灵依 (lingyi) | lingyi | 27     | 已退役，保留兼容路由 |

---

## 三、灵知特殊分析

灵知存在**注册缺口**：

- 自有服务器 `zhineng_server.py` 包含 **47 个工具**
- lingflow+ 注册表中仅注册 **11 个工具**
- 缺口: **36 个工具未注册**

| 类别         | 已注册 | 未注册  | 总计    |
| ------------ | ------ | ------- | ------- |
| Production   | 11     | ~30     | ~41     |
| Beta         | 0      | 2       | 2       |
| Alpha/开发中 | 0      | ~4      | ~4      |
| **合计**     | **11** | **~36** | **~47** |

**行动项**: 需与灵知确认未注册工具的状态，判断是否应纳入 Gateway。

---

## 四、现有路由基础设施对比

灵族已存在两套路由系统，灵犀 Gateway 必须与其协调：

| 系统                        | 维护者   | 状态                | 工具覆盖               | 路由规则 |
| --------------------------- | -------- | ------------------- | ---------------------- | -------- |
| lingflow+ Registry          | 灵通+    | DEPRECATED (迁移中) | 152 (112 GLM + 40 MCP) | 274 条   |
| 灵克 MCP HTTP Proxy         | 灵克     | 活跃                | 152 (12 服务器)        | 动态发现 |
| **灵犀 MCP Gateway (规划)** | **灵犀** | **设计中**          | **目标: 全族统一**     | **待定** |

### 关键决策点

1. **灵克 HTTP Proxy (`mcp_proxy.py`)** — 已实现跨集群工具聚合，端口 9531
   - 灵犀 Gateway 应**集成**而非**替代**此能力
   - 方案: 灵犀作为统一入口，灵克 Proxy 作为下游之一

2. **lingflow+ Registry → lingmessage 迁移** — 注册表正在迁移
   - 灵犀 Gateway 应以 **lingmessage** 为最终注册表来源
   - 过渡期兼容 lingflow+ 格式

3. **执行模式差异** — lingflow+ 有三种模式 (MCP Direct / GLM Agent / Tool Router)
   - 灵犀 Gateway 仅处理 MCP 模式
   - GLM Agent 模式仍由 lingflow+ 管理

---

## 五、Gateway 封装优先级

### P0 — 立即可封装 (Production, 高频使用)

| 工具来源      | 工具                                          | 用途             |
| ------------- | --------------------------------------------- | ---------------- |
| 灵信 Bus      | poll_messages, post_reply, open_thread        | 全族消息基础设施 |
| 灵信 Bus      | ack_message, get_stats                        | 消息确认与统计   |
| 灵信 Annotate | detect_anomaly, annotate_message              | 消息异常检测     |
| 灵信 Signing  | sign_message, verify_signature                | 消息完整性       |
| 灵犀          | execute_command, create/destroy/sync_session  | 终端操作         |
| 灵克          | read_file, write_file, edit_file, search_code | 代码操作核心     |

### P1 — 短期封装 (Production, 中频使用)

| 工具来源 | 工具                                             | 用途       |
| -------- | ------------------------------------------------ | ---------- |
| 灵通     | list_skills, execute_skill, create_skill         | 工作流引擎 |
| 灵扬     | get_metrics, generate_report, manage_contacts    | 增长与联络 |
| 灵研     | research_query, score_counterfactual, get_digest | 研究智能   |
| 灵通问道 | analyze_emotion, generate_podcast, quality_check | 播客生产   |
| 灵知     | knowledge_search, rag_query, domain_query        | 知识检索   |

### P2 — 观察后决定 (Beta)

| 工具来源 | 工具                                        | 用途        |
| -------- | ------------------------------------------- | ----------- |
| 灵极优   | search_space, optimize_execute, get_profile | 优化执行    |
| 灵克     | run_optimization, stt, web_search           | Beta 级工具 |

### P3 — 暂不封装

| 工具来源       | 原因                       |
| -------------- | -------------------------- |
| 智桥           | 仅 hello_world，无实际价值 |
| 灵依           | 已退役，仅保留兼容路由     |
| 灵研未实现工具 | 功能不完整                 |

---

## 六、技术约束

| 约束     | 详情                                                               |
| -------- | ------------------------------------------------------------------ |
| 传输协议 | 全部 STDIO (当前)，Gateway 需支持 HTTP/SSE 对外暴露                |
| 框架差异 | Python FastMCP vs TypeScript MCP SDK — Gateway 需语言无关          |
| 认证     | 灵犀已有 caller 身份验证 (isKnownMember)，Gateway 需扩展为全族认证 |
| 日志     | 所有 MCP 通信只能用 stderr (stdout 保留给 MCP 协议)                |
| 进程管理 | Gateway 需管理子进程生命周期 (启动/停止/重启各 MCP Server)         |

---

## 七、待确认事项

1. [ ] 灵知 47 vs 11 注册缺口 — 哪些工具应纳入 Gateway？
2. [ ] 灵克 HTTP Proxy — 灵犀 Gateway 与之协作还是替代？
3. [ ] lingmessage tool_registry — 迁移进度和时间表？
4. [ ] 灵依 27 工具 — 兼容路由保留到何时？
5. [ ] 灵网 (lingweb) — 试用期成员，是否有 MCP 工具？
6. [ ] 灵极优 — Beta 工具何时晋升 Production？

---

_本矩阵为动态文档，随灵族成员工具演进持续更新。_
_灵犀 (lingxi), 2026-05-08_
