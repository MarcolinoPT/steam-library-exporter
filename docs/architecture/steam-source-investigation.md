# Investigation: authenticated Steam library sources

**Status:** In progress  
**Date:** 2026-11-05

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

## CORS observation

A page script executing on `store.steampowered.com` could not read the Community endpoint due to a cross-origin 403/CORS response. This establishes a page-context restriction, not that the endpoint itself is unavailable. The Community endpoint worked when requested from its own origin.

A Firefox extension background context with explicit host permissions may make the cross-origin request, but this must be proven with a prototype. Do not assume content scripts have equivalent privileges.

## Open questions

1. Can the extension's privileged context query both endpoints while reusing the user's logged-in Steam session?
2. What exact session/authentication context does each endpoint require?
3. Are individually private games included?
4. Are free games, DLC, demos, tools, soundtracks, and software represented?
5. Does either source omit licenses, delisted titles, or older entitlements?
6. What explains the observed 499 vs 545 difference?
7. Are package IDs and owned AppIDs sufficient to reconstruct individual products?
8. Can we identify and report source coverage without claiming completeness?

## Next experiment

Build a minimal Firefox MV3 comparator that requests both endpoints using the browser's authorized session context, validates response shapes, and reports counts plus set overlap only. Do not log or persist cookies, session IDs, or raw private library data.

## Decision guardrails

- Do not select a canonical source until the coverage questions are answered.
- Do not merge sources by union without classification and provenance.
- Do not silently discard records.
- Do not claim full-library completeness solely from HTTP 200 or matching counts.
