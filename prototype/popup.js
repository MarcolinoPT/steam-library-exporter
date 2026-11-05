const compareButton = document.querySelector("#compare-button");
const classifyButton = document.querySelector("#classify-button");
const classifyNote = document.querySelector("#classify-note");
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

classifyButton.addEventListener("click", async () => {
  compareButton.disabled = true;
  classifyButton.disabled = true;
  errorElement.hidden = true;
  classificationElement.hidden = true;
  statusElement.textContent =
    "Refreshing the source sets, then checking Store metadata one AppID at a time. Please keep this popup open…";

  try {
    const result = await browser.runtime.sendMessage({
      type: "CLASSIFY_STORE_ONLY"
    });

    if (!result || !result.ok) {
      throw new Error(
        result?.error || "Store-only classification could not be completed."
      );
    }

    appendClassification(result);
    statusElement.textContent = result.rateLimited
      ? "Classification stopped early because Steam rate-limited the requests."
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
