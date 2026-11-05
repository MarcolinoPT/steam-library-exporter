# Repository instructions

## Project principles

- Prefer the simplest implementation that meets the requirements.
- Keep the core domain logic independent of Firefox APIs and the DOM.
- Isolate Steam-specific network integrations behind small adapters.
- Treat Steam endpoints as undocumented and unstable unless official documentation says otherwise.
- Never claim a library export is complete without a source-specific completeness check.
- Preserve provenance and uncertainty when reconciling multiple data sources.
- Never silently discard application records. Classification and filtering must be explicit.

## Security

- Never log, persist, export, or transmit Steam cookies, session IDs, authentication tokens, or other secrets.
- Do not request broad browser permissions such as <all_urls> when narrower host permissions suffice.
- Treat Steam responses and page content as untrusted input.
- Validate response status, content type, shape, and identifiers.
- Do not inject remote code or load executable code from remote sources.
- Do not add telemetry or a backend without an explicit product decision.

## Engineering conventions

- TypeScript with strict compiler settings.
- Prefer browser-native APIs and minimal dependencies.
- Use named exports and explicit return types for public module functions.
- Use async/await and handle expected network failures explicitly.
- Use descriptive names; avoid abbreviations except established domain terms such as AppID.
- Keep functions focused and side-effect boundaries explicit.
- Add tests for parsers, normalization, reconciliation, and exporters.
- Tests follow the three-part naming convention: MethodName_StateUnderTest_ExpectedBehavior.
- Do not commit generated build output unless explicitly required.

## Git workflow

- Do not commit implementation changes directly to main.
- Use focused branches and pull requests.
- CI must pass before merge.
- Address AI review findings; AI review is advisory and does not replace human review.
- Use Conventional Commits.

## Documentation

- Record meaningful architectural decisions as ADRs.
- Clearly distinguish verified behavior, observed behavior, assumptions, and open questions.
- Update README and relevant docs when behavior or setup changes.
