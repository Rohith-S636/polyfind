export interface ConfidenceInterval {
  level: number;
  lower: number;
  upper: number;
  marginOfError: number;
}

export interface StatisticalSummary {
  count: number;
  mean: number;
  median: number;
  p50: number;
  p95: number;
  p99: number;
  q1: number;
  q3: number;
  iqr: number;
  variance: number;
  stdDev: number;
  min: number;
  max: number;
  confidenceInterval95: ConfidenceInterval;
}

function round(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  const weight = position - lower;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * weight;
}

/**
 * Summarizes a sample with sample variance and a normal-approximation 95% CI.
 * The interval describes uncertainty in the sample mean; it is not a
 * significance test and does not establish causal or statistical claims.
 */
export function summarizeSamples(samples: readonly number[]): StatisticalSummary {
  const finite = samples.filter((value) => Number.isFinite(value));
  if (finite.length === 0) {
    return {
      count: 0,
      mean: 0,
      median: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
      variance: 0,
      stdDev: 0,
      min: 0,
      max: 0,
      confidenceInterval95: { level: 0.95, lower: 0, upper: 0, marginOfError: 0 },
    };
  }

  const sorted = [...finite].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
  const sumSquaredDifferences = sorted.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  );
  const variance = count > 1 ? sumSquaredDifferences / (count - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const marginOfError = count > 1 ? 1.96 * (stdDev / Math.sqrt(count)) : 0;

  return {
    count,
    mean: round(mean),
    median: round(percentile(sorted, 0.5)),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    q1: round(percentile(sorted, 0.25)),
    q3: round(percentile(sorted, 0.75)),
    iqr: round(percentile(sorted, 0.75) - percentile(sorted, 0.25)),
    variance: round(variance),
    stdDev: round(stdDev),
    min: sorted[0]!,
    max: sorted[count - 1]!,
    confidenceInterval95: {
      level: 0.95,
      lower: round(mean - marginOfError),
      upper: round(mean + marginOfError),
      marginOfError: round(marginOfError),
    },
  };
}

export interface FreshnessRateSummary {
  violations: number;
  observations: number;
  rate: number;
}

export function summarizeFreshnessViolations(
  violations: number,
  observations: number,
): FreshnessRateSummary {
  const safeObservations = Math.max(0, Math.floor(observations));
  const safeViolations = Math.max(0, Math.min(safeObservations, Math.floor(violations)));
  return {
    violations: safeViolations,
    observations: safeObservations,
    rate: safeObservations > 0 ? round(safeViolations / safeObservations) : 0,
  };
}
