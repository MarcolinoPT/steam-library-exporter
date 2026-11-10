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


function findProfileAllGamesTab(tabs, storeId) {
  const candidates = tabs.filter((tab) => {
    if (tab.cookieStoreId !== storeId || typeof tab.url !== "string") {
      return false;
    }
    try {
      const url = new URL(tab.url);
      return url.hostname === "steamcommunity.com" &&
        /^\/(?:id|profiles)\/[^/]+\/games\/?$/.test(url.pathname) &&
        url.searchParams.get("tab") === "all";
    } catch {
      return false;
    }
  });
  return candidates.length === 1 ? candidates[0] : null;
}

async function compareVisibleProfileGames(confirmedOwnProfile) {
  if (confirmedOwnProfile !== true) {
    return { ok: false, error: "Confirm that the open profile belongs to your own Steam account before comparing it." };
  }
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
    selected.tabs, selected.storeId, "steamcommunity.com"
  );
  const storeTab = findExistingSteamTab(
    selected.tabs, selected.storeId, "store.steampowered.com"
  );
  const profileTab = findProfileAllGamesTab(selected.tabs, selected.storeId);

  if (!communityTab || !storeTab || !profileTab) {
    return {
      ok: false,
      error: "Keep exactly one Steam Community profile Games page with tab=all, plus Community and Store source tabs, open in the same authenticated Firefox container. The extension will not open or navigate tabs."
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
      !storePayload || typeof storePayload !== "object" ||
      Array.isArray(storePayload) ||
      !Array.isArray(storePayload.rgOwnedApps)) {
    return { ok: false, error: "Steam returned an unexpected library response shape." };
  }

  let community;
  let store;
  try {
    community = normalizeAppIds(communityPayload);
    store = normalizeAppIds(storePayload.rgOwnedApps);
  } catch {
    return { ok: false, error: "Could not normalize the refreshed Steam library entries." };
  }

  let pageResults;
  try {
    pageResults = await browser.scripting.executeScript({
      target: { tabId: profileTab.id },
      func: () => {
        const appIds = new Set();
        const add = (value) => {
          if (typeof value !== "string" && typeof value !== "number") return;
          const text = String(value);
          if (!/^\d+$/.test(text)) return;
          const id = Number(text);
          if (Number.isSafeInteger(id) && id > 0) appIds.add(id);
        };

        for (const element of document.querySelectorAll("[data-appid]")) {
          add(element.getAttribute("data-appid"));
        }
        for (const link of document.querySelectorAll('a[href*="/app/"]')) {
          const match = link.href.match(/\/app\/(\d+)(?:\/|$|[?#])/);
          if (match) add(match[1]);
        }

        let reportedCount = null;
        for (const element of document.querySelectorAll("a, span, div")) {
          const match = (element.textContent || "").trim().match(/^All Games\s*\(([\d,]+)\)$/);
          if (match) {
            reportedCount = Number(match[1].replace(/,/g, ""));
            break;
          }
        }

        return {
          appIds: [...appIds],
          reportedCount,
          renderedGameRowCount: document.querySelectorAll(".gameListRow").length
        };
      }
    });
  } catch {
    return { ok: false, error: "Firefox could not inspect the already-open profile Games page." };
  }

  const mainFrame = pageResults.find((result) => result.frameId === 0);
  const pageData = mainFrame?.result;
  if (!pageData || !Array.isArray(pageData.appIds)) {
    return { ok: false, error: "The profile Games page did not expose a readable AppID list." };
  }

  const profileIds = new Set(pageData.appIds.filter(isPositiveAppId));
  let communityOverlap = 0;
  let storeOverlap = 0;
  let allThree = 0;
  let profileOnlyCommunity = 0;
  let profileOnlyStore = 0;
  for (const appId of profileIds) {
    const inCommunity = community.appIds.has(appId);
    const inStore = store.appIds.has(appId);
    if (inCommunity) communityOverlap += 1;
    if (inStore) storeOverlap += 1;
    if (inCommunity && inStore) allThree += 1;
    if (!inCommunity) profileOnlyCommunity += 1;
    if (!inStore) profileOnlyStore += 1;
  }

  let communityNotOnProfile = 0;
  for (const appId of community.appIds) {
    if (!profileIds.has(appId)) communityNotOnProfile += 1;
  }
  let storeNotOnProfile = 0;
  for (const appId of store.appIds) {
    if (!profileIds.has(appId)) storeNotOnProfile += 1;
  }

  return {
    ok: true,
    profileReportedCount: Number.isSafeInteger(pageData.reportedCount)
      ? pageData.reportedCount : null,
    profileRenderedGameRowCount: pageData.renderedGameRowCount,
    profileExtractedUniqueAppCount: profileIds.size,
    communityUniqueAppCount: community.uniqueAppCount,
    storeUniqueAppCount: store.uniqueAppCount,
    profileCommunityOverlapCount: communityOverlap,
    profileStoreOverlapCount: storeOverlap,
    allThreeOverlapCount: allThree,
    profileOnlyCommunityCount: profileOnlyCommunity,
    profileOnlyStoreCount: profileOnlyStore,
    communityNotOnProfileCount: communityNotOnProfile,
    storeNotOnProfileCount: storeNotOnProfile,
    profileExtractionMatchesReportedCount:
      pageData.reportedCount === null ? null : profileIds.size === pageData.reportedCount
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


async function startProfileOnlyClassification(confirmedOwnProfile) {
  if (confirmedOwnProfile !== true) {
    return { ok: false, error: "Confirm that the open profile belongs to your own Steam account before classifying it." };
  }
  const cookieDiagnostics = await getSafeCookieDiagnostics();
  let selected;
  try {
    selected = await chooseAuthenticatedStore(cookieDiagnostics);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not select an authenticated Firefox container." };
  }

  const communityTab = findExistingSteamTab(selected.tabs, selected.storeId, "steamcommunity.com");
  const storeTab = findExistingSteamTab(selected.tabs, selected.storeId, "store.steampowered.com");
  const profileTab = findProfileAllGamesTab(selected.tabs, selected.storeId);

  if (!communityTab || !storeTab || !profileTab) {
    return { ok: false, error: "Keep exactly one Steam Community profile Games page with tab=all, plus both source tabs, open in the same authenticated container. No tabs will be opened or navigated." };
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
    return { ok: false, error: error instanceof Error ? error.message : "Could not refresh authenticated Steam sources." };
  }

  if (!Array.isArray(communityPayload) || !storePayload ||
      typeof storePayload !== "object" || Array.isArray(storePayload) ||
      !Array.isArray(storePayload.rgOwnedApps)) {
    return { ok: false, error: "Steam returned an unexpected library response shape." };
  }

  let community;
  let store;
  try {
    community = normalizeAppIds(communityPayload);
    store = normalizeAppIds(storePayload.rgOwnedApps);
  } catch {
    return { ok: false, error: "Could not normalize refreshed Steam library entries." };
  }

  let pageResults;
  try {
    pageResults = await browser.scripting.executeScript({
      target: { tabId: profileTab.id },
      func: () => {
        const ids = new Set();
        const add = (value) => {
          if (typeof value !== "string" && typeof value !== "number") return;
          const text = String(value);
          if (!/^\d+$/.test(text)) return;
          const id = Number(text);
          if (Number.isSafeInteger(id) && id > 0) ids.add(id);
        };
        for (const element of document.querySelectorAll("[data-appid]")) add(element.getAttribute("data-appid"));
        for (const link of document.querySelectorAll('a[href*="/app/"]')) {
          const match = link.href.match(/\/app\/(\d+)(?:\/|$|[?#])/);
          if (match) add(match[1]);
        }
        return [...ids];
      }
    });
  } catch {
    return { ok: false, error: "Firefox could not inspect the already-open profile Games page." };
  }

  const pageIds = pageResults.find((result) => result.frameId === 0)?.result;
  if (!Array.isArray(pageIds)) {
    return { ok: false, error: "The profile Games page did not expose a readable AppID list." };
  }

  const profileIds = new Set(pageIds.filter(isPositiveAppId));
  const candidates = [...profileIds].filter((appId) =>
    !community.appIds.has(appId) && !store.appIds.has(appId)
  );

  const jobId = String(nextClassificationJobId++);
  activeClassificationJob = {
    jobId,
    appIds: candidates,
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
    done: candidates.length === 0,
    subject: "profile-only"
  };

  return { ok: true, jobId, requestedCount: candidates.length, done: activeClassificationJob.done };
}


async function startStoreNotProfileClassification(confirmedOwnProfile) {
  if (confirmedOwnProfile !== true) {
    return { ok: false, error: "Confirm that the open profile belongs to your own Steam account before classifying it." };
  }
  const cookieDiagnostics = await getSafeCookieDiagnostics();
  let selected;
  try {
    selected = await chooseAuthenticatedStore(cookieDiagnostics);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not select an authenticated Firefox container." };
  }

  const communityTab = findExistingSteamTab(selected.tabs, selected.storeId, "steamcommunity.com");
  const storeTab = findExistingSteamTab(selected.tabs, selected.storeId, "store.steampowered.com");
  const profileTab = findProfileAllGamesTab(selected.tabs, selected.storeId);

  if (!communityTab || !storeTab || !profileTab) {
    return { ok: false, error: "Keep the profile Games page and both Steam source tabs open in the same authenticated container. No tabs will be opened or navigated." };
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
    return { ok: false, error: error instanceof Error ? error.message : "Could not refresh authenticated Steam sources." };
  }

  if (!Array.isArray(communityPayload) || !storePayload ||
      typeof storePayload !== "object" || Array.isArray(storePayload) ||
      !Array.isArray(storePayload.rgOwnedApps)) {
    return { ok: false, error: "Steam returned an unexpected library response shape." };
  }

  let store;
  try {
    store = normalizeAppIds(storePayload.rgOwnedApps);
  } catch {
    return { ok: false, error: "Could not normalize refreshed Store entries." };
  }

  let pageResults;
  try {
    pageResults = await browser.scripting.executeScript({
      target: { tabId: profileTab.id },
      func: () => {
        const ids = new Set();
        const add = (value) => {
          if (typeof value !== "string" && typeof value !== "number") return;
          const text = String(value);
          if (!/^\d+$/.test(text)) return;
          const id = Number(text);
          if (Number.isSafeInteger(id) && id > 0) ids.add(id);
        };
        for (const element of document.querySelectorAll("[data-appid]")) add(element.getAttribute("data-appid"));
        for (const link of document.querySelectorAll('a[href*="/app/"]')) {
          const match = link.href.match(/\/app\/(\d+)(?:\/|$|[?#])/);
          if (match) add(match[1]);
        }
        return [...ids];
      }
    });
  } catch {
    return { ok: false, error: "Firefox could not inspect the already-open profile Games page." };
  }

  const pageIds = pageResults.find((result) => result.frameId === 0)?.result;
  if (!Array.isArray(pageIds)) {
    return { ok: false, error: "The profile Games page did not expose a readable AppID list." };
  }

  const profileIds = new Set(pageIds.filter(isPositiveAppId));
  const candidates = [...store.appIds].filter((appId) => !profileIds.has(appId));
  const jobId = String(nextClassificationJobId++);
  activeClassificationJob = {
    jobId,
    appIds: candidates,
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
    done: candidates.length === 0,
    subject: "store-not-profile"
  };
  return { ok: true, jobId, requestedCount: candidates.length, done: activeClassificationJob.done };
}

function getClassificationProgress(job) {
  return {
    ok: true,
    jobId: job.jobId,
    requestedCount: job.appIds.length,
    subject: job.subject || "store-only",
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


function extractPackageId(entry) {
  if (typeof entry === "number" && Number.isSafeInteger(entry) && entry > 0) {
    return entry;
  }
  if (typeof entry === "string" && /^\d+$/.test(entry)) {
    const value = Number(entry);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const candidate = entry.packageid ?? entry.packageId ?? entry.subid ??
      entry.subId ?? entry.id;
    if (typeof candidate === "number" && Number.isSafeInteger(candidate) &&
        candidate > 0) {
      return candidate;
    }
    if (typeof candidate === "string" && /^\d+$/.test(candidate)) {
      const value = Number(candidate);
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    }
  }
  return null;
}

function selectEvenlySpacedSample(values, sampleSize) {
  if (values.length <= sampleSize) {
    return values;
  }
  const selected = [];
  const seen = new Set();
  for (let index = 0; index < sampleSize; index += 1) {
    const sourceIndex = Math.floor(index * (values.length - 1) /
      (sampleSize - 1));
    const value = values[sourceIndex];
    if (!seen.has(value)) {
      seen.add(value);
      selected.push(value);
    }
  }
  return selected;
}

async function probeOwnedPackageSample() {
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
    selected.tabs, selected.storeId, "steamcommunity.com"
  );
  const storeTab = findExistingSteamTab(
    selected.tabs, selected.storeId, "store.steampowered.com"
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
      !storePayload || typeof storePayload !== "object" ||
      Array.isArray(storePayload) ||
      !Array.isArray(storePayload.rgOwnedApps) ||
      !Array.isArray(storePayload.rgOwnedPackages)) {
    return {
      ok: false,
      error: "Steam returned an unexpected library response shape or did not include rgOwnedPackages."
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

  const storeOnlyAppIds = new Set(
    [...store.appIds].filter((appId) => !community.appIds.has(appId))
  );
  const packageIds = [...new Set(
    storePayload.rgOwnedPackages.map(extractPackageId).filter(
      (packageId) => packageId !== null
    )
  )];
  const invalidPackageEntryCount =
    storePayload.rgOwnedPackages.length -
    storePayload.rgOwnedPackages.filter(
      (entry) => extractPackageId(entry) !== null
    ).length;
  const sample = selectEvenlySpacedSample(packageIds, 10);

  if (sample.length === 0) {
    return {
      ok: false,
      error: "Steam Store returned no valid package IDs to sample."
    };
  }

  const packageResponses = new Map();
  let completedPackageRequestCount = 0;

  for (let index = 0; index < sample.length; index += 1) {
    if (index > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const packageId = sample[index];
    const url = new URL("https://store.steampowered.com/api/packagedetails/");
    url.searchParams.set("packageids", String(packageId));
    url.searchParams.set("l", "english");

    let response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "follow"
      });
    } catch {
      return {
        ok: false,
        error: "A public package-details request failed at the network layer.",
        completedPackageRequestCount,
        failedPackageRequestNumber: index + 1
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        error: "Steam rate-limited the package-details sample (HTTP 429).",
        completedPackageRequestCount,
        failedPackageRequestNumber: index + 1
      };
    }
    if (!response.ok || response.redirected) {
      return {
        ok: false,
        error: "Steam package-details request failed (HTTP " +
          response.status + (response.redirected ? ", redirected" : "") + ").",
        completedPackageRequestCount,
        failedPackageRequestNumber: index + 1
      };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return {
        ok: false,
        error: "Steam package-details returned a non-JSON response.",
        completedPackageRequestCount,
        failedPackageRequestNumber: index + 1
      };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        error: "Steam package-details returned malformed JSON.",
        completedPackageRequestCount,
        failedPackageRequestNumber: index + 1
      };
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return {
        ok: false,
        error: "Steam package-details returned an unexpected JSON shape.",
        completedPackageRequestCount,
        failedPackageRequestNumber: index + 1
      };
    }

    packageResponses.set(String(packageId), payload[String(packageId)]);
    completedPackageRequestCount += 1;
  }

  let resolvedPackageCount = 0;
  let unavailablePackageCount = 0;
  let packagesWithAppsCount = 0;
  let packagesWithoutAppsCount = 0;
  let invalidAppEntryCount = 0;
  let appRelationshipCount = 0;
  const uniqueAppIds = new Set();
  const sampledAppIds = new Set();

  for (const packageId of sample) {
    const entry = packageResponses.get(String(packageId));
    if (!entry || entry.success !== true || !entry.data ||
        typeof entry.data !== "object") {
      unavailablePackageCount += 1;
      continue;
    }

    resolvedPackageCount += 1;
    if (!Array.isArray(entry.data.apps)) {
      unavailablePackageCount += 1;
      resolvedPackageCount -= 1;
      continue;
    }

    const packageApps = new Set();
    for (const app of entry.data.apps) {
      const appId = extractAppId(app);
      if (appId === null || !isPositiveAppId(appId)) {
        invalidAppEntryCount += 1;
        continue;
      }
      packageApps.add(appId);
      uniqueAppIds.add(appId);
      sampledAppIds.add(appId);
      appRelationshipCount += 1;
    }
    if (packageApps.size > 0) {
      packagesWithAppsCount += 1;
    } else {
      packagesWithoutAppsCount += 1;
    }
  }

  let storeOnlyAppIdsMatchedCount = 0;
  for (const appId of sampledAppIds) {
    if (storeOnlyAppIds.has(appId)) {
      storeOnlyAppIdsMatchedCount += 1;
    }
  }

  return {
    ok: true,
    sampleMethod: "evenly-spaced across the unique owned-package list",
    ownedPackageEntryCount: storePayload.rgOwnedPackages.length,
    uniqueValidPackageCount: packageIds.length,
    invalidPackageEntryCount,
    sampledPackageCount: sample.length,
    completedPackageRequestCount,
    resolvedPackageCount,
    unavailablePackageCount,
    packagesWithAppsCount,
    packagesWithoutAppsCount,
    invalidAppEntryCount,
    appRelationshipCount,
    uniqueAppCount: uniqueAppIds.size,
    storeOnlyAppIdsMatchedCount,
    storeOnlyAppIdsUnmatchedCount: storeOnlyAppIds.size -
      storeOnlyAppIdsMatchedCount
  };
}

browser.runtime.onMessage.addListener((message) => {
  if (!message) {
    return undefined;
  }

  if (message.type === "COMPARE_VISIBLE_PROFILE_GAMES") {
    return compareVisibleProfileGames(message.confirmedOwnProfile);
  }

  if (message.type === "COMPARE_SOURCES") {
    return compareSources();
  }

  if (message.type === "START_STORE_NOT_PROFILE_CLASSIFICATION") {
    return startStoreNotProfileClassification(message.confirmedOwnProfile);
  }

  if (message.type === "START_PROFILE_ONLY_CLASSIFICATION") {
    return startProfileOnlyClassification(message.confirmedOwnProfile);
  }

  if (message.type === "START_CLASSIFICATION") {
    return startStoreOnlyClassification();
  }

  if (message.type === "POLL_CLASSIFICATION") {
    return pollStoreOnlyClassification(message.jobId);
  }

  if (message.type === "PROBE_PACKAGE_SAMPLE") {
    return probeOwnedPackageSample();
  }

  return undefined;
});