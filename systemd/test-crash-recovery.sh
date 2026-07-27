#!/bin/bash
# Lingxi systemd unit — crash-recovery self-test
# 用户 sudo 执行，验证 lingxi-http.service 是否真正常驻

set -u

UNIT="lingxi-http.service"
EXPECTED_PORT="9529"
HEALTH_URL="http://127.0.0.1:${EXPECTED_PORT}/health"

echo "=== Step 1: 单元加载状态 ==="
sudo systemctl daemon-reload
sudo systemctl is-enabled "$UNIT"

echo
echo "=== Step 2: 服务存活检查 ==="
if ! sudo systemctl is-active --quiet "$UNIT"; then
    echo "服务未运行，正在启动..."
    sudo systemctl start "$UNIT"
    sleep 3
fi
sudo systemctl status "$UNIT" --no-pager -l | head -20

echo
echo "=== Step 3: 健康检查 ==="
RESP=$(curl -s --max-time 5 "$HEALTH_URL")
echo "Health: $RESP"
if [[ "$RESP" != *'"status":"ok"'* ]]; then
    echo "❌ Health check failed"
    exit 1
fi

echo
echo "=== Step 4: 记录 MainPID ==="
BEFORE_PID=$(sudo systemctl show "$UNIT" -p MainPID --value)
echo "MainPID before kill: $BEFORE_PID"
if [[ -z "$BEFORE_PID" || "$BEFORE_PID" == "0" ]]; then
    echo "❌ 无法读取 MainPID"
    exit 1
fi

echo
echo "=== Step 5: 崩溃注入 ==="
echo "正在 kill -9 $BEFORE_PID ..."
sudo kill -9 "$BEFORE_PID"

echo
echo "=== Step 6: 等待 systemd 自愈（RestartSec=5s）==="
for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    if sudo systemctl is-active --quiet "$UNIT"; then
        echo "✅ 服务在 ${i}s 后自动恢复"
        break
    fi
    echo "  等待中... ${i}s"
done

echo
echo "=== Step 7: 自愈后状态 ==="
# Wait for HTTP socket to be live (up to 10s)
sleep 2
AFTER_PID=$(sudo systemctl show "$UNIT" -p MainPID --value)
echo "MainPID after recovery: $AFTER_PID"
if [[ "$AFTER_PID" == "$BEFORE_PID" ]]; then
    echo "❌ MainPID 未变化，自愈失败"
    exit 1
fi

RESP2=$(curl -s --max-time 5 --retry 5 --retry-delay 2 --retry-connrefused "$HEALTH_URL")
echo "Health after recovery: $RESP2"

echo
echo "=== Step 8: 自愈计数 ==="
sudo systemctl show "$UNIT" -p NRestarts --value

echo
echo "=== Step 9: 最近日志 ==="
sudo journalctl -u "$UNIT" --since "1 minute ago" --no-pager | tail -10

echo
echo "=== ✅ 自愈验证完成 ==="
echo "单元: $UNIT"
echo "端口: $EXPECTED_PORT"
echo "策略: Restart=always, RestartSec=5s"
echo "测试结论: $(if [[ "$AFTER_PID" != "$BEFORE_PID" && "$RESP2" == *'"status":"ok"'* ]]; then echo 'PASS'; else echo 'FAIL'; fi)"