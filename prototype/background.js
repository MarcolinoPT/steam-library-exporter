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

async function getSafeCookieDiagnostics() {
  let cookieStores;
  try {
    cookieStores = await browser.cookies.getAllCookieStores();
  } catch {
    return { error: "Firefox could not enumerate cookie stores." };
  }

  const stores = [];
  for (const cookieStore of cookieStores) {
    const [communityCookies, storeCookies] = await Promise.all([
      browser.cookies.getAll({
        domain: "steamcommunity.com",
        storeId: cookieStore.id
      }),
      browser.cookies.getAll({
        domain: "steampowered.com",
        storeId: cookieStore.id
      })
    ]);

    const summarize = (cookies) => ({
      count: cookies.length,
      cookies: cookies.map((cookie) => ({
        name: cookie.name,
        domain: cookie.domain,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        session: cookie.session
      })).sort((a, b) =>
        a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name)
      )
    });

    stores.push({
      storeId: cookieStore.id,
      tabCount: cookieStore.tabIds.length,
      community: summarize(communityCookies),
      store: summarize(storeCookies)
    });
  }

  return { stores };
}

function hasAuthenticatedCookies(store) {
  return store.community.cookies.some(
    (cookie) => cookie.name === "steamLoginSecure"
  ) && store.store.cookies.some(
    (cookie) => cookie.name === "steamLoginSecure"
  );
}

async function chooseAuthenticatedStore(cookieDiagnostics) {
  if (cookieDiagnostics.error) {
    throw new Error(cookieDiagnostics.error);
  }

  const candidates = cookieDiagnostics.stores.filter(hasAuthenticatedCookies);
  if (candidates.length === 0) {
    throw new Error(
      "No Firefox cookie store has Steam login cookies for both Community and Store. Sign in to both Steam sites in the same container and retry."
    );
  }

  const tabs = await browser.tabs.query({});
  const activeTabs = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true
  });
  const activeSteamTab = activeTabs.find((tab) => {
    try {
      const host = new URL(tab.url).hostname;
      return host === "steamcommunity.com" ||
        host === "store.steampowered.com";
    } catch {
      return false;
    }
  });

  if (activeSteamTab && candidates.some(
    (store) => store.storeId === activeSteamTab.cookieStoreId
  )) {
    return {
      storeId: activeSteamTab.cookieStoreId,
      tabs
    };
  }

  if (candidates.length !== 1) {
    throw new Error(
      "Multiple Firefox containers have Steam login cookies. Activate a Steam tab in the container you want to export from, then retry."
    );
  }

  return {
    storeId: candidates[0].storeId,
    tabs
  };
}

function findExistingSteamTab(tabs, storeId, hostname) {
  return tabs
    .filter((tab) => {
      if (tab.cookieStoreId !== storeId || typeof tab.url !== "string") {
        return false;
      }
      try {
        return new URL(tab.url).hostname === hostname;
      } catch {
        return false;
      }
    })
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0] ?? null;
}

async function getCommunitySessionId(storeId) {
  let cookie;
  try {
    cookie = await browser.cookies.get({
      url: COMMUNITY_ENDPOINT,
      name: "sessionid",
      storeId
    });
  } catch {
    throw new Error(
      "Steam Community: Firefox could not read the sessionid cookie for the selected container."
    );
  }

  if (!cookie || typeof cookie.value !== "string" || cookie.value.length === 0) {
    throw new Error(
      "Steam Community: no sessionid cookie was available in the selected container."
    );
  }

  return cookie.value;
}

async function executeSteamRequest(tabId, endpoint, sessionId = null) {
  let injectionResults;
  try {
    injectionResults = await browser.scripting.executeScript({
      target: { tabId },
      func: async (requestUrl, communitySessionId) => {
        try {
          const url = new URL(requestUrl);
          if (communitySessionId) {
            url.searchParams.set("sessionid", communitySessionId);
          }

          const response = await fetch(url.toString(), {
            method: "GET",
            credentials: "include",
            cache: "no-store",
            redirect: "follow"
          });

          const contentType = response.headers.get("content-type") || "";
          if (response.redirected) {
            return {
              ok: false,
              error: "Steam redirected the request. The selected session may be missing or expired."
            };
          }
          if (response.status === 401 || response.status === 403) {
            return {
              ok: false,
              error: "Steam rejected the request (HTTP " + response.status + ")."
            };
          }
          if (!response.ok) {
            return {
              ok: false,
              error: "Steam returned HTTP " + response.status + "."
            };
          }
          if (!contentType.toLowerCase().includes("application/json")) {
            return {
              ok: false,
              error: "Steam returned a non-JSON response."
            };
          }

          let payload;
          try {
            payload = await response.json();
          } catch {
            return {
              ok: false,
              error: "Steam returned malformed JSON."
            };
          }

          return { ok: true, payload };
        } catch {
          return {
            ok: false,
            error: "The request failed inside the existing Steam tab."
          };
        }
      },
      args: [endpoint, sessionId]
    });
  } catch {
    throw new Error(
      "Firefox could not run the request in the existing Steam tab. Confirm the tab is loaded and try again."
    );
  }

  const mainFrameResult = injectionResults.find(
    (result) => result.frameId === 0
  );
  if (!mainFrameResult || mainFrameResult.error) {
    throw new Error(
      "Firefox could not execute the request in the existing Steam tab."
    );
  }

  const result = mainFrameResult.result;
  if (!result || !result.ok) {
    throw new Error(result?.error || "Steam request failed.");
  }

  return result.payload;
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

async function compareSources() {
  const cookieDiagnostics = await getSafeCookieDiagnostics();

  let selected;
  try {
    selected = await chooseAuthenticatedStore(cookieDiagnostics);
  } catch (error) {
    return {
      ok: true,
      cookieDiagnostics,
      selectionError: error instanceof Error
        ? error.message
        : "Could not select an authenticated Firefox container.",
      community: { ok: false, error: "Not queried." },
      store: { ok: false, error: "Not queried." },
      metrics: null
    };
  }

  const communityTab = findExistingSteamTab(
    selected.tabs,
    selected.storeId,
    "steamcommunity.com"
  );
  const storeTab = findExistingSteamTab(
    selected.tabs,
    selected.storeId,
    "store.steampowered.com"
  );

  const [community, store] = await Promise.all([
    captureSource(async () => {
      if (!communityTab) {
        throw new Error(
          "No existing Steam Community tab was found in the authenticated container. Open Steam Community in that container and retry; the extension will not open a tab."
        );
      }

      const sessionId = await getCommunitySessionId(selected.storeId);
      const payload = await executeSteamRequest(
        communityTab.id,
        COMMUNITY_ENDPOINT,
        sessionId
      );

      if (!Array.isArray(payload)) {
        throw new Error(
          "Steam Community: response shape was not the expected JSON array."
        );
      }

      return normalizeAppIds(payload);
    }),
    captureSource(async () => {
      if (!storeTab) {
        throw new Error(
          "No existing Steam Store tab was found in the authenticated container. Open Steam Store in that container and retry; the extension will not open a tab."
        );
      }

      const payload = await executeSteamRequest(
        storeTab.id,
        STORE_ENDPOINT
      );

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
    })
  ]);

  return {
    ok: true,
    cookieDiagnostics,
    selectedStoreId: selected.storeId,
    selectedTabs: {
      community: Boolean(communityTab),
      store: Boolean(storeTab)
    },
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
}


let activeClassificationJob = null;
let nextClassificationJobId = 1;

async function startStoreOnlyClassification() {
  const cookieDiagnostics = await getSafeCookieDiagnostics();

  let selected;
  try {
    selected = await chooseAuthenticatedStore(cookieDiagnostics);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? error.message
        : "Could not select an authenticated Firefox container."
    };
  }

  const communityTab = findExistingSteamTab(
    selected.tabs,
    selected.storeId,
    "steamcommunity.com"
  );
  const storeTab = findExistingSteamTab(
    selected.tabs,
    selected.storeId,
    "store.steampowered.com"
  );

  if (!communityTab || !storeTab) {
    return {
      ok: false,
      error: "Both Steam Community and Steam Store tabs must already be open in the selected authenticated container. No tabs were opened or changed."
    };
  }

  let communityPayload;
  let storePayload;
  try {
    const sessionId = await getCommunitySessionId(selected.storeId);
    [communityPayload, storePayload] = await Promise.all([
      executeSteamRequest(communityTab.id, COMMUNITY_ENDPOINT, sessionId),
      executeSteamRequest(storeTab.id, STORE_ENDPOINT)
    ]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error
        ? error.message
        : "Could not refresh the authenticated Steam sources."
    };
  }

  if (!Array.isArray(communityPayload) ||
      !storePayload ||
      typeof storePayload !== "object" ||
      Array.isArray(storePayload) ||
      !Array.isArray(storePayload.rgOwnedApps)) {
    return {
      ok: false,
      error: "Steam returned an unexpected library response shape."
    };
  }

  let community;
  let store;
  try {
    community = normalizeAppIds(communityPayload);
    store = normalizeAppIds(storePayload.rgOwnedApps);
  } catch {
    return {
      ok: false,
      error: "Could not normalize the refreshed Steam library entries."
    };
  }

  const storeOnlyAppIds = [];
  for (const appId of store.appIds) {
    if (!community.appIds.has(appId)) {
      storeOnlyAppIds.push(appId);
    }
  }

  const jobId = String(nextClassificationJobId++);
  activeClassificationJob = {
    jobId,
    appIds: storeOnlyAppIds,
    nextIndex: 0,
    lastRequestAt: 0,
    attemptedCount: 0,
    resolvedCount: 0,
    unavailableCount: 0,
    missingTypeCount: 0,
    identityMismatchCount: 0,
    requestFailureCount: 0,
    rateLimited: false,
    stopReason: null,
    typeCounts: new Map(),
    done: storeOnlyAppIds.length === 0
  };

  return {
    ok: true,
    jobId,
    requestedCount: storeOnlyAppIds.length,
    done: activeClassificationJob.done
  };
}

function getClassificationProgress(job) {
  return {
    ok: true,
    jobId: job.jobId,
    requestedCount: job.appIds.length,
    attemptedCount: job.attemptedCount,
    resolvedCount: job.resolvedCount,
    unavailableCount: job.unavailableCount,
    missingTypeCount: job.missingTypeCount,
    identityMismatchCount: job.identityMismatchCount,
    requestFailureCount: job.requestFailureCount,
    rateLimited: job.rateLimited,
    stopReason: job.stopReason,
    notAttemptedCount: job.appIds.length - job.attemptedCount,
    typeCounts: Object.fromEntries(job.typeCounts),
    done: job.done,
    waitingForPacing: false
  };
}

async function pollStoreOnlyClassification(jobId) {
  const job = activeClassificationJob;
  if (!job || job.jobId !== jobId) {
    return {
      ok: false,
      error: "The classification job is no longer available. Start it again; no library data was persisted."
    };
  }

  if (job.done) {
    return getClassificationProgress(job);
  }

  const now = Date.now();
  const remainingDelay = 2000 - (now - job.lastRequestAt);
  if (job.lastRequestAt > 0 && remainingDelay > 0) {
    return {
      ...getClassificationProgress(job),
      waitingForPacing: true,
      retryAfterMs: remainingDelay
    };
  }

  const appId = job.appIds[job.nextIndex];
  const url = new URL("https://store.steampowered.com/api/appdetails/");
  url.searchParams.set("appids", String(appId));
  url.searchParams.set("l", "english");

  job.attemptedCount += 1;
  job.nextIndex += 1;
  job.lastRequestAt = Date.now();

  let response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "follow"
    });
  } catch {
    job.requestFailureCount += 1;
    job.stopReason = "network-error";
    job.done = true;
    return getClassificationProgress(job);
  }

  if (response.status === 429) {
    job.rateLimited = true;
    job.requestFailureCount += 1;
    job.stopReason = "rate-limited";
    job.done = true;
    return getClassificationProgress(job);
  }

  if (!response.ok || response.redirected) {
    job.requestFailureCount += 1;
    job.stopReason = "http-error";
    job.done = true;
    return getClassificationProgress(job);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    job.requestFailureCount += 1;
    job.stopReason = "unexpected-content-type";
    job.done = true;
    return getClassificationProgress(job);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    job.requestFailureCount += 1;
    job.stopReason = "malformed-json";
    job.done = true;
    return getClassificationProgress(job);
  }

  const entry = payload && typeof payload === "object"
    ? payload[String(appId)]
    : null;

  if (!entry || entry.success !== true || !entry.data) {
    job.unavailableCount += 1;
  } else if (
    entry.data.steam_appid !== undefined &&
    Number(entry.data.steam_appid) !== appId
  ) {
    job.identityMismatchCount += 1;
  } else if (
    typeof entry.data.type !== "string" ||
    entry.data.type.trim().length === 0
  ) {
    job.missingTypeCount += 1;
  } else {
    const type = entry.data.type.trim().toLowerCase().slice(0, 64);
    job.typeCounts.set(type, (job.typeCounts.get(type) || 0) + 1);
    job.resolvedCount += 1;
  }

  if (job.nextIndex >= job.appIds.length) {
    job.done = true;
  }

  return getClassificationProgress(job);
}

browser.runtime.onMessage.addListener((message) => {
  if (!message) {
    return undefined;
  }

  if (message.type === "COMPARE_SOURCES") {
    return compareSources();
  }

  if (message.type === "START_CLASSIFICATION") {
    return startStoreOnlyClassification();
  }

  if (message.type === "POLL_CLASSIFICATION") {
    return pollStoreOnlyClassification(message.jobId);
  }

  return undefined;
});
