import { api } from "./api.js";
import { subscribeToMutations } from "./live.js";
import {
  badge,
  formatCurrency,
  initProtectedPage,
  renderEmptyState,
  renderMetricSkeleton,
  renderTableSkeleton,
  showToast
} from "./ui.js";

initProtectedPage({
  pageKey: "ANALYTICS",
  title: "Business analytics",
  subtitle: "Simple week-on-week comparisons for money, product movement, and live distribution pressure."
});

const snapshotGrid = document.querySelector("#analyticsSnapshot");
const moneyGraph = document.querySelector("#analyticsMoneyGraph");
const productGraph = document.querySelector("#analyticsProductGraph");
const runnerLeaderboardTable = document.querySelector("#analyticsRunnerLeaderboard");
const distributionOverviewGrid = document.querySelector("#analyticsDistributionOverview");

function comparisonTone(delta) {
  if (delta > 0) {
    return "good";
  }

  if (delta < 0) {
    return "warn";
  }

  return "neutral";
}

function formatChange(metric) {
  const isCurrency = metric.format === "currency";
  const amount = isCurrency ? formatCurrency(Math.abs(metric.delta)) : Math.abs(metric.delta);

  if (!metric.delta) {
    return "No change from last week";
  }

  return `${metric.delta > 0 ? "+" : "-"}${amount} vs last week`;
}

function renderLoading() {
  snapshotGrid.innerHTML = renderMetricSkeleton(4);
  distributionOverviewGrid.innerHTML = renderMetricSkeleton(3);
  moneyGraph.innerHTML = "<div class='insight-row skeleton-card'></div><div class='insight-row skeleton-card'></div>";
  productGraph.innerHTML = "<div class='insight-row skeleton-card'></div><div class='insight-row skeleton-card'></div>";
  runnerLeaderboardTable.innerHTML = renderTableSkeleton(6, 5);
}

function renderSnapshot(metrics = []) {
  if (!metrics.length) {
    snapshotGrid.innerHTML = renderEmptyState("No weekly comparison yet", "Once activity starts, this week vs last week will appear here.");
    return;
  }

  snapshotGrid.innerHTML = metrics.map((metric) => `
    <article class="metric-card ${comparisonTone(metric.delta)}">
      <p>${metric.label}</p>
      <strong>${metric.format === "currency" ? formatCurrency(metric.current) : metric.current}</strong>
      <small>${formatChange(metric)}</small>
    </article>
  `).join("");
}

function renderComparisonGraph(container, rows = [], emptyTitle, emptyCopy, formatter = (value) => value) {
  if (!rows.length) {
    container.innerHTML = renderEmptyState(emptyTitle, emptyCopy);
    return;
  }

  const maxValue = Math.max(
    ...rows.flatMap((row) => [Math.abs(Number(row.current || 0)), Math.abs(Number(row.previous || 0))]),
    1
  );

  container.innerHTML = rows.map((row) => {
    const currentWidth = Math.max(10, Math.round((Math.abs(Number(row.current || 0)) / maxValue) * 100));
    const previousWidth = Math.max(10, Math.round((Math.abs(Number(row.previous || 0)) / maxValue) * 100));
    const changeLabel = row.delta === 0
      ? "No change"
      : `${row.delta > 0 ? "+" : "-"}${formatter(Math.abs(row.delta))}`;

    return `
      <article class="insight-row">
        <div class="insight-headline">
          <strong>${row.label}</strong>
          <span class="insight-value">${formatter(row.current)}</span>
        </div>
        <div class="badge-group">
          ${badge(`This week ${formatter(row.current)}`, "accent")}
          ${badge(`Last week ${formatter(row.previous)}`, "neutral")}
          ${badge(changeLabel, comparisonTone(row.delta))}
        </div>
        <div class="comparison-stack">
          <div class="comparison-track-row">
            <span class="comparison-label">This week</span>
            <div class="insight-bar-track">
              <div class="insight-bar-fill" style="width: ${currentWidth}%;"></div>
            </div>
          </div>
          <div class="comparison-track-row">
            <span class="comparison-label">Last week</span>
            <div class="insight-bar-track muted-track">
              <div class="insight-bar-fill previous-bar" style="width: ${previousWidth}%;"></div>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderDistributionOverview(overview = {}) {
  distributionOverviewGrid.innerHTML = `
    <article class="metric-card neutral">
      <p>Active runs</p>
      <strong>${overview.activeRuns || 0}</strong>
      <small>Still being worked</small>
    </article>
    <article class="metric-card warn">
      <p>Outstanding value</p>
      <strong>${formatCurrency(overview.outstandingTotal || 0)}</strong>
      <small>Still owed back</small>
    </article>
    <article class="metric-card accent">
      <p>Pending dirty cash</p>
      <strong>${formatCurrency(overview.pendingLedgerTotal || 0)}</strong>
      <small>${overview.pendingLedgerCount || 0} waiting to deposit</small>
    </article>
  `;
}

function renderRunnerLeaderboard(rows = []) {
  if (!rows.length) {
    runnerLeaderboardTable.innerHTML = renderEmptyState(
      "No runner activity yet",
      "Once runners start moving product or bringing money back, the weekly leaderboard will appear here."
    );
    return;
  }

  runnerLeaderboardTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Runner</th>
            <th>This week units</th>
            <th>Last week units</th>
            <th>This week made</th>
            <th>Last week made</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr>
              <td><strong>#${index + 1}</strong></td>
              <td>
                <strong>${row.name}</strong>
                <span class="subtle-row">${row.activeRuns || 0} active runs right now</span>
              </td>
              <td><strong>${row.currentUnits || 0}</strong></td>
              <td>${row.previousUnits || 0}</td>
              <td><strong>${formatCurrency(row.currentMoney || 0)}</strong></td>
              <td>${formatCurrency(row.previousMoney || 0)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadAnalytics() {
  renderLoading();

  try {
    const data = await api("/analytics/summary");
    renderSnapshot(data.snapshot || []);
    renderComparisonGraph(
      moneyGraph,
      data.moneyGraph || [],
      "No money movement yet",
      "Clean and dirty money changes will appear here once transactions start moving.",
      (value) => formatCurrency(value)
    );
    renderComparisonGraph(
      productGraph,
      data.productGraph || [],
      "No product movement yet",
      "Product movement will appear here once distributions go out.",
      (value) => `${value}`
    );
    renderRunnerLeaderboard(data.runnerLeaderboard || []);
    renderDistributionOverview(data.distributionOverview || {});
  } catch (error) {
    snapshotGrid.innerHTML = renderEmptyState("Unable to load analytics", error.message);
    moneyGraph.innerHTML = "";
    productGraph.innerHTML = "";
    runnerLeaderboardTable.innerHTML = "";
    distributionOverviewGrid.innerHTML = "";
    showToast(error.message, "error");
  }
}

subscribeToMutations(["distribution", "bank", "inventory"], () => {
  showToast("Analytics refreshed with live data.", "info");
  loadAnalytics();
});

loadAnalytics();
