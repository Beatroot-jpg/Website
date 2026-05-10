import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  badge,
  closeFormModal,
  formatCurrency,
  formatDate,
  initProtectedPage,
  mountFormError,
  openFormModal,
  renderEmptyState,
  renderMetricSkeleton,
  renderTableSkeleton,
  showToast
} from "./ui.js";

const currentUser = initProtectedPage({
  pageKey: "FACTORY",
  requiredPermission: null,
  title: "Factory round tracker",
  subtitle: "Clock work into the factory, log round sales as they happen, and let the payout share update live from time spent in the round."
});

const categorySectionsContainer = document.querySelector("#factoryCategorySections");
const currentStatus = document.querySelector("#factoryCurrentStatus");
const projectionNote = document.querySelector("#factoryProjectionNote");
const pieChartHost = document.querySelector("#factoryPieChart");
const shareTableContainer = document.querySelector("#factoryShareTable");
const salesCreateCard = document.querySelector("#factorySalesCreateCard");
const salesSummaryContainer = document.querySelector("#factorySalesSummary");
const salesTableContainer = document.querySelector("#factorySalesTable");
const salesPaginationContainer = document.querySelector("#factorySalesPagination");
const openSaleFormButton = document.querySelector("#openFactorySaleFormButton");
const adminPanel = document.querySelector("#factoryAdminPanel");
const openSessionsButton = document.querySelector("#openFactorySessionsButton");
const finalizeRoundButton = document.querySelector("#finalizeFactoryRoundButton");
const startRoundButton = document.querySelector("#startFactoryRoundButton");
const archiveTableContainer = document.querySelector("#factoryArchiveTable");
const archivePaginationContainer = document.querySelector("#factoryArchivePagination");

const saleForm = document.querySelector("#factorySaleForm");
const saleFormHost = document.querySelector("#factorySaleFormHost");
const saleFormContent = document.querySelector("#factorySaleFormContent");
const saleFormTitle = document.querySelector("#factorySaleFormTitle");
const saleFormSubtitle = document.querySelector("#factorySaleFormSubtitle");
const saleSubmitButton = document.querySelector("#factorySaleSubmitButton");
const saleResetButton = document.querySelector("#resetFactorySaleForm");
const saleError = document.querySelector("#factorySaleError");
const saleIdField = document.querySelector("#factorySaleId");

const sessionsHost = document.querySelector("#factorySessionsHost");
const sessionsContent = document.querySelector("#factorySessionsContent");
const sessionsTableContainer = document.querySelector("#factorySessionsTable");
const sessionsPaginationContainer = document.querySelector("#factorySessionsPagination");

const sessionForm = document.querySelector("#factorySessionForm");
const sessionFormHost = document.querySelector("#factorySessionFormHost");
const sessionFormContent = document.querySelector("#factorySessionFormContent");
const sessionFormTitle = document.querySelector("#factorySessionFormTitle");
const sessionFormSubtitle = document.querySelector("#factorySessionFormSubtitle");
const sessionSubmitButton = document.querySelector("#factorySessionSubmitButton");
const sessionResetButton = document.querySelector("#resetFactorySessionForm");
const sessionError = document.querySelector("#factorySessionError");
const sessionIdField = document.querySelector("#factorySessionId");
const deleteSessionButton = document.querySelector("#deleteFactorySessionButton");

const archiveDetailHost = document.querySelector("#factoryArchiveDetailHost");
const archiveDetailContent = document.querySelector("#factoryArchiveDetailContent");

const params = new URLSearchParams(window.location.search);
let currentSalesPage = Number.parseInt(params.get("salesPage") || "1", 10);
let currentArchivePage = Number.parseInt(params.get("archivePage") || "1", 10);
let requestedArchiveRoundId = params.get("viewFactoryRound") || "";

let viewerState = {
  canAdmin: false,
  activeCategoryId: "",
  activeSessionId: ""
};
let categoriesCache = [];
let currentRoundCache = null;
let archiveRoundsCache = [];
let currentSessionsPage = 1;
let currentSessionsCache = [];
let currentSessionsPagination = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1
};
let reopenSessionsListAfterClose = false;

const PIE_COLORS = [
  "#2ecb72",
  "#81d8af",
  "#d7ffc7",
  "#f1c06d",
  "#9ad0ff",
  "#f09aa7",
  "#90f4d0",
  "#d6e4ff",
  "#f8e38c",
  "#c0f7c6"
];

const SECTION_ORDER = ["MINING", "SMELTING", "MISCELLANEOUS"];

if (!Number.isFinite(currentSalesPage) || currentSalesPage < 1) {
  currentSalesPage = 1;
}

if (!Number.isFinite(currentArchivePage) || currentArchivePage < 1) {
  currentArchivePage = 1;
}

function escapeHtml(value) {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function updateUrlParams(updates = {}, removeKeys = []) {
  const nextParams = new URLSearchParams(window.location.search);

  Object.entries(updates).forEach(([key, value]) => {
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
  });

  removeKeys.forEach((key) => nextParams.delete(key));
  const query = nextParams.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

function toInputDateTimeValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function toIsoFromLocalInput(value) {
  return value ? new Date(value).toISOString() : "";
}

function formatHours(value) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function sectionLabel(section) {
  switch (`${section || ""}`.toUpperCase()) {
    case "MINING":
      return "Mining";
    case "SMELTING":
      return "Smelting";
    default:
      return "Miscellaneous";
  }
}

function sectionBadge(section) {
  const tone = section === "MINING"
    ? "accent"
    : section === "SMELTING"
      ? "good"
      : "neutral";

  return badge(sectionLabel(section), tone);
}

function lockBadge(locked) {
  return badge(locked ? "Locked" : "Open", locked ? "warn" : "good");
}

function activeCategory() {
  return categoriesCache.find((category) => category.id === viewerState.activeCategoryId) || null;
}

function resetSaleForm() {
  saleForm.reset();
  saleIdField.value = "";
  saleFormTitle.textContent = "Add sale entry";
  saleFormSubtitle.textContent = "Log the deal value here and it will add onto the current round total immediately.";
  saleSubmitButton.textContent = "Save sale entry";
  mountFormError(saleError, "");
}

function fillSaleForm(entry) {
  saleIdField.value = entry.id;
  saleFormTitle.textContent = "Edit sale entry";
  saleFormSubtitle.textContent = "Correct the deal amount or note here. The round projection will recalculate immediately.";
  saleSubmitButton.textContent = "Save changes";
  saleForm.elements.amount.value = Number(entry.amount || 0).toFixed(2);
  saleForm.elements.note.value = entry.note || "";
  mountFormError(saleError, "");
}

function showSaleModal(opener = document.activeElement) {
  openFormModal({
    content: saleFormContent,
    host: saleFormHost,
    focusSelector: '[name="amount"]',
    opener
  });
}

function resetSessionForm() {
  sessionForm.reset();
  sessionIdField.value = "";
  sessionFormTitle.textContent = "Correct session";
  sessionFormSubtitle.textContent = "Adjust the worker’s session times here. Overlapping blocks are blocked automatically.";
  sessionSubmitButton.textContent = "Save correction";
  deleteSessionButton?.classList.add("hidden");
  mountFormError(sessionError, "");
}

function fillSessionForm(session) {
  sessionIdField.value = session.id;
  sessionFormTitle.textContent = `Correct ${session.userName}`;
  sessionFormSubtitle.textContent = `Update the ${session.categoryName} session here if the worker forgot to clock cleanly.`;
  sessionSubmitButton.textContent = "Save correction";
  sessionForm.elements.startedAt.value = toInputDateTimeValue(session.startedAt);
  sessionForm.elements.endedAt.value = toInputDateTimeValue(session.endedAt);
  sessionForm.elements.note.value = session.note || "";
  deleteSessionButton?.classList.remove("hidden");
  mountFormError(sessionError, "");
}

function showSessionsModal(opener = document.activeElement) {
  openFormModal({
    content: sessionsContent,
    host: sessionsHost,
    focusSelector: ".form-modal-close",
    opener
  });
}

function showSessionFormModal(opener = document.activeElement) {
  openFormModal({
    content: sessionFormContent,
    host: sessionFormHost,
    focusSelector: '[name="startedAt"]',
    opener,
    onClose: () => {
      if (reopenSessionsListAfterClose) {
        reopenSessionsListAfterClose = false;
        window.setTimeout(() => showSessionsModal(opener), 0);
      }
    }
  });
}

function showArchiveDetailModal(opener = document.activeElement) {
  openFormModal({
    content: archiveDetailContent,
    host: archiveDetailHost,
    focusSelector: ".form-modal-close",
    opener,
    onClose: () => {
      if (requestedArchiveRoundId) {
        requestedArchiveRoundId = "";
        updateUrlParams({ viewFactoryRound: "" }, ["viewFactoryRound"]);
      }
    }
  });
}

function renderCurrentStatus() {
  if (!currentStatus) {
    return;
  }

  if (!currentRoundCache) {
    currentStatus.textContent = viewerState.canAdmin
      ? "There is no active factory round right now. Start the next round below when the team is ready to clock in again."
      : "There is no active factory round right now. Clocking will reopen once an admin starts the next round.";
    return;
  }

  const active = activeCategory();

  if (active) {
    currentStatus.textContent = `You are currently clocked into ${active.name} for round ${currentRoundCache.roundNumber}.`;
    return;
  }

  currentStatus.textContent = `You are not clocked into a factory category right now. Round ${currentRoundCache.roundNumber} is currently open.`;
}

function renderCategorySections() {
  if (!categorySectionsContainer) {
    return;
  }

  if (!categoriesCache.length) {
    categorySectionsContainer.innerHTML = renderEmptyState("No factory categories yet", "The factory categories will appear here once the system is initialized.");
    return;
  }

  const userHasActiveCategory = Boolean(viewerState.activeCategoryId);

  categorySectionsContainer.innerHTML = SECTION_ORDER.map((section) => {
    const categories = categoriesCache.filter((category) => category.section === section);

    if (!categories.length) {
      return "";
    }

    return `
      <section class="stack-list">
        <div class="panel-header compact-panel-header">
          <h3>${sectionLabel(section)}</h3>
          <p>${section === "MINING" ? "Raw collection work" : section === "SMELTING" ? "Ore conversion work" : "Support and finish work"}</p>
        </div>
        <div class="stack-list">
          ${categories.map((category) => {
            const helperText = category.helperText && !/section$/i.test(category.helperText) ? category.helperText : "";
            const workerNames = category.activeWorkers.map((worker) => worker.userName).join(", ");
            const actionLabel = category.viewerActive
              ? "Clock out"
              : userHasActiveCategory
                ? "Switch here"
                : "Clock in";
            const actionDisabled = !currentRoundCache || (category.locked && !viewerState.canAdmin && !category.viewerActive);

            return `
              <article class="activity-card factory-category-card">
                <div>
                  <strong>${escapeHtml(category.name)}</strong>
                  <p>${helperText || "Clock time here if this is the part of the factory you are working on."}</p>
                  <small class="subtle-row">${category.activeWorkerCount ? `${category.activeWorkerCount} active worker${category.activeWorkerCount === 1 ? "" : "s"}${workerNames ? ` - ${escapeHtml(workerNames)}` : ""}` : "Nobody clocked in here right now"}</small>
                </div>
                <div class="activity-meta">
                  <div class="badge-group">
                    ${sectionBadge(category.section)}
                    ${lockBadge(category.locked)}
                  </div>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-category-action="${category.viewerActive ? "clock-out" : "clock-in"}" data-category-id="${category.id}" ${actionDisabled ? "disabled" : ""}>
                      ${actionDisabled && category.locked && !category.viewerActive ? "Locked" : actionLabel}
                    </button>
                    ${viewerState.canAdmin ? `
                      <button class="mini-action" type="button" data-lock-category="${category.id}" data-lock-next="${category.locked ? "false" : "true"}">
                        ${category.locked ? "Unlock" : "Lock"}
                      </button>
                    ` : ""}
                  </div>
                </div>
              </article>
            `;
          }).join("")}
        </div>
      </section>
    `;
  }).join("");

  categorySectionsContainer.querySelectorAll("[data-category-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.categoryAction;
      const categoryId = button.dataset.categoryId;

      try {
        if (action === "clock-out") {
          await api("/factory/clock-out", {
            method: "POST"
          });
          showToast("Factory clock-out saved.", "success");
        } else {
          const response = await api("/factory/clock-in", {
            method: "POST",
            body: {
              categoryId
            }
          });
          showToast(
            response.switchedFromCategoryName
              ? `Switched from ${response.switchedFromCategoryName} into the new factory category.`
              : "Factory clock-in saved.",
            "success"
          );
        }

        await loadPage();
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  categorySectionsContainer.querySelectorAll("[data-lock-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/factory/categories/${button.dataset.lockCategory}`, {
          method: "PATCH",
          body: {
            locked: button.dataset.lockNext === "true"
          }
        });
        showToast(button.dataset.lockNext === "true" ? "Category locked." : "Category unlocked.", "success");
        await loadPage();
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

function renderProjectionNote() {
  if (!projectionNote) {
    return;
  }

  if (!currentRoundCache) {
    projectionNote.innerHTML = `<div class="empty-state"><h3>No active round</h3><p>Archived rounds are still viewable below, but a new round needs to be started before the factory can clock time or collect fresh sales.</p></div>`;
    return;
  }

  if (currentRoundCache.estimateBasisSource === "CURRENT_ROUND") {
    projectionNote.innerHTML = `
      <article class="activity-card">
        <div>
          <strong>Projection basis: current round sales</strong>
          <p>${formatCurrency(currentRoundCache.salesTotal)} is currently driving the live payout projection for round ${currentRoundCache.roundNumber}.</p>
        </div>
      </article>
    `;
    return;
  }

  if (currentRoundCache.estimateBasisSource === "LAST_FINALIZED_ROUND") {
    projectionNote.innerHTML = `
      <article class="activity-card">
        <div>
          <strong>Projection basis: last finalized round</strong>
          <p>No sales have been logged into round ${currentRoundCache.roundNumber} yet, so the live estimate is temporarily using ${formatCurrency(currentRoundCache.lastFinalizedTotal)} from the last finalized round.</p>
        </div>
      </article>
    `;
    return;
  }

  projectionNote.innerHTML = `
    <article class="activity-card">
      <div>
        <strong>Projection basis: waiting for the first sale</strong>
        <p>No current or prior round sales are available yet, so the projected payout will stay at zero until the first sale entry lands.</p>
      </div>
    </article>
  `;
}

function renderPieChart() {
  if (!pieChartHost) {
    return;
  }

  if (!currentRoundCache) {
    pieChartHost.innerHTML = "";
    return;
  }

  if (!currentRoundCache.shareRows.length) {
    pieChartHost.innerHTML = renderEmptyState("No clocked time yet", "Once workers start clocking time into the factory, their share of the round will appear here.");
    return;
  }

  let progress = 0;
  const slices = currentRoundCache.shareRows.map((row, index) => {
    const start = progress;
    const end = Math.min(100, progress + Number(row.sharePercent || 0));
    progress = end;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${end}%`;
  });

  pieChartHost.innerHTML = `
    <div class="factory-pie-shell">
      <div class="factory-pie-chart" style="background: conic-gradient(${slices.join(", ")});">
        <div class="factory-pie-center">
          <strong>${formatCurrency(currentRoundCache.estimateBasisTotal)}</strong>
          <span>Projection pool</span>
        </div>
      </div>
    </div>
  `;
}

function renderShareTable() {
  if (!shareTableContainer) {
    return;
  }

  if (!currentRoundCache) {
    shareTableContainer.innerHTML = "";
    return;
  }

  if (!currentRoundCache.shareRows.length) {
    shareTableContainer.innerHTML = "";
    return;
  }

  shareTableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Worker</th>
            <th>Live status</th>
            <th>Hours</th>
            <th>Share</th>
            <th>Projected payout</th>
          </tr>
        </thead>
        <tbody>
          ${currentRoundCache.shareRows.map((row) => `
            <tr class="${row.userId === currentUser.id ? "selected-row" : ""}">
              <td>
                <strong>${escapeHtml(row.userName)}</strong>
                <span class="subtle-row">${row.activeCategoryName ? `Currently in ${escapeHtml(row.activeCategoryName)}` : "Not actively clocked in right now"}</span>
              </td>
              <td>${row.activeCategoryName ? badge("Clocked in", "good") : badge("Offline", "neutral")}</td>
              <td><strong>${formatHours(row.totalHours)} h</strong><span class="subtle-row">${row.totalMinutes} minutes</span></td>
              <td><strong>${formatPercent(row.sharePercent)}%</strong></td>
              <td><strong>${formatCurrency(row.projectedPayout)}</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSalesSummary() {
  if (!salesSummaryContainer) {
    return;
  }

  if (!currentRoundCache) {
    salesSummaryContainer.innerHTML = renderEmptyState(
      "No active round sales yet",
      viewerState.canAdmin
        ? "Start a new round below when the factory is ready to begin clocking and logging deals again."
        : "A fresh round needs to be opened by an admin before sales can start compounding here."
    );
    return;
  }

  salesSummaryContainer.innerHTML = `
    <div class="metric-grid">
      <article class="metric-card accent">
        <p>Current round sales</p>
        <strong>${formatCurrency(currentRoundCache.salesTotal)}</strong>
        <small>Total logged into the live round so far</small>
      </article>
      <article class="metric-card good">
        <p>Projection basis</p>
        <strong>${formatCurrency(currentRoundCache.estimateBasisTotal)}</strong>
        <small>${currentRoundCache.estimateBasisSource === "CURRENT_ROUND" ? "Using live round sales" : currentRoundCache.estimateBasisSource === "LAST_FINALIZED_ROUND" ? "Using last finalized round" : "Waiting for the first sale"}</small>
      </article>
      <article class="metric-card neutral">
        <p>Last finalized round</p>
        <strong>${formatCurrency(currentRoundCache.lastFinalizedTotal)}</strong>
        <small>Fallback estimate when the new round has no sales yet</small>
      </article>
    </div>
  `;
}

function renderSalesPagination(pagination) {
  if (!salesPaginationContainer) {
    return;
  }

  if (!pagination || pagination.totalPages <= 1) {
    salesPaginationContainer.innerHTML = pagination?.total
      ? `<span class="pager-label">${pagination.total} total sale entries</span>`
      : "";
    return;
  }

  salesPaginationContainer.innerHTML = `
    <span class="pager-label">Page ${pagination.page} of ${pagination.totalPages}</span>
    <button class="ghost-button pager-button" type="button" data-sales-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Prev</button>
    <button class="ghost-button pager-button" type="button" data-sales-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
  `;

  salesPaginationContainer.querySelectorAll("[data-sales-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.salesPage);

      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > pagination.totalPages) {
        return;
      }

      currentSalesPage = nextPage;
      updateUrlParams({ salesPage: `${currentSalesPage}` });
      loadPage();
    });
  });
}

function renderSalesTable() {
  if (!salesTableContainer) {
    return;
  }

  if (!currentRoundCache) {
    salesTableContainer.innerHTML = "";
    salesPaginationContainer.innerHTML = "";
    return;
  }

  const pagination = currentRoundCache.salesPagination;

  if (!currentRoundCache.salesEntries.length) {
    salesTableContainer.innerHTML = renderEmptyState(
      "No sales logged into this round yet",
      viewerState.canAdmin
        ? "Add the first sale entry above and the payout projection will start updating straight away."
        : "Waiting for an admin to log the first deal into this round."
    );
    renderSalesPagination(pagination);
    return;
  }

  salesTableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Amount</th>
            <th>Note</th>
            <th>Logged by</th>
            <th>Updated</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${currentRoundCache.salesEntries.map((entry) => `
            <tr>
              <td><strong>${formatCurrency(entry.amount)}</strong></td>
              <td>${escapeHtml(entry.note || "No note")}</td>
              <td>${escapeHtml(entry.createdByName || "Unknown user")}</td>
              <td>${formatDate(entry.updatedAt)}</td>
              <td>
                ${viewerState.canAdmin ? `
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-edit-sale="${entry.id}">Edit</button>
                    <button class="mini-action danger-action" type="button" data-delete-sale="${entry.id}">Delete</button>
                  </div>
                ` : "Read only"}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  salesTableContainer.querySelectorAll("[data-edit-sale]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = currentRoundCache.salesEntries.find((item) => item.id === button.dataset.editSale);

      if (!entry) {
        return;
      }

      fillSaleForm(entry);
      showSaleModal(button);
    });
  });

  salesTableContainer.querySelectorAll("[data-delete-sale]").forEach((button) => {
    button.addEventListener("click", async () => {
      const entry = currentRoundCache.salesEntries.find((item) => item.id === button.dataset.deleteSale);

      if (!entry) {
        return;
      }

      const confirmed = window.confirm(`Delete the ${formatCurrency(entry.amount)} sale entry from this round?`);

      if (!confirmed) {
        return;
      }

      try {
        await api(`/factory/sales/${entry.id}`, {
          method: "DELETE"
        });
        showToast("Sale entry deleted.", "success");
        await loadPage();
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  renderSalesPagination(pagination);
}

function renderAdminState() {
  salesCreateCard?.classList.toggle("hidden", !viewerState.canAdmin || !currentRoundCache);
  adminPanel?.classList.toggle("hidden", !viewerState.canAdmin);

  if (!viewerState.canAdmin) {
    return;
  }

  finalizeRoundButton.disabled = !currentRoundCache;
  startRoundButton.disabled = Boolean(currentRoundCache);
  openSessionsButton.disabled = !currentRoundCache;
}

function renderArchivePagination(pagination) {
  if (!archivePaginationContainer) {
    return;
  }

  if (!pagination || pagination.totalPages <= 1) {
    archivePaginationContainer.innerHTML = pagination?.total
      ? `<span class="pager-label">${pagination.total} archived rounds</span>`
      : "";
    return;
  }

  archivePaginationContainer.innerHTML = `
    <span class="pager-label">Page ${pagination.page} of ${pagination.totalPages}</span>
    <button class="ghost-button pager-button" type="button" data-archive-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Prev</button>
    <button class="ghost-button pager-button" type="button" data-archive-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
  `;

  archivePaginationContainer.querySelectorAll("[data-archive-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.archivePage);

      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > pagination.totalPages) {
        return;
      }

      currentArchivePage = nextPage;
      updateUrlParams({ archivePage: `${currentArchivePage}` });
      loadPage();
    });
  });
}

function renderArchiveTable(pagination = null) {
  if (!archiveTableContainer) {
    return;
  }

  if (!archiveRoundsCache.length) {
    archiveTableContainer.innerHTML = renderEmptyState("No archived rounds yet", "Once a factory round is finalized, it will appear here with its frozen payout history.");
    renderArchivePagination(pagination);
    return;
  }

  archiveTableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Round</th>
            <th>Final sales</th>
            <th>Worker time</th>
            <th>Participants</th>
            <th>Finalized</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${archiveRoundsCache.map((round) => `
            <tr class="${requestedArchiveRoundId === round.id ? "editing-row" : ""}">
              <td>
                <strong>Round ${round.roundNumber}</strong>
                <span class="subtle-row">${round.saleEntryCount} sale entr${round.saleEntryCount === 1 ? "y" : "ies"}</span>
              </td>
              <td>
                <strong>${formatCurrency(round.finalizedSalesTotal)}</strong>
                <span class="subtle-row">Highest payout ${formatCurrency(round.highestPayout)}</span>
              </td>
              <td>
                <strong>${formatHours(round.totalMinutes / 60)} h</strong>
                <span class="subtle-row">${round.totalMinutes} minutes</span>
              </td>
              <td>${round.participantCount}</td>
              <td>${formatDate(round.finalizedAt)}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-view-round="${round.id}">View</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  archiveTableContainer.querySelectorAll("[data-view-round]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedArchiveRoundId = button.dataset.viewRound;
      updateUrlParams({ viewFactoryRound: requestedArchiveRoundId });
      loadArchiveRoundDetail(button.dataset.viewRound, button);
    });
  });

  renderArchivePagination(pagination);
}

function renderArchiveDetail(detail) {
  const payoutRows = detail.payouts || [];
  const salesEntries = detail.salesEntries || [];
  const categoryBreakdown = detail.categoryBreakdown || [];

  archiveDetailContent.innerHTML = `
    <div class="panel-header">
      <h2>Round ${detail.round.roundNumber} archive</h2>
      <p>This round is frozen. The payout table and sales history below are the stored record used when the round was finalized.</p>
    </div>

    <div class="metric-grid">
      <article class="metric-card accent">
        <p>Final sales</p>
        <strong>${formatCurrency(detail.round.finalizedSalesTotal)}</strong>
        <small>Total locked into this round when it was finalized</small>
      </article>
      <article class="metric-card good">
        <p>Total worker time</p>
        <strong>${formatHours(detail.round.totalMinutes / 60)} h</strong>
        <small>${detail.round.totalMinutes} minutes across the whole round</small>
      </article>
      <article class="metric-card neutral">
        <p>Participants</p>
        <strong>${detail.round.participantCount}</strong>
        <small>Workers who earned a payout in this round</small>
      </article>
    </div>

    <div class="panel-divider"></div>
    <div class="panel-header compact-panel-header">
      <h3>Final payout table</h3>
      <p>Frozen payouts by worker for this round.</p>
    </div>
    ${payoutRows.length ? `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Hours</th>
              <th>Share</th>
              <th>Payout</th>
            </tr>
          </thead>
          <tbody>
            ${payoutRows.map((row) => `
              <tr>
                <td><strong>${escapeHtml(row.userName)}</strong></td>
                <td>${formatHours(row.totalHours)} h</td>
                <td>${formatPercent(row.sharePercent)}%</td>
                <td><strong>${formatCurrency(row.payoutAmount)}</strong></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : renderEmptyState("No payout rows stored", "This round does not have stored payout rows yet.")}

    <div class="panel-divider"></div>
    <div class="panel-header compact-panel-header">
      <h3>Sales logged in this round</h3>
      <p>Every deal amount that compounded into the final round total.</p>
    </div>
    ${salesEntries.length ? `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>Amount</th>
              <th>Note</th>
              <th>Logged by</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${salesEntries.map((entry) => `
              <tr>
                <td><strong>${formatCurrency(entry.amount)}</strong></td>
                <td>${escapeHtml(entry.note || "No note")}</td>
                <td>${escapeHtml(entry.createdByName || "Unknown user")}</td>
                <td>${formatDate(entry.updatedAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : renderEmptyState("No sales entries stored", "This round has no saved sales entries.")}

    <div class="panel-divider"></div>
    <div class="panel-header compact-panel-header">
      <h3>Category time breakdown</h3>
      <p>How the round’s work hours were spread across the factory categories.</p>
    </div>
    ${categoryBreakdown.length ? `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Section</th>
              <th>Hours</th>
            </tr>
          </thead>
          <tbody>
            ${categoryBreakdown.map((entry) => `
              <tr>
                <td><strong>${escapeHtml(entry.categoryName)}</strong></td>
                <td>${sectionBadge(entry.section)}</td>
                <td>${formatHours(entry.totalHours)} h<span class="subtle-row">${entry.totalMinutes} minutes</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : renderEmptyState("No category breakdown available", "No stored time blocks were found for this round.")}
  `;
}

async function loadArchiveRoundDetail(roundId, opener = document.activeElement) {
  try {
    archiveDetailContent.innerHTML = renderMetricSkeleton(3);
    const detail = await api(`/factory/rounds/${roundId}`);
    renderArchiveDetail(detail);
    showArchiveDetailModal(opener);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function maybeOpenRequestedArchiveRound() {
  if (!requestedArchiveRoundId) {
    return;
  }

  await loadArchiveRoundDetail(requestedArchiveRoundId);
}

async function loadSessionCorrections(page = 1) {
  sessionsTableContainer.innerHTML = renderTableSkeleton(6, 5);
  sessionsPaginationContainer.innerHTML = "";

  try {
    const data = await api(`/factory/sessions?page=${page}`);
    currentSessionsPage = data.pagination?.page || 1;
    currentSessionsPagination = data.pagination || currentSessionsPagination;
    currentSessionsCache = data.sessions || [];

    if (!currentSessionsCache.length) {
      sessionsTableContainer.innerHTML = renderEmptyState(
        "No current round sessions yet",
        data.round
          ? "Once the team starts clocking work into this round, the correction list will appear here."
          : "There is no active round to correct right now."
      );
      sessionsPaginationContainer.innerHTML = "";
      return;
    }

    sessionsTableContainer.innerHTML = `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Category</th>
              <th>Start</th>
              <th>End</th>
              <th>Hours</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${currentSessionsCache.map((session) => `
              <tr>
                <td>
                  <strong>${escapeHtml(session.userName)}</strong>
                  <span class="subtle-row">${session.correctedByName ? `Last corrected by ${escapeHtml(session.correctedByName)}` : "No admin correction yet"}</span>
                </td>
                <td>${escapeHtml(session.categoryName)}</td>
                <td>${formatDate(session.startedAt)}</td>
                <td>${session.endedAt ? formatDate(session.endedAt) : "Still active"}</td>
                <td>${formatHours(session.durationHours)} h</td>
                <td>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-edit-session="${session.id}">Edit</button>
                    <button class="mini-action danger-action" type="button" data-delete-session="${session.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    sessionsTableContainer.querySelectorAll("[data-edit-session]").forEach((button) => {
      button.addEventListener("click", () => {
        const session = currentSessionsCache.find((entry) => entry.id === button.dataset.editSession);

        if (!session) {
          return;
        }

        fillSessionForm(session);
        reopenSessionsListAfterClose = true;
        showSessionFormModal(button);
      });
    });

    sessionsTableContainer.querySelectorAll("[data-delete-session]").forEach((button) => {
      button.addEventListener("click", async () => {
        const session = currentSessionsCache.find((entry) => entry.id === button.dataset.deleteSession);

        if (!session) {
          return;
        }

        const confirmed = window.confirm(`Delete ${session.userName}'s ${session.categoryName} session from the current round?`);

        if (!confirmed) {
          return;
        }

        try {
          await api(`/factory/sessions/${session.id}`, {
            method: "DELETE"
          });
          showToast("Factory session deleted.", "success");
          await loadSessionCorrections(currentSessionsPage);
          await loadPage();
          announceMutation(["factory"]);
        } catch (error) {
          showToast(error.message, "error");
        }
      });
    });

    renderSessionPagination(currentSessionsPagination);
  } catch (error) {
    sessionsTableContainer.innerHTML = renderEmptyState("Unable to load session corrections", error.message);
    showToast(error.message, "error");
  }
}

function renderSessionPagination(pagination) {
  if (!sessionsPaginationContainer) {
    return;
  }

  if (!pagination || pagination.totalPages <= 1) {
    sessionsPaginationContainer.innerHTML = pagination?.total
      ? `<span class="pager-label">${pagination.total} current sessions</span>`
      : "";
    return;
  }

  sessionsPaginationContainer.innerHTML = `
    <span class="pager-label">Page ${pagination.page} of ${pagination.totalPages}</span>
    <button class="ghost-button pager-button" type="button" data-session-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Prev</button>
    <button class="ghost-button pager-button" type="button" data-session-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
  `;

  sessionsPaginationContainer.querySelectorAll("[data-session-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.sessionPage);

      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > pagination.totalPages) {
        return;
      }

      loadSessionCorrections(nextPage);
    });
  });
}

async function loadPage() {
  categorySectionsContainer.innerHTML = renderMetricSkeleton(3);
  projectionNote.innerHTML = renderMetricSkeleton(1);
  pieChartHost.innerHTML = "";
  shareTableContainer.innerHTML = renderTableSkeleton(5, 5);
  salesSummaryContainer.innerHTML = renderMetricSkeleton(3);
  salesTableContainer.innerHTML = renderTableSkeleton(5, 5);
  salesPaginationContainer.innerHTML = "";
  archiveTableContainer.innerHTML = renderTableSkeleton(6, 4);
  archivePaginationContainer.innerHTML = "";

  try {
    const data = await api(`/factory?salesPage=${currentSalesPage}&archivePage=${currentArchivePage}`);
    viewerState = {
      canAdmin: Boolean(data.viewer?.canAdmin),
      activeCategoryId: data.viewer?.activeCategoryId || "",
      activeSessionId: data.viewer?.activeSessionId || ""
    };
    categoriesCache = data.categories || [];
    currentRoundCache = data.currentRound || null;
    archiveRoundsCache = data.archives?.rounds || [];
    currentSalesPage = data.currentRound?.salesPagination?.page || currentSalesPage;
    currentArchivePage = data.archives?.pagination?.page || currentArchivePage;

    renderCurrentStatus();
    renderCategorySections();
    renderProjectionNote();
    renderPieChart();
    renderShareTable();
    renderSalesSummary();
    renderSalesTable();
    renderAdminState();
    renderArchiveTable(data.archives?.pagination || null);
    await maybeOpenRequestedArchiveRound();
  } catch (error) {
    const fallback = renderEmptyState("Unable to load factory page", error.message);
    categorySectionsContainer.innerHTML = fallback;
    projectionNote.innerHTML = fallback;
    shareTableContainer.innerHTML = "";
    salesSummaryContainer.innerHTML = "";
    salesTableContainer.innerHTML = "";
    archiveTableContainer.innerHTML = "";
    showToast(error.message, "error");
  }
}

saleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(saleError, "");

  const payload = {
    amount: Number(saleForm.elements.amount.value || 0),
    note: saleForm.elements.note.value
  };

  try {
    if (saleIdField.value) {
      await api(`/factory/sales/${saleIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Sale entry updated.", "success");
    } else {
      await api("/factory/sales", {
        method: "POST",
        body: payload
      });
      showToast("Sale entry added to the round.", "success");
    }

    resetSaleForm();
    closeFormModal();
    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    mountFormError(saleError, error.message);
    showToast(error.message, "error");
  }
});

sessionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(sessionError, "");

  const payload = {
    startedAt: toIsoFromLocalInput(sessionForm.elements.startedAt.value),
    endedAt: sessionForm.elements.endedAt.value ? toIsoFromLocalInput(sessionForm.elements.endedAt.value) : "",
    note: sessionForm.elements.note.value
  };

  try {
    await api(`/factory/sessions/${sessionIdField.value}`, {
      method: "PATCH",
      body: payload
    });
    showToast("Factory session corrected.", "success");
    resetSessionForm();
    closeFormModal();
    await loadSessionCorrections(currentSessionsPage);
    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    mountFormError(sessionError, error.message);
    showToast(error.message, "error");
  }
});

openSaleFormButton?.addEventListener("click", () => {
  resetSaleForm();
  showSaleModal(openSaleFormButton);
});

saleResetButton?.addEventListener("click", () => {
  resetSaleForm();
});

openSessionsButton?.addEventListener("click", async () => {
  await loadSessionCorrections(1);
  showSessionsModal(openSessionsButton);
});

sessionResetButton?.addEventListener("click", () => {
  resetSessionForm();
});

deleteSessionButton?.addEventListener("click", async () => {
  const session = currentSessionsCache.find((entry) => entry.id === sessionIdField.value);

  if (!session) {
    mountFormError(sessionError, "That session could not be found.");
    return;
  }

  const confirmed = window.confirm(`Delete ${session.userName}'s ${session.categoryName} session from the current round?`);

  if (!confirmed) {
    return;
  }

  try {
    await api(`/factory/sessions/${session.id}`, {
      method: "DELETE"
    });
    showToast("Factory session deleted.", "success");
    resetSessionForm();
    closeFormModal();
    await loadSessionCorrections(currentSessionsPage);
    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    mountFormError(sessionError, error.message);
    showToast(error.message, "error");
  }
});

finalizeRoundButton?.addEventListener("click", async () => {
  const confirmed = window.confirm("Finalize the current factory round? This will close any live sessions, freeze the payout snapshot, and archive the round.");

  if (!confirmed) {
    return;
  }

  try {
    const response = await api("/factory/rounds/finalize", {
      method: "POST"
    });
    showToast(`Round ${response.round.roundNumber} finalized and archived.`, "success");
    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    showToast(error.message, "error");
  }
});

startRoundButton?.addEventListener("click", async () => {
  try {
    const response = await api("/factory/rounds/start", {
      method: "POST"
    });
    showToast(`Round ${response.round.roundNumber} is now open.`, "success");
    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    showToast(error.message, "error");
  }
});

subscribeToMutations(["factory"], () => {
  showToast("Factory page refreshed with live changes.", "info");
  loadPage();
});

resetSaleForm();
resetSessionForm();
loadPage();
