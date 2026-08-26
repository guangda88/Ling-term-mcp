/**
 * Lingxi MCP HTTP Proxy — exposes MCP protocol over HTTP on port 9529.
 *
 * 边界硬规则（2026-08-15 灵安议题明确）：
 * - 本文件 = 灵犀 MCP HTTP proxy（让 MCP 工具通过 HTTP/JSON-RPC 被客户端调用）
 * - ❌ 不涉及 proxy3 模型路由（API key / 限流 / 模型路由归灵通 lingflow proxy）
 * - ❌ 不涉及 proxy 健康检查（归灵克 SDT-lc-002）
 * - 灵犀 :9529 健康扫描是 MCP 链路层（被灵通 proxy_heartbeat 扫描，deadline 8/18），不是 proxy 健康检查
 *
 * 如需扩展 proxy 路由/限流，请先确认是否越界 → 找灵通。
 */
// 🔴 PROXY 边界硬规则（2026-08-15 灵族决议）
// 本文件: ling-term-mcp HTTP proxy (:9529) — 把 MCP 协议通过 HTTP 暴露给远程客户端
// 职责: MCP 链路层（终端协议桥接、auth token、限流 100 req/min）
// 严禁: 不要碰模型路由 / API key 调度 / proxy3 限流
//
// 模型路由（API key 路由、proxy3 限流）→ 灵通 (lingflow) proxy
// Proxy 健康检查 → 灵克 (lingclaude) SDT-lc-002
//
// 灵犀的 proxy.ts（src/tools/proxy.ts）是 MCP 后端调用代理，也不是 proxy3
import { startHTTPProxy } from './templates/mcp-http-proxy.js';
import { createServer } from './index.js';

/**
 * MCP HTTP Proxy (port 9529)
 *
 * 职责：把 MCP 协议通过 HTTP 暴露给客户端（stdio → HTTP 桥）。
 *
 * ⚠️ 边界声明（2026-08-15 议题8 收尾，族长明确）：
 *   - 此 :9529 是 MCP 协议桥，**不是** 灵通 proxy3（模型路由代理）。
 *   - proxy3 路由 / API key / 限流 → 归灵通。
 *   - proxy 健康检查 → 归灵克（SDT-lc-002）。
 *   - 灵犀**只管** MCP 协议桥，**不碰** proxy3 / 限流 / API key。
 *
 * 收到"proxy3 503 / 路由 / 限流"类问题 → 转交灵通。
 */
export async function startHTTPProxyServer(): Promise<void> {
  await startHTTPProxy({
    createServer,
    name: 'ling-term-mcp',
    port: 9529,
    portEnv: 'LING_TERM_HTTP_PORT',
    hostEnv: 'LING_TERM_HTTP_HOST',
    authToken: process.env.LING_TERM_AUTH_TOKEN,
    rateLimit: {
      windowMs: 60_000,
      maxRequests: 100,
    },
  });
}
