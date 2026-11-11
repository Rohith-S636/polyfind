import type {
  RetrievalCandidate,
  RetrievalProvider,
  RetrievalRequest,
} from "../contracts/types.js";
import { sanitizeOperationalError } from "../config/environment.js";
import { validateCandidate } from "./candidate.js";

export interface AdapterExecutionResult {
  source: string;
  candidates: RetrievalCandidate[];
  elapsedMs: number;
  success: boolean;
  error?: {
    code: string;
    message: string;
  } | undefined;
}

export async function executeRetrievalAdapter(
  adapter: RetrievalProvider,
  request: RetrievalRequest,
): Promise<AdapterExecutionResult> {
  const start = performance.now();

  try {
    const rawResult = await adapter.retrieve(request);
    const elapsedMs = Math.round((performance.now() - start) * 100) / 100;

    // Validate candidates returned by the adapter
    const validatedCandidates: RetrievalCandidate[] = (rawResult.candidates || []).map((c) => {
      const valid = validateCandidate(c);
      const item: RetrievalCandidate = {
        productId: valid.productId,
        source: valid.source,
        score: valid.score,
      };
      if (valid.sourceVersion !== undefined) {
        item.sourceVersion = valid.sourceVersion;
      }
      return item;
    });

    return {
      source: adapter.name,
      candidates: validatedCandidates,
      elapsedMs,
      success: true,
    };
  } catch (error) {
    const elapsedMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      source: adapter.name,
      candidates: [],
      elapsedMs,
      success: false,
      error: {
        code: "ADAPTER_RETRIEVAL_FAILED",
        message: sanitizeOperationalError(error),
      },
    };
  }
}
