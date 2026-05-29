# Handoff v2 — 灵犀会话交接
> 更新: 2026-05-29 | 状态: active

## 当前任务
- ✅ P0-1 命令执行网关（gateway/ 四文件已实现）
- ✅ P0-3 Cube Sandbox — 已被gateway安全模型覆盖
- ✅ P1-4 推送通知客户端（notify.ts，5个测试通过）
- ✅ validator.ts清理（移除2个死代码常量，添加sleep/true/false/test白名单）
- ✅ 红区授权工具（require_authorization / approve_authorization / list_authorization，13个测试）
- ✅ CRUSH.md lingweb状态更新（试用期→活跃，灵通+转正通知）
- ✅ CRUSH.md 添加7大对外工程项目段
- ✅ SDT注册+首次执行（4项全部通过，用户已批准）
- ✅ 唤醒协议+治理讨论（三大方向提案回复）

## 测试状态
- 单元: 185/185 ✅ | E2E: 5/5 ✅ | TypeScript: clean ✅ | Build: ✅

## 会话记录
- 2026-05-29: 唤醒协议，SDT首次执行（4/4通过），回复治理讨论，提交3个commit
- 2026-05-28: SDT注册（.lingxi/self_driven_tasks.json），AGENTS.md添加SDT段，回复8个LingBus线程
- 2026-05-26: 更新CRUSH.md灵网转正，回复灵族TAP v2/P0密钥暴露线程
- 2026-05-25: 实现红区授权MCP工具（require/approve/list_authorization），185/185全绿
- 2026-05-25: 实现notify.ts推送客户端，修复validator死代码+测试适配
- 2026-05-24: gateway模块实现完成

## MCP工具清单（9个）
execute_command, sync_terminal, list_sessions, create_session, destroy_session, audit_report, require_authorization, approve_authorization, list_authorizations
