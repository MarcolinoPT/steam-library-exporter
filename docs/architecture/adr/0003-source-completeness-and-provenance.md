# ADR 0003: Source completeness and provenance

- Status: Accepted
- Date: 2026-11-05

## Context

Two authenticated Steam endpoints returned different application counts in an initial test. Their semantics and coverage are not established.

## Decision

Every imported record retains source provenance. Reconciliation reports intersection and differences. No source, union, or intersection is treated as a complete canonical library until category coverage and edge cases have been verified.

## Consequences

- The domain model must represent uncertain or unclassified records.
- The UI must distinguish successful retrieval from verified completeness.
- Tests must cover differences, duplicates, and missing metadata.
- Users must not receive a misleading "complete export" claim.
