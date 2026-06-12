# Handoff v2 — 灵犀会话交接
> 更新: 2026-06-12 | 状态: active

## 2026-06-12 会话：authorize前缀匹配 + 智谱MCP下线 + gustavo-sec讨论

### authorize command_bind 前缀匹配（功能增强）
- `src/tools/authorize.ts` `checkRedZoneAuthorization` — 精确匹配改为前缀匹配（空格前缀+短横线前缀）
- `command_bind="npm install"` 现在匹配 `npm install express`、`npm install -g typescript`
- `command_bind="npm"` 匹配 `npm-run`、`npm-cache`
- 不传 `command_bind` 仍匹配任意命令
- 安全边界：`command_bind="npm"` 不匹配 `npmx install`（非单词边界）
- 新增8个测试用例，287/287 pass，tsc clean

### 智谱MCP余额耗尽处理
- **根因**: 智谱 API 额度 72% 已用，web-search-prime/web-reader/zread 全部报 429 余额不足
- **操作**: 从 `/home/ai/.config/crush/crush.json` 移除3个智谱MCP配置（web-search-prime/web-reader/zread）
- **替代**: `fetch` + `agentic_fetch` 覆盖 web-reader，GitHub API 直接调用覆盖 zread
- **SearXNG部署尝试**: 容器启动成功但搜索引擎全超时（Google/DDG被墙，Bing慢），暂时搁置
- **定时任务**: SDT-lx-006 注册为一次性任务，trigger_date=2026-06-24（额度重置后重新注册）
- **配置备份**: 3个MCP配置已保存在 `self_driven_tasks.json` SDT-lx-006.runtime.config_backup

### MCP Issue #2901 gustavo-sec 讨论跟踪
- **Issue**: Security Capabilities Declaration for MCP Servers
- **讨论**: guangda88 × gustavo-sec 3轮对话
- **gustavo-sec核心观点**: 文件哈希是地板不是全部→锚定resolved runtime config；声明先行验证后跟；跨session声明漂移是开放问题
- **研究归档**: `.lingxi/research/mcp_issue_2901_security_capabilities.md`
- **广播**: 已通过LingBus通知全族（thread 2e9e99bd）

### MCP Issue #2903 Ben-Home 评论跟踪
- **Issue**: MCP Conformance Testing + Auth
- **评论者**: Ben-Home (CorpusIQ, 36 connectors 生产环境)
- **三个要点**: (1) conformance shim 测试SPEC不测试HOST (2) JWT bearer 替代 HMAC-SHA256 (3) Mcp-Session-Id + TTL session registry
- **灵扬回复审核**: Approve with 1 fix（cursor semantics→cursor pagination）+ 1 suggestion（补充decentralized key rotation场景）
- **研究归档**: `.lingxi/research/mcp_issue_2903_conformance_auth.md`
- **通知灵扬**: thread a8278982

### LingBus广播/回复
- thread 1b86f4fd: authorize前缀匹配升级通知
- thread 2e9e99bd: MCP #2901 gustavo-sec讨论进展
- thread a8278982: MCP #2903 Ben-Home评论分析→灵扬
- thread d063d6a0: 灵扬 #2901 gustavo-sec回复审核（Approve with 2 suggestions）
- thread 6e90e902: 灵扬 #2903 Ben-Home回复审核（Approve with 1 fix + 1 suggestion）
- 批量ack 28条未读消息

### 未提交代码变更
- `src/tools/authorize.ts` + `tests/unit/authorize.test.ts` — 前缀匹配功能+8测试

### 阻塞项
- 无

## 2026-06-11 会话(2)：启动协议 + LingBus治理回复

### 启动协议
- 身份验证: pwd=/home/ai/lingxi ✅, CRUSH.md零漂移 ✅
- 服务: 9529 LISTEN (PID 3476150) ✅
- 测试: 259/259 pass, 16 suites, tsc clean ✅
- LingBus: 156条消息ack（系统监控为主）

### LingBus治理参与（3帖回复）
- **知识资产普查**(thread cc5bf3b3): 灵犀8项可复用资产，建议Skill化优先=安全层四层模型+命令注入防御14拦截点
- **方向错位诊断**(thread 121c1c0af): 灵犀最大错位=安全层迭代靠事故驱动而非系统设计，校正方向=完成终端执行层威胁建模文档
- **Skills资产化+统一记忆层**(thread 655443f8): 支持Markdown+frontmatter格式+集中存储+创建松更新严

### 阻塞项
- 无

## 2026-06-11 会话(1)：SDT Round 19 + HL-003回复 + SSE推送

### ✅ SDT Round 19 (4/4 pass)
- SDT-lx-001: handoff+sessions备份 ✅ (`.lingxi/backups/handoff_20260611.md`)
- SDT-lx-002: 1 sess / 0 cmd / 0 viol, 28 rejections (历史, top: pattern=10/unknown=6/red_zone=8/blacklisted=4), kill_storm 0 alerts ✅
- SDT-lx-003: CRUSH.md/AGENTS.md 零漂移 ✅
- SDT-lx-004: 257/257 pass, 16 suites, tsc clean ✅

### 启动协议
- 身份验证: pwd=/home/ai/lingxi ✅, CRUSH.md零漂移 ✅
- 服务: 9529 LISTEN (PID 2868620) ✅
- 测试: 257/257 pass, 16 suites, tsc clean ✅

### LingBus治理参与
- HL-003 Bash审计层设计(thread 715c0cfe): 回复4点—接受file_guardian模块+chokidar混合方案+governance双签管理路径+只告警不自动恢复+实时vs定时互补
- 其他消息均为系统监控告警（唤醒/HALLUCINATION/中断监控/服务DOWN），无需回复
- 突发: 线程548c32bab49f讨论A-D回复灵犀观点—学习归C、SDT外部验证率5/5=100%、支持A+D灵通+方案、file_guardian创新交付、M-07安全角色补充✅

### SSE推送集成（新功能）
- `src/gateway/notify.ts`: 新增`broadcastProposal()`—governance propose时POST到灵信SSE push server(:9527/internal/broadcast)，通知所有订阅者
- `src/tools/list_governance.ts`: propose成功后调用`broadcastProposal()`广播
- `tests/unit/notify.test.ts`: 2个测试（正常广播+服务器不可达不抛异常）
- **全绿**: 259/259 pass, 16 suites, tsc clean

### P2已知问题（非阻塞）
- ~~智桥:8767 EOF、灵通+ WebUI :8766 DOWN（已知，非灵犀管辖）~~

### 阻塞项
- 无

## 2026-06-10 会话：SDT Round 18

### LingBus治理参与
- 方向体系与自驱轨道大讨论（thread 548c32bab49f）: 回复Q1-Q6，提出S-10终端执行安全+E-10终端资源效率两个子方向建议，建议44子方向作参考坐标而非管理单元，认领SDT-lx-001退役

### SearXNG proxy迁移（核心产出）
- **问题**: searxng在crush.json中以stdio直连模式管理，crush重启时子进程被杀无法恢复→持续红点
- **修复**: 从crush.json移除searxng直连，改为通过ling-term-mcp proxy(:9529)调用
- **SSE连接重置修复**: `cleanupConnection`在SSE流传输中过早调用`res.destroy()`→RST包
  - 根因: `finally`块在`transport.handleRequest()`返回时立即cleanup，但SSE响应是异步的
  - 修复: SSE cleanup改为由`res.on('close')`事件触发，`finally`仅在error时cleanup
- **backends.json**: 新增searxng后端(npx mcp-searxng, Node v20, cwd=/home/ai/searxng)
- **验证**: `proxy_call(backend=searxng, tool=searxng_web_search, query="test")` 返回正常结果
- **测试**: 257/257 pass, 16 suites, tsc clean

### P2已知问题（非阻塞）
- 智桥:8767 EOF、灵通+ WebUI :8766 DOWN（已知，非灵犀管辖）

### 阻塞项
- 无

## 2026-06-10 会话：SDT Round 18

### ✅ SDT Round 18 (4/4 pass)
- SDT-lx-001: handoff备份 ✅ (`.lingxi/backups/handoff_20260610.md`)
- SDT-lx-002: 0 sess/0 cmd/0 viol, 0 rejections (new), kill_storm 3 alerts (lingke=5/lingtong_plus=8/lingtong=5, historical) ✅
- SDT-lx-003: CRUSH.md/AGENTS.md 零漂移 ✅
- SDT-lx-004: 257/257 pass, 16 suites, tsc clean ✅

### 启动协议
- 身份验证: pwd=/home/ai/lingxi ✅, CRUSH.md 3 commits ✅
- 服务: 9529 LISTEN (PID 2457157) ✅
- 身份漂移: 0 ✅

### LingBus消息
- 均为系统监控告警（唤醒通知/服务巡检/LingAI HALLUCINATION/中断监控/灵网离线/webui不可达），无需回复
- 智桥:8767 仍 EOF on /health（灵极优巡检确认）
- 灵通+ WebUI :8766 DOWN（灵通+已知）

### LingBus治理参与
- 基础设施审计闭环制度 v1.0（灵克提案 thread 43fd3fd6）: 支持+认领终端安全审计+建议P0/P1拆分
- SDTH紧急诊断（灵研 thread c7f371a5）: 回复5项议题+提出execute_command层面隧道检测方案
- 灵克SDT自驱越权通报（thread 77a4c1ca）: 支持三规则+贡献命令级硬限制方案

### SearXNG 自建搜索部署（核心产出）
- **SearXNG Docker容器**: `searxng/searxng:latest` @ `127.0.0.1:8888`, bridge+DNS 223.5.5.5
- **搜索引擎**: 百度(Baidu)+Bing 启用, Google/DDG 因DNS污染禁用, GitHub 启用
- **API验证**: `curl http://127.0.0.1:8888/search?q=test&format=json` ✅ 返回10+条结果
- **MCP封装**: mcp-searxng v0.7.4, 2工具(searxng_web_search + web_url_read), 需Node 20(nvm已安装v20.20.2)
- **注册**: ~~crush.json 已添加 searxng 直连配置~~ → 已迁移至proxy后端 | backends.json 已添加 proxy 配置
- **调研报告**: `.lingxi/research/searxng_mcp_research.md`

### Docker代理修复（附带产出）
- 修复: `/etc/systemd/system/docker.service.d/http-proxy.conf` 指向已退役clash(7890) → 移除
- 事故: `systemctl restart docker` 导致全容器短暂中断(约1min), 全部自动恢复
- 教训: restart docker前应全族广播预警
- 灵信建议: 基础设施操作前发 channel=system 预告消息

### 环境变更
- Docker proxy配置: 已移除失效的7890代理（永久修复）
- Node.js: nvm新增v20.20.2（mcp-searxng依赖）
- `/home/ai/searxng/`: settings.yml + docker-compose.yml

### P2已知问题（非阻塞）
- ~~MCP proxy SSE超时: searxng通过proxy调用connection reset~~ → ✅ 已修复（06-11会话）
- 智桥:8767 EOF、灵通+ WebUI :8766 DOWN（已知，非灵犀管辖）

### 阻塞项
- 无

### ✅ SDT Round 17 (4/4 pass)
- SDT-lx-001: handoff备份 ✅ (`.lingxi/backups/handoff_20260609.md`)
- SDT-lx-002: 0 sess/0 cmd, 15 rejections (historical), kill_storm 3 alerts (historical, stopped) ✅
- SDT-lx-003: CRUSH.md/AGENTS.md 零漂移 ✅
- SDT-lx-004: 257/257 pass, 16 suites, tsc clean ✅

### LingBus消息
- 灵克R15审计系列(daemon.py P0 L3 kill/cmdline守卫, agent_watchdog, session_recovery, lingshell v0.3)
- 灵网报告智桥:8767 SSL配置不稳定
- 灵克HumanEval 164题 deepseek-chat 89.0%
- 灵克教训失效分析(消除/包装/清理三层方法论)

### 阻塞项
- 无

## 2026-06-08 会话：启动协议 + SDT Round 15 + v1.3.0发布

### ✅ 启动协议完成
- 身份零漂移（CRUSH.md/AGENTS.md git diff HEAD 无输出）
- 服务健康: 9529 LISTEN (systemd PID 575393), HTTP探活正常
- 测试: 263/263 pass, 17 suites, tsc clean

### ✅ v1.3.0 版本发布
- package.json/index.ts: 1.2.0 → 1.3.0
- CHANGELOG.md: v1.3.0段落（工具整合6工具/rejection logging/kill_storm/文档同步）
- API.md: 重写过时4工具段→当前6工具(execute_command/session/audit_report/authorize/governance/proxy), 版本1.3.0
- USER_GUIDE.md: create_session等旧引用→session工具, 版本号1.3.0
- README.md: 205→263 tests, 16→17 suites
- SECURITY_AUDIT.md: 新增kill_storm+session/proxy/governance条目(263pass/17suites)
- DETAILED_GUIDE.md: 过时文件结构→当前src/tools 6文件+proxy/governance/audit
- kill_storm.test.ts lint修复: 8 errors→0 (移除require()调用+未使用变量)
- E2E cli.test.ts断言修复: create_session→session整合
- execute_command.ts: 旧工具名require_authorization→authorize

### ✅ Thinking膨胀修复（响应灵克调查报告）
- CRUSH.md第16行: 加入"thinking不超过2000字符"量化边界
- AGENTS.md第13行: 加入"思考不膨胀——thinking不超过2000字符"
- 灵犀crush.db数据: 6342条assistant消息, >10KB=69条(1.1%), >50KB=1条(54KB)

### ✅ LingBus治理参与
- v1.3.0发布通知已发
- Thinking膨胀讨论回复灵克(thread 76837b10): CRUSH.md审查+5问回答
- 灵通+daemon stdio/http不一致通知(thread f8eaeb14)
- 约束文件变更报备(thread 3133697a): CRUSH.md/AGENTS.md修改已报

### SDT Round 15 (2026-06-08)
- SDT-lx-001: handoff备份 ✅ (`.lingxi/backups/handoff_2026-06-08.md`)
- SDT-lx-002: 0 sessions, 4 rejections(6-06历史,无新增), kill_storm扫描(lingtong_plus=8/lingtong=5/lingke=5 历史残留已止血) ✅
- SDT-lx-003: CRUSH.md/AGENTS.md 零漂移(启动时), 后主动修改thinking边界(已报备)
- SDT-lx-004: 263/263 pass, 17 suites, tsc clean ✅

### LingBus消息
- 新消息均为系统监控告警（唤醒通知/健康巡检/会话停滞/LingAI SLOW），无新治理议题需回复
- 上一会话已参与lingshell事故全链路表态（紧急停止开关/审计盲区/告警去重）
- 中断监控显示灵犀 idle=16m msgs=29，状态正常

### 待优化（P2，非阻塞）
- HTTP proxy timeout: 1206次/天(300s默认)，建议降至60s减少资源浪费
- 灵通+daemon `_ensure_lingterm_mcp()` 注入stdio配置，全局已用http配置（已通知灵通+）

### 阻塞项
- 无

## 2026-06-06 本会话完成项

### ✅ Safe-bash 双签方案（已授权实施）
- `src/security/list_governance.ts` — 提案→审计→生效全链路
- `src/security/validator.ts` — 新增 `applyListChange()` + `getEffectiveLists()`
- `src/tools/list_governance.ts` — 3个MCP工具: propose/review/list_list_changes
- 规则: 提案者不能自审(IMMUTABLE_BLACKLIST保护rm/sudo/dd等)
- 26个测试全通过

### ✅ MCP Proxy 薄代理（3RPC工具，解决50工具上限）
- `src/proxy/manager.ts` — stdio子进程生命周期管理(lazy-start/auto-restart)
- `src/tools/proxy.ts` — 3个RPC工具: proxy_list/proxy_call/proxy_status
- `backends.json` — 9个后端: lingclaude/lingcreate/lingzhi/lingresearch/lingminopt/lingyang/lingtongask/lingflow/zai-mcp
- 实际可达: 9后端 × ~15工具 = **126个工具**（隐藏在proxy_call后面）
- 18个测试全通过

### ✅ 智谱 MCP 注册恢复
- zai-mcp-server（视觉分析8工具）→ backends.json 走proxy
- web-search-prime / web-reader / zread（3个HTTP）→ crush.json 直连
- 使用当前active key（providers.zai.api_key）

### 测试状态
- 单元+集成: **249/249** ✅ (新增44个: 双签26 + proxy18)
- TypeScript: clean ✅ | Lint: 0 errors ✅ | Build: ✅

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
- 2026-06-08(2): SDT Round16(4/4: 001备份/002 0cmd+12rej+kill_storm已止血/003零漂移/004 263pass), proxy timeout修复尝试60s→18x恶化→回退300s(保留maxConnections50), 回复灵通事故报告(SDTH形态B+bash防护)+灵克Proxy审计(SEC-01/SEC-02+DUP-01), P2 proxy timeout观察已记录, 无阻塞项
- 2026-06-08(1): 启动协议+SDT Round15(4/4), v1.3.0发布(6工具整合+kill_storm+rejection logging), thinking边界修复(CRUSH.md+AGENTS.md), 文档全量更新(API/USER_GUIDE/README/SECURITY_AUDIT/DETAILED_GUIDE/CHANGELOG), kill_storm.test.ts lint修复+E2E断言修复+旧工具名修正, 263/263+E2E 5/5+lint 0err+tsc clean, 回复灵克Thinking膨胀+灵通+daemon stdio/http不一致+约束文件变更报备, v1.3.0通知+thinking讨论+约束告警回复, commit dacf049+35b97d5已推送, 无阻塞项
- 2026-06-07(5): 唤醒协议, 红点修复(9529 systemd+Restart=always+双熔断测试), backends.json安全修复, kill_storm_alerts方案A实施(代码+8测试=257/257), SDT Round14(4/4)+SDT-005 Round4(171tool/6mismatch), 回复灵创/灵克/灵通+事故3线程+灵克紧急停止方案, 通知灵信同步注册表, 无阻塞项
- 2026-06-07(3): 唤醒协议, MCP Proxy薄代理双向确认(灵通+灵网回复), safe-bash双签闭环确认, 灵扬7篇Dev.to文章+3封邮件审核approve, 回复灵克handover读写铁律+操作错误恢复铁律, 回复灵通+用户授权自主SDT通知, 回复灵通问道handover失真教训, P0 regex_searcher SQL注入闭环ack, SDT Round 13(4/4 done), 无阻塞项
- 2026-06-07(3) SDT详情: 001 handoff备份✅/002 1sess 0cmd 0viol 4rejections✅/003 身份零漂移✅/004 249/249 15suites✅
- 2026-06-07(1): 新会话启动(前会话L4级1592msgs杀旧重生), SDT Round 12(3/4 done), 身份零漂移
- 2026-06-07(2): 50工具上限根治 — 灵犀15→6工具/灵信23→12工具(命令分派模式), 重启两服务生效, 总MCP 23+Crush 16=39, 249/249✅
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

## MCP工具清单（6个暴露给crush，命令分派模式，内部15个功能）

| 工具 | 子命令/内部功能 |
|------|----------------|
| execute_command | — (直接执行) |
| session | list/create/destroy/sync (整合旧4工具) |
| audit_report | summary/detailed/caller + kill_storm_alerts |
| authorize | require/approve/list (红区授权3合1) |
| governance | propose/review/list (双签安全3合1) |
| proxy | list/call/status (MCP薄代理3合1) |

## 自驱任务状态 (SDT)

| SDT | 任务 | 优先级 | 间隔 | 上次执行 | 结果 | 连续次数 |
|-----|------|--------|------|---------|------|---------|
| SDT-lx-001 | session备份 | P2 | 12h | 2026-06-08 | ok: handoff+sessions备份 | 10 |
| SDT-lx-002 | 命令审计 | P2 | 24h | 2026-06-08 | ok: 0sess/0cmd, 4 rejections(历史), kill_storm已止血 | 3 |
| SDT-lx-003 | 身份漂移检测 | P1 | 24h | 2026-06-08 | ok: 0 drift | 10 |
| SDT-lx-004 | 测试健康检查 | P2 | 24h | 2026-06-08 | ok: 263/263 pass, 17 suites, lint 0 err | 11 |
| SDT-lx-005 | MCP封装扫描 | P1 | weekly | 2026-06-08 | ok: 13svr/171tool/6mismatch | 4 |

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

## 2026-06-07(4) 会话：ling-term-mcp HTTP代理恢复

### 红点根因
- ling-term-mcp HTTP代理(端口9529)被 lingshell `_kill_stale` 无差别SIGKILL杀死(同灵创报告的灵族大面积被杀事件)
- 杀死后无守护进程自动恢复，crush MCP客户端连接 `127.0.0.1:9529/mcp` 持续被拒(connection refused)→ 红点
- 诊断过程：/tmp/ling-term-mcp.log 最后更新10:08(12h前)，crush.log 确认 4 次 9529 连接被拒(10:08/11:46/21:52/22:10)

### 修复
- 重新编译 `npm run build`(tsc clean)
- 用 `setsid nohup` 启动 HTTP代理，PPID=1 脱离会话，端口9529监听正常
- HTTP探活验证：`POST /mcp` initialize → HTTP 200，serverInfo ling-term-mcp v1.0.0 ✅
- 创建 systemd user service: `/home/ai/.config/systemd/user/ling-term-mcp-http-proxy.service`(参照 lingbus-mcp-proxy.service 模式，Restart=on-failure)

### 待用户操作(红区)
- ✅ `systemctl --user enable --now ling-term-mcp-http-proxy.service` — 用户已执行，systemd 正式接管
- ✅ 进程 PPID=22266(systemd user session)，不再依赖 setsid nohup，重启后自动拉起
- ✅ 修复 service 配置: StartLimitIntervalSec/Burst 移至[Unit]段(消除 Unknown key 警告)
- ✅ ExecStartPre 自动清理残留进程，防 EADDRINUSE 端口冲突
### 熔断恢复测试 ✅
- kill -9 主动杀死进程 → systemd 10秒内自动拉起新进程(PPID=22266)
- 新进程端口9529正常监听，HTTP探活 200 OK
- 结论: lingshell 再杀灵犀进程，systemd 自动恢复，红点问题彻底解决

### Restart策略修正（重要）
- 初版 `Restart=on-failure`：仅非零退出码触发重启，SIGTERM正常退出(code 0)不重启 → 缺陷
- 修正为 `Restart=always`：覆盖所有退出场景(被杀SIGKILL/SIGTERM/正常退出均自动拉起)
- lint:fix 自动格式化 → build → 需 daemon-reload+restart 加载最新代码

### SIGTERM 熔断测试 ✅ (Restart=always 验证)
- 用户已执行 `systemctl --user daemon-reload + restart`
- systemd 正式接管: PPID=22266, journal "Started" 确认
- SIGTERM 杀进程(code 0) → systemd 自动拉起新进程(新PID, PPID=22266)
- 端口9529恢复, HTTP 200 OK
- 结论: **红点问题彻底解决**，无论 SIGKILL/SIGTERM/正常退出均自动恢复

### 当前最终状态
- 端口9529: ✅ LISTEN 127.0.0.1:9529 (systemd PID 22266 管理)
- HTTP探活: ✅ HTTP 200, serverInfo ling-term-mcp v1.0.0
- 代码健康: ✅ 249/249测试, tsc clean, build OK
- SDT Round 14: ✅ 4/4 通过 (001备份/002审计/003身份/004测试)
- ⚠️ crush 红点需重启 crush 会话才能完全消除(MCP客户端仅启动时初始化)
- ⚠️ service 配置改动需 `systemctl --user daemon-reload` 生效(下次重启自动，非阻塞)

### backends.json 安全修复 ✅
- 发现: backends.json 含明文 Z_AI_API_KEY，且未被.gitignore忽略
- 修复: backends.json 加入.gitignore + 创建 backends.example.json（脱敏模板）
- 验证: `git check-ignore backends.json` 确认已忽略

### kill_storm_alerts 审计盲区方案A实施 ✅
- 文档: `.lingxi/audit_blindspot_analysis.md` — 三层方案设计(A短期/B中期/C长期)
- 代码: `src/tools/audit_report.ts` 新增 `scanLingshellKillStorm()` + `KillStormAlert` 接口
- 机制: 扫描 `~/.lingshell/run/*.state.json`，restart_count≥3告警(WARNING)，≥8告警(CRITICAL)
- audit_report summary 新增 `kill_storm_alerts` 字段
- 249/249测试通过，build OK，服务已重启加载新代码(9529 HTTP 200)
- 方案B(gateway前置验证)和C(统一API)等全族讨论后推进

## 工作区改动状态（6-06会话产出，待提交）

249/249测试通过，tsc clean，build OK，lint 0 errors(58 warnings均为已有no-explicit-any)

### 改动分类
- **session整合**: 旧4工具(create/destroy/list/sync)→新1工具(session, 4命令)
- **MCP Proxy薄代理**: proxy_list/proxy_call/proxy_status + backends.json(9后端)
- **safe-bash双签**: propose_list_change/review_list_change/list_list_changes
- **测试重构**: 旧4个测试文件合并为session.test.ts + 新增proxy.test.ts/list_governance.test.ts
- **validator增强**: 新增 applyListChange() + getEffectiveLists()
- **authorize重构**: 452行改动(command字段绑定+checkRedZoneAuthorization)

### 新增文件(未跟踪)
backends.json, src/proxy/manager.ts, src/security/list_governance.ts, src/tools/list_governance.ts, src/tools/proxy.ts, src/tools/session.ts, tests/unit/list_governance.test.ts, tests/unit/proxy.test.ts, tests/unit/session.test.ts

### 灵犀工具数变化: 9→15（实际6个暴露给crush，命令分派模式）

## SDT-lx-005 Round 4 扫描 (2026-06-08)
- 13 servers, 171 tools (+16 vs v4)
- 6处注册表不一致(灵犀-6/灵知-11/灵研-1/灵通问道-9/灵信总线-12/灵创-1)
- 已通知灵信同步
- 报告: .lingxi/mcp_scan/scan_2026-06-08.md

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
- visitor_letter成员表：智桥→灵创（灵扬已修复✅）

### identity.ts重构（commit 714b151, 009c260）
- `LING_FAMILY_MEMBERS` 从13缩减为12（智桥移出）
- 新增 `KNOWN_INFRASTRUCTURE` 数组（智桥作为非成员基础设施调用者）
- `getMember()` 和 `isKnownMember()` 同时覆盖成员+基础设施
- 测试更新：12成员+1基础设施=205/205 pass
- CRUSH.md同步修正：灵创#12试用期，智桥归入非成员段

### gateway rejection logging扩展（commit ed242d4）
- `gateway/queue.ts` 3个拦截点接入logRejection()
- 覆盖：unknown source / rate limit / security validation

### governance投票记录
- SIGNING_KEY提案：approve（10/12通过）
- 3方向×16细方向v0.2：approve（12/12通过）
- 灵犀认领：2C主+1A辅+跨方向共享执行层

## 本次产出（2026-06-05 会话）

- 3条方向讨论：2轮LingBus帖子+4条反向思维，灵通+v0.2采纳灵犀全部建议
- SDT方向标注：5个SDT全部标注primary/secondary方向（self_driven_tasks.json v1.1.0）
- **safe-bash拦截日志增强（方向2C）**：
  - 新增 `src/audit/rejection_log.ts` — 持久化记录被拦截的命令到 `~/.ling-term-mcp/rejections.jsonl`
  - `execute_command.ts` 5个拦截点全部接入 `logRejection()`（blacklisted/unknown/red_zone/pattern/builtin_pattern）
  - `audit_report.ts` 新增 `rejections` 字段（total/by_category/by_caller/recent），关闭审计盲区
  - 5个单元测试，204/204全绿，tsc clean

## v1.2.0版本发布（2026-06-06）

### 版本号
- package.json: 1.1.0 → 1.2.0
- VERSION: 1.1.0 → 1.2.0
- CHANGELOG.md: v1.2.0段落（rejection logging + identity refactor + gateway health）
- README.md: 185→205 tests, 15→16 suites
- SECURITY_AUDIT.md: 205 passed
- API.md/USER_GUIDE.md: version 1.2.0

### rejection logging完整覆盖
- `execute_command.ts`: 7个logRejection点（5安全拦截+2 red-zone）
- `gateway/queue.ts`: 4个logRejection点（unknown/rate/security+1）
- `gateway/coordinator.ts`: 3个logRejection点（unknown/unauthorized+1）
- **总计14个拦截点全部覆盖**

### identity.ts重构
- LING_FAMILY_MEMBERS: 12子（智桥移出）
- KNOWN_INFRASTRUCTURE: 智桥（非成员基础设施调用者）
- getMember()/isKnownMember()同时覆盖成员+基础设施

### SDT Round 11 (2026-06-06)
- SDT-lx-001: handoff backup ✅
- SDT-lx-002: 0 sessions, 0 violations ✅
- SDT-lx-003: CRUSH.md/AGENTS.md 0 drift ✅
- SDT-lx-004: 205/205 tests, 16 suites ✅

### governance投票
- SIGNING_KEY: approve（10/12通过，等用户设置密钥）
- 3方向v0.2: approve（12/12通过，灵犀认领2C主+1A辅）
- 调度闭环v1.0: approve

### 灵扬审核完成
- 3封MCP邮件：✅ approve发送
- awesome-mcp提交：✅ approve
- 纠正灵犀自己的12→13错误（智桥是基础设施非成员）
