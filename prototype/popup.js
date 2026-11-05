const compareButton = document.querySelector("#compare-button");
const classifyButton = document.querySelector("#classify-button");
const classifyNote = document.querySelector("#classify-note");
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

compareButton.addEventListener("click", async () => {
  compareButton.disabled = true;
  classifyButton.disabled = true;
  classifyButton.hidden = true;
  classifyNote.hidden = true;
  packageProbeButton.disabled = true;
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
        classifyButton.disabled = false;
        classifyNote.hidden = false;
      }
      if (result.store.ownedPackagesCount > 0) {
        packageProbeButton.hidden = false;
        packageProbeButton.disabled = false;
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
    compareButton.disabled = false;
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
      "Classifying Store-only AppIDs: " +
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

packageProbeButton.addEventListener("click", async () => {
  compareButton.disabled = true;
  classifyButton.disabled = true;
  packageProbeButton.disabled = true;
  errorElement.hidden = true;
  packageProbeElement.hidden = true;
  statusElement.textContent =
    "Refreshing authenticated sources and checking a sample of owned packages…";

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
    compareButton.disabled = false;
    classifyButton.disabled = false;
    packageProbeButton.disabled = false;
  }
});

classifyButton.addEventListener("click", async () => {
  compareButton.disabled = true;
  classifyButton.disabled = true;
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
    compareButton.disabled = false;
    classifyButton.disabled = false;
  }
});
