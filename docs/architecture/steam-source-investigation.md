# Investigation: authenticated Steam library sources

**Status:** In progress  
**Last updated:** 2026-11-05

## Objective

Identify reliable ways for a user to export their own Steam library even when their profile/game details are not public. Public-profile export is a secondary capability.

## Observations from manual browser-console experiments

The following results were observed in one authenticated Firefox session. They are not API guarantees and should not be treated as universal expected values.

### Steam Community

Request:

`https://steamcommunity.com/actions/GetOwnedApps/?sessionid=...`

Observed:

- HTTP 200
- JSON array
- 499 records in the tested account

### Steam Store Dynamic Store

Request:

`https://store.steampowered.com/dynamicstore/userdata/`

Observed:

- HTTP 200
- `application/json; charset=utf-8`
- `rgOwnedApps`: 545 entries
- `rgOwnedPackages`: 329 entries
- `rgMasterSubApps`: 0 entries
- 28 top-level keys

These are observations from a single account on 2026-11-05.

## Firefox MV3 authenticated request experiment

The temporary prototype initially requested both endpoints from the extension background context. Those requests did not use the Steam login session held in the user's Firefox Multi-Account Container:

- Community returned HTTP 403.
- Store returned valid JSON but an empty `rgOwnedApps` array.

Cookie metadata inspection (cookie values were not exposed) showed that the authenticated `steamLoginSecure` cookies for both origins were in `firefox-container-4`. The default cookie store did not have the matching Store login cookie.

The prototype was changed to execute each authenticated request in an already-open tab for the corresponding Steam origin and selected cookie store. This reuses the tab's container context without opening, reloading, activating, navigating, or closing tabs.

**Important operational requirement:** a Steam Community tab and a Steam Store tab must both already be open in the same authenticated Firefox container. A Community tab in the default container cannot provide the session context for a request in another container. The prototype does not create or move tabs to satisfy this requirement.

### Verified runtime result

The user ran the updated prototype on 2026-11-05 with both Steam tabs open in `firefox-container-4`.

| Metric | Steam Community | Steam Store |
|---|---:|---:|
| Raw entries | 499 | 545 |
| Unique AppIDs | 499 | 545 |
| Invalid entries | 0 | 0 |

Set comparison:

- Intersection: 499
- Community-only: 0
- Store-only: 46
- Union: 545

The Store response also contained 329 owned packages. All 499 Community AppIDs were present in the Store AppID set for this one account and test run.

This confirms that the existing-tab/container-scoped approach can reproduce the earlier manual counts. It does not establish that either endpoint is complete, that all returned AppIDs are games, or that these counts generalize to other accounts.

## CORS observation

A page script executing on `store.steampowered.com` could not read the Community endpoint due to a cross-origin 403/CORS response. This establishes a page-context restriction, not that the endpoint itself is unavailable. The Community endpoint worked when requested from its own origin.

The prototype uses each Steam origin's own existing tab for its authenticated request. It does not assume that content-script or background request contexts share a container's cookie store.

## Store-only metadata classification experiment

The prototype now offers a separate **Classify Store-only AppIDs** action after a successful comparison.

It re-fetches both authenticated sources, computes the Store-only set in memory, then queries the Steam Store `/api/appdetails/` endpoint once per Store-only AppID from the existing Store tab. These metadata requests use `credentials: "omit"`, so Steam login cookies are not sent. They are paced two seconds apart, stop on HTTP 429 or the first request-level failure, and return only aggregate counts grouped by the Store-reported `data.type` field.

The popup does not receive AppIDs, application names, or raw metadata. Unavailable records, missing type fields, identity mismatches, request failures, and entries not attempted are reported separately. The endpoint is undocumented and its behavior may change; community-maintained documentation reports a rate limit around 200 requests per five minutes, but Valve does not publish a stable contract or limit.

Reference: [InternalSteamWebAPI — Get App Details](https://github-wiki-see.page/m/Revadike/InternalSteamWebAPI/wiki/Get-App-Details).

**Status:** implementation and static syntax validation complete; user runtime validation and classification results are pending.

## Open questions

1. Does the metadata endpoint return a usable type for all 46 Store-only AppIDs?
2. What exact categories account for the 46 Store-only entries?
3. Are individually private games included?
4. Are free games, DLC, demos, tools, soundtracks, and software represented?
5. Does either source omit licenses, delisted titles, or older entitlements?
6. Are package IDs and owned AppIDs sufficient to reconstruct individual products?
7. Can we identify and report source coverage without claiming completeness?

## Decision guardrails

- Do not select a canonical source until the coverage questions are answered.
- Do not merge sources by union without classification and provenance.
- Do not silently discard records.
- Do not claim full-library completeness solely from HTTP 200, matching counts, or successful metadata lookups.
- Keep metadata enrichment separate from authenticated library acquisition.
