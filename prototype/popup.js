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

function renderMetrics(metrics) {
  metricsElement.replaceChildren();

  for (const [key, label] of Object.entries(METRIC_LABELS)) {
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = label;
    value.textContent = String(metrics[key]);
    metricsElement.append(term, value);
  }

  resultsElement.hidden = false;
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
      throw new Error(result?.error || "The comparison could not be completed.");
    }

    renderMetrics(result.metrics);
    statusElement.textContent = "Both endpoint responses were parsed.";
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
