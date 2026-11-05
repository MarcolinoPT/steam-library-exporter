const COMMUNITY_ENDPOINT =
  "https://steamcommunity.com/actions/GetOwnedApps/";

const STORE_ENDPOINT =
  "https://store.steampowered.com/dynamicstore/userdata/";

function isPositiveAppId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function extractAppId(entry) {
  if (typeof entry === "number") {
    return entry;
  }

  if (typeof entry === "string" && /^\d+$/.test(entry)) {
    return Number(entry);
  }

  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const candidate = entry.appid ?? entry.appId ?? entry.id;
    if (typeof candidate === "number") {
      return candidate;
    }
    if (typeof candidate === "string" && /^\d+$/.test(candidate)) {
      return Number(candidate);
    }
  }

  return null;
}

function normalizeAppIds(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("Expected an array of application entries.");
  }

  const appIds = new Set();
  let invalidEntryCount = 0;

  for (const entry of entries) {
    const appId = extractAppId(entry);
    if (appId === null || !isPositiveAppId(appId)) {
      invalidEntryCount += 1;
      continue;
    }
    appIds.add(appId);
  }

  return {
    appIds,
    rawEntryCount: entries.length,
    uniqueAppCount: appIds.size,
    invalidEntryCount
  };
}

function compareAppIds(community, store) {
  let intersectionCount = 0;
  let communityOnlyCount = 0;
  let storeOnlyCount = 0;

  for (const appId of community.appIds) {
    if (store.appIds.has(appId)) {
      intersectionCount += 1;
    } else {
      communityOnlyCount += 1;
    }
  }

  for (const appId of store.appIds) {
    if (!community.appIds.has(appId)) {
      storeOnlyCount += 1;
    }
  }

  return {
    communityUniqueCount: community.uniqueAppCount,
    storeUniqueCount: store.uniqueAppCount,
    intersectionCount,
    communityOnlyCount,
    storeOnlyCount,
    unionCount: community.uniqueAppCount + storeOnlyCount,
    communityInvalidEntryCount: community.invalidEntryCount,
    storeInvalidEntryCount: store.invalidEntryCount
  };
}

async function fetchJsonEndpoint(endpoint, sourceName) {
  let response;

  try {
    response = await fetch(endpoint, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow"
    });
  } catch {
    throw new Error(
      sourceName + ": network request failed. Check the connection and extension host permissions."
    );
  }

  if (response.redirected) {
    throw new Error(
      sourceName + ": Steam redirected the request. The session may be missing or expired."
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      sourceName + ": Steam rejected the request (HTTP " + response.status + ")."
    );
  }

  if (!response.ok) {
    throw new Error(
      sourceName + ": Steam returned HTTP " + response.status + "."
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(
      sourceName + ": expected JSON but received a different content type."
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(sourceName + ": Steam returned malformed JSON.");
  }

  return payload;
}

async function getCommunitySessionId() {
  let cookie;
  try {
    cookie = await browser.cookies.get({
      url: COMMUNITY_ENDPOINT,
      name: "sessionid"
    });
  } catch {
    throw new Error(
      "Steam Community: Firefox could not read the sessionid cookie. Check the extension cookie permission and Steam sign-in."
    );
  }

  if (!cookie || typeof cookie.value !== "string" || cookie.value.length === 0) {
    throw new Error(
      "Steam Community: no sessionid cookie was available for this profile. Open Steam Community, sign in, and retry."
    );
  }

  return cookie.value;
}

async function fetchCommunitySource() {
  const sessionId = await getCommunitySessionId();
  const endpoint = new URL(COMMUNITY_ENDPOINT);
  endpoint.searchParams.set("sessionid", sessionId);

  const payload = await fetchJsonEndpoint(
    endpoint.toString(),
    "Steam Community"
  );

  if (!Array.isArray(payload)) {
    throw new Error(
      "Steam Community: response shape was not the expected JSON array."
    );
  }

  return normalizeAppIds(payload);
}

async function fetchStoreSource() {
  const payload = await fetchJsonEndpoint(STORE_ENDPOINT, "Steam Store");

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Steam Store: response was not a JSON object.");
  }

  if (!Array.isArray(payload.rgOwnedApps)) {
    const keys = Object.keys(payload).sort();
    throw new Error(
      "Steam Store: rgOwnedApps was missing or was not an array. Response keys: " +
      keys.join(", ")
    );
  }

  const normalized = normalizeAppIds(payload.rgOwnedApps);
  return {
    ...normalized,
    responseKeys: Object.keys(payload).sort(),
    ownedPackagesCount: Array.isArray(payload.rgOwnedPackages)
      ? payload.rgOwnedPackages.length
      : null
  };
}

async function captureSource(fetchSource) {
  try {
    const source = await fetchSource();
    return {
      ok: true,
      rawEntryCount: source.rawEntryCount,
      uniqueAppCount: source.uniqueAppCount,
      invalidEntryCount: source.invalidEntryCount,
      responseKeys: source.responseKeys ?? null,
      ownedPackagesCount: source.ownedPackagesCount ?? null,
      appIds: source.appIds
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? error.message
        : "An unexpected error occurred."
    };
  }
}

browser.runtime.onMessage.addListener(async (message) => {
  if (!message || message.type !== "COMPARE_SOURCES") {
    return undefined;
  }

  const [community, store] = await Promise.all([
    captureSource(fetchCommunitySource),
    captureSource(fetchStoreSource)
  ]);

  return {
    ok: true,
    community: community.ok
      ? {
          ok: true,
          rawEntryCount: community.rawEntryCount,
          uniqueAppCount: community.uniqueAppCount,
          invalidEntryCount: community.invalidEntryCount
        }
      : community,
    store: store.ok
      ? {
          ok: true,
          rawEntryCount: store.rawEntryCount,
          uniqueAppCount: store.uniqueAppCount,
          invalidEntryCount: store.invalidEntryCount,
          responseKeys: store.responseKeys,
          ownedPackagesCount: store.ownedPackagesCount
        }
      : store,
    metrics: community.ok && store.ok
      ? compareAppIds(community, store)
      : null
  };
});
