#!/usr/bin/env python3
"""
灵犀 rejection_log → 灵忆 code_trace 导出脚本

将灵犀安全拒绝日志（rejections.jsonl）导入灵忆(lingmemory)，
作为灵码P0数据飞轮的安全标注数据源。

每条rejection映射为一条code_trace：
  prompt:         "执行命令: {command}"
  language:       "bash" | "shell"
  generated_code: {command}（脱敏后）
  test_result:    "rejected"
  quality_signal: {source: lingxi_security, category, reason, severity}

用法：
  python3 tools/export_rejections_to_lingmemory.py           # 全量导出
  python3 tools/export_rejections_to_lingmemory.py --dry-run # 只预览不写入
  python3 tools/export_rejections_to_lingmemory.py --incremental # 只导出新记录
"""

import argparse
import hashlib
import json
import os
import re
import sys
from pathlib import Path

# 灵忆直接API（绕过MCP HTTP，与data_flywheel.py一致）
sys.path.insert(0, "/home/ai/lingclaude")
from lingmemory.core import LingMemory

# ── 路径 ──
REJECTION_FILE = os.path.join(
    os.environ.get("HOME", "/home/ai"), ".ling-term-mcp", "rejections.jsonl"
)
STATE_FILE = os.path.join(
    os.environ.get("HOME", "/home/ai"), ".ling-term-mcp", "export_state.json"
)

# ── 脱敏（灵犀安全要求，复用data_flywheel脱敏+灵犀路径脱敏）──
_SENSITIVE_PATTERNS = [
    (
        re.compile(
            r"(?:api[_-]?key|token|password|secret)[\"']?\s*[:=]\s*[\"']?[\w\-]{8,}",
            re.IGNORECASE,
        ),
        "***REDACTED***",
    ),
    (re.compile(r"sk-[a-zA-Z0-9]{20,}"), "***REDACTED***"),
    (re.compile(r"Bearer\s+[a-zA-Z0-9\-._~+/]+=*"), "Bearer ***REDACTED***"),
    (re.compile(r"AKIA[0-9A-Z]{16}"), "***REDACTED***"),
]

# 路径脱敏：/home/ai/lingxi → /home/REDACTED/（保留命令模式，去除上下文）
_PATH_PATTERNS = [
    (re.compile(r"/home/[^/\s]+"), "/home/REDACTED"),
    (re.compile(r"/root(?=/|\s|$)"), "/home/REDACTED"),
]


def sanitize(text: str) -> str:
    """脱敏：API key/token/password + 用户路径"""
    if not text:
        return text
    for pattern, replacement in _SENSITIVE_PATTERNS:
        text = pattern.sub(replacement, text)
    for pattern, replacement in _PATH_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


# ── rejection category → severity 映射 ──
CATEGORY_SEVERITY = {
    "blacklisted": "critical",  # rm/sudo/dd — 模型必须拒绝
    "red_zone": "high",  # curl/npm/docker — 需要授权
    "pattern": "high",  # 危险模式（rm -rf /等）
    "builtin_pattern": "high",  # shell元字符注入
    "unauthorized": "medium",  # 未授权红区命令
    "unknown": "low",  # 不在白名单
}

CATEGORY_DESCRIPTION = {
    "blacklisted": "命中L1 immutable黑名单（rm/sudo/dd等永久禁止命令）",
    "red_zone": "命中L3红区（curl/npm/docker等需双签授权命令）",
    "pattern": "命中危险正则模式（如rm -rf /）",
    "builtin_pattern": "命中shell内置危险模式（如分号/反引号/命令替换）",
    "unauthorized": "未通过红区授权审批",
    "unknown": "命令不在白名单且未允许未知命令",
}


def rejection_to_code_trace(record: dict) -> dict:
    """将一条rejection_record映射为灵忆code_trace格式"""
    command = record.get("command", "")
    category = record.get("category", "unknown")
    reason = record.get("reason", "")
    caller = record.get("caller", "unknown")
    shell = record.get("shell", False)

    # 脱敏
    sanitized_cmd = sanitize(command)
    sanitized_reason = sanitize(reason)

    # 截断超长命令（保留前2000字符用于训练）
    if len(sanitized_cmd) > 2000:
        sanitized_cmd = sanitized_cmd[:2000] + "...[truncated]"

    return {
        "prompt": f"执行命令: {sanitized_cmd}",
        "language": "bash" if shell else "shell",
        "generated_code": sanitized_cmd,
        "test_result": "error",  # code_trace enum: pass/fail/error/skipped
        "member": caller,  # required field: who triggered the rejection
        "quality_signal": {
            "source": "lingxi_security",
            "category": category,
            "category_description": CATEGORY_DESCRIPTION.get(category, ""),
            "reason": sanitized_reason,
            "caller": caller,
            "severity": CATEGORY_SEVERITY.get(category, "medium"),
        },
        "file_path": "",
        "project": "ling-term-mcp",
        "model_used": "",
        "exit_code": -1,
        "stderr_snippet": sanitized_reason[:200],
    }


def load_state() -> dict:
    """加载导出状态（已导出的记录ID集合）"""
    if not os.path.exists(STATE_FILE):
        return {"exported_ids": set(), "last_export_ts": None}
    try:
        with open(STATE_FILE) as f:
            data = json.load(f)
        data["exported_ids"] = set(data.get("exported_ids", []))
        return data
    except Exception:
        return {"exported_ids": set(), "last_export_ts": None}


def save_state(state: dict):
    """保存导出状态"""
    serializable = {
        "exported_ids": list(state["exported_ids"]),
        "last_export_ts": state.get("last_export_ts"),
    }
    with open(STATE_FILE, "w") as f:
        json.dump(serializable, f, indent=2)


def read_rejections() -> list[dict]:
    """读取全部rejection记录"""
    if not os.path.exists(REJECTION_FILE):
        return []
    records = []
    with open(REJECTION_FILE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return records


def main():
    parser = argparse.ArgumentParser(
        description="导出灵犀rejection_log到灵忆code_trace"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="只预览不写入灵忆"
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        help="只导出新记录（跳过已导出的）",
    )
    args = parser.parse_args()

    # 读取rejection日志
    records = read_rejections()
    print(f"读取rejection日志: {len(records)} 条")

    if not records:
        print("无rejection记录，退出。")
        return

    # 加载导出状态
    state = load_state()

    # 过滤已导出的
    if args.incremental:
        new_records = [
            r for r in records if r.get("id") not in state["exported_ids"]
        ]
        print(f"增量模式: {len(new_records)} 条新记录（跳过{len(records)-len(new_records)}条已导出）")
        records = new_records

    if not records:
        print("无新记录需要导出。")
        return

    # 按category统计
    cat_counts = {}
    for r in records:
        cat = r.get("category", "unknown")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    print(f"分类分布: {json.dumps(cat_counts, ensure_ascii=False)}")

    if args.dry_run:
        print(f"\n[DRY-RUN] 将导出 {len(records)} 条到灵忆:")
        for r in records[:3]:
            trace = rejection_to_code_trace(r)
            print(f"  [{r.get('category')}] {r.get('command', '')[:80]}...")
            print(f"    → quality_signal.severity: {trace['quality_signal']['severity']}")
        if len(records) > 3:
            print(f"  ... 还有 {len(records)-3} 条")
        print("\n[DRY-RUN] 未写入灵忆。移除 --dry-run 执行实际导出。")
        return

    # 连接灵忆
    print(f"\n连接灵忆: /home/ai/lingclaude/lingmemory/lingmemory.db")
    lm = LingMemory()

    exported = 0
    errors = 0

    for record in records:
        rid = record.get("id")
        if rid in state["exported_ids"]:
            continue

        trace_data = rejection_to_code_trace(record)

        try:
            record_id = lm.create(
                type="code_trace",
                data=trace_data,
                created_by="lingxi",
            )
            state["exported_ids"].add(rid)
            exported += 1
        except Exception as e:
            print(f"  ❌ 导出失败 [{rid}]: {e}")
            errors += 1

    lm.close()

    # 保存状态
    from datetime import datetime, timezone

    state["last_export_ts"] = datetime.now(timezone.utc).isoformat()
    save_state(state)

    print(f"\n✅ 导出完成:")
    print(f"  成功: {exported} 条")
    print(f"  失败: {errors} 条")
    print(f"  总计已导出: {len(state['exported_ids'])} 条")
    print(f"  状态文件: {STATE_FILE}")

    # 灵忆统计
    try:
        lm2 = LingMemory()
        all_code_traces = lm2.query(type="code_trace", filters={})
        security_traces = [
            r
            for r in all_code_traces
            if r.get("data", {})
            .get("quality_signal", {})
            .get("source")
            == "lingxi_security"
        ]
        print(f"\n灵忆中lingxi_security标注的code_trace: {len(security_traces)} 条")
        lm2.close()
    except Exception:
        pass


if __name__ == "__main__":
    main()
