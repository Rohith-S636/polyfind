/**
 * S5-03 Latency and Resource Benchmark Harness for PolyFind
 * Replays standardized workloads across baseline and proposed policies.
 * Measures end-to-end latency quantiles, per-store timings, and exports machine-readable results.
 */

import os from "node:os";
import type { SearchRequest } from "../contracts/types.js";
import type { WorkloadOperation } from "./workload.js";

export interface LatencyQuantiles {
  minMs: number;
  medianMs: number; // p50
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  meanMs: number;
}

export interface EnvironmentSnapshot {
  platform: string;
  architecture: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryMb: number;
  nodeVersion: string;
}

export interface BenchmarkStrategyMetrics {
  strategyName: string;
  cacheState: "cold" | "warm";
  totalQueries: number;
  totalUpdates: number;
  latencyQuantiles: LatencyQuantiles;
  perStoreTimings: {
    mysqlAvgMs: number;
    redisAvgMs: number;
    vectorAvgMs: number;
    graphAvgMs: number;
  };
  cacheStats: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  freshnessViolations: number;
  totalElapsedMs: number;
}

export interface BenchmarkRunResult {
  runId: string;
  benchmarkSchemaVersion: "1.0.0";
  timestamp: string;
  environment: EnvironmentSnapshot;
  workloadConfig: {
    workloadId: string;
    totalOperations: number;
    seed: number;
  };
  results: BenchmarkStrategyMetrics[];
}

/**
 * Computes statistical percentiles from a numeric sample.
 */
export function calculateLatencyQuantiles(samples: number[]): LatencyQuantiles {
  if (samples.length === 0) {
    return { minMs: 0, medianMs: 0, p90Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, meanMs: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  const getPercentile = (p: number): number => {
    const idx = Math.min(n - 1, Math.max(0, Math.floor((p / 100) * n)));
    return sorted[idx]!;
  };

  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    minMs: Math.round(sorted[0]! * 100) / 100,
    medianMs: Math.round(getPercentile(50) * 100) / 100,
    p90Ms: Math.round(getPercentile(90) * 100) / 100,
    p95Ms: Math.round(getPercentile(95) * 100) / 100,
    p99Ms: Math.round(getPercentile(99) * 100) / 100,
    maxMs: Math.round(sorted[n - 1]! * 100) / 100,
    meanMs: Math.round((sum / n) * 100) / 100,
  };
}

export function captureEnvironmentSnapshot(): EnvironmentSnapshot {
  const cpus = os.cpus();
  return {
    platform: process.platform,
    architecture: process.arch,
    cpuModel: cpus[0]?.model ?? "unknown",
    cpuCores: cpus.length,
    totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
    nodeVersion: process.version,
  };
}

export interface BenchmarkExecutionTarget {
  name: string;
  executeQuery(request: SearchRequest): Promise<{
    elapsedMs: number;
    storeTimings?: { mysqlMs?: number; redisMs?: number; vectorMs?: number; graphMs?: number };
    cacheHit?: boolean;
    freshnessViolation?: boolean;
  }>;
  executeUpdate?(productId: string, patch: Record<string, unknown>): Promise<{ elapsedMs: number }>;
}

export class BenchmarkHarness {
  /**
   * Replays a standardized workload against an execution target.
   */
  async runWorkload(
    target: BenchmarkExecutionTarget,
    operations: WorkloadOperation[],
    options: { cacheState?: "cold" | "warm" } = {},
  ): Promise<BenchmarkStrategyMetrics> {
    const cacheState = options.cacheState ?? "cold";
    const startOverall = performance.now();
    const latencies: number[] = [];

    let totalQueries = 0;
    let totalUpdates = 0;
    let cacheHits = 0;
    let cacheMisses = 0;
    let freshnessViolations = 0;

    let totalMysqlMs = 0;
    let totalRedisMs = 0;
    let totalVectorMs = 0;
    let totalGraphMs = 0;

    for (const op of operations) {
      if (op.type === "query") {
        totalQueries += 1;
        const res = await target.executeQuery(op.request);
        latencies.push(res.elapsedMs);

        if (res.cacheHit !== undefined) {
          if (res.cacheHit) cacheHits += 1;
          else cacheMisses += 1;
        }

        if (res.freshnessViolation) {
          freshnessViolations += 1;
        }

        if (res.storeTimings) {
          totalMysqlMs += res.storeTimings.mysqlMs ?? 0;
          totalRedisMs += res.storeTimings.redisMs ?? 0;
          totalVectorMs += res.storeTimings.vectorMs ?? 0;
          totalGraphMs += res.storeTimings.graphMs ?? 0;
        }
      } else if (op.type === "update") {
        totalUpdates += 1;
        if (target.executeUpdate) {
          const res = await target.executeUpdate(op.productId, op.patch);
          latencies.push(res.elapsedMs);
        }
      }
    }

    const totalElapsedMs = Math.round((performance.now() - startOverall) * 100) / 100;
    const quantiles = calculateLatencyQuantiles(latencies);
    const queryCountSafe = Math.max(1, totalQueries);
    const totalCacheOps = cacheHits + cacheMisses;

    return {
      strategyName: target.name,
      cacheState,
      totalQueries,
      totalUpdates,
      latencyQuantiles: quantiles,
      perStoreTimings: {
        mysqlAvgMs: Math.round((totalMysqlMs / queryCountSafe) * 100) / 100,
        redisAvgMs: Math.round((totalRedisMs / queryCountSafe) * 100) / 100,
        vectorAvgMs: Math.round((totalVectorMs / queryCountSafe) * 100) / 100,
        graphAvgMs: Math.round((totalGraphMs / queryCountSafe) * 100) / 100,
      },
      cacheStats: {
        hits: cacheHits,
        misses: cacheMisses,
        hitRate: totalCacheOps > 0 ? Math.round((cacheHits / totalCacheOps) * 1000) / 1000 : 0,
      },
      freshnessViolations,
      totalElapsedMs,
    };
  }

  /**
   * Builds the complete machine-readable benchmark run report.
   */
  buildRunResult(
    runId: string,
    workload: { workloadId: string; totalOperations: number; seed: number },
    metrics: BenchmarkStrategyMetrics[],
  ): BenchmarkRunResult {
    return {
      runId,
      benchmarkSchemaVersion: "1.0.0",
      timestamp: new Date().toISOString(),
      environment: captureEnvironmentSnapshot(),
      workloadConfig: {
        workloadId: workload.workloadId,
        totalOperations: workload.totalOperations,
        seed: workload.seed,
      },
      results: metrics,
    };
  }
}
