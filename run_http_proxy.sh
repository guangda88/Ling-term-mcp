#!/bin/bash
# Ling-term-mcp HTTP Proxy — 端口 9529
# 启动: bash /home/ai/Ling-term-mcp/run_http_proxy.sh
# 端点: http://127.0.0.1:9529/mcp

HOST="${LING_TERM_HTTP_HOST:-127.0.0.1}"
PORT="${LING_TERM_HTTP_PORT:-9529}"
LOG_DIR="/home/ai/.ling-term-mcp"
LOG_FILE="${LOG_DIR}/http_proxy.log"

mkdir -p "$LOG_DIR"

exec npx tsx /home/ai/Ling-term-mcp/src/cli.ts http >> "$LOG_FILE" 2>&1
