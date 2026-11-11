export {
  generateWorkload,
  createPRNG,
  REGIME_DEFAULTS,
  DEFAULT_QUERY_MIX,
  type WorkloadConfiguration,
  type WorkloadOperation,
  type QueryOperation,
  type UpdateOperationItem,
  type GeneratedWorkload,
  type WorkloadMetadata,
  type UpdateRegime,
  type QueryMix,
  type QueryCategory,
} from "./workload.js";

export {
  precisionAtK,
  recallAtK,
  dcgAtK,
  idcgAtK,
  ndcgAtK,
} from "./metrics.js";

export {
  BENCHMARK_QUERY_SET,
  GROUND_TRUTH_LABELS,
  evaluateQueryResult,
  evaluateAllQueries,
  type EvaluationQuery,
  type MetricSummary,
  type QueryEvaluationResult,
  type BenchmarkEvaluationReport,
} from "./judgments.js";

export {
  BenchmarkHarness,
  calculateLatencyQuantiles,
  captureEnvironmentSnapshot,
  type LatencyQuantiles,
  type EnvironmentSnapshot,
  type BenchmarkStrategyMetrics,
  type BenchmarkRunResult,
  type BenchmarkExecutionTarget,
} from "./harness.js";

export {
  runAblationSuite,
  runDelayedUpdateSensitivity,
  computeStatisticalMetric,
  type AblationComponent,
  type StatisticalMetric,
  type AblationExperimentResult,
  type DelayedUpdateResult,
} from "./ablation.js";

export {
  createDefaultBaselineArtifact,
  renderComparisonMarkdownTable,
  renderAsciiBarChart,
  renderAllMetricCharts,
  renderTradeoffsReport,
  renderFullVisualizationReport,
  saveBaselineArtifact,
  loadBaselineArtifact,
  type MethodResultPoint,
  type TradeoffComparison,
  type BaselineComparisonArtifact,
  type BarChartOptions,
} from "./visualization.js";

export {
  summarizeSamples,
  summarizeFreshnessViolations,
  type ConfidenceInterval,
  type StatisticalSummary,
  type FreshnessRateSummary,
} from "./statistics.js";

export {
  RepeatedBenchmarkRunner,
  saveRepeatedBenchmarkArtifact,
  loadRepeatedBenchmarkArtifact,
  type RepeatedBenchmarkArtifact,
  type RepeatedBenchmarkConfiguration,
  type RepeatedBenchmarkTarget,
  type StrategyRepeatedSummary,
} from "./repeated-runs.js";
