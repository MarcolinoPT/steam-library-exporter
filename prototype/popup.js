const compareButton = document.querySelector("#compare-button");
const statusElement = document.querySelector("#status");
const resultsElement = document.querySelector("#results");
const metricsElement = document.querySelector("#metrics");
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

  const definitionList = document.createElement("dl");
  for (const [key, label] of Object.entries(METRIC_LABELS)) {
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = label;
    value.textContent = String(metrics[key]);
    definitionList.append(term, value);
  }
  metricsElement.append(definitionList);
}

compareButton.addEventListener("click", async () => {
  compareButton.disabled = true;
  resultsElement.hidden = true;
  errorElement.hidden = true;
  statusElement.textContent = "Querying Steam Community and Steam Store…";

  try {
    const result = await browser.runtime.sendMessage({
      type: "COMPARE_SOURCES"
    });

    if (!result || !result.ok) {
      throw new Error("The comparison could not be completed.");
    }

    metricsElement.replaceChildren();
    appendSourceStatus("Steam Community", result.community);
    appendSourceStatus("Steam Store", result.store);

    if (result.metrics) {
      appendComparisonMetrics(result.metrics);
      statusElement.textContent = "Both endpoint responses were parsed.";
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
