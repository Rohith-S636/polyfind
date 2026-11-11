/**
 * MySQL Keyword Retrieval Provider for Phase 9 Hybrid Search.
 *
 * Performs parameterized LIKE-based full-text keyword search against the
 * authoritative MySQL products table. Filters (category, price range, stock)
 * are pushed into the SQL WHERE clause so the database executes them, not
 * application memory.
 *
 * MySQL remains the source of truth. This provider returns RetrievalCandidate
 * objects with version metadata so the freshness validator can verify them.
 *
 * Design decisions:
 * - Uses parameterized queries exclusively — no string interpolation.
 * - Candidate limit is bounded at MAX_CANDIDATES to prevent unbounded scans.
 * - Each token matched adds to the score; score is tokens-matched / total-tokens,
 *   preserving the existing keyword scoring contract used by SearchService.
 * - minPrice filter from ProductFilters is also applied here when provided.
 * - Falls back to listing without keyword filter when query is empty.
 */

import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  ProductFilters,
  RetrievalCandidate,
  RetrievalProvider,
  RetrievalRequest,
  RetrievalResult,
} from "../contracts/types.js";

/** Maximum candidate rows fetched per keyword query. */
const MAX_CANDIDATES = 200;

interface KeywordRow extends RowDataPacket {
  id: string;
  name: string;
  description: string;
  version: number;
}

function tokenize(query: string): string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Builds a SQL WHERE clause fragment and parameter array for keyword + filter
 * combination. All values are parameterized.
 */
function buildWhereClause(tokens: string[], filters: ProductFilters): {
  where: string;
  params: (string | number | boolean)[];
} {
  const clauses: string[] = [];
  const params: (string | number | boolean)[] = [];

  if (tokens.length > 0) {
    // OR of LIKE across name and description for each token.
    // This is intentionally broad: scoring is done in application logic.
    const tokenClause = tokens
      .map(() => "(name LIKE ? OR description LIKE ?)")
      .join(" OR ");
    clauses.push(`(${tokenClause})`);
    for (const token of tokens) {
      const pattern = `%${token}%`;
      params.push(pattern, pattern);
    }
  }

  if (filters.categoryId) {
    clauses.push("category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.minPrice !== undefined) {
    clauses.push("price >= ?");
    params.push(filters.minPrice);
  }
  if (filters.maxPrice !== undefined) {
    clauses.push("price <= ?");
    params.push(filters.maxPrice);
  }
  if (filters.inStock === true) {
    clauses.push("stock > 0");
  } else if (filters.inStock === false) {
    clauses.push("stock = 0");
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

/**
 * Score a product row against the query tokens using token-overlap ratio.
 * Returns 0 when no tokens match; ranges [0, 1] inclusive.
 */
function scoreRow(row: KeywordRow, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const text = `${row.name} ${row.description}`.toLocaleLowerCase();
  const matched = tokens.filter((token) => text.includes(token)).length;
  return matched / tokens.length;
}

export class MySqlKeywordRetrievalProvider implements RetrievalProvider {
  readonly name = "mysql" as const;

  constructor(private readonly pool: Pool) {}

  async retrieve(request: RetrievalRequest): Promise<RetrievalResult> {
    const start = performance.now();
    const tokens = tokenize(request.query);
    const filters = request.filters ?? {};

    const { where, params } = buildWhereClause(tokens, filters);
    const limitParam = Math.min(MAX_CANDIDATES, Math.max(1, request.limit > 0 ? request.limit * 4 : MAX_CANDIDATES));

    const sql = `
      SELECT id, name, description, version
      FROM products
      ${where}
      ORDER BY id ASC
      LIMIT ?
    `;
    params.push(limitParam);

    let rows: KeywordRow[];
    try {
      const [result] = await this.pool.query<KeywordRow[]>(sql, params);
      rows = result;
    } catch (error) {
      throw new Error(
        `MySQL keyword retrieval failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    const candidates: RetrievalCandidate[] = rows
      .map((row) => ({
        productId: row.id,
        source: this.name,
        score: tokens.length === 0 ? 0 : scoreRow(row, tokens),
        sourceVersion: Number(row.version),
      }))
      .filter((c) => tokens.length === 0 || c.score > 0)
      .sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId));

    return {
      candidates,
      elapsedMs: Math.round((performance.now() - start) * 100) / 100,
    };
  }
}
