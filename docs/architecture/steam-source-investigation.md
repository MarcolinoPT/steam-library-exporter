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

The prototype offers a separate **Classify Store-only AppIDs** action after a successful comparison.

The first implementation injected one long-running metadata loop into the existing Store tab. The user reported Firefox's generic `Could not establish connection. Receiving end does not exist.` error while the popup remained open. Moving the loop to a single long-running background message did not resolve the symptom. Neither failure provided an HTTP status or metadata result, so it cannot be attributed to Steam or interpreted as a rate limit.

The current implementation uses an incremental job:
- It refreshes both authenticated library sources using their existing same-container tabs.
- It computes the Store-only set in background memory.
- The popup starts a job and polls through short runtime messages.
- Each poll performs at most one public Store `/api/appdetails/` request from the extension background context, using `credentials: "omit"`.
- Requests are paced at least two seconds apart; the popup displays aggregate progress.
- Only aggregate type counts and failure categories are returned. AppIDs, names, and raw metadata are not exposed or persisted.

This design removes the long-lived message and tab-injection operations. It still depends on the Firefox background context remaining available while the popup polls; job state is memory-only and is lost if that context unloads. The Store metadata endpoint is undocumented and its behavior may change. Community-maintained documentation reports a rate limit around 200 requests per five minutes, but Valve publishes no stable contract or limit.

### Successful incremental runtime result

The user successfully ran the incremental classifier on 2026-11-05:

| Result | Count |
|---|---:|
| Store-only AppIDs refreshed | 46 |
| Metadata requests attempted | 46 |
| Successfully classified | 2 |
| Steam-reported `game` | 1 |
| Steam-reported `dlc` | 1 |
| Unavailable / no Store details | 44 |
| Missing type | 0 |
| Identity mismatch | 0 |
| Request failures | 0 |
| Not attempted | 0 |

All 46 requests completed without a reported network/HTTP failure or rate limit. Only two returned usable app details. The other 44 were unavailable through this metadata endpoint; this does **not** establish that they are invalid, delisted, DLC, or non-games. Their nature remains unknown and requires separate investigation.

The successful run validates the incremental message/polling flow for this account and this 46-entry set. It does not establish metadata coverage or library completeness. A successful comparison still does not establish that either source is complete.

Reference: [InternalSteamWebAPI — Get App Details](https://github-wiki-see.page/m/Revadike/InternalSteamWebAPI/wiki/Get-App-Details).

## Owned-package relationship probe

A separate prototype action now tests the public Store package-details endpoint against a small sample of the account's `rgOwnedPackages` entries.

The probe:
- Refreshes Community and Store library responses from the existing authenticated tabs in the selected Firefox container.
- Computes the Store-only AppID set in memory.
- Extracts valid package IDs from `rgOwnedPackages`, deduplicates them, and chooses up to 10 evenly spaced entries from the returned order.
- Sends one unauthenticated request to `/api/packagedetails/` using the sampled package IDs in the `packageids` query parameter.
- Inspects only response success state and the `data.apps[].id` relationships.
- Returns aggregate counts only, including sample AppID overlap with the Store-only set. No package IDs, AppIDs, names, or raw metadata are returned or persisted.

The package-details endpoint is undocumented by Valve. Community-maintained documentation describes a CSV `packageids` parameter and an `apps` array in each successful package response. This is sufficient to justify a limited probe, not to assume that the endpoint is stable or complete.

**Interpretation guardrail:** a package's catalog app list describes what the package contains; it does not prove that every listed app is individually entitled to the account. A 10-package sample can indicate whether this mapping is useful, but cannot establish coverage of all 329 owned packages or explain all 46 Store-only AppIDs.

**Status:** implementation added; awaiting user runtime validation.

Reference: [InternalSteamWebAPI — Get Package Details](https://github-wiki-see.page/m/Revadike/InternalSteamWebAPI/wiki/Get-Package-Details).

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
