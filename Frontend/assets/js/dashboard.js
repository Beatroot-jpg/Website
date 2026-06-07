import { api } from "./api.js";
import { NAV_ITEMS } from "./constants.js";
import { subscribeToMutations } from "./live.js";
import { hasPermission } from "./session.js";
import { initThemeToggle } from "./theme.js";
import {
  badge,
  formatCurrency,
  formatDate,
  initProtectedPage,
  renderEmptyState,
  renderMetricSkeleton,
  showToast
} from "./ui.js";

initProtectedPage({
  pageKey: "DASHBOARD",
  title: "Home",
  subtitle: "Open the panel you need, glance at the important numbers, and keep the week moving without the old business-system clutter.",
  showQuickActions: false
});

const themeToggleButton = document.querySelector("#themeToggleButton");
const homeLauncherGrid = document.querySelector("#homeLauncherGrid");
const metricsGrid = document.querySelector("#metricsGrid");
const lowStockFeed = document.querySelector("#lowStockFeed");
const activityFeed = document.querySelector("#activityFeed");
const transactionFeed = document.querySelector("#transactionFeed");

const PANEL_LOOKUP = {
  ANALYTICS: {
    eyebrow: "Numbers",
    summary: "See weekly trends, output comparisons, and money movement.",
    tone: "accent"
  },
  PRICE_LIST: {
    eyebrow: "Quotes",
    summary: "Shared pricing plus a fast sale calculator when deals change on the fly.",
    tone: "good"
  },
  FACTORY: {
    eyebrow: "Rounds",
    summary: "Track time, freeze unpaid weeks, and keep payout work moving cleanly.",
    tone: "warn"
  },
  SECRETARY: {
    eyebrow: "Records",
    summary: "Meetings, notes, calendar items, and shared organization history.",
    tone: "neutral"
  },
  INVENTORY: {
    eyebrow: "Stock",
    summary: "Track what is on hand, what changed, and what needs attention next.",
    tone: "good"
  },
  TAX: {
    eyebrow: "Access",
    summary: "Monitor active and inactive access periods in one place.",
    tone: "neutral"
  },
  BANK: {
    eyebrow: "Money",
    summary: "Log payments, watch clean and dirty totals, and keep the ledger tidy.",
    tone: "accent"
  },
  DISTRIBUTION: {
    eyebrow: "Runs",
    summary: "Keep track of assigned movement and what has or has not come back yet.",
    tone: "warn"
  },
  USERS: {
    eyebrow: "Admin",
    summary: "Create users and control who can see what in the workspace.",
    tone: "neutral"
  }
};

function renderLauncherPanels() {
  const visiblePanels = NAV_ITEMS
    .filter((item) => item.key !== "DASHBOARD")
    .filter((item) => item.visibleToAllAuthenticated || hasPermission(item.key));

  if (!visiblePanels.length) {
    homeLauncherGrid.innerHTML = renderEmptyState(
      "No panels available",
      "This account does not currently have access to any workspace panels."
    );
    return;
  }

  homeLauncherGrid.innerHTML = visiblePanels.map((panel) => {
    const look = PANEL_LOOKUP[panel.key] || {
      eyebrow: "Panel",
      summary: panel.description,
      tone: "neutral"
    };

    return `
      <a class="home-launch-card ${look.tone}" href="${panel.href}">
        <div class="home-launch-copy">
          <p class="home-launch-eyebrow">${look.eyebrow}</p>
          <strong>${panel.label}</strong>
          <p>${look.summary}</p>
        </div>
        <div class="home-launch-meta">
          ${badge(panel.description, look.tone)}
          <span>Open panel</span>
        </div>
      </a>
    `;
  }).join("");
}

function renderMetrics(metrics) {
  if (!metrics.length) {
    metricsGrid.innerHTML = renderEmptyState(
      "No summary cards available",
      "Once more workspace tools are rebuilt, the home summary cards will populate here."
    );
    return;
  }

  metricsGrid.innerHTML = metrics.map((metric) => `
    <a class="metric-link" href="${metric.href || "#"}">
      <article class="metric-card ${metric.tone} home-metric-card">
        <p>${metric.label}</p>
        <strong>${metric.currency ? formatCurrency(metric.value) : metric.value}</strong>
        <small>${metric.note || "Live value"}</small>
      </article>
    </a>
  `).join("");
}

function renderInventoryOverview(items) {
  if (!items.length) {
    lowStockFeed.innerHTML = renderEmptyState(
      "No inventory tracked yet",
      "Once inventory starts getting entered, your latest stock signals will show up here."
    );
    return;
  }

  lowStockFeed.innerHTML = items.map((item) => `
    <a class="activity-link" href="./inventory.html?editItem=${item.id}">
      <article class="activity-card">
        <div>
          <strong>${item.name}</strong>
          <p><span class="emphasis-inline">${item.quantity} ${item.unit}</span> on hand${item.category ? ` - ${item.category}` : ""}</p>
        </div>
        <div class="activity-meta">
          ${badge("Inventory", "neutral")}
          <small>${formatDate(item.updatedAt)}</small>
        </div>
      </article>
    </a>
  `).join("");
}

function renderActivity(items) {
  if (!items.length) {
    activityFeed.innerHTML = renderEmptyState(
      "No recent movement",
      "As new inventory, money, or other workspace activity lands, it will show up here."
    );
    return;
  }

  activityFeed.innerHTML = items.map((item) => `
    <a class="activity-link" href="${item.href || "#"}">
      <article class="activity-card">
        <div>
          <strong>${item.title}</strong>
          <p>${item.detail}</p>
        </div>
        <div class="activity-meta">
          ${badge(item.badgeLabel, item.tone || "accent")}
          <small>${item.category} - ${formatDate(item.createdAt)}</small>
        </div>
      </article>
    </a>
  `).join("");
}

function renderTransactionFeed(items) {
  if (!items.length) {
    transactionFeed.innerHTML = renderEmptyState(
      "No money entries yet",
      "Clean and dirty money activity will appear here once entries start landing."
    );
    return;
  }

  transactionFeed.innerHTML = items.map((item) => `
    <a class="activity-link" href="./bank.html?view=${item.moneyType === "DIRTY" ? "dirty" : "clean"}">
      <article class="activity-card">
        <div>
          <strong>${item.moneyType} Money</strong>
          <p>${item.createdBy?.name || "System"} - ${item.description || "Manual entry"} <span class="emphasis-inline">${formatCurrency(item.amount)}</span></p>
        </div>
        <div class="activity-meta">
          ${badge(`${item.entryType} ${formatCurrency(item.amount)}`, item.entryType === "SUBTRACT" ? "danger" : item.moneyType === "DIRTY" ? "accent" : "good")}
          <small>${formatDate(item.createdAt)}</small>
        </div>
      </article>
    </a>
  `).join("");
}

async function loadDashboard() {
  renderLauncherPanels();
  metricsGrid.innerHTML = renderMetricSkeleton(4);
  lowStockFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";
  activityFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";
  transactionFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";

  try {
    const data = await api("/dashboard/summary");
    renderMetrics(data.metrics || []);
    renderInventoryOverview(data.lowStockItems || []);
    renderActivity(data.recentActivity || []);
    renderTransactionFeed(data.recentTransactions || []);
  } catch (error) {
    metricsGrid.innerHTML = renderEmptyState("Unable to load home summary", error.message);
    lowStockFeed.innerHTML = "";
    activityFeed.innerHTML = "";
    transactionFeed.innerHTML = "";
    showToast(error.message, "error");
  }
}

initThemeToggle(themeToggleButton);

subscribeToMutations(["inventory", "bank", "distribution", "users"], () => {
  showToast("Home refreshed with live changes.", "info");
  loadDashboard();
});

loadDashboard();
