import type { CatalogReader } from "../contracts/types.js";
import type { LanceDbVectorStore } from "../retrieval/lancedb-store.js";
import type { TextEmbeddingProvider } from "../retrieval/embeddings.js";
import type { Neo4jGraphAdapter } from "./neo4j-driver.js";
import { LanceDbOutboxTarget, Neo4jOutboxTarget, createProductOutboxEvent, type OutboxDelivery } from "./outbox.js";

export interface ReconciliationOptions {
  pageSize?: number;
  repair?: boolean;
  maxRepairs?: number;
  maxErrors?: number;
}

export interface ReconciliationReport {
  inspected: number;
  missing: number;
  stale: number;
  repaired: number;
  failed: number;
  dryRun: boolean;
  deletedDerived: number;
  newerDerived: number;
  unverifiedOrphans: number;
  skipped: number;
  errors: Array<{ id: string; target: string; message: string }>;
  continuation?: { authoritativePage: number; graphCursor?: string; vectorCursor?: string };
}

export async function reconcileProducts(
  catalog: CatalogReader,
  options: ReconciliationOptions = {},
  dependencies: {
    graph?: Neo4jGraphAdapter;
    vector?: { store: LanceDbVectorStore; embedder: TextEmbeddingProvider };
  } = {},
): Promise<ReconciliationReport> {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 100));
  const report: ReconciliationReport = {
    inspected: 0,
    missing: 0,
    stale: 0,
    repaired: 0,
    failed: 0,
    dryRun: options.repair !== true,
    deletedDerived: 0,
    newerDerived: 0,
    unverifiedOrphans: 0,
    skipped: 0,
    errors: [],
  };
  const maxRepairs = Math.max(1, options.maxRepairs ?? 100);
  const maxErrors = Math.max(1, options.maxErrors ?? 50);
  let repairs = 0;
  const recordError = (id: string, target: string, error: unknown) => {
    report.failed += 1;
    if (report.errors.length < maxErrors) {
      report.errors.push({ id, target, message: error instanceof Error ? error.message : String(error) });
    }
  };
  let page = 1;
  while (true) {
    const result = await catalog.listProducts({}, page, pageSize);
    for (const product of result.items) {
      report.inspected += 1;
      const event = createProductOutboxEvent(product, "updated");
      const checks = await Promise.all([
        dependencies.graph ? dependencies.graph.getCurrentVersion(product.id) : Promise.resolve(null),
        dependencies.vector ? dependencies.vector.store.getVersion(product.id) : Promise.resolve(null),
      ]);
      const graphVersion = checks[0];
      const vectorVersion = checks[1];
      const graphNeedsRepair = dependencies.graph !== undefined && (graphVersion === null || graphVersion < product.version);
      const vectorNeedsRepair = dependencies.vector !== undefined && (vectorVersion === null || vectorVersion < product.version);
      if (graphVersion !== null && graphVersion > product.version) report.newerDerived += 1;
      if (vectorVersion !== null && vectorVersion > product.version) report.newerDerived += 1;
      if (!graphNeedsRepair && !vectorNeedsRepair) continue;
      if (graphNeedsRepair || vectorNeedsRepair) {
        if (graphVersion === null || vectorVersion === null) report.missing += 1;
        else report.stale += 1;
      }
      if (options.repair !== true) continue;
      if (repairs >= maxRepairs) {
        report.skipped += 1;
        continue;
      }
      try {
        if (graphNeedsRepair && dependencies.graph) {
          await new Neo4jOutboxTarget(dependencies.graph).deliver({
            event,
            targetName: "neo4j",
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          } satisfies OutboxDelivery);
        }
        if (vectorNeedsRepair && dependencies.vector) {
          await new LanceDbOutboxTarget(dependencies.vector.store, dependencies.vector.embedder).deliver({
            event,
            targetName: "lancedb",
            status: "pending",
            attemptCount: 0,
            nextAttemptAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
          } satisfies OutboxDelivery);
        }
        report.repaired += 1;
        repairs += 1;
      } catch (error) {
        recordError(product.id, "reconciliation", error);
      }
    }
    if (result.items.length < pageSize || report.inspected >= result.total) break;
    page += 1;
  }

  let graphCursor: string | undefined;
  let vectorCursor: string | undefined;
  while (dependencies.graph && typeof dependencies.graph.listProductVersions === "function") {
    const page = await dependencies.graph.listProductVersions(pageSize, graphCursor);
    for (const derived of page) {
      const source = await catalog.getProduct(derived.id);
      if (source) continue;
      if (derived.sourceSystem !== "polyfind") {
        report.unverifiedOrphans += 1;
        continue;
      }
      report.deletedDerived += 1;
      if (options.repair !== true) continue;
      if (repairs >= maxRepairs) {
        report.skipped += 1;
        continue;
      }
      try {
        if (await dependencies.graph.deleteProductIfOwned(derived.id, derived.version)) {
          report.repaired += 1;
          repairs += 1;
        } else {
          report.skipped += 1;
        }
      } catch (error) {
        recordError(derived.id, "neo4j", error);
      }
    }
    if (page.length < pageSize) break;
    graphCursor = page[page.length - 1]?.id;
  }
  while (dependencies.vector && typeof dependencies.vector.store.listProductVersions === "function") {
    const page = await dependencies.vector.store.listProductVersions(pageSize, vectorCursor);
    for (const derived of page) {
      const source = await catalog.getProduct(derived.id);
      if (source) continue;
      if (derived.sourceSystem !== "polyfind") {
        report.unverifiedOrphans += 1;
        continue;
      }
      report.deletedDerived += 1;
      if (options.repair !== true) continue;
      if (repairs >= maxRepairs) {
        report.skipped += 1;
        continue;
      }
      try {
        if (await dependencies.vector.store.deleteVersionedOwned(derived.id, derived.version, "polyfind")) {
          report.repaired += 1;
          repairs += 1;
        } else {
          report.skipped += 1;
        }
      } catch (error) {
        recordError(derived.id, "lancedb", error);
      }
    }
    if (page.length < pageSize) break;
    vectorCursor = page[page.length - 1]?.id;
  }
  return report;
}
