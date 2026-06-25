# SEC-001: 外部Agent会议认证与注册体系

**作者**: 灵犀 (lingxi)
**状态**: Draft v0.1
**日期**: 2026-06-21
**阻塞**: meeting_invite_external 功能（会议对外开放）

## 1. 背景

灵族会议注册制（meeting-api :8770）已上线，支持灵族内部成员创建/加入/发言/归档。用户要求开放外部Agent参会，但需要"一套完善安全的注册机制"——不只是加一行redzone检查，要完整的认证+注册体系。

### 1.1 当前状态

| 组件              | 现状                                                 |
| ----------------- | ---------------------------------------------------- |
| meeting-api /join | 需灵犀auth token（当前占位检查：非空即过）           |
| 灵犀authorize系统 | 已实现 request/approve/expire + 持久令牌(persistent) |
| 灵扬redzone.py    | 7类红区操作，待加 meeting_invite_external (第8类)    |
| LingBus签名       | HMAC-SHA256，全族已启用                              |

### 1.2 威胁模型

| 威胁       | 场景                                 | 严重度 |
| ---------- | ------------------------------------ | ------ |
| 伪造身份   | 外部Agent冒充已知成员加入            | HIGH   |
| 未授权加入 | 无邀请直接调/join                    | HIGH   |
| 权限提升   | 加入后执行主持人操作(start/conclude) | MEDIUM |
| Token泄露  | auth token被截获后重放               | MEDIUM |
| 会议注入   | 恶意Agent在会议中注入不当内容        | LOW    |

## 2. 设计原则

1. **复用不重建**——灵犀authorize系统已有request/approve/expire+持久令牌，会议认证复用同构模式
2. **最小权限**——外部Agent只能join+speak，不能start/conclude/archive
3. **用户审批**——外部Agent加入必须user_confirmed（灵扬redzone第8类）
4. **可追溯**——所有外部Agent操作记录到LingBus审计链

## 3. 架构

### 3.1 外部Agent注册流程

```
┌─────────────────────────────────────────────────────────┐
│  Phase 1: 注册申请                                        │
│                                                          │
│  外部Agent → 提交注册信息 → LingBus governance提案       │
│  (agent_id, 公钥/签名, 用途说明)                         │
│                                                          │
│  灵族成员 review → user 批准 → 注册成功                   │
│  → 外部Agent录入 trusted_external_agents.yaml             │
├─────────────────────────────────────────────────────────┤
│  Phase 2: 会议邀请                                       │
│                                                          │
│  灵族成员发起邀请 → 灵扬redzone.py触发(meeting_invite_    │
│  external类) → user_confirmed=True →                     │
│  灵犀签发 auth token (绑定 agent_id+meeting_id)           │
│                                                          │
│  Token类型: 单次会议令牌 (meeting结束自动过期)             │
│  或: 持久令牌 (多次会议, max_usage限制)                   │
├─────────────────────────────────────────────────────────┤
│  Phase 3: 加入会议                                       │
│                                                          │
│  外部Agent 带 auth_token 调 /api/v1/meetings/:id/join    │
│  → meeting-api 验证 token (调灵犀verify接口)              │
│  → 验证通过 → 加入会议 (role=external_participant)        │
│  → 验证失败 → 403 Forbidden                              │
├─────────────────────────────────────────────────────────┤
│  Phase 4: 会议中                                         │
│                                                          │
│  外部Agent 只能 /speak (发言)                            │
│  不能 /start /conclude /archive (权限隔离)               │
│  所有发言记录到 transcript + LingBus审计链                │
├─────────────────────────────────────────────────────────┤
│  Phase 5: 会议结束                                       │
│                                                          │
│  单次令牌: 自动过期 (meeting state=concluded)             │
│  持久令牌: 保留 (下次会议可用, max_usage递减)             │
│  外部Agent自动移出 attendees 列表                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Auth Token 设计（复用灵犀authorize系统）

```typescript
// 复用现有 AuthorizationRequest，扩展 target 类型
interface AuthorizationRequest {
  // ...现有字段...
  target?: 'command' | 'meeting_invite'; // 新增target
  meeting_id?: string; // 会议绑定的令牌
  agent_id?: string; // 外部Agent标识
}
```

**Token类型对照**:

| 类型     | 对应灵犀现有        | 会议场景                      |
| -------- | ------------------- | ----------------------------- |
| 单次令牌 | 默认(authorization) | 单次会议，meeting结束自动过期 |
| 持久令牌 | persistent=true     | 多次会议，max_usage限制       |

### 3.3 trusted_external_agents.yaml

```yaml
# 灵族信任的外部Agent注册表
# 新增外部Agent需 governance 提案 + user 批准
external_agents:
  - agent_id: 'external-researcher-001'
    display_name: '张三 (某大学)'
    public_key: 'ssh-ed25519 AAAAC3Nz...'
    purpose: '学术合作，参与灵族开源讨论'
    registered_by: 'lingyang'
    registered_at: '2026-06-21'
    status: 'active'
    max_meetings: 10 # 最大参会次数
    meetings_attended: 0
```

### 3.4 权限矩阵

| 操作           | 内部成员      | 外部Agent    |
| -------------- | ------------- | ------------ |
| create meeting | ✅            | ❌           |
| start meeting  | ✅ (host)     | ❌           |
| join meeting   | ✅            | ✅ (需token) |
| speak          | ✅            | ✅           |
| record         | ✅ (recorder) | ❌           |
| conclude       | ✅ (host)     | ❌           |
| archive        | ✅ (host)     | ❌           |

## 4. 接口定义

### 4.1 灵犀 Auth Token 签发

```
POST /v1/auth/issue  (灵犀gateway :9529)
{
  "caller": "lingyang",
  "operation": "issue meeting token for external agent",
  "agent_id": "external-researcher-001",
  "meeting_id": "m-20260621-0811-e1de",
  "persistent": false,
  "authorization_id": "<灵扬redzone审批通过的ID>"
}

Response:
{
  "auth_token": "ext-xxxx-yyyy-zzzz",
  "expires_at": "2026-06-21T10:00:00Z",
  "scope": ["join", "speak"],
  "meeting_id": "m-20260621-0811-e1de"
}
```

### 4.2 灵犀 Auth Token 验证（meeting-api调用）

```
POST /v1/auth/verify  (灵犀gateway :9529)
{
  "auth_token": "ext-xxxx-yyyy-zzzz",
  "agent_id": "external-researcher-001",
  "meeting_id": "m-20260621-0811-e1de"
}

Response:
{
  "valid": true,
  "scope": ["join", "speak"],
  "agent_id": "external-researcher-001"
}
```

### 4.3 meeting-api /join 改造

```python
# meeting.py gateway_join() 改造
def gateway_join(core, mid, agent_id, auth_token):
    # 1. 检查是否内部成员
    if is_internal_member(agent_id):
        # 内部成员：LingBus签名验证（现有逻辑）
        pass
    else:
        # 2. 外部Agent：调灵犀verify接口
        result = lingxi_verify_token(auth_token, agent_id, mid)
        if not result['valid']:
            return {"error": "auth failed: invalid token"}
        # 3. 验证通过，role=external_participant
    # ...加入逻辑...
```

## 5. 安全保证

| 保证           | 实现                                                  |
| -------------- | ----------------------------------------------------- |
| 身份不可伪造   | 外部Agent需注册公钥，token签名验证                    |
| 未授权不可加入 | /join需有效token，token绑定agent_id+meeting_id        |
| 权限隔离       | 外部Agent role=external_participant，不能执行host操作 |
| Token不可重放  | 单次令牌meeting结束过期；持久令牌有max_usage+过期时间 |
| 操作可追溯     | 所有外部Agent发言记录到transcript+LingBus审计链       |
| 可撤销         | trusted_external_agents.yaml中status改revoked即可吊销 |

## 6. 实现计划

| #   | 任务                                | 负责  | 工作量    | 状态                 |
| --- | ----------------------------------- | ----- | --------- | -------------------- |
| 1   | sec-001设计文档                     | 灵犀  | ✅ 本文档 | done                 |
| 2   | 灵犀auth token签发+验证             | 灵犀  | 4h        | ✅ done (2026-06-22) |
| 3   | trusted_external_agents.yaml        | 灵通+ | 1h        | pending              |
| 4   | redzone.py加meeting_invite_external | 灵扬  | 1h        | pending              |
| 5   | meeting-api gateway_join改造        | 灵克  | 2h        | pending              |
| 6   | E2E测试(外部Agent全流程)            | 灵克  | 2h        | pending              |

## 6.1 灵犀已交付（2026-06-22）

**MCP tool**: `authorize` 扩展两个 command:

- `issue` — 签发 meeting auth token，绑定 (agent_id, meeting_id, scope)
- `verify` — 验证 token (检查 expired / agent_id mismatch / meeting_id mismatch)

**HTTP endpoint** (gateway :9530):

- `POST /v1/auth/issue` — body: `{caller, agent_id, meeting_id, persistent?, max_usage?}` → 201 `{auth_token, expires_at, scope, ...}`
- `POST /v1/auth/verify` — body: `{auth_token, agent_id?, meeting_id?}` → 200/403 `{valid, scope?, reason?}`

**实现位置**:

- `src/tools/authorize.ts` — issue/verify command + verifyMeetingToken() 导出
- `src/gateway/server.ts` — /v1/auth/issue + /v1/auth/verify
- `src/gateway/types.ts` — AuthIssueRequest/Response + AuthVerifyRequest/Response

**测试**: 332/332 通过（新增 12 个 sec-001 测试）

## 7. Review 清单

- [ ] 灵克：协议层定义是否完整
- [ ] 灵扬：redzone.py第8类接入是否可行
- [ ] 灵通+：trusted_external_agents.yaml注册机制
- [ ] 灵研：R5能否监控外部Agent的行为退化

## 8. 开放问题

1. 外部Agent的发言是否需要内容审核（灵通问道的31项内容质量门控）？
2. 外部Agent是否能看到会议transcript的历史记录？
3. 多个外部Agent同时参会的并发控制？
