# Temporary Firefox MV3 source comparator

This prototype tests authenticated requests from a privileged extension background context. It is intentionally separate from the production application.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose `prototype/manifest.json` from this repository checkout.
4. Open the extension popup and select **Compare my Steam sources**.

Use a Firefox profile where you are already signed in to both Steam Community and Steam Store. Do not change Steam profile privacy settings for this test.

## Permissions

The prototype requests:

- `cookies` permission, used only to read the `sessionid` cookie for `steamcommunity.com`.
- Host access only for `https://steamcommunity.com/*` and `https://store.steampowered.com/*`.

It does not request broad URL access, tabs, storage, or content-script permissions. Requests run in the Firefox MV3 background context with `credentials: "include"`.

The Community session ID is retrieved in memory and added only to the Community endpoint request. It is never returned to the popup, logged, persisted, or sent to the Store endpoint or any third party. If the cookie is unavailable, the Community request fails with a generic diagnostic.

## Data handling

- Response bodies and the session ID are handled in memory only.
- AppIDs are normalized to positive safe integers.
- Only aggregate counts and non-sensitive Store response-shape metadata (top-level keys and owned-package count) are returned to the popup.
- Raw records, cookies, and session material are never logged or persisted.
- No requests are sent to any destination other than the two Steam origins.

## Interpretation

A successful JSON response confirms only that the endpoint returned a parseable response in this browser context. It does not prove that the response is complete or that every returned AppID is a game.

The comparator reports unique AppID counts, overlap, source-only counts, union count, and invalid-entry counts. It does not classify records or select a canonical source.
