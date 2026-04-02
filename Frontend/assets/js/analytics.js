import { api } from "./api.js";
import { subscribeToMutations } from "./live.js";
import {
  badge,
  distributionStatusBadge,
  formatCurrency,
  formatDate,
  initProtectedPage,
  renderEmptyState,
  renderMetricSkeleton,
  showToast
} from "./ui.js";

initProtectedPage({
  pageKey: "ANALYTICS",
  title: "Business analytics",
  subtitle: "A simple read-only view of what the group is moving week by week."
});

const snapshotGrid = document.querySelector("#analyticsSnapshot");
const weekRows = document.querySelector("#analyticsWeekRows");
const topItems = document.querySelector("#analyticsTopItems");
const recentRuns = document.querySelector("#analyticsRecentRuns");
const overallGrid = document.querySelector("#analyticsOverall");

function renderLoading() {
  snapshotGrid.innerHTML = renderMetricSkeleton(4);
  overallGrid.innerHTML = renderMetricSkeleton(4);
  weekRows.innerHTML = "<div class='insight-row skeleton-card'></div><div class='insight-row skeleton-card'></div>";
  topItems.innerHTML = "<div class='insight-row skeleton-card'></div><div class='insight-row skeleton-card'></div>";
  recentRuns.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";
}

function comparisonClass(delta) {
  if (delta > 0) {
    return "up";
  }

  if (delta < 0) {
    return "down";
  }

  return "flat";
}

function renderChange(change, currency = false) {
  const formatted = currency ? formatCurrency(Math.abs(change.delta)) : Math.abs(change.delta);
  const className = comparisonClass(change.delta);
  const direction = change.delta > 0 ? "up" : change.delta < 0 ? "down" : "steady";

  return `
    <span class="insight-comparison ${className}">
      ${direction === "steady" ? "No change" : `${direction} ${formatted}`}
      <span class="muted">${Math.abs(change.percent)}%</span>
    </span>
  `;
}

function renderSnapshot(snapshot) {
  const cards = [
    {
      label: "Units this week",
      value: snapshot.units.current,
      tone: "good",
      note: renderChange(snapshot.units)
    },
    {
      label: "Assigned this week",
      value: formatCurrency(snapshot.assigned.current),
      tone: "accent",
      note: renderChange(snapshot.assigned, true)
    },
    {
      label: "Collected this week",
      value: formatCurrency(snapshot.collected.current),
      tone: "neutral",
      note: renderChange(snapshot.collected, true)
    },
    {
      label: "Deposited this week",
      value: formatCurrency(snapshot.deposited.current),
      tone: "accent",
      note: renderChange(snapshot.deposited, true)
    }
  ];

  snapshotGrid.innerHTML = cards.map((card) => `
    <article class="metric-card ${card.tone}">
      <p>${card.label}</p>
      <strong>${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join("");
}

function renderWeekRows(weeks) {
  if (!weeks.length) {
    weekRows.innerHTML = renderEmptyState("No weekly trend yet", "Once distributions start moving, the weekly comparisons will show here.");
    return;
  }

  const maxUnits = Math.max(...weeks.map((week) => week.unitsDistributed), 1);
  const maxDeposited = Math.max(...weeks.map((week) => week.amountDeposited), 1);

  weekRows.innerHTML = weeks.map((week, index) => {
    const previousWeek = weeks[index - 1];
    const delta = previousWeek ? week.unitsDistributed - previousWeek.unitsDistributed : 0;
    const unitsWidth = `${Math.max(10, Math.round((week.unitsDistributed / maxUnits) * 100))}%`;
    const depositedWidth = `${Math.max(10, Math.round((week.amountDeposited / maxDeposited) * 100))}%`;

    return `
      <article class="insight-row">
        <div class="insight-headline">
          <strong>${week.label}</strong>
          <span class="insight-value">${week.unitsDistributed} units</span>
        </div>
        <div class="insight-meta">
          <div class="badge-group">
            ${badge(`${week.distributionCount} runs`, "neutral")}
            ${badge(`Assigned ${formatCurrency(week.valueAssigned)}`, "accent")}
            ${badge(`Deposited ${formatCurrency(week.amountDeposited)}`, "good")}
          </div>
          ${previousWeek ? renderChange({ delta, percent: previousWeek.unitsDistributed ? ((delta / previousWeek.unitsDistributed) * 100).toFixed(1) : delta === 0 ? 0 : 100 }) : "<span class='insight-comparison flat'>Starting point</span>"}
        </div>
        <div class="task-summary-list">
          <div>
            <div class="insight-meta">
              <span class="muted">Units moved</span>
              <span class="muted">${week.unitsDistributed}</span>
            </div>
            <div class="insight-bar-track">
              <div class="insight-bar-fill" style="width: ${unitsWidth};"></div>
            </div>
          </div>
          <div>
            <div class="insight-meta">
              <span class="muted">Dirty cash deposited</span>
              <span class="muted">${formatCurrency(week.amountDeposited)}</span>
            </div>
            <div class="insight-bar-track">
              <div class="insight-bar-fill" style="width: ${depositedWidth};"></div>
            </div>
          </div>
        </div>
        <p class="muted">Collected ${formatCurrency(week.amountCollected)} back during the same week.</p>
      </article>
    `;
  }).join("");
}

function renderTopItems(items) {
  if (!items.length) {
    topItems.innerHTML = renderEmptyState("No item movement yet", "Once items go out this week, the top movers list will fill in here.");
    return;
  }

  const maxQuantity = Math.max(...items.map((item) => item.quantity), 1);

  topItems.innerHTML = items.map((item) => `
    <article class="insight-row">
      <div class="insight-headline">
        <strong>${item.name}</strong>
        <span class="insight-value">${item.quantity}</span>
      </div>
      <div class="insight-meta">
        ${badge(`Assigned ${formatCurrency(item.valueAssigned)}`, "accent")}
        <span class="muted">Units out this week</span>
      </div>
      <div class="insight-bar-track">
        <div class="insight-bar-fill" style="width: ${Math.max(12, Math.round((item.quantity / maxQuantity) * 100))}%;"></div>
      </div>
    </article>
  `).join("");
}

function renderRecentRuns(runs) {
  if (!runs.length) {
    recentRuns.innerHTML = renderEmptyState("No recent output", "When new distributions are created, they will appear here.");
    return;
  }

  recentRuns.innerHTML = runs.map((run) => `
    <article class="activity-card">
      <div>
        <strong>${run.item.name}</strong>
        <p>${run.quantity} units with ${run.distributor.name} (${run.distributor.number})</p>
      </div>
      <div class="activity-meta">
        ${distributionStatusBadge(run.status)}
        <small>${formatDate(run.updatedAt || run.createdAt)}</small>
      </div>
    </article>
  `).join("");
}

function renderOverall(overall) {
  const cards = [
    {
      label: "Total runs",
      value: overall.totalRuns,
      tone: "neutral",
      note: "All recorded distributions"
    },
    {
      label: "Total units out",
      value: overall.totalUnits,
      tone: "good",
      note: "All-time distributed quantity"
    },
    {
      label: "Total assigned value",
      value: formatCurrency(overall.totalAssigned),
      tone: "accent",
      note: "All-time locked value"
    },
    {
      label: "Total deposited",
      value: formatCurrency(overall.totalDeposited),
      tone: "good",
      note: "Dirty cash already banked"
    },
    {
      label: "Active runs",
      value: overall.activeRuns,
      tone: "neutral",
      note: "Still being worked"
    },
    {
      label: "Outstanding now",
      value: formatCurrency(overall.outstandingTotal),
      tone: "warn",
      note: "Still owed back"
    }
  ];

  overallGrid.innerHTML = cards.map((card) => `
    <article class="metric-card ${card.tone}">
      <p>${card.label}</p>
      <strong>${card.value}</strong>
      <small>${card.note}</small>
    </article>
  `).join("");
}

async function loadAnalytics() {
  renderLoading();

  try {
    const data = await api("/analytics/summary");
    renderSnapshot(data.snapshot || {});
    renderWeekRows(data.weeks || []);
    renderTopItems(data.topItems || []);
    renderRecentRuns(data.recentRuns || []);
    renderOverall(data.overall || {});
  } catch (error) {
    snapshotGrid.innerHTML = renderEmptyState("Unable to load analytics", error.message);
    weekRows.innerHTML = "";
    topItems.innerHTML = "";
    recentRuns.innerHTML = "";
    overallGrid.innerHTML = "";
    showToast(error.message, "error");
  }
}

subscribeToMutations(["distribution", "bank", "inventory"], () => {
  showToast("Analytics refreshed with live data.", "info");
  loadAnalytics();
});

loadAnalytics();
