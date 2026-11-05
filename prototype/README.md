# Temporary Firefox MV3 source comparator

This prototype tests authenticated requests from a privileged extension background context. It is intentionally separate from the production application.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose `prototype/manifest.json` from this repository checkout.
4. Open the extension popup and select **Compare my Steam sources**.

Use a Firefox profile where you are already signed in to both Steam Community and Steam Store. Do not change Steam profile privacy settings for this test.

## Permissions

The prototype requests host access only for:

- `https://steamcommunity.com/*`
- `https://store.steampowered.com/*`

It does not request the cookies API, broad URL access, tabs, storage, or content-script permissions. Requests run in the Firefox MV3 background context with `credentials: "include"`.

The Community endpoint is initially queried without a session ID parameter. If Steam requires that parameter, record the failure first; do not add cookie access or copy session material without a separate security review.

## Data handling

- Response bodies are parsed in memory only.
- AppIDs are normalized to positive safe integers.
- Only aggregate counts are returned to the popup.
- Raw records, cookies, and session material are never logged or persisted.
- No requests are sent to any destination other than the two Steam origins.

## Interpretation

A successful JSON response confirms only that the endpoint returned a parseable response in this browser context. It does not prove that the response is complete or that every returned AppID is a game.

The comparator reports unique AppID counts, overlap, source-only counts, union count, and invalid-entry counts. It does not classify records or select a canonical source.
