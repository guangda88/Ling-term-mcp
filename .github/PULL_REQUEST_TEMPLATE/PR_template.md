---
name: Pull Request
about: Submit changes for Ling-term-mcp
title: '[PR] '
labels: ''
assignees: ''
---

## 📋 Description

<!-- Brief description of the changes -->

## 🎯 Type of Change

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 📝 Documentation update
- [ ] ♻️ Refactoring
- [ ] ⚡ Performance improvement
- [ ] 🔒 Security fix
- [ ] 🧪 Test coverage improvement
- [ ] Other (please describe)

## 📝 Changes Made

<!-- List the changes made -->

-

-

-

## ✅ Testing

<!-- Describe the testing performed -->

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass
- [ ] Manual testing performed

### Test Results

<!-- Share test results if applicable -->

```
[Output of test run]
```

## 📚 Documentation

- [ ] Updated README.md
- [ ] Updated API documentation
- [ ] Updated user guide
- [ ] Added/updated examples
- [ ] Updated CHANGELOG.md

## 🔍 Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review of code completed
- [ ] Comments added to complex code sections
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests added/updated
- [ ] All tests passing
- [ ] Ready for review

## 🔄 Rollback

<!-- Cost & strategy for reverting this change -->

**rollback_cost**: [ ] 🟢 低 / [ ] 🟡 中 / [ ] 🔴 高

- 🟢 **低**: 一行代码回滚 (manifest toggle / env var / feature flag)
- 🟡 **中**: 需数据迁移 (schema 重建 / 配置重载 / 数据回填)
- 🔴 **高**: 不可逆 (数据删除 / 外部 API 状态变更 / 密钥轮换)

**rollback_strategy**: 描述回滚步骤 (一行命令 / 配置切换 / 数据恢复)

**rollback_verified**: [ ] 是 (已 dry-run 回滚流程)

## 📅 Review Schedule

<!-- When should this change be revisited? Default: 7 days -->

- **review_at**: YYYY-MM-DD (默认: 合并后 7 天)
- **review_check**: [ ] 通过 / [ ] 需调整 / [ ] 回滚
- **review_owner**: @username (默认: PR 作者)
- **review_trigger**: SDT-lx-005 daemon 自动提醒 (超期 24h)

### 复查清单

- [ ] 生产环境运行正常 (无新增 P0/P1 告警)
- [ ] 性能指标未劣化 (latency / throughput / error rate)
- [ ] 用户体验未受影响 (feedback / metrics)
- [ ] 无新增安全事件 (audit log / rejection log)
- [ ] 文档与代码同步 (README / API.md / CHANGELOG)

## 🔗 Related Issues

<!-- Link to related GitHub issues or discussions -->

Fixes #
Related to #

## 💬 Additional Notes

<!-- Any additional context or notes for reviewers -->
