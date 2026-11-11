import type {
  RetrievalProvider,
  RetrievalRequest,
  RetrievalResult,
} from "../contracts/types.js";
import { executeRetrievalAdapter, type AdapterExecutionResult } from "../retrieval/adapter.js";

export interface FailureInjectionScenario {
  delayMs?: number;
  unavailable?: boolean;
  errorMessage?: string;
}

export interface FailureInjectionResult extends AdapterExecutionResult {
  scenario: FailureInjectionScenario;
  degraded: boolean;
}

/**
 * Wraps a replaceable retrieval provider with deterministic delay/failure
 * controls for local reliability tests. It never contacts a real store.
 */
export class FailureInjectionHarness {
  async execute(
    provider: RetrievalProvider,
    request: RetrievalRequest,
    scenario: FailureInjectionScenario = {},
  ): Promise<FailureInjectionResult> {
    const injectedProvider: RetrievalProvider = {
      name: provider.name,
      async retrieve(injectedRequest: RetrievalRequest): Promise<RetrievalResult> {
        if (scenario.delayMs !== undefined && scenario.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, scenario.delayMs));
        }
        if (scenario.unavailable) {
          throw new Error(
            scenario.errorMessage ?? `${provider.name} connection unavailable`,
          );
        }
        return provider.retrieve(injectedRequest);
      },
    };

    const result = await executeRetrievalAdapter(injectedProvider, request);
    return {
      ...result,
      scenario: { ...scenario },
      degraded: !result.success,
    };
  }
}
