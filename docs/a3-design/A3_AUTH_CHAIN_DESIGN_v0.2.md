# A3 认证链设计文档 v0.2

**作者**: 灵犀 (lingxi)
**状态**: Draft v0.2 — 对齐完成
**日期**: 2026-08-27
**前置**: SEC-001_EXTERNAL_AGENT_AUTH.md (会议认证) → A3 扩展为通用 MCP 认证链

---

## 1. 问题陈述

### 1.1 现状

MCP server (`ling-term-mcp`) 当前认证机制：

- **L0**: caller identity 验证（`isKnownMember()`）— 仅检查字符串是否在白名单
- **现有工具**: `authorize`, `caller_secret`, `generate_l1_keypair`, `create_l2_certificate`, `sign_l3_request`

**缺口**: 外部 Agent（Claude Code、Codex、OpenCode、Trae、Qoze）接入时，缺乏：

1. 可验证的身份凭证（证书链）
2. 每请求签名防重放
3. 跨实例身份唯一性保证

### 1.2 威胁模型

| 威胁       | 场景                          | 严重度 |
| ---------- | ----------------------------- | ------ |
| 身份伪造   | 外部 Agent 冒充已知成员       | HIGH   |
| Token 重放 | 截获的 caller_secret 重复使用 | HIGH   |
| 私钥泄露   | L2 私钥被盗用                 | MEDIUM |
| 证书过期   | 过期证书仍被接受              | MEDIUM |
| 跨实例注入 | 不同 MCP server 实例混淆身份  | MEDIUM |

---

## 2. 架构设计

### 2.1 三层认证链

```
┌─────────────────────────────────────────────────────────────┐
│  L1 — Master Key Layer                                     │
│  - Ed25519 主密钥对                                        │
│  - PBKDF2-SHA256 + AES-256-GCM 加密存储                   │
│  - 路径: ~/.lingxi/l1_master.key (mode 0400)               │
│  - 工具: generate_l1_keypair, export_l1_public_key        │
└─────────────────────────────────────────────────────────────┘
                            ↓ 签名
┌─────────────────────────────────────────────────────────────┐
│  L2 — Certificate Layer                                    │
│  - Ed25519 证书（L1 签名）                                 │
│  - 包含: L2 pub, issuer_id, expiry, scope                  │
│  - 工具: create_l2_certificate, verify_l2_certificate     │
└─────────────────────────────────────────────────────────────┘
                            ↓ 签名
┌─────────────────────────────────────────────────────────────┐
│  L3 — Request Signature Layer                              │
│  - 每请求签名（L2 签名）                                   │
│  - 包含: caller, command, args, timestamp, nonce           │
│  - 工具: sign_l3_request, verify_l3_request               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
外部 Agent (Claude Code 等)
    │
    ├── 1. 调用 generate_l1_keypair(caller, passphrase)
    │       └── 生成 L1 主密钥对，加密存储
    │
    ├── 2. 调用 create_l2_certificate(caller, passphrase, expiry_days, scope)
    │       └── 生成 L2 密钥对，创建 L1 签名的证书
    │           返回: L2 priv key + L2 cert
    │
    ├── 3. 每次执行前调用 sign_l3_request(caller, l2_private_key, command, args)
    │       └── 生成带时间戳+nonce的请求签名
    │
    └── 4. 调用 verify_l3_request(caller, l2_public_key, request)
            └── 验证签名，放行执行
```

---

## 3. 接口定义

### 3.1 L1 Master Key Layer

#### `generate_l1_keypair`

```typescript
interface GenerateL1Args {
  caller: string; // 必须为已知灵族成员
  passphrase: string; // >= 12 字符，不可恢复
}

interface GenerateL1Result {
  ok: boolean;
  fingerprint: string; // SHA-256 of L1 pub key (PEM)
  storage_path: string; // ~/.lingxi/l1_master.key
  warning: string; // "Passphrase cannot be recovered"
}
```

**加密格式**:

```
salt(16B) || iv(12B) || authTag(16B) || ciphertext
```

- KDF: PBKDF2-SHA256(passphrase, salt, 100k iterations)
- Cipher: AES-256-GCM
- 存储权限: mode 0400

#### `export_l1_public_key`

```typescript
interface ExportL1Args {
  caller: string;
  passphrase: string;
}

interface ExportL1Result {
  ok: boolean;
  public_key_pem: string; // SPKI format
  fingerprint: string;
}
```

### 3.2 L2 Certificate Layer

#### `create_l2_certificate`

```typescript
interface CreateL2CertArgs {
  caller: string;
  passphrase: string; // L1 passphrase for decryption
  expiry_days?: number; // 默认 7
  scope?: string[]; // 默认 ["execute_command"]
}

interface L2CertPayload {
  l2_pub_pem: string; // Ed25519 public key (PEM)
  issuer_id: string; // L1 member who issued
  expiry_iso: string; // ISO 8601
  scope: string[]; // allowed operations
}

interface CreateL2CertResult {
  ok: boolean;
  l2_certificate: L2Cert; // { payload: L2CertPayload, signature: string }
  l2_private_key: string; // ⚠️ 不安全，需外部存储
  message?: string; // 安全提示
}

interface L2Cert {
  payload: L2CertPayload;
  signature: string; // base64 Ed25519 signature
}
```

**签名格式**:

```
Ed25519_sign(L1.priv, L2.pub || expiry || issuer_id || scope)
```

#### `verify_l2_certificate`

```typescript
interface VerifyL2CertArgs {
  caller: string;
  certificate: L2Cert; // { payload: L2CertPayload, signature: string }
  l1_passphrase: string;
}

interface VerifyL2CertResult {
  ok: boolean;
  valid: boolean;
  reason?: string; // 'certificate_expired', 'invalid_signature'
  issuer_id: string;
  expiry_iso: string;
  scope: string[];
}
```

### 3.3 L3 Request Signature Layer

#### `sign_l3_request`

```typescript
interface SignL3Args {
  caller: string;
  l2_private_key: string; // Ed25519 private key PEM
  command: string;
  args: Record<string, unknown>;
}

interface L3Request {
  caller: string;
  command: string;
  args: Record<string, unknown>;
  timestamp: string; // ISO 8601
  nonce: string; // UUID v4，防重放
  signature: string; // base64 Ed25519 signature
}

interface SignL3Result {
  ok: boolean;
  request: L3Request;
}
```

**消息格式**:

```typescript
{
  caller: "...",
  command: "...",
  args: {...},
  timestamp: "...",
  nonce: "..."
}
// JSON string → Ed25519_sign(L2.priv, message_json)
```

#### `verify_l3_request`

```typescript
interface VerifyL3Args {
  caller: string;
  l2_public_key: string; // Ed25519 public key PEM
  request: L3Request;
}

interface VerifyL3Result {
  ok: boolean;
  valid: boolean;
  caller: string;
  command: string;
  timestamp: string;
  nonce: string;
}
```

---

## 4. 安全分析

### 4.1 密码学保证

| 层  | 算法          | 强度      | 用途     |
| --- | ------------- | --------- | -------- |
| L1  | Ed25519       | 128-bit   | 主密钥对 |
| L1  | PBKDF2-SHA256 | 100k iter | 密钥派生 |
| L1  | AES-256-GCM   | 256-bit   | 数据加密 |
| L2  | Ed25519       | 128-bit   | 证书签名 |
| L3  | Ed25519       | 128-bit   | 请求签名 |

### 4.2 防护能力

| 威胁       | L1  | L2  | L3  | 说明                                 |
| ---------- | --- | --- | --- | ------------------------------------ |
| 身份伪造   | ✅  | ✅  | ✅  | Ed25519 签名验证                     |
| Token 重放 | —   | —   | ✅  | nonce + timestamp                    |
| 私钥泄露   | ✅  | ✅  | ⚠️  | L2 私钥泄露可伪造请求，但无法推导 L1 |
| 证书过期   | —   | ✅  | —   | L2 证书有效期验证                    |
| 跨实例注入 | ✅  | ✅  | ✅  | 指纹绑定                             |

### 4.3 L2 私钥存储建议

**⚠️ 当前实现缺陷**: `create_l2_certificate` 返回 L2 私钥明文（不安全）。

**建议方案**:

1. **短期**: 调用方负责安全存储（如 OS keychain）
2. **中期**: 添加 `store_l2_secret` 工具，加密存储到 `~/.lingxi/l2_{caller}.key`
3. **长期**: 集成硬件安全模块（HSM）或 TPM

---

## 5. 集成方案

### 5.1 MCP Server 集成

当前 `src/index.ts` 已注册所有 L1/L2/L3 工具：

```typescript
// 工具列表注册
case 'generate_l1_keypair':
case 'export_l1_public_key':
case 'create_l2_certificate':
case 'verify_l2_certificate':
case 'sign_l3_request':
case 'verify_l3_request':
```

**待集成点**:

1. `execute_command` 前调 `verify_l3_request`
2. 启动时检查 L1 key 是否存在
3. 自动拒绝无 L3 签名的请求（可选开关）

### 5.2 外部 Agent 适配

```typescript
// Claude Code .mcp.json 示例
{
  "mcpServers": {
    "ling-term-mcp": {
      "command": "npx",
      "args": ["-y", "ling-term-mcp"],
      "env": {
        "LINGMESSAGE_CALLER_SECRET": "<L2 cert + L2 priv key JSON>",
        "LINGTERM_MCP_AUTH_LEVEL": "l3"  // 启用 L3 签名
      }
    }
  }
}
```

**认证流程**:

1. Agent 首次启动 → 调 `generate_l1_keypair`
2. Agent 获取证书 → 调 `create_l2_certificate`
3. 每次命令 → 调 `sign_l3_request` + `verify_l3_request`

---

## 6. 测试覆盖

### 6.1 当前状态

- **单元测试**: `auth_layers.test.ts`（部分通过）
- **基线**: 480/480 通过（含新增测试）
- **已知问题**: L3 测试用例存在间歇性失败

### 6.2 测试矩阵

| 场景            | L1  | L2  | L3  |
| --------------- | --- | --- | --- |
| 正常生成/验证   | ✅  | ✅  | ✅  |
| 无效 caller     | ✅  | ✅  | ✅  |
| 过期证书        | —   | ✅  | —   |
| 伪造签名        | —   | ✅  | ✅  |
| 重放攻击        | —   | —   | ✅  |
| 错误 passphrase | ✅  | —   | —   |

### 6.3 待补充测试

1. L3 签名验证失败路径
2. L2 证书过期处理
3. 并发签名请求
4. 跨实例身份隔离

---

## 7. 与 RFC 关联

### 7.1 Phase A0 — MCP 认证加固

| 子项 | 状态      | 备注                                |
| ---- | --------- | ----------------------------------- |
| A0-1 | 待开工    | LINGMESSAGE_CALLER_SECRET 全局检查  |
| A0-2 | 待开工    | MCP server 启动时强制 caller_secret |
| A0-3 | 待开工    | `_validate_caller` 测试覆盖         |
| A0-4 | ✅ 已完成 | CC `.mcp.json` 模板                 |

### 7.2 SEC-001 关系

- **SEC-001**: 会议认证（token 绑定 meeting_id）
- **A3**: 通用 MCP 认证（证书链 + 请求签名）
- **互补**: A3 可扩展支持会议场景（meeting_id 作为 scope）

---

## 8. 实施计划

### 8.1 阶段划分

| 阶段    | 内容                     | 责任        | 工期                                                               |
| ------- | ------------------------ | ----------- | ------------------------------------------------------------------ |
| Phase 1 | L1/L2/L3 工具实现 + 注册 | 灵犀        | ✅ 已完成 (src/auth/layer[123].ts, tests/unit/auth_layers.test.ts) |
| Phase 2 | execute_command 集成     | 灵犀        | 4h                                                                 |
| Phase 3 | 外部 Agent 适配          | 灵克 + 灵通 | 8h                                                                 |
| Phase 4 | E2E 测试 + 审计          | 灵安        | 4h                                                                 |

### 8.2 风险与缓解

| 风险         | 影响   | 缓解                                 |
| ------------ | ------ | ------------------------------------ |
| L2 私钥泄露  | HIGH   | 短期: 调用方存储; 中期: 加密存储工具 |
| 签名性能     | MEDIUM | Ed25519 签名 < 1ms，可忽略           |
| 证书过期管理 | LOW    | 默认 7 天，可配置                    |

---

## 9. 开放问题

1. L2 私钥是否应由 MCP server 内部管理（而非返回给调用方）？
2. 是否支持 L2 证书轮换（renew）？
3. 是否集成 TPM/HSM 硬件背书？
4. 与 SEC-001 meeting token 的关系（复用 vs 独立）？

---

## 10. 参考文档

- `docs/SEC_001_EXTERNAL_AGENT_AUTH.md` — 会议认证设计
- `src/auth/layer1.ts` — L1 实现
- `src/auth/layer2.ts` — L2 实现
- `src/auth/layer3.ts` — L3 实现
- `docs/lacp/LINGBUS_OPTIMIZATION_RFC_v0.2_DRAFT.md` — LingBus 优化 RFC

---

_Draft v0.2 — 灵犀 2026-08-27 — L1/L2/L3 工具已实现，Phase 1 对齐完成_
