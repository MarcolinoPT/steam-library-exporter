# Testing strategy

**Status:** Proposed  
**Related:** [Issue #13](https://github.com/MarcolinoPT/steam-library-exporter/issues/13)

## Current repository assessment

The repository is still in its investigation/prototype phase:

- There is no root `package.json`, lockfile, production source tree, or production extension build.
- The executable extension is isolated under `prototype/` and is explicitly documented as temporary diagnostic tooling.
- The prototype is plain JavaScript. Its background script combines domain calculations, Firefox API access, authenticated Steam requests, and message routing; its popup script combines DOM rendering and browser messaging.
- The Firefox Manifest V3 prototype uses a background script and popup. The production architecture is intended to keep the domain core independent of Firefox APIs and the DOM.
- CI currently validates the repository foundation and conditionally runs npm tasks only when a root Node project exists. It does not yet execute a product test suite.

The prototype is valuable as a source of verified behaviours, fixtures to design, and regression scenarios. It should not become the production domain layer or force the production code to preserve its current coupling.

## Principles

1. Test production modules at their intended boundaries; do not turn the diagnostic prototype into a permanent test target.
2. Keep domain tests independent of Firefox, the DOM, Steam network access, and user credentials.
3. Make Steam responses deterministic through synthetic fixtures. Never use live Steam accounts or private library data in automated tests.
4. Assert evidence and completeness semantics, not just counts. A successful response, an absent record, and unavailable metadata are distinct states.
5. Keep browser-level tests small and focused on behaviours that cannot be established reliably by unit or integration tests.
6. Do not introduce a UI framework solely to make component tests possible. The production UI technology should determine the appropriate DOM test environment.
7. Do not commit generated browser profiles, downloaded Firefox binaries, build output, credentials, cookies, session IDs, or real account data.

## Test layers

### 1. Unit tests — Vitest

Use Vitest for deterministic domain logic, with no browser globals unless a test explicitly supplies a narrow fake.

Initial targets:

- AppID parsing and normalization, including positive safe integers, digit-only strings, object shapes, duplicates, malformed values, zero, negatives, and unsafe integers.
- Source-result normalization and validation.
- Catalogue identity versus account/source observations.
- Reconciliation: intersection, source-only records, union, duplicates, and conflicting observations.
- Completeness and coverage states, including complete, partial, unavailable, and unknown.
- Metadata classification, preserving unknown/unavailable outcomes and never treating catalogue type as entitlement.
- Export projections and TXT, CSV, and JSON serialization, including escaping and stable counts.

Use the repository's three-part test naming convention: `MethodName_StateUnderTest_ExpectedBehavior`.

### 2. DOM/component tests

Use Vitest with a DOM environment (prefer the lightest environment compatible with the chosen UI; evaluate jsdom before adding alternatives) for user-visible UI behaviour.

Targets include:

- Correct display of complete, partial, private, unavailable, and failed source states.
- Disabled/busy states and confirmation gates.
- Safe rendering of Steam-derived strings as text rather than HTML.
- Export actions and displayed/exported count consistency.

Do not test Firefox's implementation of browser APIs in this layer; mock the extension boundary.

### 3. Integration tests

Exercise production source adapters and application orchestration with controlled fakes:

- Firefox API adapter contracts, including tabs, cookies, runtime messaging, and downloads.
- Steam Community and Store response validation and normalization.
- Container/tab selection and missing-origin-tab behaviour.
- Multi-source refresh, reconciliation, and completeness propagation.
- Classification job progression, cancellation/failure paths, and popup-independent background state where applicable.

Network calls must be intercepted or replaced by deterministic fixtures. No integration test should contact Steam.

### 4. Firefox E2E

Select the runner only after a minimal proof-of-concept against the production build and Firefox MV3 manifest.

Evaluate:

- Firefox-native extension loading and temporary installation support.
- Headless CI reliability and reproducible Firefox versions.
- Access to popup UI and extension background context.
- Ability to control deterministic Steam responses without real accounts.
- Diagnostics, screenshots/logs, and cleanup on failure.

Candidate direction: use Firefox WebDriver/geckodriver or a `web-ext`-driven Firefox session with WebDriver control. Do not assume Playwright's Firefox support provides Chromium-equivalent unpacked-extension loading; verify this experimentally before adoption.

Keep the first E2E suite deliberately small:

1. Install/load the built extension and open its popup.
2. Complete a source-comparison/classification workflow using deterministic fixtures or a local test server.
3. Export TXT, CSV, and JSON and verify the downloaded contents/counts.
4. Exercise a popup close/reopen scenario while a background job is active, if the production lifecycle retains that behaviour.

No E2E scenario should require a signed-in Steam account, real cookies, or public profile availability.

## CI

Incrementally extend GitHub Actions once a production Node project exists:

- Pin Node to the version selected by `.nvmrc` and use `npm ci`.
- Run lint, typecheck, unit/DOM/integration tests, build, and manifest validation.
- Validate workflow YAML with `actionlint`.
- Run Firefox E2E in a separate job so browser setup and failures are isolated from fast tests.
- Upload only sanitized diagnostics on failure; never upload browser profiles or storage state.
- Keep permissions least-privilege and use concurrency cancellation for superseded runs.

## Delivery sequence

1. Complete the production domain and adapter boundaries before building test infrastructure around them.
2. Introduce the root Node/TypeScript project and Vitest with the first pure domain modules.
3. Add unit tests alongside each domain module; establish deterministic fixtures and coverage semantics.
4. Add DOM and adapter integration tests as the UI and Firefox boundary are implemented.
5. Prove the Firefox E2E runner against the real production manifest/build, then add the smoke suite.
6. Add `actionlint` and split CI into fast validation and browser E2E jobs.

## Exit criteria

- Local commands and CI run the same deterministic test suite.
- Core domain tests do not import Firefox APIs or access the DOM.
- No automated test requires real Steam authentication or transmits private account data.
- Incomplete/unavailable/unknown data cannot silently become a complete library or a negative ownership assertion.
- Exported content and counts are verified from the same deterministic scenario.
- Firefox E2E loads the built extension in a real Firefox instance and is stable in CI.
