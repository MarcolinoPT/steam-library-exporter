# System overview

## Product scope

Steam Library Exporter is a Firefox-first extension. Its primary mode exports the signed-in user's own Steam library independently of profile visibility. A secondary mode may export another user's library only when Steam exposes it to the current visitor.

## Architectural boundaries

- **UI:** popup and, where useful, a small in-page status surface.
- **Browser integration:** Firefox WebExtension APIs, permissions, tabs, downloads, and authenticated request context.
- **Source adapters:** isolated integrations for each verified Steam data source.
- **Domain core:** normalized application records, classification, provenance, reconciliation, and completeness assessment.
- **Exporters:** TXT, CSV, JSON, and clipboard output.

The domain core must not depend on the DOM or Firefox APIs.

## Data model direction

An application record should preserve at least:

- AppID
- name, when known
- application type/category, when known
- source provenance
- classification confidence or unresolved status

Package/subscription IDs must not be confused with AppIDs. Games, DLC, tools, demos, soundtracks, and software must not be silently conflated.

## Completeness

A successful HTTP response is not proof of complete ownership data. Each source adapter reports source-specific coverage and limitations. Reconciliation must preserve source membership and differences, not blindly treat the union or intersection as authoritative.

## Security

All processing is local. Steam session material is never logged, persisted, exported, or sent to third parties. Host permissions must be narrowly scoped. No backend or telemetry is planned.
