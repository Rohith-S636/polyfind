# ADR-002 — Explicit Freshness Contracts

## Status
Proposed; confirm with the team before implementation.

## Context
Different fields have different correctness requirements. A stale price is more serious than a slightly delayed descriptive tag or related-item edge.

## Decision
Define freshness policies by data class rather than treating one cache TTL as a universal guarantee. At minimum, separate transactional fields (price/stock) from descriptive/derived search signals.

## Why
It allows explicit measurement of freshness violations and avoids conflating TTL expiry with actual source-data freshness.

## Alternatives considered
- One TTL for every cache/index: simpler but does not establish correctness.
- Strong synchronous updates to every store: potentially expensive and may be unavailable across all selected technologies.

## Implementation note
Before coding, define what each search mode promises, how versions are represented, and what the system does when freshness cannot be verified.
