# Temporary Firefox MV3 source comparator

This prototype tests whether the authenticated Steam library endpoints can be queried from the Firefox container that already holds the user's Steam session. It is intentionally separate from the production application.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose `prototype/manifest.json` from this repository checkout.
4. Open the extension popup and select **Compare my Steam sources**.

Use a Firefox profile where you are already signed in to both Steam Community and Steam Store in the same Firefox container. Do not change Steam profile privacy settings for this test.

**Both Steam sites must already have an open tab in the selected authenticated container.** A Community tab in the default container cannot be used for a request in another container, even if it is signed in. The prototype will not open, reload, activate, navigate, or otherwise modify tabs. If either matching tab is missing, that source reports a diagnostic and is not queried.

## Permissions and scope

The prototype requests:

- `cookies`: inspect Steam cookie metadata across Firefox cookie stores and read the Community `sessionid` for the selected store. Cookie values are not included in diagnostics.
- `scripting`: execute one-off requests in existing Steam tabs.
- Host access only for `https://steamcommunity.com/*` and `https://store.steampowered.com/*`.

It deliberately does **not** request:

- `tabs`: host permissions provide access to the URL metadata of matching Steam tabs; the prototype queries tabs without a URL filter and filters the returned Steam URLs locally.
- `contextualIdentities`: it reads the existing tab `cookieStoreId` and cookie-store metadata, but does not manage or name containers.
- `storage`, `<all_urls>`, or any unrelated host access.

The background script identifies cookie stores that have Steam's `steamLoginSecure` cookie for both Community and Store. If more than one store qualifies, the active Steam tab determines the intended store; if there is no unambiguous selection, the prototype stops and explains what to do. It then finds existing Community and Store tabs in that same store.

The Firefox MV3 background context cannot select an arbitrary container's cookie store for a normal `fetch()`. Therefore, the prototype uses `scripting.executeScript()` to run each authenticated library request in a matching existing Steam-origin tab. The browser attaches that tab's own container cookies to the same-origin request. This is a one-off injection, not a persistent content script.

The Community `sessionid` is read for the selected cookie store and passed in memory only to the Community library request. It is never returned to the popup, logged, persisted, sent to Steam Store, or sent to a third party. The Steam library response bodies are returned to the extension background only for in-memory normalization and comparison.

## Store-only AppID classification

After a successful comparison, the popup offers **Classify Store-only AppIDs** when the Store source contains additional AppIDs.

Selecting it:

1. Re-queries both authenticated library sources in the same selected container.
2. Computes the Store-only set in memory.
3. Requests public Steam Store `/api/appdetails/` metadata for each Store-only AppID, one ID per request.
4. Reads only the `data.type` field and returns aggregate counts by Steam-reported type.

The metadata requests execute from the extension background context with `credentials: "omit"`; Steam login cookies are not sent. They do not need an open Steam tab after the authenticated source refresh completes. AppIDs, application names, full metadata responses, and the Store-only set are never returned to the popup, logged, or persisted.

Classification is incremental. The popup starts a background job, then polls using short messages. Each poll performs at most one public metadata request, and requests are spaced at least two seconds apart. This avoids one long-lived message/executeScript operation and provides visible progress. Keep the popup open while the job runs. The job state and identifiers exist in memory only; if Firefox unloads the background context, the job is lost and must be started again.

An HTTP 429 response or the first request-level failure stops the run and reports how many entries were not attempted. The UI reports aggregate progress and the failure category, not the AppID or response body.
A missing Store record, unsuccessful response, missing type field, identity mismatch, or request failure is counted separately; it is never silently classified as a game. The metadata endpoint is undocumented and can change. Its type value is a Store classification, not proof of a user's entitlement type or of library completeness.

Reference for the observed appdetails behavior and rate limit: [InternalSteamWebAPI — Get App Details](https://github-wiki-see.page/m/Revadike/InternalSteamWebAPI/wiki/Get-App-Details). This is community-maintained documentation, not an official Valve API contract.

## Profile Games page comparison

The popup also offers **Compare profile Games page (All Games)**. It requires an already-open Steam Community profile Games page (for example, `/id/<profile>/games/?tab=all`) in the selected authenticated Firefox container, alongside the existing Community and Store tabs.

The prototype inspects the currently rendered page DOM in place. It extracts positive AppIDs from `data-appid` attributes and app links, detects Steam's displayed **All Games** count when present, and compares the extracted set in memory with freshly queried Community and Store sets. It reports only aggregate overlap and difference counts. It does not open, reload, scroll, activate, or navigate tabs; it does not export game names or AppIDs.

The page may render only part of the library at a time. The result therefore includes both Steam's displayed count and the number of unique AppIDs extracted from the current DOM. If those counts differ, treat the page comparison as partial rather than assuming the profile page has been fully read. The page's visible list is a third reference set, not a canonical entitlement source.

## Store AppIDs absent from profile page

After a successful profile comparison, the popup can classify the Store AppIDs not present in the current profile Games page. The action refreshes the authenticated Store source and re-reads the existing profile page DOM in the same selected Firefox container, then selects Store AppIDs absent from the profile set. It checks public `/api/appdetails/` metadata one AppID per request, paced at least two seconds apart, using the in-memory incremental classifier. For the observed account this set was 233 entries, so a complete run may take roughly eight minutes. The popup must remain open. Only aggregate type and failure counts are displayed. No tabs are opened, scrolled, reloaded, or navigated. Public metadata is not proof of account entitlement, and unavailable records remain unknown.

## Profile-only AppID metadata probe

After a successful profile Games page comparison identifies AppIDs absent from both authenticated library endpoints, the popup offers a separate metadata probe for that profile-only set.

The probe refreshes the two authenticated endpoints and extracts AppIDs from the already-open profile Games page again. It selects only IDs absent from both endpoint sets, then queries public Store `/api/appdetails/` metadata one AppID per request, with at least two seconds between requests. It reuses the incremental in-memory classification job and returns aggregate Steam-reported type counts and unresolved/failure counts only.

The profile page and both Steam source tabs must remain open in the same authenticated container. No tab is opened, reloaded, scrolled, or navigated. AppIDs, names and response bodies are not shown, logged or persisted. Public appdetails metadata is not an entitlement check; unavailable entries remain unknown.

## Owned-package relationship probe

After a successful comparison with an `rgOwnedPackages` array, the popup offers **Probe owned package sample (10)**.

The probe refreshes both authenticated library sources from the existing same-container tabs, derives the Store-only AppID set in memory, and samples up to 10 unique package IDs. The sample is evenly spaced across the package list returned by Steam rather than taking only the first entries. It sends one unauthenticated public `/api/packagedetails/` request per sampled package ID, sequentially, with a two-second delay between requests and `credentials: "omit"`. It stops at the first network, HTTP, content-type, or JSON-shape failure and reports only the completed request count and failing request position.

The response is inspected in memory. Only aggregate metrics are returned: package counts, whether package app lists were available, app relationship counts, unique AppID count, invalid entry counts, and how many sampled AppIDs overlap the Store-only set. Package IDs, AppIDs, package names, app names, and raw response data are never returned to the popup, logged, or persisted.

This is an exploratory catalog relationship test. A package's public `apps` list describes catalog contents; it does not prove that every included app is individually entitled to the account. A sample cannot establish coverage of the full package set. If the endpoint behaves consistently, a separate follow-up experiment can evaluate the full set of owned packages.

Reference: [InternalSteamWebAPI — Get Package Details](https://github-wiki-see.page/m/Revadike/InternalSteamWebAPI/wiki/Get-Package-Details). This is community-maintained documentation, not an official Valve API contract.

## Data handling

- Response bodies, AppID sets, and session material are handled in memory only.
- AppIDs are normalized to positive safe integers.
- The comparison popup receives aggregate counts, non-sensitive Store response-shape metadata (top-level keys and owned-package count), cookie metadata (never cookie values), and a selected store identifier.
- The classification popup receives aggregate progress and final aggregate counts by Steam-reported type and unresolved-result counts only.
- Raw AppID entries, application names, response bodies, cookie values, and session material are never logged or persisted.
- No requests are sent to any destination other than the two Steam origins.
- The extension does not create, reload, activate, navigate, or close tabs.
- The prototype does not change Steam account or profile settings.

## Runtime validation (2026-11-05)

The existing-tab approach was tested successfully in Firefox using `firefox-container-4`, where both Steam login cookie sets were present and both matching Steam tabs were open.

| Metric | Steam Community | Steam Store |
|---|---:|---:|
| Raw entries | 499 | 545 |
| Unique AppIDs | 499 | 545 |
| Invalid entries | 0 | 0 |

Comparison:

- Present in both: 499
- Community only: 0
- Store only: 46
- Combined unique AppIDs: 545
- Store owned packages: 329

The user also tested with the Community tab in the default container; it did not work for the selected authenticated container. This confirms the practical requirement that **both origin tabs must be open in the same authenticated Firefox container**. The extension does not move or recreate tabs to satisfy this requirement.

This is a successful reproduction of the earlier manual counts, not proof that either endpoint is complete or that every returned AppID represents a game.

The incremental Store-only metadata classifier was subsequently tested successfully. It refreshed 46 Store-only AppIDs and attempted all 46 public metadata requests. Two returned usable details (one `game`, one `dlc`); 44 returned no usable Store details. There were no missing type fields, identity mismatches, request failures, or unattempted entries. The 44 unavailable results remain unclassified: they must not be assumed to be invalid, delisted, DLC, or non-games. This validates the incremental polling flow, not the completeness or coverage of the metadata endpoint.

## Interpretation

A successful JSON response confirms only that the endpoint returned a parseable response in this browser context. It does not prove that the response is complete or that every returned AppID is a game.

The comparator reports unique AppID counts, overlap, source-only counts, union count, and invalid-entry counts. It does not select a canonical source or merge sources into a production library.


## Additional runtime results (2026-11-05)

The profile comparison and follow-up classifiers were also exercised successfully in the same authenticated account/container.

Profile Games page:
- Steam All Games count: 326
- Unique AppIDs extracted from the current DOM: 326 (matching the displayed count)
- In both authenticated sources: 312
- Profile-only: 14; all 14 returned Steam-reported type `demo` from public appdetails metadata
- Community absent from profile: 187
- Store absent from profile: 233

Store-not-profile classification (233):
- 94 successfully classified: 75 `dlc`, 9 `episode`, 4 `music`, 3 `game`, 2 `advertising`, 1 `series`
- 137 unavailable/no Store details
- 2 identity mismatches
- 0 missing type, request failures, or unattempted entries

Store-only classification (46):
- 2 successfully classified: 1 `dlc`, 1 `game`
- 44 unavailable/no Store details
- 0 missing type, identity mismatches, request failures, or unattempted entries

Owned-package sample:
- 329 package entries; 328 unique valid package IDs; 1 invalid entry
- 10 sampled requests completed
- 1 package returned an app list; 9 were unavailable/without an app list
- 1 app relationship / 1 unique AppID; no overlap with the Store-only set

These remain account-specific observations. Unavailable metadata is unknown, not evidence of invalidity or lack of entitlement. Public appdetails and packagedetails describe catalogue information, not account ownership. The package sample does not establish full package coverage.
