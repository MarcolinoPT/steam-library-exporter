# System overview

## Product scope

Steam Library Exporter is a Firefox-first extension. Its primary mode exports the signed-in user's own Steam library independently of profile visibility. A secondary mode may export another user's library only when Steam exposes it to the current visitor.

## Architectural boundaries

- **UI:** popup and, where useful, a small in-page status surface.
- **Browser integration:** Firefox WebExtension APIs, permissions, tabs, downloads, and authenticated request context.
- **Source adapters:** isolated integrations for each verified Steam data source.
- **Domain core:** catalogue identity, account library observations, metadata classification, provenance, reconciliation, and completeness assessment.
- **Exporters:** TXT, CSV, JSON, and clipboard output.

The domain core must not depend on the DOM or Firefox APIs.

## Data model direction

The domain model separates two concepts:

- **Catalogue item:** a Steam application identified by AppID, independent of any account. Optional metadata may include name and Steam-reported type.
- **Account library observation:** evidence that a particular source listed or exposed an AppID for an account context at a particular time.

An account library observation is not automatically an entitlement. Source membership must not be described as proof of purchase, license, permanent access, or ownership unless future evidence justifies that stronger meaning.

Catalogue metadata and account observations are independent:

- Metadata may be unavailable while an account observation remains valid.
- Catalogue type describes the catalogue item; it does not establish ownership.
- Multiple observations for the same AppID may coexist across sources and collection runs.
- Source differences and unresolved results must remain representable.
- Absence from a response must not automatically become a negative ownership assertion.

Package/subscription IDs must not be confused with AppIDs. Games, DLC, tools, demos, soundtracks, and software must not be silently conflated. Catalogue type vocabulary must remain extensible.

See [ADR 0004: Separate catalogue items from account library observations](adr/0004-catalogue-and-account-observations.md).

## Completeness

A successful HTTP response is not proof of complete ownership data. Each source adapter reports source-specific coverage and limitations. Reconciliation must preserve source membership and differences, not blindly treat the union or intersection as authoritative.

## Security

All processing is local. Steam session material is never logged, persisted, exported, or sent to third parties. Host permissions must be narrowly scoped. No backend or telemetry is planned.
