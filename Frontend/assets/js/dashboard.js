import { api } from "./api.js";
import { subscribeToMutations } from "./live.js";
import { hasPermission } from "./session.js";
import {
  badge,
  bankTransactionBadge,
  distributionStatusBadge,
  formatCurrency,
  formatDate,
  initProtectedPage,
  renderEmptyState,
  renderMetricSkeleton,
  showToast
} from "./ui.js";

initProtectedPage({
  pageKey: "DASHBOARD",
  title: "Operations dashboard",
  subtitle: "Your live snapshot across stock, funds, and distribution activity."
});

const metricsGrid = document.querySelector("#metricsGrid");
const lowStockFeed = document.querySelector("#lowStockFeed");
const activityFeed = document.querySelector("#activityFeed");
const distributionFeed = document.querySelector("#distributionFeed");
const transactionFeed = document.querySelector("#transactionFeed");

function renderMetrics(metrics) {
  if (!metrics.length) {
    metricsGrid.innerHTML = renderEmptyState("No metrics available", "This user does not currently have dashboard-linked module access.");
    return;
  }

  metricsGrid.innerHTML = metrics.map((metric) => `
    <a class="metric-link" href="${metric.href || "#"}">
      <article class="metric-card ${metric.tone}">
        <p>${metric.label}</p>
        <strong>${metric.currency ? formatCurrency(metric.value) : metric.value}</strong>
        <small>${metric.note || "Live value"}</small>
      </article>
    </a>
  `).join("");
}

function renderLowStock(items) {
  if (!items.length) {
    lowStockFeed.innerHTML = renderEmptyState("No low stock alerts", "Items with reorder thresholds will show here when they need attention.");
    return;
  }

  lowStockFeed.innerHTML = items.map((item) => `
    <a class="activity-link" href="./inventory.html?editItem=${item.id}#inventoryForm">
      <article class="activity-card">
        <div>
          <strong>${item.name}</strong>
          <p>${item.quantity} ${item.unit} on hand against reorder level ${item.reorderLevel}</p>
        </div>
        <div class="activity-meta">
          ${badge("Low stock", "warn")}
          <small>${formatDate(item.updatedAt)}</small>
        </div>
      </article>
    </a>
  `).join("");
}

function renderActivity(items) {
  if (!items.length) {
    activityFeed.innerHTML = renderEmptyState("No activity yet", "New stock movements, distributions, and payments will appear here.");
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

function renderDistributionFeed(items) {
  if (!items.length) {
    distributionFeed.innerHTML = renderEmptyState("No distributions yet", "Assignments will show up here after the first distribution is created.");
    return;
  }

  distributionFeed.innerHTML = items.map((item) => `
    <a class="activity-link" href="./distribution.html?editDistribution=${item.id}#distributionForm">
      <article class="activity-card">
        <div>
          <strong>${item.item.name}</strong>
          <p>${item.quantity} units assigned to ${item.assignedTo.name}</p>
        </div>
        <div class="activity-meta">
          ${distributionStatusBadge(item.status)}
          <small>${formatDate(item.createdAt)}</small>
        </div>
      </article>
    </a>
  `).join("");
}

function renderTransactionFeed(items) {
  if (!items.length) {
    transactionFeed.innerHTML = renderEmptyState("No bank transactions yet", "When new credits or debits land, they will show here.");
    return;
  }

  transactionFeed.innerHTML = items.map((item) => `
    <a class="activity-link" href="${item.distribution?.id && hasPermission("DISTRIBUTION") ? `./distribution.html?editDistribution=${item.distribution.id}#distributionForm` : `./bank.html${item.distribution?.id ? `?search=${encodeURIComponent(item.description || item.type)}#transactionTable` : `?editTransaction=${item.id}#transactionForm`}`}">
      <article class="activity-card">
        <div>
          <strong>${item.type}</strong>
          <p>${item.description || "Manual entry"}</p>
        </div>
        <div class="activity-meta">
          ${bankTransactionBadge(item.type, formatCurrency(item.amount))}
          <small>${formatDate(item.createdAt)}</small>
        </div>
      </article>
    </a>
  `).join("");
}

async function loadDashboard() {
  metricsGrid.innerHTML = renderMetricSkeleton(4);
  lowStockFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";
  activityFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";
  distributionFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";
  transactionFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";

  try {
    const data = await api("/dashboard/summary");
    renderMetrics(data.metrics || []);
    renderLowStock(data.lowStockItems || []);
    renderActivity(data.recentActivity || []);
    renderDistributionFeed(data.recentDistributions || []);
    renderTransactionFeed(data.recentTransactions || []);
  } catch (error) {
    metricsGrid.innerHTML = renderEmptyState("Unable to load dashboard", error.message);
    lowStockFeed.innerHTML = "";
    activityFeed.innerHTML = "";
    distributionFeed.innerHTML = "";
    transactionFeed.innerHTML = "";
    showToast(error.message, "error");
  }
}

subscribeToMutations(["inventory", "bank", "distribution", "users"], () => {
  showToast("Dashboard refreshed with live changes.", "info");
  loadDashboard();
});

loadDashboard();
