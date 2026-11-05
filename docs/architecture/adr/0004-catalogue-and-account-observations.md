# ADR 0004: Separate catalogue items from account library observations

- Status: Proposed
- Date: 2026-11-05

## Context

The initial Steam source investigation found that authenticated Community and Store endpoints, the public profile Games page, and public Store metadata expose different views of Steam application data.

Those views do not have established, interchangeable semantics:

- An AppID identifies a Steam catalogue application.
- A catalogue type such as `game`, `dlc`, or `demo` describes the catalogue item; it does not establish account ownership.
- An AppID returned by an authenticated endpoint is evidence that the source listed it in that response. It is not, without a stronger documented contract, proof of a particular legal or permanent entitlement.
- Public profile visibility and public catalogue metadata are separate from authenticated account data.
- Unavailable metadata and source differences must remain representable rather than being interpreted as invalid, unowned, or delisted.

The investigation also found heterogeneous catalogue types and unresolved records. A model that treats every AppID as an owned game would encode assumptions that the evidence does not support.

## Decision

Model Steam catalogue identity separately from account-specific source observations.

### Catalogue item

A `CatalogueItem` represents an application identified by its Steam AppID, independently of any account.

The initial identity is:

- `appId`: positive Steam AppID.

Catalogue metadata is optional and independently enrichable. It may include a name and a source-reported type/category. The type vocabulary must remain extensible; observed values are not an exhaustive enum.

A catalogue item may exist in the model even when its metadata is unavailable or unresolved.

### Account library observation

An `AccountLibraryObservation` represents an account-scoped observation that a particular source returned or exposed an AppID.

An observation must retain, at minimum:

- the account context to which the observation belongs;
- the referenced AppID;
- the source identifier;
- when the observation was made;
- the kind of source relationship asserted, using wording no stronger than the source evidence supports.

The initial relationship semantics should be conservative (for example, `listed-by-source`). Do not name this concept `Entitlement` or infer ownership, purchase, license, or permanent access from source membership alone.

Only positive observations are created by this initial concept. The absence of an AppID from a response must not automatically become a negative ownership assertion. Source-run coverage and reconciliation are handled separately.

### Separation and constraints

- Catalogue metadata must never create an account observation.
- An account observation may reference a catalogue item whose metadata is missing or unavailable.
- Multiple observations for the same account and AppID may coexist when they come from different sources or collection runs.
- Conflicting source observations are retained; they are not overwritten or silently collapsed.
- Catalogue type is descriptive metadata, not an entitlement state.
- Package/subscription identifiers remain distinct from AppIDs.
- Stronger entitlement concepts may be introduced later only if evidence and requirements justify their semantics.

## Consequences

- The domain model has two independent concepts: catalogue identity and account/source observation.
- Source provenance is intrinsic to each observation rather than a property inferred after merging.
- Exporters can distinguish an item and its metadata from the evidence that caused it to appear in an account's library view.
- Reconciliation can combine observations without turning source presence into an unsupported ownership claim.
- Unknown and unavailable catalogue metadata do not require dropping an observation.
- The model avoids prematurely asserting ownership semantics, but callers must use precise labels in UI and exports.

## Initial illustrative shape

This is conceptual, not a finalized programming-language schema:

```ts
type CatalogueItem = {
  appId: number;
  metadata?: {
    name?: string;
    type?: string;
    status: "available" | "unavailable" | "unknown";
  };
};

type AccountLibraryObservation = {
  accountContextId: string;
  appId: number;
  source: string;
  relationship: "listed-by-source";
  observedAt: string;
};
```

The exact field names, metadata status representation, account-context identity, source-run model, and serialization format remain open for subsequent design work.

## Alternatives considered

### One unified owned-game record

Rejected because it conflates catalogue identity, catalogue classification, and account relationship. It would also encourage treating every AppID as an owned game.

### A first-class Entitlement model immediately

Deferred because current evidence does not establish that the observed source membership means purchase, license, or permanent entitlement. The term would communicate more certainty than we have.

### Store only raw source responses

Rejected as the production domain model because it leaves every consumer to reinterpret source-specific payloads and makes consistent reconciliation/export difficult. Raw response retention is not required by this decision and must not include session secrets.

## Follow-up

This ADR defines the conceptual separation only. Subsequent design work should specify:

1. source provenance and collection-run/coverage representation;
2. reconciliation semantics, including how absence and unresolved results are represented;
3. catalogue metadata enrichment and classification status;
4. export projections and user-facing wording.

The model must continue to reflect observed evidence, not assumptions about undocumented Steam behavior.
