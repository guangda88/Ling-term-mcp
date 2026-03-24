# Ling-term-mcp 参数优化报告

**优化时间**: 2026-03-24 22:41:45
**优化耗时**: 47.05 秒
**迭代次数**: 23
**搜索空间大小**: 4096

## 最佳配置

```json
{
  "max_connections": 500,
  "ping_interval": 5,
  "command_timeout": 30,
  "output_buffer_size": 10000,
  "session_cache_ttl": 3600,
  "log_level": "warn"
}
```

## 最佳评分

**综合评分**: 0.5770

## 评分详情

- 响应时间权重: 40%
- 吞吐量权重: 30%
- 缓存效率权重: 15%
- 缓冲区权重: 10%
- 日志开销权重: 5%

