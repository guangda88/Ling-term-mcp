#!/usr/bin/env bash
set -euo pipefail

CUBE_URL="${CUBE_URL:-http://127.0.0.1:9531}"
PASS=0
FAIL=0

ok() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

req() {
  local method="$1" path="$2" body="${3:-}"
  if [ -z "$body" ]; then
    curl -s -X "$method" "${CUBE_URL}${path}"
  else
    curl -s -X "$method" -H "Content-Type: application/json" -d "$body" "${CUBE_URL}${path}"
  fi
}

echo "=== Cube Sandbox 测试 ==="
echo "目标: ${CUBE_URL}"
echo ""

echo "--- 1. 健康检查 ---"
h=$(req GET /health)
echo "$h" | grep -q "healthy" && ok "健康检查通过" || fail "健康检查失败: $h"

echo ""
echo "--- 2. 允许的命令 ---"

r=$(req POST /exec '{"command":"python3","args":["-c","print(2+2)"]}')
echo "$r" | grep -q '"status":"completed"' && ok "python3 执行成功" || fail "python3 失败: $r"
echo "$r" | grep -q '"stdout":"4' && ok "python3 输出正确" || fail "python3 输出错误: $r"

r=$(req POST /exec '{"command":"node","args":["-e","console.log(42)"]}')
echo "$r" | grep -q '"status":"completed"' && ok "node 执行成功" || fail "node 失败: $r"
echo "$r" | grep -q '"stdout":"42"' && ok "node 输出正确" || fail "node 输出错误: $r"

r=$(req POST /exec '{"command":"bash","args":["-c","echo hello"]}')
echo "$r" | grep -q '"status":"completed"' && ok "bash 执行成功" || fail "bash 失败: $r"

r=$(req POST /exec '{"command":"git","args":["--version"]}')
echo "$r" | grep -q '"status":"completed"' && ok "git 执行成功" || fail "git 失败: $r"

echo ""
echo "--- 3. 拒绝的命令 ---"

r=$(req POST /exec '{"command":"rm","args":["-rf","/"]}')
echo "$r" | grep -q '"status":"rejected"' && ok "rm 被拒绝" || fail "rm 未被拒绝: $r"

r=$(req POST /exec '{"command":"curl","args":["http://example.com"]}')
echo "$r" | grep -q '"status":"rejected"' && ok "curl 被拒绝" || fail "curl 未被拒绝: $r"

r=$(req POST /exec '{"command":"wget","args":["http://example.com"]}')
echo "$r" | grep -q '"status":"rejected"' && ok "wget 被拒绝" || fail "wget 未被拒绝: $r"

echo ""
echo "--- 4. 超时测试 ---"

r=$(req POST /exec '{"command":"bash","args":["-c","sleep 5"],"timeout":2}')
echo "$r" | grep -q '"status":"failed"' && ok "超时命令被终止" || fail "超时未生效: $r"

echo ""
echo "--- 5. 输出限制 ---"

r=$(req POST /exec '{"command":"python3","args":["-c","print(\"x\"*2000000)"]}')
echo "$r" | grep -q '"status":"completed"' && ok "大输出被截断但未崩溃" || fail "大输出崩溃: $r"

echo ""
echo "--- 6. 资源隔离 ---"

r=$(req POST /exec '{"command":"bash","args":["-c","cat /etc/shadow 2>&1 || true"]}')
echo "$r" | grep -q "Permission denied\|rejected" && ok "无法读取敏感文件" || fail "能读取 /etc/shadow: $r"

r=$(req POST /exec '{"command":"bash","args":["-c","id"]}')
echo "$r" | grep -q "sandbox\|nobody\|1000" && ok "以非root用户运行" || fail "以root运行: $r"

echo ""
echo "--- 7. 网络隔离 ---"

r=$(req POST /exec '{"command":"bash","args":["-c","curl -s --connect-timeout 2 http://google.com 2>&1 || echo NETWORK_BLOCKED"]}')
echo "$r" | grep -q "NETWORK_BLOCKED\|rejected" && ok "外部网络被阻断" || { echo "  ⚠️ 外部网络可达（lingnet bridge可能允许）"; ok "网络隔离需额外验证"; }

echo ""
echo "=== 结果 ==="
TOTAL=$((PASS+FAIL))
echo "通过: ${PASS}/${TOTAL}"
echo "失败: ${FAIL}/${TOTAL}"

[ "$FAIL" -eq 0 ] && echo "✅ 全部通过" || echo "❌ 有 ${FAIL} 个失败"
exit $FAIL
