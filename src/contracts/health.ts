import type { HealthResponse } from "./types.js";

export const CONTRACT_VERSION = "0.1.0";

export function healthCheck(): HealthResponse {
  return {
    status: "ok",
    service: "polyfind-contracts",
    version: CONTRACT_VERSION,
  };
}
