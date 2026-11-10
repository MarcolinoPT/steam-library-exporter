# Repository instructions

These instructions apply to the entire repository. Follow any more specific `AGENTS.md` found in a subdirectory as an addition to these rules.

## Product intent and non-negotiable boundaries

- Build a Firefox-first browser extension for exporting Steam game libraries to TXT, CSV, and JSON.
- The primary use case is exporting the signed-in user's own library, including libraries that are not publicly visible.
- Exporting another user's library is secondary and must be limited to information Steam exposes publicly.
- Keep library processing local to the browser. Do not introduce a backend, API key, telemetry, or runtime third-party service without an explicit product decision.
- Keep the core domain logic independent of Firefox APIs, browser globals, and the DOM.
- Treat Steam endpoints as undocumented and unstable unless official documentation establishes otherwise. Isolate Steam-specific requests and page integration behind small adapters.

## Security and privacy

- Never log, persist, export, or transmit Steam cookies, session identifiers, authentication tokens, or other secrets.
- Use the user's existing authenticated browser context only where required. Do not copy credentials into extension storage or application state that outlives the operation.
- Do not send library data, page contents, or credentials to third parties.
- Request only the narrow host permissions needed for verified functionality. Never use broad permissions such as `<all_urls>` when narrower permissions suffice.
- Treat Steam responses, page content, profile data, and imported/exported values as untrusted input.
- Validate response status, content type, payload shape, and identifiers at integration boundaries. Fail explicitly on malformed, inaccessible, private, or incomplete sources.
- Never inject remote code or load executable code from remote sources.
- Keep fixtures and test output free of real account identifiers, cookies, session IDs, and other personal or secret data.

## Architecture

- Prefer a small, layered design: browser-independent domain logic, application/use-case orchestration, and narrow browser/Steam adapters.
- Keep parsing, normalization, classification, reconciliation, and export formatting testable without a browser.
- Keep side effects at explicit boundaries. Prefer pure functions for domain transformations.
- Use canonical AppID strings in domain and serialized data. Validate numeric inputs before conversion; do not allow unsafe JavaScript number coercion.
- Normalize valid AppIDs consistently, remove duplicates while preserving first-seen order, and report invalid values explicitly. Never silently turn a partially invalid collection into a fully valid one.
- Preserve source provenance and uncertainty when reconciling data from multiple sources.
- Never silently discard application records. Classification, filtering, exclusion, and deduplication must be explicit and testable.
- Never claim an export is complete without a source-specific completeness check. Distinguish complete, partial, unavailable, private, and failed results where applicable.
- Keep authenticated-library and public-profile capabilities separate. Do not let public-profile limitations incorrectly constrain the signed-in user's own library.

## Extraction and asynchronous workflows

- Prefer semantic, evidence-based page extraction over brittle styling selectors or assumptions about Steam's markup.
- Account for lazily loaded or dynamically inserted content when the observed page requires it. Use bounded observation and waiting; avoid unbounded polling or indefinite waits.
- Make long-running operations explicit about progress, completion, partial results, failure, cancellation, and timeout.
- Treat popup lifetime separately from background-operation lifetime. Closing a popup must not be described as either cancelling or continuing work unless the actual owner of the operation guarantees that behavior.
- Where an operation is designed to survive popup closure, make its state discoverable on reopen and resume UI polling without starting duplicate work.
- Handle cancellation, timeouts, navigation, and browser-context shutdown deliberately. Do not leave orphaned timers, observers, listeners, or duplicate jobs.
- Do not report an operation as resumed or complete until its state and subsequent work have been verified.

## Incremental delivery and prototype migration

- Work in small, focused vertical slices. Each slice should deliver one coherent, independently testable outcome rather than a broad layer-only rewrite.
- Keep tickets small and explicit about scope, acceptance criteria, dependencies, and validation. Split work when it crosses unrelated behaviors or creates a review that is difficult to reason about.
- Prefer extending the production architecture incrementally over attempting a wholesale rewrite.
- The existing `prototype/` code is diagnostic/reference tooling, not the production architecture. Keep it isolated from production modules and do not silently turn prototype assumptions into production contracts.
- Do not modify or remove working prototype behavior as part of an unrelated production slice.
- Defer a migration or deletion of prototype functionality until there is a deliberate migration point and the replacement behavior has been validated. Preserve a clear path to compare the replacement with observed prototype behavior.
- Avoid speculative abstractions and premature generalization. Introduce shared infrastructure when a concrete slice needs it and its boundary is understood.
- Keep each PR focused on its stated slice. Do not bundle unrelated cleanup, formatting, dependency changes, or future-slice scaffolding without a clear need.

## TypeScript and implementation conventions

- Use TypeScript with strict compiler settings and the repository's configured ES module conventions.
- Prefer browser-native APIs and a small dependency set. Add a dependency only when it provides clear value over a focused implementation.
- Use named exports and explicit return types for public module functions.
- Accept `unknown` at untrusted boundaries and narrow/validate it before use.
- Use descriptive names; avoid abbreviations except established domain terms such as AppID.
- Prefer `async`/`await` and handle expected failures explicitly. Do not swallow errors or convert failures into success-shaped defaults.
- Keep functions focused, deterministic where practical, and explicit about side effects.
- Preserve compatibility with the supported Firefox WebExtension environment. Do not assume Chromium-only APIs or behavior; verify API availability and manifest compatibility.

## Tests and validation

- Add deterministic tests for domain behavior before or alongside integration code.
- Cover valid, invalid, boundary, duplicate, empty, and mixed inputs for parsers and normalizers.
- Add tests for classification, provenance, reconciliation, completeness reporting, and export formatting as those slices are introduced.
- Add lifecycle tests for cancellation, timeout, popup close/reopen, duplicate-start prevention, and background-context loss whenever those behaviors are changed.
- Tests follow the three-part naming convention: `MethodName_StateUnderTest_ExpectedBehavior`.
- Use privacy-safe fixtures. Never make tests depend on a real Steam account, live authenticated session, or unstable production endpoint.
- Keep the npm manifest and lockfile in sync. Commit a genuine lockfile generated by npm; never fabricate lockfile contents or weaken installation to avoid a missing lockfile.
- Use `npm ci` for clean dependency installation, followed by the repository's configured typecheck and test scripts.
- CI must execute real checks for the files and project capabilities present in the PR. Do not silently skip required checks or remove lint, build, or extension validation merely to make a workflow green; if a check is not yet applicable, document the reason and the slice that will introduce it.
- Run the relevant focused tests during development and the full available validation before requesting review. Report checks that could not be run and why.
- Do not commit generated build output unless explicitly required.

## Documentation and decisions

- Update the README and relevant documentation when setup, supported behavior, security boundaries, or user-visible behavior changes.
- Clearly distinguish verified behavior, observed behavior, assumptions, limitations, and open questions.
- Record meaningful architectural decisions as concise ADRs under the existing architecture documentation structure.
- Keep examples aligned with the actual implementation; do not document intended future behavior as if it already exists.

## Git and review workflow

- Do not commit implementation changes directly to `main`. Use focused branches and pull requests.
- Use Conventional Commits.
- Keep PRs small enough to review as vertical slices. Explain the user-visible or architectural outcome, scope boundaries, validation, and known limitations.
- Keep the branch current with its target when needed, and verify the final diff rather than relying on the PR title or description.
- Address valid security, privacy, correctness, lifecycle, recovery, and timeout findings before merge. Verify each finding against the current code and tests; do not dismiss it solely because an automated reviewer raised it.
- AI reviews are advisory and do not replace human review. A missing, skipped, or still-processing AI review is not approval.
- Do not approve or merge automatically. CI must pass and the change must receive the required human review before merge.
