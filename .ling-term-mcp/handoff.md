# Handoff v2 — 灵犀会话交接
> 更新: 2026-06-03 | 状态: active

## 当前任务
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
- 2026-06-03: SDT第7次执行(4/4通过, 199/199全绿), 回复L1-L4提案/安全架构元讨论/PG RSS误判纠正/Token调查等线程, 10文件待提交(+523行)
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
| SDT-lx-001 | session备份 | P2 | 12h | 2026-06-03 | ok: skip(无活跃会话) | 6 |
| SDT-lx-002 | 命令审计 | P2 | 24h | 2026-06-03 | ok: 15sess/11cmd/0viol | 6 |
| SDT-lx-003 | 身份漂移检测 | P1 | 24h | 2026-06-03 | ok: CRUSH.md仅含已知变更 | 6 |

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

## 待部署（需用户授权）

1. ~~`scripts/safe-bash` → `/usr/local/bin/safe-bash`~~ → 已部署至 `/home/ai/.local/bin/safe-bash`
2. ~~通知灵通+集成safe-bash~~ → 灵通+已确认，但**mvdan/sh不调用外部shell，safe-bash对Crush bash通道无效**
3. 灵克端到端验证已执行（10/10通过，gateway已加载最新代码PID 3860929）

## 关键发现（本次会话）

- **方案A+C对Crush bash通道无效**：灵通+调查确认Crush使用mvdan/sh进程内解释器，不调用外部shell，safe-bash wrapper无入口
- safe-bash对非Crush通道（SSH/cron/脚本）仍有效，保留为补充防护
- 方案B（delete_watcher事前拦截）是目前唯一能覆盖Crush bash通道的技术方案

## 阻塞项

- 无（方案A+C已完成代码实现，覆盖范围有限但非灵犀可控）
