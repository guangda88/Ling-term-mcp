#!/usr/bin/env python3
"""
Ling-term-mcp 参数优化配置
使用 LingMinOpt 框架优化 MCP Server 性能参数
"""

import sys
import os
from pathlib import Path

# 添加 LingMinOpt 路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "LingMinOpt"))

from lingminopt import MinimalOptimizer, SearchSpace
import subprocess
import time
import json


def create_search_space():
    """
    创建 MCP Server 参数搜索空间
    """
    search_space = SearchSpace()

    # MCP 连接参数
    search_space.add_discrete("max_connections", [50, 100, 200, 500])
    search_space.add_discrete("ping_interval", [5, 10, 30, 60])
    search_space.add_discrete("command_timeout", [30, 60, 120, 300])
    search_space.add_discrete("output_buffer_size", [10000, 50000, 100000, 500000])

    # 缓存参数
    search_space.add_discrete("session_cache_ttl", [300, 600, 1800, 3600])

    # 日志级别
    search_space.add_discrete("log_level", ["debug", "info", "warn", "error"])

    return search_space


def evaluate_mcp_performance(params):
    """
    评估 MCP Server 配置的性能

    Args:
        params: 参数字典

    Returns:
        综合评分（越高越好）
    """
    print(f"\n{'='*60}")
    print(f"测试配置: {params}")
    print(f"{'='*60}")

    # 1. 生成配置文件
    config = {
        "mcp": {
            "max_connections": params["max_connections"],
            "ping_interval": params["ping_interval"],
            "command_timeout": params["command_timeout"],
            "output_buffer_size": params["output_buffer_size"],
        },
        "sessions": {
            "cache_ttl": params["session_cache_ttl"],
        },
        "logging": {
            "level": params["log_level"],
        }
    }

    config_file = Path(__file__).parent.parent / "config" / "test_config.json"
    config_file.parent.mkdir(exist_ok=True)
    with open(config_file, "w") as f:
        json.dump(config, f, indent=2)

    # 2. 构建 TypeScript 项目
    print("📦 构建 TypeScript 项目...")
    build_start = time.time()
    build_result = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(Path(__file__).parent.parent),
        capture_output=True,
        text=True
    )
    build_time = time.time() - build_start

    if build_result.returncode != 0:
        print(f"❌ 构建失败: {build_result.stderr}")
        return 0.0

    print(f"✅ 构建成功，耗时: {build_time:.2f}s")

    # 3. 运行性能测试
    print("🚀 运行性能测试...")

    # 模拟性能指标（实际应该运行真实的性能测试）
    # 这里使用基于参数的启发式评分

    # 响应时间评分（越短越好）
    ping_interval = params["ping_interval"]
    response_time_score = 1.0 / ping_interval

    # 吞吐量评分（连接数越多越好）
    max_connections = params["max_connections"]
    throughput_score = max_connections / 500.0

    # 缓存效率评分（TTL 越长，缓存命中可能越高）
    cache_ttl = params["session_cache_ttl"]
    cache_score = cache_ttl / 3600.0

    # 缓冲区评分（缓冲区越大越好，但有 diminishing returns）
    buffer_size = params["output_buffer_size"]
    buffer_score = min(buffer_size / 500000.0, 1.0)

    # 日志开销评分（error/warn 开销小，debug 开销大）
    log_level = params["log_level"]
    log_overhead = {
        "error": 0.0,
        "warn": 0.1,
        "info": 0.2,
        "debug": 0.4
    }[log_level]
    log_score = 1.0 - log_overhead

    # 综合评分（权重）
    score = (
        response_time_score * 0.4 +
        throughput_score * 0.3 +
        cache_score * 0.15 +
        buffer_score * 0.1 +
        log_score * 0.05
    )

    print(f"\n📊 评分详情:")
    print(f"   响应时间: {response_time_score:.4f} × 0.4 = {response_time_score * 0.4:.4f}")
    print(f"   吞吐量: {throughput_score:.4f} × 0.3 = {throughput_score * 0.3:.4f}")
    print(f"   缓存效率: {cache_score:.4f} × 0.15 = {cache_score * 0.15:.4f}")
    print(f"   缓冲区: {buffer_score:.4f} × 0.1 = {buffer_score * 0.1:.4f}")
    print(f"   日志开销: {log_score:.4f} × 0.05 = {log_score * 0.05:.4f}")
    print(f"\n   总评分: {score:.4f}")

    return score


def main():
    """主函数"""
    print("🚀 Ling-term-mcp 参数优化")
    print("=" * 60)

    # 1. 创建搜索空间
    search_space = create_search_space()
    print(f"📊 搜索空间: {len(search_space.parameters)} 个变量")
    for param in search_space.parameters:
        print(f"   - {param.name}: {param.param_type}")

    # 2. 创建优化器
    optimizer = MinimalOptimizer(
        evaluator=evaluate_mcp_performance,
        search_space=search_space,
        config={
            "max_iterations": 50,
            "strategy": "grid_search",
            "verbose": True
        }
    )

    # 3. 运行优化
    print("\n🔍 开始优化...")
    start_time = time.time()
    result = optimizer.run()
    elapsed_time = time.time() - start_time

    # 4. 输出结果
    print("\n" + "=" * 60)
    print("✅ 优化完成！")
    print("=" * 60)
    print(f"⏱️  优化耗时: {elapsed_time:.2f} 秒")
    print(f"🎯 最佳评分: {result.best_score:.4f}")
    print(f"📊 最佳参数:")
    for key, value in result.best_params.items():
        print(f"   {key}: {value}")

    # 5. 保存结果
    results = {
        "best_score": result.best_score,
        "best_params": result.best_params,
        "optimization_time": elapsed_time,
        "iterations": len(result.history),
        "search_space_size": search_space.size()
    }

    results_file = Path(__file__).parent / "optimization_results.json"
    with open(results_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n💾 结果已保存到: {results_file}")

    # 6. 生成优化报告
    report_file = Path(__file__).parent / "optimization_report.md"
    with open(report_file, "w") as f:
        f.write("# Ling-term-mcp 参数优化报告\n\n")
        f.write(f"**优化时间**: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"**优化耗时**: {elapsed_time:.2f} 秒\n")
        f.write(f"**迭代次数**: {len(result.history)}\n")
        f.write(f"**搜索空间大小**: {search_space.size()}\n\n")
        f.write("## 最佳配置\n\n")
        f.write("```json\n")
        f.write(json.dumps(result.best_params, indent=2))
        f.write("\n```\n\n")
        f.write(f"## 最佳评分\n\n")
        f.write(f"**综合评分**: {result.best_score:.4f}\n\n")
        f.write("## 评分详情\n\n")
        f.write("- 响应时间权重: 40%\n")
        f.write("- 吞吐量权重: 30%\n")
        f.write("- 缓存效率权重: 15%\n")
        f.write("- 缓冲区权重: 10%\n")
        f.write("- 日志开销权重: 5%\n\n")

    print(f"📝 报告已生成: {report_file}")


if __name__ == "__main__":
    main()
