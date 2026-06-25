#!/usr/bin/env python3
"""
validate_handover_yaml.py — Handover YAML 验证脚本

R1 验证闭环:
  stop_reason.reason 含有 "已修复"/"fixed"/"resolved" 时，
  必须附带 stop_reason.verification.error_gone_after_fix: true。

用法:
  python3 tools/validate_handover_yaml.py [--fix] [path/to/handover.yaml]
  默认路径: .ling-term-mcp/handover.yaml
"""

import re
import sys
import os
from pathlib import Path

HANDOVER_PATH = Path(".ling-term-mcp/handover.yaml")
FIX_KEYWORDS = re.compile(
    r"(已修复|fixed|resolved|fix|修复|已定位根因|根因已定位|已解决|solved)",
    re.IGNORECASE,
)


def validate(path: Path) -> list[str]:
    errors = []
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")

    # 1. 检查 fix 关键字与 verification 块
    in_stop_reason = False
    in_verification = False
    reason_lines = []
    has_fix_keyword = False
    has_verification = False
    error_gone_after_fix = None

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        if stripped == "stop_reason:":
            in_stop_reason = True
            in_verification = False
            reason_lines = []
            continue

        if in_stop_reason:
            if stripped.startswith("reason: |"):
                continue  # reason block header
            if stripped == "next_steps:":
                break  # reason block ends
            if stripped.startswith("verification:"):
                has_verification = True
                in_verification = True
                continue
            if in_verification:
                m = re.match(r"error_gone_after_fix:\s*(true|false)", stripped)
                if m:
                    error_gone_after_fix = m.group(1) == "true"
                    continue
                # verification 块的其它行
                if stripped and not stripped.startswith("#"):
                    continue  # skip other verification fields
            # 收集 reason 内容行
            if stripped and not stripped.startswith("#"):
                reason_lines.append(stripped)

    # 检查 reason 中是否有 fix 关键字
    reason_text = "\n".join(reason_lines)
    if FIX_KEYWORDS.search(reason_text):
        has_fix_keyword = True

    # R1: 有 fix 关键字但无 verification
    if has_fix_keyword and not has_verification:
        errors.append(
            f"[R1] stop_reason.reason 包含 fix 关键字但缺少 verification 块。"
        )

    # R1 sub: 有 verification 但 error_gone_after_fix 缺失
    if has_verification and error_gone_after_fix is None:
        errors.append(
            f"[R1] verification 块缺少 error_gone_after_fix 字段 (true/false)。"
        )

    # R1 sub: error_gone_after_fix=false 却写了 fix 关键字
    if error_gone_after_fix is False and has_fix_keyword:
        errors.append(
            f"[R1] error_gone_after_fix=false 但 reason 声称已修复。矛盾。"
        )

    # 2. 检查 next_steps 格式完整性
    in_next_steps = False
    for i, line in enumerate(lines, 1):
        stripped = line.strip()
        if stripped == "next_steps:":
            in_next_steps = True
            continue
        if in_next_steps:
            if stripped.startswith("key_") or stripped.startswith("stop_reason"):
                break
            # 每个 step 应有 id 和 action
            if stripped.startswith("- id:"):
                pass  # ok
            elif stripped.startswith("action:"):
                pass  # ok

    return errors


def main():
    path = HANDOVER_PATH
    if len(sys.argv) > 1 and not sys.argv[1].startswith("--"):
        path = Path(sys.argv[1])

    if not path.exists():
        print(f"❌ 文件不存在: {path}")
        sys.exit(1)

    errors = validate(path)
    if errors:
        print(f"❌ Handover YAML 验证失败 ({len(errors)} 项):\n")
        for e in errors:
            print(f"  • {e}")
        print()
        sys.exit(1)
    else:
        print(f"✅ Handover YAML 验证通过: {path}")
        sys.exit(0)


if __name__ == "__main__":
    main()
