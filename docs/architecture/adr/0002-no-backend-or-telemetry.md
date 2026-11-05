# ADR 0002: No backend or telemetry

- Status: Accepted
- Date: 2026-11-05

## Context

The exporter handles potentially sensitive Steam account and library information. The product does not need server-side processing for its core function.

## Decision

All library retrieval, reconciliation, and export processing occurs locally in the browser. No backend, analytics, or telemetry is included.

## Consequences

- No library data is transmitted to project infrastructure.
- Session material remains in the browser's authorized request context.
- Diagnostics must avoid raw account or library data.
- Any future proposal to add remote services requires a separate explicit privacy and security decision.
