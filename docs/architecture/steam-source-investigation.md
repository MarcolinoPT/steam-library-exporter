# Investigation: authenticated Steam library sources

**Status:** Completed (initial source investigation; findings remain subject to revision)  
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

## Steam Community profile Games page comparison

The user's Steam Community profile page at `/id/<profile>/games/?tab=all` displays an **All Games** count of 326 in the observed session. This is a third reference point, distinct from the authenticated Community and Store endpoint results. The count is a UI presentation count; it should not be assumed to have the same inclusion rules as either endpoint.

The prototype now has a separate profile-page comparison action. It requires an already-open profile Games page in the selected authenticated Firefox container, in addition to the existing Community and Store tabs. It inspects the current DOM in place, collecting AppIDs from `data-appid` attributes and app links. It also attempts to read Steam's displayed All Games count. The extracted IDs are compared in memory with freshly queried Community and Store sets; only aggregate overlap/difference counts are returned to the popup.

The implementation does not scroll, reload, navigate, open, activate, or otherwise modify tabs. It does not return or persist AppIDs or names. Because the page may render only a subset of the full list in the current DOM, the comparison reports the displayed count separately from the extracted unique AppID count. A mismatch means the page extraction is partial and must not be treated as a complete profile set.

**Successful runtime validation (2026-11-05):**

| Metric | Result |
|---|---:|
| Steam-displayed All Games count | 326 |
| Rendered `.gameListRow` elements | 0 |
| Unique AppIDs extracted from DOM | 326 |
| Extracted count matches displayed count | Yes |
| In Community | 312 |
| In Store | 312 |
| In all three sources | 312 |
| Profile-only (absent from both endpoints) | 14 |
| Community entries absent from profile page | 187 |
| Store entries absent from profile page | 233 |

The zero `.gameListRow` count is not a failed extraction: AppIDs were successfully obtained from other DOM selectors, and the extracted unique count exactly matched Steam's displayed count. This is strong validation for the current page rendering, but not a guarantee about other page states or accounts.

The follow-up profile-only metadata probe refreshed all three sources, re-extracted the 14 profile-only AppIDs, and completed 14 individual public appdetails requests. All 14 returned usable metadata with Steam-reported type `demo`; there were no unavailable results, missing types, identity mismatches, request failures, or unattempted entries.

This supports the hypothesis that the profile's All Games presentation includes demos omitted from both authenticated endpoint sets for this account. It does not prove that every profile-only discrepancy on other accounts is a demo, nor does public appdetails metadata prove account entitlement. Preserve app type as a distinct classification rather than treating demos as full games.

## Profile-only AppID metadata probe

The first successful profile page comparison extracted 326 unique AppIDs, matching the Steam page's displayed All Games count. It found 312 AppIDs in all three sources, and 14 profile-page AppIDs absent from both authenticated endpoints. The 14 are the next targeted investigation set.

A prototype action now refreshes both authenticated endpoint responses and re-reads the profile page AppIDs from the existing page DOM. It selects the profile AppIDs absent from both Community and Store, then checks public Store `/api/appdetails/` metadata one ID per request with at least two seconds between requests. It uses the existing incremental in-memory job/polling mechanism. Only aggregate type counts and unresolved/failure counts are returned. The profile page and both source tabs must remain open in the same authenticated container; no tab is opened, scrolled, reloaded, or navigated.

**Interpretation guardrail:** appdetails metadata is not an entitlement check. An unavailable response does not prove an AppID is invalid, delisted, or not a game.

**Runtime validation completed (2026-11-05):** all 14 profile-only AppIDs returned usable public metadata with Steam-reported type `demo`; there were no unavailable results, missing types, identity mismatches, request failures, or unattempted entries. These are account/session-specific catalogue observations, not proof of entitlement.

## Owned-package relationship probe

A separate prototype action now tests the public Store package-details endpoint against a small sample of the account's `rgOwnedPackages` entries.

The probe:
- Refreshes Community and Store library responses from the existing authenticated tabs in the selected Firefox container.
- Computes the Store-only AppID set in memory.
- Extracts valid package IDs from `rgOwnedPackages`, deduplicates them, and chooses up to 10 evenly spaced entries from the returned order.
- Sends one unauthenticated `/api/packagedetails/` request per sampled package ID, sequentially, with a two-second delay between requests. The first network, HTTP, content-type, or JSON-shape failure stops the sample and reports aggregate request progress only.
- Inspects only response success state and the `data.apps[].id` relationships.
- Returns aggregate counts only, including sample AppID overlap with the Store-only set. No package IDs, AppIDs, names, or raw metadata are returned or persisted.

The package-details endpoint is undocumented by Valve. Community-maintained documentation describes a CSV `packageids` parameter and an `apps` array in each successful package response. This is sufficient to justify a limited probe, not to assume that the endpoint is stable or complete.

**Interpretation guardrail:** a package's catalog app list describes what the package contains; it does not prove that every listed app is individually entitled to the account. A 10-package sample can indicate whether this mapping is useful, but cannot establish coverage of all 329 owned packages or explain all 46 Store-only AppIDs.

**Runtime update:** the initial batched request failed with HTTP 400. The revised one-package-per-request probe completed successfully on 2026-11-05: 10 individually paced requests completed, one package returned an app list, and nine were unavailable or had no app list. The sample remains too small and sparse to establish package coverage or reconstruct entitlements.

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


## Consolidated runtime findings and conclusion

The following additional experiments were completed on 2026-11-05 using the same authenticated Firefox account/container. These observations are account- and session-specific.

### Three-way profile comparison

The Steam Community profile All Games page displayed 326 entries. The prototype extracted 326 unique AppIDs from the current DOM, matching the displayed count.

| Comparison | Count |
|---|---:|
| Profile All Games | 326 |
| Community authenticated endpoint | 499 |
| Store authenticated endpoint | 545 |
| Present in all three | 312 |
| Profile-only (absent from both endpoints) | 14 |
| Community absent from profile | 187 |
| Store absent from profile | 233 |

All 14 profile-only AppIDs were successfully classified by public appdetails metadata as Steam-reported `demo`. This is a catalogue classification, not proof of account entitlement.

### Store-not-profile classification (233 entries)

The 233 Store AppIDs absent from the profile page were checked individually:

| Steam-reported type / outcome | Count |
|---|---:|
| Successfully classified | 94 |
| `dlc` | 75 |
| `episode` | 9 |
| `music` | 4 |
| `game` | 3 |
| `advertising` | 2 |
| `series` | 1 |
| Unavailable / no Store details | 137 |
| Missing type | 0 |
| Identity mismatch | 2 |
| Request failures | 0 |
| Not attempted | 0 |

The 137 unavailable entries and two identity mismatches remain unknown. The 94 successful classifications show that this set is heterogeneous, with DLC the largest classified category. They do not establish what the unresolved entries represent or whether the account owns each catalogue item.

### Store-only classification (46 entries)

All 46 Store AppIDs absent from Community were checked individually:

| Steam-reported type / outcome | Count |
|---|---:|
| Successfully classified | 2 |
| `dlc` | 1 |
| `game` | 1 |
| Unavailable / no Store details | 44 |
| Missing type | 0 |
| Identity mismatch | 0 |
| Request failures | 0 |
| Not attempted | 0 |

The 44 unavailable entries remain unknown. The 46-record experiment validates the incremental request/polling path for this run, but provides little catalogue coverage for the Store-only set.

### Owned-package relationship sample

The Store response contained 329 owned-package entries. The revised package-details probe completed 10 individually paced public requests against an evenly spaced sample:

| Metric | Result |
|---|---:|
| Package entries | 329 |
| Unique valid package IDs | 328 |
| Invalid package entries | 1 |
| Sampled packages | 10 |
| Requests completed | 10 |
| Packages resolved with app lists | 1 |
| Packages unavailable / without app list | 9 |
| Packages with at least one app | 1 |
| App relationships returned | 1 |
| Unique AppIDs across sample | 1 |
| Sample AppIDs overlapping Store-only set | 0 |

This sample is too small and sparse to support reconstruction of the account's entitlements from package contents. It does not establish coverage of the full package set.

### Consolidated interpretation

For this account and observed session:

- Community returned 499 unique AppIDs; Store returned 545.
- Every Community AppID was also present in Store; Store added 46.
- The profile page exposed 326 AppIDs, 312 of which overlapped both authenticated sources.
- The profile-only 14 were all reported as demos by public appdetails metadata.
- The Store-not-profile set of 233 was heterogeneous among the 94 successfully classified records; 137 were unavailable and two had identity mismatches.
- Of the 46 Store-only records, only two were classifiable (one DLC and one game); 44 were unavailable.
- The 10-package sample resolved only one package app list and is not useful evidence of full package-to-entitlement coverage.

These results do **not** prove that Community is complete, that Store is complete, or that their union is a complete library. They also do not prove that the profile page is an authoritative entitlement source. Public appdetails and packagedetails are catalogue metadata, not account ownership checks.

### Decisions for the production design

1. Keep authenticated Community, authenticated Store, and public-profile acquisition as distinct source adapters.
2. Preserve source provenance for every record; do not silently merge away differences.
3. Model Steam catalogue entities separately from account entitlements. An AppID or catalogue type is not itself proof of ownership.
4. Preserve unknown/unavailable/identity-mismatch states. Never discard unresolved records or infer that they are invalid/delisted.
5. Treat game, DLC, demo, software, tool, soundtrack, episode, music, series and other catalogue types as distinct classifications where metadata supports them. Do not assume the current observed type vocabulary is exhaustive.
6. Keep metadata enrichment separate from authenticated library acquisition.
7. Do not claim completeness based on HTTP success, source overlap, matching UI counts, or public metadata availability.

### Investigation status

The initial Firefox MV3 feasibility, source comparison, profile comparison, targeted metadata classifications, and exploratory package sample are complete for this account/session. Coverage across other accounts and the full entitlement categories listed below remains unproven. The next step is to design the production data model and export pipeline around provenance and explicit uncertainty, then add further coverage probes only when they answer a concrete design question.

The findings are living documentation: update this record when new accounts, Steam behavior, runtime evidence, or implementation decisions change the conclusions.
