# ADR 0001: Firefox-first WebExtension

- Status: Accepted
- Date: 2026-11-05

## Context

The initial target browser is Firefox. The product should remain small and portable to Chromium-based browsers where practical.

## Decision

Use Firefox WebExtension APIs and Manifest V3 for the initial implementation. Keep browser integration behind a thin adapter boundary and keep domain logic browser-independent.

## Consequences

- Firefox behavior and permissions are the initial compatibility target.
- Cross-origin authenticated requests must be tested in the extension's privileged context.
- Browser-specific code must not leak into the core domain modules.
- A future Chromium port remains possible without rewriting parsing, reconciliation, or exporters.
