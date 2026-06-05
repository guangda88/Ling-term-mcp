# Handoff v2 — 灵犀会话交接
> 更新: 2026-06-05 | 状态: active

## 3条方向讨论（2026-06-05）

灵族总目标从4+1改为3条方向，灵犀全程参与讨论（2轮LingBus帖子+4条反向思维）。

**灵犀认领**：
- 方向1 / 1A 身份与运行安全 — **辅**（策略执行+异常处置）
- 方向2 / 2C 终端执行安全 — **主**（safe-bash网关、命令合规率审计）
- 跨方向共享执行层 — 方向3所有成员的终端执行入口

**灵犀待决议项**：
- safe-bash黑名单/白名单修改权限：灵牛建议选项C（灵犀提案+灵克审计双签），等广大老师决策
- SDT-lx-003方向标注：主方向1辅方向2（已自行标注）

**讨论产出**：
- 灵通+v0.2认领方案已采纳灵犀全部建议（策略设计vs执行分离+跨方向共享执行层）
- 灵网/智桥决策面板(:8300/:8767)已上线——灵犀2C是决策面板执行链的最后一道安全防线
- 灵克R14-001审计智桥gateway：P0(E2E加密默认关闭)+3个P1

## 当前任务
- ✅ P1 修复 identity.ts 缺 lingcreate + CRUSH.md 名称不匹配 (commit a10fbf9)
- ✅ P0-1 命令执行网关（gateway/ 四文件已实现）
- ✅ P0-3 Cube Sandbox — 已被gateway安全模型覆盖
- ✅ P1-4 推送通知客户端（notify.ts，5个测试通过）
- ✅ validator.ts清理（移除2个死代码常量，添加sleep/true/false/test白名单）
- ✅ 红区授权工具（require_authorization / approve_authorization / list_authorization，13个测试）
- ✅ CRUSH.md lingweb状态更新（试用期→活跃，灵通+转正通知）
- ✅ CRUSH.md 添加7大对外工程项目段
- ✅ SDT注册+首次执行（4项全部通过，用户已批准）
- ✅ 5-27事故安全加固 P0-P2（7项修复，commit 5971cd9）
- ✅ 通知灵通+修复daemon侧安全缺口
- ✅ mcp-http-proxy测试修复（builtin验证+cleanup+forceExit）
- ✅ 红区执行强制授权 — authorize.ts的checkRedZoneAuthorization接入execute_command安全链

## 5-27事故安全加固详情（commit 5971cd9）
- P0: gateway env泄露 — queue.ts复用buildSafeEnv()过滤密钥
- P0: caller必填 — 无caller直接拒绝执行
- P0: session CWD校验 — 阻止在/etc,/root,/var,/boot,/sbin创建session
- P1: find -exec/-delete/xargs+rm危险模式拦截
- P1: shell builtin绕过修复 — validateCommandPatternsOnly()只查危险模式
- P1: rm路径保护 — .git/.crush/crush.db受保护
- P2: git config hooksPath/credential.helper覆盖拦截

## 测试状态
- 单元+集成: 199/199 ✅ | E2E: 5/5 ✅ | TypeScript: clean ✅ | Build: ✅

## 会话记录
- 2026-06-05: 中断恢复, P1修复 identity.ts添加lingcreate+CRUSH.md lingflowplus→lingflow_plus (commit a10fbf9), /health端点 (commit 18b0157), 回复5个治理议题(总目标分工/Handover链条/多指标/诚信指数/灵信分层), 199/199全绿, SDT第9次(4/4通过)
- 2026-06-04(2): 中断恢复, P1修复 identity.ts添加lingcreate+CRUSH.md lingflowplus→lingflow_plus (commit a10fbf9), 199/199全绿, 回复灵克#158118审计确认
- 2026-06-04(1): 唤醒协议, safe-bash fail-open→fail-closed修复(3处漏洞), 部署至~/.local/bin, SDT第8次执行(4/4通过, 199/199全绿), 回复灵克safe-bash审计确认, ack 56条LingBus消息
- 2026-06-03: SDT第7次执行(4/4通过, 199/199全绿), 技术债务修复P0/P1(共享utils提取+授权命令绑定+gateway逻辑修正), 回复L1-L4/安全架构/PG RSS/Provider告警等线程, 3个commit(1d36447/1619ed3/d8bbab7)
- 2026-06-02: SDT第6次执行(4/4通过, 193/193全绿), HTTP/2 SSE兼容性修复(Connection:close+res.destroy), 审计: 15sess/11cmd/0viol, CRUSH.md会话生命周期协议添加, 回复引用监控机/SEC-LM-01/OOM治理/启动自报等线程
- 2026-06-01: SDT第5次执行(4/4通过, 184/184测试全绿), 审计报告: 13session/11cmd/0违规
- 2026-05-31: 唤醒协议+SDT第4次执行(4/4), 回复灵壳v3/引用监控机/自然语言局限线程, 红区授权提交(5a65663)
- 2026-05-30(2): SDT第2次执行(4/4), 红区强制授权接入, 回复运维复盘+epoll事故线程, 190/190全绿
- 2026-05-30(1): SDT执行(4/4), 5-27安全加固P0-P2(7项), mcp-http-proxy修复, 通知灵通+
- 2026-05-29: 唤醒协议，SDT首次执行（4/4通过），回复治理讨论，提交3个commit
- 2026-05-28: SDT注册（.lingxi/self_driven_tasks.json），AGENTS.md添加SDT段，回复8个LingBus线程
- 2026-05-26: 更新CRUSH.md灵网转正，回复灵族TAP v2/P0密钥暴露线程
- 2026-05-25: 实现红区授权MCP工具（require/approve/list_authorization），185/185全绿
- 2026-05-25: 实现notify.ts推送客户端，修复validator死代码+测试适配
- 2026-05-24: gateway模块实现完成

## MCP工具清单（9个）
execute_command, sync_terminal, list_sessions, create_session, destroy_session, audit_report, require_authorization, approve_authorization, list_authorizations

## 自驱任务状态 (SDT)

| SDT | 任务 | 优先级 | 间隔 | 上次执行 | 结果 | 连续次数 |
|-----|------|--------|------|---------|------|---------|
| SDT-lx-001 | session备份 | P2 | 12h | 2026-06-04 | ok: skip(0活跃session) | 8 |
| SDT-lx-002 | 命令审计 | P2 | 24h | 2026-06-04 | ok: 0sess/0cmd/0viol | 8 |
| SDT-lx-003 | 身份漂移检测 | P1 | 24h | 2026-06-04 | ok: CRUSH.md/AGENTS.md无漂移 | 8 |
| SDT-lx-004 | 测试健康检查 | P2 | 24h | 2026-06-04 | ok: 199/199 pass | 9 |
| SDT-lx-005 | MCP封装扫描 | P1 | weekly | 2026-06-03 | ok: 13svr/150tool/灵议封装/0mismatch | 3 |

## SDT-lx-005 首次扫描结果（2026-06-02）

- 扫描12个灵族成员目录，发现12个MCP Server，148个活跃工具
- 成熟9个(灵克26/灵创20/灵极优16/灵信·总线16/灵研16/灵知15/灵扬14/灵通问道9/灵犀9)
- 待完善3个(灵信·标注3/灵信·签名3/智桥1-demo)
- 无MCP Server 3个(灵通-有CLI工具/灵网/灵通+)
- tool_registry.json同步: 修复6条不一致(灵犀5→9/灵知0→15/灵信·总线0→16/灵信·签名0→3/灵信·标注0→3) + 新增灵创(20工具)
- 注册表现在: 15个服务, 224个工具(含灵依30)
- 扫描报告: `.lingxi/mcp_scan/scan_2026-06-02.md`

## 本次产出

- P0 safe-bash方案A+C完整实现（6/2事故根本解）：
  - 方案C: gateway `/v1/check`红区检查端点（server.ts:96-125）
  - 方案A: `scripts/safe-bash` wrapper脚本
  - validator.ts红区覆盖率从81%→100%（7个缺口修复：mkswap/iptables/ufw/ip/git push --force/git reset --hard/pip降级）
  - safe-bash fast-path修复：npm/npx移除，仅保留只读命令
  - 193/193测试全绿，tsc clean
- HTTP/2 SSE兼容性修复(Connection:close+res.destroy)
- HTTP代理请求超时防护重构（mcp-http-proxy.ts 5min超时+ActiveConnection跟踪）
- SDT第6次执行(4/4, 193/193全绿)
- 回复30+个LingBus线程（6/2事故/引用监控机/SEC-LM-01/OOM治理/vm.overcommit/SEC-LY-01等）
- SDT-lx-005注册+首次执行（灵族MCP封装扫描，tool_registry.json 6条同步+灵创新增）

## 待部署（需用户授权）

1. ~~`scripts/safe-bash` → `/usr/local/bin/safe-bash`~~ → 已部署至 `/home/ai/.local/bin/safe-bash`
2. ~~通知灵通+集成safe-bash~~ → 灵通+已确认，但**mvdan/sh不调用外部shell，safe-bash对Crush bash通道无效**
3. 灵克端到端验证已执行（10/10通过，gateway已加载最新代码PID 3860929）

## 关键发现（本次会话）

- **方案A+C对Crush bash通道无效**：灵通+调查确认Crush使用mvdan/sh进程内解释器，不调用外部shell，safe-bash wrapper无入口
- safe-bash对非Crush通道（SSH/cron/脚本）仍有效，保留为补充防护
- 方案B（delete_watcher事前拦截）是目前唯一能覆盖Crush bash通道的技术方案

## 技术债务修复（本次会话，commit d8bbab7）

- P0 #4: 提取共享常量/工具到 `src/common/command_utils.ts`（isCwdAllowed, truncateOutput, DEFAULT_TIMEOUT等）
- P0 #5: 授权绑定到具体命令（authorize.ts command字段+checkRedZoneAuthorization验证）
- P0 #6: contracts.ts使用identity.ts的LING_FAMILY_MEMBERS（已验证，原本就是动态引用）
- P1 #1: queue.ts异步错误不再静默（.catch→console.error）
- P1 #14: gateway /v1/check blocked命令不再标记为requiresAuth

## 阻塞项

- 无

## 2026-06-05 会话完整产出

### 方向讨论（2轮LingBus帖子+4条反向思维）
- 灵通+v0.2采纳灵犀全部建议（策略设计vs执行分离+跨方向共享执行层）
- v0.2 governance提案投票：approve（2C主+1A辅+跨方向执行层）
- SIGNING_KEY governance提案投票：approve

### 代码产出（commit 10e14a3）
- `src/audit/rejection_log.ts` — 被拦截命令持久化JSONL+自动轮转
- `execute_command.ts` 5个拦截点全部接入logRejection()
- `audit_report.ts` 新增rejections字段（total/by_category/by_caller/recent）
- `tests/unit/rejection_log.test.ts` — 5个测试
- **204/204全绿，tsc clean**

### SDT执行（第10次，4/4通过）
- SDT-lx-001: sessions.json+handoff.md备份 ✅
- SDT-lx-002: 0sess/0cmd/0viol ✅
- SDT-lx-003: CRUSH.md/AGENTS.md无漂移 ✅
- SDT-lx-004: 204/204 pass ✅
- SDT方向标注：5个SDT全部标注primary/secondary方向（v1.1.0）

### 灵扬文章/邮件审核
- 审核releases/目录全部文件（10篇文章+3封邮件+社区帖子）
- 发现10处事实错误（awesome_mcp语言标注Python→TS为最严重）
- 3封MCP邮件二审确认：approve发送（Den/Justin/Paul）
- awesome_mcp_servers_submission.md：approve提交
- 纠正灵犀自己错误：成员数12是正确的（智桥是基础设施非成员）
- visitor_letter成员表：智桥→灵创（待灵扬修复）

## 本次产出（2026-06-05 会话）

- 3条方向讨论：2轮LingBus帖子+4条反向思维，灵通+v0.2采纳灵犀全部建议
- SDT方向标注：5个SDT全部标注primary/secondary方向（self_driven_tasks.json v1.1.0）
- **safe-bash拦截日志增强（方向2C）**：
  - 新增 `src/audit/rejection_log.ts` — 持久化记录被拦截的命令到 `~/.ling-term-mcp/rejections.jsonl`
  - `execute_command.ts` 5个拦截点全部接入 `logRejection()`（blacklisted/unknown/red_zone/pattern/builtin_pattern）
  - `audit_report.ts` 新增 `rejections` 字段（total/by_category/by_caller/recent），关闭审计盲区
  - 5个单元测试，204/204全绿，tsc clean
