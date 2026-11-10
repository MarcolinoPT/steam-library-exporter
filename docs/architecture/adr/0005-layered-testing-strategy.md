# ADR 0005: Layered testing strategy

- Status: Accepted
- Date: 2026-11-06

## Context

The repository currently contains a diagnostic Firefox MV3 prototype rather than a production extension. The prototype combines domain calculations, Firefox APIs, Steam requests, and popup DOM behaviour in a small number of plain JavaScript files. There is no root Node project or production build yet.

The production architecture requires a browser-independent domain core and narrow source/browser adapters. Testing the current prototype as if it were the production architecture would couple the test suite to temporary implementation details and create avoidable migration work.

## Decision

Adopt a layered testing strategy:

1. **Vitest unit tests** for pure domain logic and deterministic normalization, reconciliation, completeness, classification, and export projections.
2. **DOM/component tests** using Vitest with a lightweight DOM environment, without introducing a UI framework solely for testability.
3. **Integration tests** for production adapters and orchestration using deterministic Firefox API fakes and Steam response fixtures; automated tests must not contact Steam or require real credentials.
4. **Firefox E2E tests** against the built production extension, using a runner selected only after a compatibility proof-of-concept with Firefox Manifest V3.

The diagnostic prototype is a source of behavioural evidence and regression scenarios, not the production domain layer or the permanent test target.

The Firefox E2E runner remains open. Evaluate Firefox WebDriver/geckodriver and a web-ext-driven Firefox session. Do not assume Playwright's Firefox browser supports the required unpacked-extension workflow without a working proof.

CI will validate workflow YAML with actionlint and run fast test layers separately from browser E2E.

## Consequences

- Production domain modules must remain independent of Firefox APIs and the DOM.
- Test fixtures must be synthetic and sanitized; no Steam cookies, session IDs, private library data, or browser profiles may be committed or uploaded.
- Tests must preserve the distinction between successful retrieval and verified completeness, and between catalogue metadata and account observations.
- Firefox E2E coverage is intentionally small and focused on extension loading, popup/background workflows, classification, and export.
- Test infrastructure will be introduced with the production source tree rather than retrofitted into temporary prototype files.
- The implementation sequence and detailed coverage targets are maintained in [Testing strategy](../../testing-strategy.md).
