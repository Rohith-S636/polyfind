import type {
  BenchmarkExecutionTarget,
  BenchmarkStrategyMetrics,
  EnvironmentSnapshot,
} from "./harness.js";
import { BenchmarkHarness, captureEnvironmentSnapshot } from "./harness.js";
import { summarizeFreshnessViolations, summarizeSamples, type StatisticalSummary } from "./statistics.js";
import type { WorkloadOperation } from "./workload.js";

export interface RepeatedBenchmarkConfiguration {
  runCount: number;
  warmupRuns: number;
  seed: number;
  workloadId: string;
  datasetSize: number;
  totalOperations: number;
}

export interface StrategyRepeatedSummary {
  strategyName: string;
  repetitions: number;
  latencyMs: StatisticalSummary;
  freshnessViolationRate: ReturnType<typeof summarizeFreshnessViolations>;
  rawRuns: BenchmarkStrategyMetrics[];
}

export interface RepeatedBenchmarkArtifact {
  schemaVersion: "1.0.0";
  artifactId: string;
  generatedAt: string;
  configuration: RepeatedBenchmarkConfiguration;
  warmupRuns: number;
  runCount: number;
  environment: EnvironmentSnapshot;
  strategies: StrategyRepeatedSummary[];
}

export interface RepeatedBenchmarkTarget {
  target: BenchmarkExecutionTarget;
  createWorkload: (runIndex: number, seed: number) => WorkloadOperation[];
}

function validateCount(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value;
}

/**
 * Runs each comparable target through identical seeded workload generation.
 * Warmups are executed but excluded from raw measured summaries.
 */
export class RepeatedBenchmarkRunner {
  private readonly harness: BenchmarkHarness;

  constructor(harness = new BenchmarkHarness()) {
    this.harness = harness;
  }

  async run(
    configuration: RepeatedBenchmarkConfiguration,
    targets: readonly RepeatedBenchmarkTarget[],
    environment: EnvironmentSnapshot = captureEnvironmentSnapshot(),
  ): Promise<RepeatedBenchmarkArtifact> {
    const runCount = validateCount("runCount", configuration.runCount);
    const warmupRuns = validateCount("warmupRuns", configuration.warmupRuns);
    if (runCount === 0) {
      throw new Error("runCount must be greater than 0.");
    }
    if (targets.length === 0) {
      throw new Error("At least one benchmark target is required.");
    }

    const summaries: StrategyRepeatedSummary[] = [];
    for (const entry of targets) {
      for (let warmup = 0; warmup < warmupRuns; warmup += 1) {
        const workload = entry.createWorkload(warmup, configuration.seed);
        await this.harness.runWorkload(entry.target, workload, { cacheState: "warm" });
      }

      const rawRuns: BenchmarkStrategyMetrics[] = [];
      for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
        const workload = entry.createWorkload(runIndex, configuration.seed);
        rawRuns.push(
          await this.harness.runWorkload(entry.target, workload, { cacheState: "cold" }),
        );
      }

      const latencySamples = rawRuns.map((run) => run.latencyQuantiles.meanMs);
      const violations = rawRuns.reduce((sum, run) => sum + run.freshnessViolations, 0);
      const observations = rawRuns.reduce((sum, run) => sum + run.totalQueries, 0);
      summaries.push({
        strategyName: entry.target.name,
        repetitions: runCount,
        latencyMs: summarizeSamples(latencySamples),
        freshnessViolationRate: summarizeFreshnessViolations(violations, observations),
        rawRuns,
      });
    }

    return {
      schemaVersion: "1.0.0",
      artifactId: `repeated-${configuration.workloadId}`,
      generatedAt: new Date().toISOString(),
      configuration: { ...configuration, runCount, warmupRuns },
      warmupRuns,
      runCount,
      environment,
      strategies: summaries,
    };
  }
}

export async function saveRepeatedBenchmarkArtifact(
  filePath: string,
  artifact: RepeatedBenchmarkArtifact,
): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(artifact, null, 2), "utf8");
}

export async function loadRepeatedBenchmarkArtifact(
  filePath: string,
): Promise<RepeatedBenchmarkArtifact> {
  const fs = await import("node:fs/promises");
  return JSON.parse(await fs.readFile(filePath, "utf8")) as RepeatedBenchmarkArtifact;
}
