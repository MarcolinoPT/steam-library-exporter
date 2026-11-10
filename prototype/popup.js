const compareButton = document.querySelector("#compare-button");
const classifyButton = document.querySelector("#classify-button");
const classifyNote = document.querySelector("#classify-note");
const profileCompareButton = document.querySelector("#profile-compare-button");
const confirmOwnProfileInput = document.querySelector("#confirm-own-profile");
const classifyProfileOnlyButton = document.querySelector("#classify-profile-only-button");
const classifyStoreNotProfileButton = document.querySelector("#classify-store-not-profile-button");
const classifyStoreNotProfileNote = document.querySelector("#classify-store-not-profile-note");
const storeNotProfileClassificationElement = document.querySelector("#store-not-profile-classification");
const storeNotProfileClassificationResultsElement = document.querySelector("#store-not-profile-classification-results");
const classifyProfileOnlyNote = document.querySelector("#classify-profile-only-note");
const profileOnlyClassificationElement = document.querySelector("#profile-only-classification");
const profileOnlyClassificationResultsElement = document.querySelector("#profile-only-classification-results");
const profileComparisonElement = document.querySelector("#profile-comparison");
const profileComparisonResultsElement = document.querySelector("#profile-comparison-results");
const packageProbeButton = document.querySelector("#package-probe-button");
const packageProbeNote = document.querySelector("#package-probe-note");
const packageProbeElement = document.querySelector("#package-probe");
const packageProbeResultsElement = document.querySelector("#package-probe-results");
const statusElement = document.querySelector("#status");
const resultsElement = document.querySelector("#results");
const metricsElement = document.querySelector("#metrics");
const classificationElement = document.querySelector("#classification");
const classificationResultsElement = document.querySelector("#classification-results");
const errorElement = document.querySelector("#error");

const METRIC_LABELS = {
  communityUniqueCount: "Community unique AppIDs",
  storeUniqueCount: "Store unique AppIDs",
  intersectionCount: "Present in both",
  communityOnlyCount: "Community only",
  storeOnlyCount: "Store only",
  unionCount: "Combined unique AppIDs",
  communityInvalidEntryCount: "Invalid Community entries",
  storeInvalidEntryCount: "Invalid Store entries"
};

let popupActionsBusy = false;

function syncProfileActionAvailability() {
  const available = confirmOwnProfileInput.checked && !popupActionsBusy;
  profileCompareButton.disabled = !available;
  classifyProfileOnlyButton.disabled = !available;
  classifyStoreNotProfileButton.disabled = !available;
}

confirmOwnProfileInput.addEventListener("change", syncProfileActionAvailability);

function setPopupActionsDisabled(disabled) {
  popupActionsBusy = disabled;
  for (const button of [
    compareButton,
    classifyButton,
    profileCompareButton,
    classifyProfileOnlyButton,
    classifyStoreNotProfileButton,
    packageProbeButton
  ]) {
    if (button) button.disabled = disabled;
  }
  syncProfileActionAvailability();
}

setPopupActionsDisabled(false);


function appendDefinitionList(container, values) {
  const definitionList = document.createElement("dl");
  for (const [label, value] of values) {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = String(value);
    definitionList.append(term, detail);
  }
  container.append(definitionList);
}

function appendSourceStatus(sourceName, sourceResult) {
  const heading = document.createElement("h3");
  heading.textContent = sourceName;
  metricsElement.append(heading);

  const detail = document.createElement("p");
  if (sourceResult.ok) {
    detail.textContent =
      sourceResult.rawEntryCount + " raw entries; " +
      sourceResult.uniqueAppCount + " unique AppIDs; " +
      sourceResult.invalidEntryCount + " invalid entries.";

    if (sourceResult.responseKeys) {
      const metadata = document.createElement("p");
      metadata.textContent =
        "Response keys: " + sourceResult.responseKeys.join(", ") +
        (sourceResult.ownedPackagesCount === null
          ? ""
          : "; owned packages: " + sourceResult.ownedPackagesCount + ".");
      metadata.className = "diagnostic";
      metricsElement.append(metadata);
    }
  } else {
    detail.textContent = sourceResult.error;
    detail.className = "error";
  }
  metricsElement.append(detail);
}

function appendComparisonMetrics(metrics) {
  const heading = document.createElement("h3");
  heading.textContent = "AppID comparison";
  metricsElement.append(heading);

  appendDefinitionList(
    metricsElement,
    Object.entries(METRIC_LABELS).map(([key, label]) => [
      label,
      metrics[key]
    ])
  );
}

function describeCookies(source) {
  if (source.count === 0) {
    return "none";
  }

  return source.cookies.map((cookie) =>
    cookie.name + " [" + cookie.domain +
    (cookie.httpOnly ? ", HttpOnly" : "") +
    (cookie.secure ? ", Secure" : "") +
    (cookie.session ? ", session" : ", persistent") + "]"
  ).join("; ");
}

function appendCookieDiagnostics(diagnostics, selectedStoreId) {
  const heading = document.createElement("h3");
  heading.textContent = "Steam cookie metadata by Firefox store";
  metricsElement.append(heading);

  if (diagnostics.error) {
    const detail = document.createElement("p");
    detail.textContent = diagnostics.error;
    detail.className = "diagnostic";
    metricsElement.append(detail);
    return;
  }

  const list = document.createElement("ul");
  for (const store of diagnostics.stores) {
    const item = document.createElement("li");
    const selectedLabel = store.storeId === selectedStoreId
      ? " (selected for this comparison)"
      : "";
    item.textContent =
      store.storeId + " (" + store.tabCount + " associated tabs)" +
      selectedLabel + " — Community: " + describeCookies(store.community) +
      "; Steam Store: " + describeCookies(store.store) + ".";
    list.append(item);
  }
  list.className = "diagnostic";
  metricsElement.append(list);
}

function appendClassification(result) {
  classificationResultsElement.replaceChildren();

  const typeEntries = Object.entries(result.typeCounts || {})
    .sort(([left], [right]) => left.localeCompare(right));

  appendDefinitionList(classificationResultsElement, [
    ["Store-only AppIDs refreshed", result.requestedCount],
    ["Metadata requests attempted", result.attemptedCount],
    ["Successfully classified", result.resolvedCount],
    ...typeEntries.map(([type, count]) => [
      "Steam-reported type: " + type,
      count
    ]),
    ["Unavailable / no Store details", result.unavailableCount],
    ["Missing type field", result.missingTypeCount],
    ["Identity mismatch", result.identityMismatchCount],
    ["Request failures", result.requestFailureCount],
    ...(result.stopReason ? [["Stopped early", result.stopReason]] : []),
    ["Not attempted", result.notAttemptedCount]
  ]);

  const note = document.createElement("p");
  note.className = "notice";
  if (result.rateLimited) {
    note.textContent =
      "Steam rate-limited the metadata requests. The remaining entries were not attempted; wait before retrying.";
  } else if (result.stopReason) {
    note.textContent =
      "The metadata run stopped after a request failure. The remaining entries were not attempted; review the stop reason before retrying.";
  } else {
    note.textContent =
      "Only aggregate type counts are shown. Application IDs, names and raw metadata are discarded after classification.";
  }
  classificationResultsElement.append(note);
  classificationElement.hidden = false;
}

 
function appendProfileComparison(result) {
  profileComparisonResultsElement.replaceChildren();
  appendDefinitionList(profileComparisonResultsElement, [
    ["Count shown by Steam's All Games tab", result.profileReportedCount ?? "Not detected"],
    ["Rendered game rows", result.profileRenderedGameRowCount],
    ["Unique AppIDs extracted from page", result.profileExtractedUniqueAppCount],
    ["Community source unique AppIDs", result.communityUniqueAppCount],
    ["Store source unique AppIDs", result.storeUniqueAppCount],
    ["Profile AppIDs also in Community", result.profileCommunityOverlapCount],
    ["Profile AppIDs also in Store", result.profileStoreOverlapCount],
    ["Present in all three sources", result.allThreeOverlapCount],
    ["Profile AppIDs absent from Community", result.profileOnlyCommunityCount],
    ["Profile AppIDs absent from Store", result.profileOnlyStoreCount],
    ["Community AppIDs absent from profile page", result.communityNotOnProfileCount],
    ["Store AppIDs absent from profile page", result.storeNotOnProfileCount],
    ["Extracted count matches Steam's displayed count", result.profileExtractionMatchesReportedCount === null
      ? "Unknown" : result.profileExtractionMatchesReportedCount ? "Yes" : "No"]
  ]);
  const note = document.createElement("p");
  note.className = "notice";
  note.textContent = "Only aggregate counts are displayed. AppIDs and game names remain in memory and are not logged or persisted. If the extracted count is below Steam's displayed count, the page may not have rendered every game yet; treat the overlap as a partial-page comparison.";
  profileComparisonResultsElement.append(note);
  if (result.storeNotOnProfileCount > 0) {
    classifyStoreNotProfileButton.hidden = false;
  }
  if (result.profileOnlyCommunityCount > 0 &&
      result.profileOnlyStoreCount === result.profileOnlyCommunityCount) {
    classifyProfileOnlyButton.hidden = false;
    classifyProfileOnlyNote.hidden = false;
    classifyProfileOnlyButton.textContent =
      "Inspect " + result.profileOnlyCommunityCount + " profile-only AppIDs";
  }
  profileComparisonElement.hidden = false;
  syncProfileActionAvailability();
}



classifyStoreNotProfileButton.addEventListener("click", async () => {
  setPopupActionsDisabled(true);
  errorElement.hidden = true;
  storeNotProfileClassificationElement.hidden = true;
  statusElement.textContent = "Refreshing sources and preparing Store AppIDs absent from the profile…";
  try {
    const started = await browser.runtime.sendMessage({
      type: "START_STORE_NOT_PROFILE_CLASSIFICATION",
      confirmedOwnProfile: confirmOwnProfileInput.checked
    });
    if (!started || !started.ok) {
      throw new Error(started?.error || "Store-not-profile classification could not be started.");
    }
    let result;
    if (started.done) {
      result = {
        requestedCount: 0, attemptedCount: 0, resolvedCount: 0,
        typeCounts: {}, unavailableCount: 0, missingTypeCount: 0,
        identityMismatchCount: 0, requestFailureCount: 0,
        rateLimited: false, notAttemptedCount: 0
      };
    } else {
      result = await runClassificationPolling(started.jobId, started.requestedCount);
    }
    storeNotProfileClassificationResultsElement.replaceChildren();
    const typeEntries = Object.entries(result.typeCounts || {})
      .sort(([left], [right]) => left.localeCompare(right));
    appendDefinitionList(storeNotProfileClassificationResultsElement, [
      ["Store AppIDs absent from profile refreshed", result.requestedCount],
      ["Metadata requests attempted", result.attemptedCount],
      ["Successfully classified", result.resolvedCount],
      ...typeEntries.map(([type, count]) => ["Steam-reported type: " + type, count]),
      ["Unavailable / no Store details", result.unavailableCount],
      ["Missing type field", result.missingTypeCount],
      ["Identity mismatch", result.identityMismatchCount],
      ["Request failures", result.requestFailureCount],
      ...(result.stopReason ? [["Stopped early", result.stopReason]] : []),
      ["Not attempted", result.notAttemptedCount]
    ]);
    const note = document.createElement("p");
    note.className = "notice";
    note.textContent = "The profile comparison set is refreshed at the start of this run. Public appdetails metadata describes Store catalogue records, not account entitlement. Unavailable entries remain unknown. Only aggregate counts are displayed.";
    storeNotProfileClassificationResultsElement.append(note);
    storeNotProfileClassificationElement.hidden = false;
    statusElement.textContent = result.rateLimited
      ? "Store-not-profile classification stopped because Steam rate-limited requests."
      : result.stopReason
        ? "Store-not-profile classification stopped after a request failure."
        : "Store-not-profile metadata classification completed.";
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "An unexpected error occurred.";
    errorElement.hidden = false;
    statusElement.textContent = "Store-not-profile classification failed.";
  } finally {
    setPopupActionsDisabled(false);
  }
});

classifyProfileOnlyButton.addEventListener("click", async () => {
  setPopupActionsDisabled(true);
  errorElement.hidden = true;
  profileOnlyClassificationElement.hidden = true;
  statusElement.textContent = "Refreshing the three sources and starting metadata checks for profile-only AppIDs…";
  try {
    const started = await browser.runtime.sendMessage({
      type: "START_PROFILE_ONLY_CLASSIFICATION",
      confirmedOwnProfile: confirmOwnProfileInput.checked
    });
    if (!started || !started.ok) {
      throw new Error(started?.error || "Profile-only metadata checks could not be started.");
    }
    let result;
    if (started.done) {
      result = {
        requestedCount: 0, attemptedCount: 0, resolvedCount: 0,
        typeCounts: {}, unavailableCount: 0, missingTypeCount: 0,
        identityMismatchCount: 0, requestFailureCount: 0,
        rateLimited: false, notAttemptedCount: 0
      };
    } else {
      result = await runClassificationPolling(started.jobId, started.requestedCount);
    }
    profileOnlyClassificationResultsElement.replaceChildren();
    const typeEntries = Object.entries(result.typeCounts || {})
      .sort(([left], [right]) => left.localeCompare(right));
    appendDefinitionList(profileOnlyClassificationResultsElement, [
      ["Profile-only AppIDs refreshed", result.requestedCount],
      ["Metadata requests attempted", result.attemptedCount],
      ["Successfully classified", result.resolvedCount],
      ...typeEntries.map(([type, count]) => ["Steam-reported type: " + type, count]),
      ["Unavailable / no Store details", result.unavailableCount],
      ["Missing type field", result.missingTypeCount],
      ["Identity mismatch", result.identityMismatchCount],
      ["Request failures", result.requestFailureCount],
      ...(result.stopReason ? [["Stopped early", result.stopReason]] : []),
      ["Not attempted", result.notAttemptedCount]
    ]);
    const note = document.createElement("p");
    note.className = "notice";
    note.textContent = "Public appdetails metadata is not an entitlement check. Unavailable records remain unknown; they are not assumed invalid or delisted. Only aggregate counts are displayed.";
    profileOnlyClassificationResultsElement.append(note);
    profileOnlyClassificationElement.hidden = false;
    statusElement.textContent = result.rateLimited
      ? "Profile-only classification stopped because Steam rate-limited requests."
      : result.stopReason
        ? "Profile-only classification stopped after a request failure."
        : "Profile-only metadata classification completed.";
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "An unexpected error occurred.";
    errorElement.hidden = false;
    statusElement.textContent = "Profile-only classification failed.";
  } finally {
    setPopupActionsDisabled(false);
  }
});

profileCompareButton.addEventListener("click", async () => {
  setPopupActionsDisabled(true);
  errorElement.hidden = true;
  profileComparisonElement.hidden = true;
  statusElement.textContent = "Reading the existing profile Games page and refreshing authenticated sources…";
  try {
    const result = await browser.runtime.sendMessage({
      type: "COMPARE_VISIBLE_PROFILE_GAMES",
      confirmedOwnProfile: confirmOwnProfileInput.checked
    });
    if (!result || !result.ok) {
      throw new Error(result?.error || "The profile page comparison could not be completed.");
    }
    appendProfileComparison(result);
    statusElement.textContent = "Profile page comparison completed; aggregate counts only.";
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "An unexpected error occurred.";
    errorElement.hidden = false;
    statusElement.textContent = "Profile page comparison failed.";
  } finally {
    setPopupActionsDisabled(false);
  }
});

compareButton.addEventListener("click", async () => {
  setPopupActionsDisabled(true);
  classifyButton.hidden = true;
  classifyNote.hidden = true;
  packageProbeButton.hidden = true;
  packageProbeNote.hidden = true;
  packageProbeElement.hidden = true;
  classificationElement.hidden = true;
  resultsElement.hidden = true;
  errorElement.hidden = true;
  statusElement.textContent =
    "Finding authenticated Steam tabs and querying both sources…";

  try {
    const result = await browser.runtime.sendMessage({
      type: "COMPARE_SOURCES"
    });

    if (!result || !result.ok) {
      throw new Error("The comparison could not be completed.");
    }

    metricsElement.replaceChildren();

    if (result.cookieDiagnostics) {
      appendCookieDiagnostics(
        result.cookieDiagnostics,
        result.selectedStoreId
      );
    }

    if (result.selectionError) {
      const selectionError = document.createElement("p");
      selectionError.textContent = result.selectionError;
      selectionError.className = "error";
      metricsElement.append(selectionError);
    }

    appendSourceStatus("Steam Community", result.community);
    appendSourceStatus("Steam Store", result.store);

    if (result.metrics) {
      appendComparisonMetrics(result.metrics);
      statusElement.textContent =
        "Both endpoint responses were parsed from existing Steam tabs.";

      if (result.metrics.storeOnlyCount > 0) {
        classifyButton.hidden = false;
        classifyNote.hidden = false;
      }
      if (result.store.ownedPackagesCount > 0) {
        packageProbeButton.hidden = false;
        packageProbeNote.hidden = false;
      }
    } else {
      statusElement.textContent =
        "At least one source could not be queried; see its diagnostic above.";
    }

    resultsElement.hidden = false;
  } catch (error) {
    errorElement.textContent = error instanceof Error
      ? error.message
      : "An unexpected error occurred.";
    errorElement.hidden = false;
    statusElement.textContent = "Comparison failed.";
  } finally {
    setPopupActionsDisabled(false);
  }
});

async function waitForNextPoll(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runClassificationPolling(jobId, requestedCount) {
  let progress;
  while (true) {
    progress = await browser.runtime.sendMessage({
      type: "POLL_CLASSIFICATION",
      jobId
    });

    if (!progress || !progress.ok) {
      throw new Error(
        progress?.error ||
        "The classification progress message could not be completed."
      );
    }

    statusElement.textContent =
      (progress.subject === "profile-only" ? "Classifying profile-only AppIDs: " : progress.subject === "store-not-profile" ? "Classifying Store AppIDs absent from profile: " : "Classifying Store-only AppIDs: ") +
      progress.attemptedCount + " of " + requestedCount +
      " requests attempted; " + progress.resolvedCount +
      " classified" +
      (progress.waitingForPacing ? " (respecting request delay)…" : "…");

    if (progress.done) {
      return progress;
    }

    await waitForNextPoll(
      progress.waitingForPacing
        ? Math.max(500, (progress.retryAfterMs || 2000) + 150)
        : 500
    );
  }
}


function appendPackageProbe(result) {
  packageProbeResultsElement.replaceChildren();
  appendDefinitionList(packageProbeResultsElement, [
    ["Owned package entries in refreshed response", result.ownedPackageEntryCount],
    ["Unique valid package IDs", result.uniqueValidPackageCount],
    ["Invalid package entries", result.invalidPackageEntryCount],
    ["Sample selection", result.sampleMethod],
    ["Packages sampled", result.sampledPackageCount],
    ["Individual requests completed", result.completedPackageRequestCount],
    ["Packages resolved with app lists", result.resolvedPackageCount],
    ["Packages unavailable / without app list", result.unavailablePackageCount],
    ["Packages with at least one app", result.packagesWithAppsCount],
    ["Packages with empty app lists", result.packagesWithoutAppsCount],
    ["App relationships returned", result.appRelationshipCount],
    ["Unique AppIDs across sample", result.uniqueAppCount],
    ["Invalid app entries", result.invalidAppEntryCount],
    ["Sample AppIDs also in Store-only set", result.storeOnlyAppIdsMatchedCount],
    ["Store-only AppIDs not seen in sample", result.storeOnlyAppIdsUnmatchedCount]
  ]);

  const note = document.createElement("p");
  note.className = "notice";
  note.textContent =
    "Package contents are public catalog metadata, not proof that each included app is individually entitled to this account. The sample is exploratory and does not establish coverage of all owned packages.";
  packageProbeResultsElement.append(note);
  packageProbeElement.hidden = false;
}

async function resumeActiveClassification() {
  setPopupActionsDisabled(true);
  let current = await browser.runtime.sendMessage({
    type: "GET_CLASSIFICATION_STATUS"
  });
  while (current?.preparing) {
    statusElement.textContent =
      "Waiting for the background classification setup to finish…";
    await waitForNextPoll(500);
    current = await browser.runtime.sendMessage({
      type: "GET_CLASSIFICATION_STATUS"
    });
  }
  if (!current || !current.ok || !current.active) {
    setPopupActionsDisabled(false);
    return;
  }

  setPopupActionsDisabled(true);
  statusElement.textContent =
    "Resuming " + current.subject + " classification: " +
    current.attemptedCount + " of " + current.requestedCount +
    " requests already attempted…";

  try {
    const result = await runClassificationPolling(
      current.jobId,
      current.requestedCount
    );

    if (current.subject === "store-only") {
      appendClassification(result);
    } else {
      const target = current.subject === "profile-only"
        ? profileOnlyClassificationResultsElement
        : storeNotProfileClassificationResultsElement;
      const section = current.subject === "profile-only"
        ? profileOnlyClassificationElement
        : storeNotProfileClassificationElement;
      target.replaceChildren();
      const typeEntries = Object.entries(result.typeCounts || {})
        .sort(([left], [right]) => left.localeCompare(right));
      appendDefinitionList(target, [
        ["AppIDs in this classification set", result.requestedCount],
        ["Metadata requests attempted", result.attemptedCount],
        ["Successfully classified", result.resolvedCount],
        ...typeEntries.map(([type, count]) => [
          "Steam-reported type: " + type,
          count
        ]),
        ["Unavailable / no Store details", result.unavailableCount],
        ["Missing type field", result.missingTypeCount],
        ["Identity mismatch", result.identityMismatchCount],
        ["Request failures", result.requestFailureCount],
        ...(result.stopReason ? [["Stopped early", result.stopReason]] : []),
        ["Not attempted", result.notAttemptedCount]
      ]);
      const note = document.createElement("p");
      note.className = "notice";
      note.textContent =
        "This result was resumed from an in-memory classification job. Only aggregate counts are displayed.";
      target.append(note);
      section.hidden = false;
    }

    statusElement.textContent = result.stopReason
      ? "Resumed classification stopped: " + result.stopReason + "."
      : "Resumed classification completed.";
  } catch (error) {
    errorElement.textContent = error instanceof Error
      ? error.message
      : "The existing classification could not be resumed.";
    errorElement.hidden = false;
    statusElement.textContent = "Classification recovery failed.";
  } finally {
    setPopupActionsDisabled(false);
  }
}

packageProbeButton.addEventListener("click", async () => {
  setPopupActionsDisabled(true);
  errorElement.hidden = true;
  packageProbeElement.hidden = true;
  statusElement.textContent =
    "Refreshing authenticated sources and checking up to 10 packages individually…";

  try {
    const result = await browser.runtime.sendMessage({
      type: "PROBE_PACKAGE_SAMPLE"
    });

    if (!result || !result.ok) {
      const detail = result?.error ||
        "The owned package sample could not be completed.";
      const progress = Number.isInteger(result?.completedPackageRequestCount)
        ? " Completed requests: " + result.completedPackageRequestCount + "." +
          (Number.isInteger(result.failedPackageRequestNumber)
            ? " Failed request number: " + result.failedPackageRequestNumber + "."
            : "")
        : "";
      throw new Error(detail + progress);
    }

    appendPackageProbe(result);
    statusElement.textContent =
      "Owned package sample completed. Only aggregate results were returned.";
  } catch (error) {
    errorElement.textContent = error instanceof Error
      ? error.message
      : "An unexpected error occurred.";
    errorElement.hidden = false;
    statusElement.textContent = "Owned package sample failed.";
  } finally {
    setPopupActionsDisabled(false);
  }
});

classifyButton.addEventListener("click", async () => {
  setPopupActionsDisabled(true);
  errorElement.hidden = true;
  classificationElement.hidden = true;
  statusElement.textContent =
    "Refreshing the source sets and starting incremental metadata classification…";

  try {
    const started = await browser.runtime.sendMessage({
      type: "START_CLASSIFICATION"
    });

    if (!started || !started.ok) {
      throw new Error(
        started?.error || "Store-only classification could not be started."
      );
    }

    if (started.done) {
      appendClassification({
        requestedCount: 0,
        attemptedCount: 0,
        resolvedCount: 0,
        typeCounts: {},
        unavailableCount: 0,
        missingTypeCount: 0,
        identityMismatchCount: 0,
        requestFailureCount: 0,
        rateLimited: false,
        notAttemptedCount: 0
      });
      statusElement.textContent = "No Store-only AppIDs need classification.";
      return;
    }

    const result = await runClassificationPolling(
      started.jobId,
      started.requestedCount
    );

    appendClassification(result);
    statusElement.textContent = result.rateLimited
      ? "Classification stopped because Steam rate-limited the requests."
      : result.stopReason
        ? "Classification stopped after a metadata request failure."
        : "Store-only metadata classification completed.";
  } catch (error) {
    errorElement.textContent = error instanceof Error
      ? error.message
      : "An unexpected error occurred.";
    errorElement.hidden = false;
    statusElement.textContent = "Classification failed.";
  } finally {
    setPopupActionsDisabled(false);
  }
});

// A popup may be closed while the background job is still running. On the
// next open, recover its job ID and continue polling instead of leaving it stuck.
resumeActiveClassification().catch((error) => {
  errorElement.textContent = error instanceof Error
    ? error.message
    : "Could not check for an existing classification job.";
  errorElement.hidden = false;
  setPopupActionsDisabled(false);
});
