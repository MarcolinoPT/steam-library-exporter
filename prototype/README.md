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

The metadata requests execute in the existing Steam Store tab and use `credentials: "omit"`; Steam login cookies are not sent with them. They do not contact any third party. AppIDs, application names, full metadata responses, and the Store-only set are never returned to the popup, logged, or persisted.

Requests are spaced 1.6 seconds apart. Community documentation reports a rate limit of approximately 200 requests per five minutes for this undocumented endpoint; Valve does not publish a stable contract or limit. The conservative delay is intended to avoid burst traffic. A HTTP 429 response stops the run immediately and reports how many entries were not attempted. A full run for 46 entries takes about 75 seconds. Keep the popup open until it completes.

A missing Store record, unsuccessful response, missing type field, identity mismatch, or request failure is counted separately; it is never silently classified as a game. The metadata endpoint is undocumented and can change. Its type value is a Store classification, not proof of a user's entitlement type or of library completeness.

Reference for the observed appdetails behavior and rate limit: [InternalSteamWebAPI — Get App Details](https://github-wiki-see.page/m/Revadike/InternalSteamWebAPI/wiki/Get-App-Details). This is community-maintained documentation, not an official Valve API contract.

## Data handling

- Response bodies, AppID sets, and session material are handled in memory only.
- AppIDs are normalized to positive safe integers.
- The comparison popup receives aggregate counts, non-sensitive Store response-shape metadata (top-level keys and owned-package count), cookie metadata (never cookie values), and a selected store identifier.
- The classification popup receives aggregate counts by Steam-reported type and unresolved-result counts only.
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

This is a successful reproduction of the earlier manual counts, not proof that either endpoint is complete or that every AppID represents a game. The Store-only metadata classification is the next manual runtime experiment; its results must be recorded separately.

## Interpretation

A successful JSON response confirms only that the endpoint returned a parseable response in this browser context. It does not prove that the response is complete or that every returned AppID is a game.

The comparator reports unique AppID counts, overlap, source-only counts, union count, and invalid-entry counts. It does not select a canonical source or merge sources into a production library.
