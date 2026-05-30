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
  title: "Factory payout tracker",
  subtitle: "Clock factory work into the live week, keep the worker split visible, and let admin manage frozen sales without dragging workers through the bloat."
});

const categorySectionsContainer = document.querySelector("#factoryCategorySections");
const currentStatus = document.querySelector("#factoryCurrentStatus");
const projectionNote = document.querySelector("#factoryProjectionNote");
const pieChartHost = document.querySelector("#factoryPieChart");
const shareTableContainer = document.querySelector("#factoryShareTable");

const adminSurface = document.querySelector("#factoryAdminSurface");
const salesSummaryContainer = document.querySelector("#factorySalesSummary");
const salesTableContainer = document.querySelector("#factorySalesTable");
const salesPaginationContainer = document.querySelector("#factorySalesPagination");
const openSaleFormButton = document.querySelector("#openFactorySaleFormButton");
const openSessionsButton = document.querySelector("#openFactorySessionsButton");
const openCategoriesButton = document.querySelector("#openFactoryCategoriesButton");
const freezeRoundButton = document.querySelector("#freezeFactoryRoundButton");
const startRoundButton = document.querySelector("#startFactoryRoundButton");
const frozenTableContainer = document.querySelector("#factoryFrozenTable");
const frozenPaginationContainer = document.querySelector("#factoryFrozenPagination");
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
const saleRoundIdField = document.querySelector("#factorySaleRoundId");

const workEntryForm = document.querySelector("#factoryWorkEntryForm");
const workEntryHost = document.querySelector("#factoryWorkEntryHost");
const workEntryContent = document.querySelector("#factoryWorkEntryContent");
const workEntryTitle = document.querySelector("#factoryWorkEntryTitle");
const workEntrySubtitle = document.querySelector("#factoryWorkEntrySubtitle");
const workEntryResetButton = document.querySelector("#resetFactoryWorkEntryForm");
const workEntryError = document.querySelector("#factoryWorkEntryError");
const workEntryCategoryIdField = document.querySelector("#factoryWorkEntryCategoryId");

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
const sessionRoundIdField = document.querySelector("#factorySessionRoundId");
const deleteSessionButton = document.querySelector("#deleteFactorySessionButton");

const categoriesManagerHost = document.querySelector("#factoryCategoriesManagerHost");
const categoriesManagerContent = document.querySelector("#factoryCategoriesManagerContent");
const categoriesManagerTable = document.querySelector("#factoryCategoriesManagerTable");
const openCategoryFormButton = document.querySelector("#openFactoryCategoryFormButton");

const categoryForm = document.querySelector("#factoryCategoryForm");
const categoryFormHost = document.querySelector("#factoryCategoryFormHost");
const categoryFormContent = document.querySelector("#factoryCategoryFormContent");
const categoryFormTitle = document.querySelector("#factoryCategoryFormTitle");
const categoryFormSubtitle = document.querySelector("#factoryCategoryFormSubtitle");
const categorySubmitButton = document.querySelector("#factoryCategorySubmitButton");
const categoryResetButton = document.querySelector("#resetFactoryCategoryForm");
const categoryError = document.querySelector("#factoryCategoryError");
const categoryIdField = document.querySelector("#factoryCategoryId");

const roundDetailHost = document.querySelector("#factoryRoundDetailHost");
const roundDetailContent = document.querySelector("#factoryRoundDetailContent");

const params = new URLSearchParams(window.location.search);
let currentSalesPage = Number.parseInt(params.get("salesPage") || "1", 10);
let currentFrozenPage = Number.parseInt(params.get("frozenPage") || "1", 10);
let currentArchivePage = Number.parseInt(params.get("archivePage") || "1", 10);

let viewerState = {
  canAdmin: false,
  activeCategoryId: "",
  activeSessionId: ""
};
let categoriesCache = [];
let activeRoundCache = null;
let adminCache = null;
let currentSessionsPage = 1;
let currentSessionsCache = [];
let currentSessionsPagination = {
  page: 1,
  pageSize: 10,
  total: 0,
  totalPages: 1
};
let factoryWorkersCache = [];
let sessionFormContext = {
  source: "",
  roundId: "",
  roundLabel: "",
  opener: null,
  restoreParentOnClose: false
};
let roundDetailState = {
  roundId: "",
  salesPage: 1,
  sessionsPage: 1
};
let roundDetailCache = null;
let categoriesManagerCache = [];
let preserveRoundDetailStateOnClose = false;

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

if (!Number.isFinite(currentFrozenPage) || currentFrozenPage < 1) {
  currentFrozenPage = 1;
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

function updateUrlParams(updates = {}) {
  const nextParams = new URLSearchParams(window.location.search);

  Object.entries(updates).forEach(([key, value]) => {
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
  });

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

function sortFactoryCategoriesForForms(left, right) {
  const sectionIndexLeft = SECTION_ORDER.indexOf(left.section);
  const sectionIndexRight = SECTION_ORDER.indexOf(right.section);

  if (sectionIndexLeft !== sectionIndexRight) {
    return sectionIndexLeft - sectionIndexRight;
  }

  return (Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    || `${left.name || ""}`.localeCompare(`${right.name || ""}`);
}

function setSessionFormContext(context = {}) {
  sessionFormContext = {
    source: context.source || "",
    roundId: context.roundId || "",
    roundLabel: context.roundLabel || "selected week",
    opener: context.opener || null,
    restoreParentOnClose: Boolean(context.restoreParentOnClose)
  };
}

function populateSessionFormOptions(selectedUserId = "", selectedCategoryId = "") {
  if (!sessionForm) {
    return;
  }

  const workerOptions = [
    '<option value="">Select worker</option>',
    ...factoryWorkersCache.map((worker) => `
      <option value="${worker.id}" ${worker.id === selectedUserId ? "selected" : ""}>${escapeHtml(worker.name)}</option>
    `)
  ].join("");

  const categoryOptions = [
    '<option value="">Select category</option>',
    ...(adminCache?.categories || [])
      .slice()
      .sort(sortFactoryCategoriesForForms)
      .map((category) => {
        const suffix = category.archived ? " (Archived)" : "";
        return `
          <option value="${category.id}" ${category.id === selectedCategoryId ? "selected" : ""}>
            ${escapeHtml(`${sectionLabel(category.section)} - ${category.name}${suffix}`)}
          </option>
        `;
      })
  ].join("");

  sessionForm.elements.userId.innerHTML = workerOptions;
  sessionForm.elements.categoryId.innerHTML = categoryOptions;
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

function workModeBadge(workMode) {
  return badge(workMode === "LOGGED_ENTRY" ? "Logged entry" : "Clocked", workMode === "LOGGED_ENTRY" ? "warn" : "good");
}

function lockBadge(locked) {
  return badge(locked ? "Locked" : "Open", locked ? "warn" : "good");
}

function roundStatusBadge(status) {
  const normalized = `${status || ""}`.toUpperCase();
  const tone = normalized === "FROZEN"
    ? "warn"
    : normalized === "PAID" || normalized === "FINALIZED"
      ? "good"
      : "accent";
  const label = normalized === "FINALIZED" ? "Paid (legacy)" : normalized.charAt(0) + normalized.slice(1).toLowerCase();
  return badge(label, tone);
}

function activeCategory() {
  return categoriesCache.find((category) => category.id === viewerState.activeCategoryId) || null;
}

function isRoundDetailOpen() {
  return Boolean(roundDetailState.roundId);
}

function resetSaleForm() {
  saleForm.reset();
  saleIdField.value = "";
  saleRoundIdField.value = activeRoundCache?.id || "";
  saleFormTitle.textContent = "Add sale entry";
  saleFormSubtitle.textContent = "Log the deal value here and it will add onto the selected week total immediately.";
  saleSubmitButton.textContent = "Save sale entry";
  mountFormError(saleError, "");
}

function fillSaleForm(entry, roundId, roundLabel = "selected week") {
  saleIdField.value = entry.id;
  saleRoundIdField.value = roundId;
  saleFormTitle.textContent = "Edit sale entry";
  saleFormSubtitle.textContent = `Correct the deal amount or note for ${roundLabel}. The payout projection will recalculate immediately.`;
  saleSubmitButton.textContent = "Save changes";
  saleForm.elements.amount.value = Number(entry.amount || 0).toFixed(2);
  saleForm.elements.note.value = entry.note || "";
  mountFormError(saleError, "");
}

function resetWorkEntryForm() {
  workEntryForm.reset();
  workEntryCategoryIdField.value = "";
  workEntryTitle.textContent = "Log timed work";
  workEntrySubtitle.textContent = "Use this for load and leave categories. The block is saved straight away and counted into the active week.";
  mountFormError(workEntryError, "");
}

function fillWorkEntryForm(category) {
  workEntryCategoryIdField.value = category.id;
  workEntryTitle.textContent = `Log ${category.name}`;
  workEntrySubtitle.textContent = "Enter the time spent and any quantity/details. If you are currently clocked somewhere else, that live block will close at the start of this logged entry.";
  workEntryForm.elements.minutes.value = "";
  workEntryForm.elements.note.value = "";
  mountFormError(workEntryError, "");
}

function resetSessionForm({
  source = "",
  roundId = "",
  roundLabel = "selected week",
  opener = null,
  restoreParentOnClose = false
} = {}) {
  sessionForm.reset();
  setSessionFormContext({
    source,
    roundId,
    roundLabel,
    opener,
    restoreParentOnClose
  });
  sessionIdField.value = "";
  sessionRoundIdField.value = roundId;
  populateSessionFormOptions();
  sessionFormTitle.textContent = "Add work block";
  sessionFormSubtitle.textContent = source === "roundDetail"
    ? `Attribute a missed block into ${roundLabel}. The unpaid split will recalculate straight away.`
    : `Add a manual work block into ${roundLabel}. Overlapping blocks are still blocked automatically.`;
  sessionSubmitButton.textContent = "Save work block";
  deleteSessionButton?.classList.add("hidden");
  mountFormError(sessionError, "");
}

function fillSessionForm(session, {
  source = "",
  opener = null,
  roundLabel = "selected week",
  restoreParentOnClose = false
} = {}) {
  setSessionFormContext({
    source,
    roundId: session.roundId || "",
    roundLabel,
    opener,
    restoreParentOnClose
  });
  sessionIdField.value = session.id;
  sessionRoundIdField.value = session.roundId || "";
  populateSessionFormOptions(session.userId, session.categoryId);
  sessionFormTitle.textContent = `Correct ${session.userName}`;
  sessionFormSubtitle.textContent = source === "roundDetail"
    ? `Update the ${session.categoryName} block here. This unpaid week will recalculate after you save.`
    : `Update the ${session.categoryName} block here if the worker forgot to clock cleanly.`;
  sessionSubmitButton.textContent = "Save correction";
  sessionForm.elements.startedAt.value = toInputDateTimeValue(session.startedAt);
  sessionForm.elements.endedAt.value = toInputDateTimeValue(session.endedAt);
  sessionForm.elements.note.value = session.note || "";
  deleteSessionButton?.classList.remove("hidden");
  mountFormError(sessionError, "");
}

function resetCategoryForm() {
  categoryForm.reset();
  categoryIdField.value = "";
  categoryFormTitle.textContent = "Add category";
  categoryFormSubtitle.textContent = "Create a category and decide whether it uses a live clock or a timed entry button.";
  categorySubmitButton.textContent = "Save category";
  categoryForm.elements.section.value = "MINING";
  categoryForm.elements.workMode.value = "CLOCKED";
  categoryForm.elements.locked.checked = false;
  categoryForm.elements.archived.checked = false;
  mountFormError(categoryError, "");
}

function fillCategoryForm(category) {
  categoryIdField.value = category.id;
  categoryFormTitle.textContent = `Edit ${category.name}`;
  categoryFormSubtitle.textContent = "Change how this category works or archive it without needing a code update.";
  categorySubmitButton.textContent = "Save changes";
  categoryForm.elements.name.value = category.name || "";
  categoryForm.elements.section.value = category.section || "MINING";
  categoryForm.elements.workMode.value = category.workMode || "CLOCKED";
  categoryForm.elements.helperText.value = category.helperText || "";
  categoryForm.elements.locked.checked = Boolean(category.locked);
  categoryForm.elements.archived.checked = Boolean(category.archived);
  mountFormError(categoryError, "");
}

function showSaleModal(opener = document.activeElement) {
  openFormModal({
    content: saleFormContent,
    host: saleFormHost,
    focusSelector: '[name="amount"]',
    opener
  });
}

function showWorkEntryModal(opener = document.activeElement) {
  openFormModal({
    content: workEntryContent,
    host: workEntryHost,
    focusSelector: '[name="minutes"]',
    opener
  });
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
    focusSelector: '[name="userId"]',
    opener,
    onClose: () => {
      if (!sessionFormContext.restoreParentOnClose) {
        return;
      }

      if (sessionFormContext.source === "activeList") {
        window.setTimeout(() => showSessionsModal(sessionFormContext.opener || opener), 0);
      } else if (sessionFormContext.source === "roundDetail" && roundDetailState.roundId) {
        window.setTimeout(() => showRoundDetailModal(sessionFormContext.opener || opener), 0);
      }
    }
  });
}

function showCategoriesManagerModal(opener = document.activeElement) {
  openFormModal({
    content: categoriesManagerContent,
    host: categoriesManagerHost,
    focusSelector: ".form-modal-close",
    opener
  });
}

function showCategoryFormModal(opener = document.activeElement) {
  openFormModal({
    content: categoryFormContent,
    host: categoryFormHost,
    focusSelector: '[name="name"]',
    opener,
    onClose: () => {
      window.setTimeout(() => showCategoriesManagerModal(opener), 0);
    }
  });
}

function showRoundDetailModal(opener = document.activeElement) {
  openFormModal({
    content: roundDetailContent,
    host: roundDetailHost,
    focusSelector: ".form-modal-close",
    opener,
    onClose: () => {
      if (preserveRoundDetailStateOnClose) {
        preserveRoundDetailStateOnClose = false;
        return;
      }

      roundDetailState = {
        roundId: "",
        salesPage: 1,
        sessionsPage: 1
      };
      roundDetailCache = null;
    }
  });
}

function renderCurrentStatus() {
  if (!currentStatus) {
    return;
  }

  if (!activeRoundCache) {
    currentStatus.textContent = viewerState.canAdmin
      ? "There is no active week right now. You can open a fresh week from the admin section below."
      : "There is no active week right now. Clocking will reopen once an admin starts the next one.";
    return;
  }

  const active = activeCategory();

  if (active) {
    currentStatus.textContent = `You are currently clocked into ${active.name} for week ${activeRoundCache.roundNumber}.`;
    return;
  }

  currentStatus.textContent = `You are not clocked into a live category right now. Week ${activeRoundCache.roundNumber} is open.`;
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
          <p>${section === "MINING" ? "Raw collection work" : section === "SMELTING" ? "Load and leave or processing work" : "Support and finish work"}</p>
        </div>
        <div class="stack-list">
          ${categories.map((category) => {
            const workerNames = category.activeWorkers.map((worker) => worker.userName).join(", ");
            const helperText = category.helperText || (category.workMode === "LOGGED_ENTRY"
              ? "Use the timed entry button when you finish a load or quick factory block."
              : "Clock into this category while you are actively working it.");
            const isClocked = category.workMode === "CLOCKED";
            const actionLabel = isClocked
              ? category.viewerActive
                ? "Clock out"
                : userHasActiveCategory
                  ? "Switch here"
                  : "Clock in"
              : "Log entry";
            const actionDisabled = !activeRoundCache || (category.locked && !viewerState.canAdmin && !category.viewerActive);

            return `
              <article class="activity-card factory-category-card">
                <div>
                  <strong>${escapeHtml(category.name)}</strong>
                  <p>${escapeHtml(helperText)}</p>
                  <small class="subtle-row">
                    ${isClocked
                      ? category.activeWorkerCount
                        ? `${category.activeWorkerCount} active worker${category.activeWorkerCount === 1 ? "" : "s"}${workerNames ? ` - ${escapeHtml(workerNames)}` : ""}`
                        : "Nobody clocked in here right now"
                      : "Timed entry category"}
                  </small>
                </div>
                <div class="activity-meta">
                  <div class="badge-group">
                    ${sectionBadge(category.section)}
                    ${workModeBadge(category.workMode)}
                    ${lockBadge(category.locked)}
                  </div>
                  <div class="inline-table-actions">
                    <button
                      class="mini-action"
                      type="button"
                      data-category-action="${isClocked ? (category.viewerActive ? "clock-out" : "clock-in") : "log-entry"}"
                      data-category-id="${category.id}"
                      ${actionDisabled ? "disabled" : ""}
                    >
                      ${actionDisabled && category.locked && !category.viewerActive ? "Locked" : actionLabel}
                    </button>
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
          await loadPage();
          announceMutation(["factory"]);
          return;
        }

        if (action === "clock-in") {
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
          await loadPage();
          announceMutation(["factory"]);
          return;
        }

        const category = categoriesCache.find((entry) => entry.id === categoryId);

        if (!category) {
          showToast("That category could not be found.", "error");
          return;
        }

        resetWorkEntryForm();
        fillWorkEntryForm(category);
        showWorkEntryModal(button);
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

  if (!activeRoundCache) {
    projectionNote.innerHTML = `
      <div class="empty-state">
        <h3>No active week</h3>
        <p>Once an admin opens the next week, the live share and projection will appear here again.</p>
      </div>
    `;
    return;
  }

  if (activeRoundCache.estimateBasisSource === "CURRENT_WEEK_SALES") {
    projectionNote.innerHTML = `
      <article class="activity-card">
        <div>
          <strong>Projection basis: live week sales</strong>
          <p>${formatCurrency(activeRoundCache.salesTotal)} is currently driving the payout estimate for week ${activeRoundCache.roundNumber}.</p>
        </div>
      </article>
    `;
    return;
  }

  if (activeRoundCache.estimateBasisSource === "LAST_CLOSED_WEEK") {
    projectionNote.innerHTML = `
      <article class="activity-card">
        <div>
          <strong>Projection basis: last closed week</strong>
          <p>No sales have been logged into week ${activeRoundCache.roundNumber} yet, so the estimate is temporarily using ${formatCurrency(activeRoundCache.referenceSalesTotal)} from the most recent closed week.</p>
        </div>
      </article>
    `;
    return;
  }

  projectionNote.innerHTML = `
    <article class="activity-card">
      <div>
        <strong>Projection basis: waiting for the first sale</strong>
        <p>There are no current or prior week sales available yet, so projected payouts will stay at zero until the first sale lands.</p>
      </div>
    </article>
  `;
}

function renderPieChart() {
  if (!pieChartHost) {
    return;
  }

  if (!activeRoundCache) {
    pieChartHost.innerHTML = "";
    return;
  }

  if (!activeRoundCache.shareRows.length) {
    pieChartHost.innerHTML = renderEmptyState("No worker time yet", "Once people start clocking or logging work blocks into this week, their share of the pie will appear here.");
    return;
  }

  let progress = 0;
  const slices = activeRoundCache.shareRows.map((row, index) => {
    const start = progress;
    const end = Math.min(100, progress + Number(row.sharePercent || 0));
    progress = end;
    return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${end}%`;
  });

  pieChartHost.innerHTML = `
    <div class="factory-pie-shell">
      <div class="factory-pie-chart" style="background: conic-gradient(${slices.join(", ")});">
        <div class="factory-pie-center">
          <strong>${formatCurrency(activeRoundCache.estimateBasisTotal)}</strong>
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

  if (!activeRoundCache || !activeRoundCache.shareRows.length) {
    shareTableContainer.innerHTML = "";
    return;
  }

  shareTableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Worker</th>
            <th>Status</th>
            <th>Hours</th>
            <th>Share</th>
            <th>Projected payout</th>
          </tr>
        </thead>
        <tbody>
          ${activeRoundCache.shareRows.map((row) => `
            <tr class="${row.userId === currentUser.id ? "selected-row" : ""}">
              <td>
                <strong>${escapeHtml(row.userName)}</strong>
                <span class="subtle-row">${row.activeCategoryName ? `Currently in ${escapeHtml(row.activeCategoryName)}` : "No live clock running right now"}</span>
              </td>
              <td>${row.activeCategoryName ? badge("Clocked in", "good") : badge("Idle", "neutral")}</td>
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
  if (!salesSummaryContainer || !viewerState.canAdmin) {
    return;
  }

  if (!activeRoundCache) {
    salesSummaryContainer.innerHTML = renderEmptyState("No active week", "Open the next week before logging live sales.");
    return;
  }

  const saleEntryCount = activeRoundCache.salesPagination?.total || 0;
  salesSummaryContainer.innerHTML = `
    <div class="metric-grid">
      <article class="metric-card accent">
        <p>Active week total</p>
        <strong>${formatCurrency(activeRoundCache.salesTotal)}</strong>
        <small>Compounded from every sale logged into this live week</small>
      </article>
      <article class="metric-card good">
        <p>Sale entries</p>
        <strong>${saleEntryCount}</strong>
        <small>Every deal logged so far into week ${activeRoundCache.roundNumber}</small>
      </article>
      <article class="metric-card neutral">
        <p>Worker time</p>
        <strong>${formatHours((activeRoundCache.totalMinutes || 0) / 60)} h</strong>
        <small>${activeRoundCache.totalMinutes || 0} minutes clocked or logged so far</small>
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
      ? `<span class="pager-label">${pagination.total} sale entr${pagination.total === 1 ? "y" : "ies"}</span>`
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
  if (!salesTableContainer || !viewerState.canAdmin) {
    return;
  }

  if (!activeRoundCache) {
    salesTableContainer.innerHTML = "";
    salesPaginationContainer.innerHTML = "";
    return;
  }

  const entries = activeRoundCache.salesEntries || [];

  if (!entries.length) {
    salesTableContainer.innerHTML = renderEmptyState("No current week sales yet", "Add each deal into the live ledger as it happens so worker projections stay accurate through the week.");
    renderSalesPagination(activeRoundCache.salesPagination || null);
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
          ${entries.map((entry) => `
            <tr>
              <td><strong>${formatCurrency(entry.amount)}</strong></td>
              <td>${escapeHtml(entry.note || "No note")}</td>
              <td>${escapeHtml(entry.createdByName || "Unknown user")}</td>
              <td>${formatDate(entry.updatedAt)}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-edit-active-sale="${entry.id}">Edit</button>
                  <button class="mini-action danger-action" type="button" data-delete-active-sale="${entry.id}">Delete</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  salesTableContainer.querySelectorAll("[data-edit-active-sale]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = entries.find((candidate) => candidate.id === button.dataset.editActiveSale);

      if (!entry) {
        return;
      }

      fillSaleForm(entry, activeRoundCache.id, `active week ${activeRoundCache.roundNumber}`);
      showSaleModal(button);
    });
  });

  salesTableContainer.querySelectorAll("[data-delete-active-sale]").forEach((button) => {
    button.addEventListener("click", async () => {
      const entry = entries.find((candidate) => candidate.id === button.dataset.deleteActiveSale);

      if (!entry) {
        return;
      }

      const confirmed = window.confirm("Delete this live sale entry from the current week?");

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

  renderSalesPagination(activeRoundCache.salesPagination || null);
}

function renderAdminState() {
  if (!adminSurface) {
    return;
  }

  adminSurface.classList.toggle("hidden", !viewerState.canAdmin);

  if (!viewerState.canAdmin) {
    return;
  }

  freezeRoundButton.disabled = !activeRoundCache;
  startRoundButton.disabled = Boolean(activeRoundCache);
  openSessionsButton.disabled = !activeRoundCache;
}

function renderRoundListPagination(container, pagination, dataAttribute, onChange) {
  if (!container) {
    return;
  }

  if (!pagination || pagination.totalPages <= 1) {
    container.innerHTML = pagination?.total
      ? `<span class="pager-label">${pagination.total} week${pagination.total === 1 ? "" : "s"}</span>`
      : "";
    return;
  }

  container.innerHTML = `
    <span class="pager-label">Page ${pagination.page} of ${pagination.totalPages}</span>
    <button class="ghost-button pager-button" type="button" data-page-key="${dataAttribute}" data-page-value="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Prev</button>
    <button class="ghost-button pager-button" type="button" data-page-key="${dataAttribute}" data-page-value="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
  `;

  container.querySelectorAll(`[data-page-key="${dataAttribute}"]`).forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.pageValue || button.getAttribute("data-page-value"));

      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > pagination.totalPages) {
        return;
      }

      onChange(nextPage);
    });
  });
}

function renderFrozenTable() {
  if (!frozenTableContainer || !viewerState.canAdmin) {
    return;
  }

  const frozenRounds = adminCache?.frozenRounds?.rounds || [];
  const pagination = adminCache?.frozenRounds?.pagination || null;

  if (!frozenRounds.length) {
    frozenTableContainer.innerHTML = renderEmptyState("No frozen unpaid weeks", "Once you freeze a week, it will land here so sales can keep being added while the workers move onto the next one.");
    renderRoundListPagination(frozenPaginationContainer, pagination, "frozenPage", (nextPage) => {
      currentFrozenPage = nextPage;
      updateUrlParams({ frozenPage: `${currentFrozenPage}` });
      loadPage();
    });
    return;
  }

  frozenTableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Week</th>
            <th>Sales</th>
            <th>Worker time</th>
            <th>Participants</th>
            <th>Frozen</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${frozenRounds.map((round) => `
            <tr>
              <td>
                <strong>Week ${round.roundNumber}</strong>
                <span class="subtle-row">${roundStatusBadge(round.status)}</span>
              </td>
              <td>
                <strong>${formatCurrency(round.salesTotal)}</strong>
                <span class="subtle-row">${round.saleEntryCount} sale entr${round.saleEntryCount === 1 ? "y" : "ies"}</span>
              </td>
              <td>
                <strong>${formatHours(round.totalMinutes / 60)} h</strong>
                <span class="subtle-row">${round.totalMinutes} minutes</span>
              </td>
              <td>${round.participantCount}</td>
              <td>${formatDate(round.frozenAt || round.createdAt)}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-manage-frozen-round="${round.id}">Manage</button>
                  <button class="mini-action danger-action" type="button" data-pay-round="${round.id}">Mark paid</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  frozenTableContainer.querySelectorAll("[data-manage-frozen-round]").forEach((button) => {
    button.addEventListener("click", () => {
      loadRoundDetail(button.dataset.manageFrozenRound, button);
    });
  });

  frozenTableContainer.querySelectorAll("[data-pay-round]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm("Mark this frozen week as paid? Sales will lock and the week will move into the archive.");

      if (!confirmed) {
        return;
      }

      try {
        await api(`/factory/rounds/${button.dataset.payRound}/pay`, {
          method: "POST"
        });
        showToast("Factory week marked as paid.", "success");
        if (roundDetailState.roundId === button.dataset.payRound) {
          closeFormModal();
        }
        await loadPage();
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  renderRoundListPagination(frozenPaginationContainer, pagination, "frozenPage", (nextPage) => {
    currentFrozenPage = nextPage;
    updateUrlParams({ frozenPage: `${currentFrozenPage}` });
    loadPage();
  });
}

function renderArchiveTable() {
  if (!archiveTableContainer || !viewerState.canAdmin) {
    return;
  }

  const rounds = adminCache?.archives?.rounds || [];
  const pagination = adminCache?.archives?.pagination || null;

  if (!rounds.length) {
    archiveTableContainer.innerHTML = renderEmptyState("No paid archive yet", "Once frozen weeks are marked paid, they will land here with the payout history locked in.");
    renderRoundListPagination(archivePaginationContainer, pagination, "archivePage", (nextPage) => {
      currentArchivePage = nextPage;
      updateUrlParams({ archivePage: `${currentArchivePage}` });
      loadPage();
    });
    return;
  }

  archiveTableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Week</th>
            <th>Sales</th>
            <th>Worker time</th>
            <th>Participants</th>
            <th>Paid</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${rounds.map((round) => `
            <tr>
              <td>
                <strong>Week ${round.roundNumber}</strong>
                <span class="subtle-row">${roundStatusBadge(round.status)}</span>
              </td>
              <td>
                <strong>${formatCurrency(round.salesTotal)}</strong>
                <span class="subtle-row">Highest payout ${formatCurrency(round.highestPayout)}</span>
              </td>
              <td>
                <strong>${formatHours(round.totalMinutes / 60)} h</strong>
                <span class="subtle-row">${round.totalMinutes} minutes</span>
              </td>
              <td>${round.participantCount}</td>
              <td>${formatDate(round.paidAt || round.finalizedAt || round.createdAt)}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-view-archive-round="${round.id}">View</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  archiveTableContainer.querySelectorAll("[data-view-archive-round]").forEach((button) => {
    button.addEventListener("click", () => {
      loadRoundDetail(button.dataset.viewArchiveRound, button);
    });
  });

  renderRoundListPagination(archivePaginationContainer, pagination, "archivePage", (nextPage) => {
    currentArchivePage = nextPage;
    updateUrlParams({ archivePage: `${currentArchivePage}` });
    loadPage();
  });
}

function renderCategoriesManager() {
  if (!categoriesManagerTable) {
    return;
  }

  if (!categoriesManagerCache.length) {
    categoriesManagerTable.innerHTML = renderEmptyState("No categories found", "Create the first category so workers have somewhere to clock or log time.");
    return;
  }

  categoriesManagerTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Section</th>
            <th>Mode</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${categoriesManagerCache.map((category) => `
            <tr class="${category.archived ? "editing-row" : ""}">
              <td>
                <strong>${escapeHtml(category.name)}</strong>
                <span class="subtle-row">${escapeHtml(category.helperText || "No helper text")}</span>
              </td>
              <td>${sectionBadge(category.section)}</td>
              <td>${workModeBadge(category.workMode)}</td>
              <td>
                <div class="badge-group">
                  ${lockBadge(category.locked)}
                  ${category.archived ? badge("Archived", "neutral") : badge("Live", "good")}
                </div>
              </td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-edit-category="${category.id}">Edit</button>
                  <button class="mini-action" type="button" data-toggle-lock-category="${category.id}" data-next-lock="${category.locked ? "false" : "true"}">
                    ${category.locked ? "Unlock" : "Lock"}
                  </button>
                  <button class="mini-action ${category.archived ? "" : "danger-action"}" type="button" data-toggle-archive-category="${category.id}" data-next-archive="${category.archived ? "false" : "true"}">
                    ${category.archived ? "Restore" : "Archive"}
                  </button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  categoriesManagerTable.querySelectorAll("[data-edit-category]").forEach((button) => {
    button.addEventListener("click", () => {
      const category = categoriesManagerCache.find((entry) => entry.id === button.dataset.editCategory);

      if (!category) {
        return;
      }

      fillCategoryForm(category);
      showCategoryFormModal(button);
    });
  });

  categoriesManagerTable.querySelectorAll("[data-toggle-lock-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/factory/categories/${button.dataset.toggleLockCategory}`, {
          method: "PATCH",
          body: {
            locked: button.dataset.nextLock === "true"
          }
        });
        showToast(button.dataset.nextLock === "true" ? "Category locked." : "Category unlocked.", "success");
        await loadPage();
        renderCategoriesManager();
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  categoriesManagerTable.querySelectorAll("[data-toggle-archive-category]").forEach((button) => {
    button.addEventListener("click", async () => {
      const archiveNext = button.dataset.nextArchive === "true";
      const confirmed = window.confirm(archiveNext
        ? "Archive this category? Workers will no longer see it in the live week."
        : "Restore this category back into the live worker list?");

      if (!confirmed) {
        return;
      }

      try {
        await api(`/factory/categories/${button.dataset.toggleArchiveCategory}`, {
          method: "PATCH",
          body: {
            archived: archiveNext
          }
        });
        showToast(archiveNext ? "Category archived." : "Category restored.", "success");
        await loadPage();
        renderCategoriesManager();
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

function renderRoundDetail(detail) {
  roundDetailCache = detail;

  const payoutRows = detail.payouts || [];
  const salesEntries = detail.salesEntries || [];
  const sessions = detail.sessions || [];
  const categoryBreakdown = detail.categoryBreakdown || [];

  roundDetailContent.innerHTML = `
    <div class="panel-header">
      <h2>Week ${detail.round.roundNumber}</h2>
      <p>${detail.round.status === "FROZEN"
        ? "Workers are locked out of this week while admins can still add sales and correct missed time until payout is marked complete."
        : "This week is archived and read-only. Use it to review how worker time and sales were recorded."}</p>
    </div>

    <div class="metric-grid">
      <article class="metric-card accent">
        <p>Week total</p>
        <strong>${formatCurrency(detail.round.salesTotal)}</strong>
        <small>${detail.round.status === "FROZEN" ? "Still live for sales" : "Final locked sales total"}</small>
      </article>
      <article class="metric-card good">
        <p>Worker time</p>
        <strong>${formatHours(detail.round.totalMinutes / 60)} h</strong>
        <small>${detail.round.totalMinutes} minutes across the whole week</small>
      </article>
      <article class="metric-card neutral">
        <p>Participants</p>
        <strong>${detail.round.participantCount}</strong>
        <small>${detail.round.status === "FROZEN" ? "Workers locked into this split" : "Workers paid from this split"}</small>
      </article>
    </div>

    ${detail.round.canEditSales || detail.round.canMarkPaid ? `
      <div class="panel-divider"></div>
      <div class="action-launch-card">
        <div class="action-launch-copy">
          <strong>Frozen week controls</strong>
          <p class="muted">Add late sales, correct missed work blocks, and then mark the week paid once management is done.</p>
        </div>
        <div class="inline-actions">
          ${detail.round.canEditSales ? `<button class="primary-button" type="button" data-add-detail-sale="${detail.round.id}">Add sale entry</button>` : ""}
          ${detail.round.canCorrectSessions ? `<button class="secondary-button" type="button" data-add-detail-session="${detail.round.id}">Add work block</button>` : ""}
          ${detail.round.canMarkPaid ? `<button class="ghost-button" type="button" data-mark-detail-paid="${detail.round.id}">Mark paid</button>` : ""}
        </div>
      </div>
    ` : ""}

    <div class="panel-divider"></div>
    <div class="panel-header compact-panel-header">
      <h3>Locked payout split</h3>
      <p>The worker percentages below are the frozen split that sales continue to flow through for this week. If you correct the work history below, this split recalculates.</p>
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
    ` : renderEmptyState("No payout rows stored", "This week does not have a frozen payout split yet.")}

    <div class="panel-divider"></div>
    <div class="panel-header compact-panel-header">
      <h3>Sales history</h3>
      <p>Every sale entry that has compounded into this week total.</p>
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
              <th>${detail.round.canEditSales ? "Action" : "State"}</th>
            </tr>
          </thead>
          <tbody>
            ${salesEntries.map((entry) => `
              <tr>
                <td><strong>${formatCurrency(entry.amount)}</strong></td>
                <td>${escapeHtml(entry.note || "No note")}</td>
                <td>${escapeHtml(entry.createdByName || "Unknown user")}</td>
                <td>${formatDate(entry.updatedAt)}</td>
                <td>
                  ${detail.round.canEditSales ? `
                    <div class="inline-table-actions">
                      <button class="mini-action" type="button" data-edit-detail-sale="${entry.id}">Edit</button>
                      <button class="mini-action danger-action" type="button" data-delete-detail-sale="${entry.id}">Delete</button>
                    </div>
                  ` : badge("Locked", "neutral")}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : renderEmptyState("No sales stored", "No sale entries have been logged into this week yet.")}
    <div class="pager" id="factoryRoundDetailSalesPagination"></div>

    <div class="panel-divider"></div>
    <div class="panel-header compact-panel-header">
      <h3>Work history</h3>
      <p>${detail.round.canCorrectSessions
        ? "Paginated worker blocks so you can backtrack the week and still correct missed or bad time before payout."
        : "Paginated worker blocks so you can backtrack the week without the page turning into a wall of sessions."}</p>
    </div>
    ${sessions.length ? `
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Category</th>
              <th>Mode</th>
              <th>Duration</th>
              <th>Started</th>
              <th>Ended</th>
              <th>${detail.round.canCorrectSessions ? "Action" : "State"}</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.map((session) => `
              <tr>
                <td>
                  <strong>${escapeHtml(session.userName)}</strong>
                  <span class="subtle-row">${session.note ? escapeHtml(session.note) : "No note"}${session.correctedByName ? ` - Corrected by ${escapeHtml(session.correctedByName)}` : ""}</span>
                </td>
                <td>${escapeHtml(session.categoryName)}</td>
                <td>${workModeBadge(session.workMode)}</td>
                <td>${formatHours(session.durationHours)} h<span class="subtle-row">${session.durationMinutes} minutes</span></td>
                <td>${formatDate(session.startedAt)}</td>
                <td>${session.endedAt ? formatDate(session.endedAt) : "Still active"}</td>
                <td>
                  ${detail.round.canCorrectSessions ? `
                    <div class="inline-table-actions">
                      <button class="mini-action" type="button" data-edit-detail-session="${session.id}">Edit</button>
                      <button class="mini-action danger-action" type="button" data-delete-detail-session="${session.id}">Delete</button>
                    </div>
                  ` : badge("Locked", "neutral")}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    ` : renderEmptyState("No work blocks stored", detail.round.canCorrectSessions
      ? "No work sessions were found for this week yet. You can still add a missed work block before payout."
      : "No work sessions were found for this week.")}
    <div class="pager" id="factoryRoundDetailSessionsPagination"></div>

    <div class="panel-divider"></div>
    <div class="panel-header compact-panel-header">
      <h3>Category breakdown</h3>
      <p>How the week’s worker time was spread across the factory categories.</p>
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
    ` : renderEmptyState("No category breakdown available", "No stored work blocks were found for this week.")}
  `;

  const detailSalesPager = roundDetailContent.querySelector("#factoryRoundDetailSalesPagination");
  renderRoundListPagination(detailSalesPager, detail.salesPagination, "detailSalesPage", (nextPage) => {
    roundDetailState.salesPage = nextPage;
    loadRoundDetail(roundDetailState.roundId);
  });

  const detailSessionsPager = roundDetailContent.querySelector("#factoryRoundDetailSessionsPagination");
  renderRoundListPagination(detailSessionsPager, detail.sessionsPagination, "detailSessionsPage", (nextPage) => {
    roundDetailState.sessionsPage = nextPage;
    loadRoundDetail(roundDetailState.roundId);
  });

  roundDetailContent.querySelectorAll("[data-add-detail-sale]").forEach((button) => {
    button.addEventListener("click", () => {
      resetSaleForm();
      saleRoundIdField.value = detail.round.id;
      saleFormTitle.textContent = "Add frozen week sale";
      saleFormSubtitle.textContent = `Log another sale into week ${detail.round.roundNumber}. The worker split stays frozen while the payout amount updates.`;
      showSaleModal(button);
    });
  });

  roundDetailContent.querySelectorAll("[data-add-detail-session]").forEach((button) => {
    button.addEventListener("click", () => {
      resetSessionForm({
        source: "roundDetail",
        roundId: detail.round.id,
        roundLabel: `week ${detail.round.roundNumber}`,
        opener: button,
        restoreParentOnClose: true
      });
      preserveRoundDetailStateOnClose = true;
      showSessionFormModal(button);
    });
  });

  roundDetailContent.querySelectorAll("[data-mark-detail-paid]").forEach((button) => {
    button.addEventListener("click", async () => {
      const confirmed = window.confirm("Mark this frozen week as paid? This will move it into the read-only archive.");

      if (!confirmed) {
        return;
      }

      try {
        await api(`/factory/rounds/${button.dataset.markDetailPaid}/pay`, {
          method: "POST"
        });
        showToast("Factory week marked as paid.", "success");
        closeFormModal();
        await loadPage();
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  roundDetailContent.querySelectorAll("[data-edit-detail-sale]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = salesEntries.find((candidate) => candidate.id === button.dataset.editDetailSale);

      if (!entry) {
        return;
      }

      fillSaleForm(entry, detail.round.id, `week ${detail.round.roundNumber}`);
      showSaleModal(button);
    });
  });

  roundDetailContent.querySelectorAll("[data-delete-detail-sale]").forEach((button) => {
    button.addEventListener("click", async () => {
      const entry = salesEntries.find((candidate) => candidate.id === button.dataset.deleteDetailSale);

      if (!entry) {
        return;
      }

      const confirmed = window.confirm("Delete this sale entry from the frozen week?");

      if (!confirmed) {
        return;
      }

      try {
        await api(`/factory/sales/${entry.id}`, {
          method: "DELETE"
        });
        showToast("Sale entry deleted.", "success");
        await loadPage();
        await loadRoundDetail(detail.round.id);
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  roundDetailContent.querySelectorAll("[data-edit-detail-session]").forEach((button) => {
    button.addEventListener("click", () => {
      const session = sessions.find((candidate) => candidate.id === button.dataset.editDetailSession);

      if (!session) {
        return;
      }

      fillSessionForm(session, {
        source: "roundDetail",
        opener: button,
        roundLabel: `week ${detail.round.roundNumber}`,
        restoreParentOnClose: true
      });
      preserveRoundDetailStateOnClose = true;
      showSessionFormModal(button);
    });
  });

  roundDetailContent.querySelectorAll("[data-delete-detail-session]").forEach((button) => {
    button.addEventListener("click", async () => {
      const session = sessions.find((candidate) => candidate.id === button.dataset.deleteDetailSession);

      if (!session) {
        return;
      }

      const confirmed = window.confirm(`Delete ${session.userName}'s ${session.categoryName} work block from week ${detail.round.roundNumber}?`);

      if (!confirmed) {
        return;
      }

      try {
        await api(`/factory/sessions/${session.id}`, {
          method: "DELETE"
        });
        showToast("Factory session deleted.", "success");
        await loadPage();
        await loadRoundDetail(detail.round.id, button);
        announceMutation(["factory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

async function loadRoundDetail(roundId, opener = document.activeElement) {
  if (!roundId) {
    return;
  }

  roundDetailState.roundId = roundId;
  roundDetailContent.innerHTML = renderMetricSkeleton(3);

  try {
    const detail = await api(`/factory/rounds/${roundId}?salesPage=${roundDetailState.salesPage}&sessionsPage=${roundDetailState.sessionsPage}`);
    renderRoundDetail(detail);
    showRoundDetailModal(opener);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function loadSessionCorrections(page = 1) {
  sessionsTableContainer.innerHTML = renderTableSkeleton(6, 5);
  sessionsPaginationContainer.innerHTML = "";

  try {
    const data = await api(`/factory/sessions?page=${page}`);
    currentSessionsPage = data.pagination?.page || 1;
    currentSessionsPagination = data.pagination || currentSessionsPagination;
    currentSessionsCache = data.sessions || [];

    const manualEntryCard = data.round ? `
      <div class="action-launch-card">
        <div class="action-launch-copy">
          <strong>Add missed work block</strong>
          <p class="muted">Use this when somebody forgot to clock in or you need to attribute a clean manual block into the active week.</p>
        </div>
        <div class="inline-actions">
          <button class="primary-button" type="button" data-add-active-session="${data.round.id}">Add work block</button>
        </div>
      </div>
    ` : "";

    if (!currentSessionsCache.length) {
      sessionsTableContainer.innerHTML = `
        ${manualEntryCard}
        ${renderEmptyState(
          "No active week sessions yet",
          data.round
            ? "Once the team starts clocking or logging work into this week, the correction list will appear here."
            : "There is no active week to correct right now."
        )}
      `;
      sessionsPaginationContainer.innerHTML = "";
      sessionsTableContainer.querySelectorAll("[data-add-active-session]").forEach((button) => {
        button.addEventListener("click", () => {
          resetSessionForm({
            source: "activeList",
            roundId: data.round.id,
            roundLabel: `week ${data.round.roundNumber}`,
            opener: button,
            restoreParentOnClose: true
          });
          showSessionFormModal(button);
        });
      });
      return;
    }

    sessionsTableContainer.innerHTML = `
      ${manualEntryCard}
      <div class="table-shell">
        <table class="data-table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Category</th>
              <th>Mode</th>
              <th>Start</th>
              <th>End</th>
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
                <td>${workModeBadge(session.workMode)}</td>
                <td>${formatDate(session.startedAt)}</td>
                <td>${session.endedAt ? formatDate(session.endedAt) : "Still active"}</td>
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

    sessionsTableContainer.querySelectorAll("[data-add-active-session]").forEach((button) => {
      button.addEventListener("click", () => {
        resetSessionForm({
          source: "activeList",
          roundId: data.round.id,
          roundLabel: `week ${data.round.roundNumber}`,
          opener: button,
          restoreParentOnClose: true
        });
        showSessionFormModal(button);
      });
    });

    sessionsTableContainer.querySelectorAll("[data-edit-session]").forEach((button) => {
      button.addEventListener("click", () => {
        const session = currentSessionsCache.find((entry) => entry.id === button.dataset.editSession);

        if (!session) {
          return;
        }

        fillSessionForm(session, {
          source: "activeList",
          opener: button,
          roundLabel: `week ${data.round?.roundNumber || activeRoundCache?.roundNumber || ""}`,
          restoreParentOnClose: true
        });
        showSessionFormModal(button);
      });
    });

    sessionsTableContainer.querySelectorAll("[data-delete-session]").forEach((button) => {
      button.addEventListener("click", async () => {
        const session = currentSessionsCache.find((entry) => entry.id === button.dataset.deleteSession);

        if (!session) {
          return;
        }

        const confirmed = window.confirm(`Delete ${session.userName}'s ${session.categoryName} work block from the active week?`);

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

    renderRoundListPagination(sessionsPaginationContainer, currentSessionsPagination, "sessionPage", (nextPage) => {
      loadSessionCorrections(nextPage);
    });
  } catch (error) {
    sessionsTableContainer.innerHTML = renderEmptyState("Unable to load session corrections", error.message);
    showToast(error.message, "error");
  }
}

function renderLoadingState() {
  categorySectionsContainer.innerHTML = renderMetricSkeleton(3);
  projectionNote.innerHTML = renderMetricSkeleton(1);
  pieChartHost.innerHTML = "";
  shareTableContainer.innerHTML = renderTableSkeleton(5, 5);

  if (viewerState.canAdmin || adminSurface) {
    salesSummaryContainer.innerHTML = renderMetricSkeleton(3);
    salesTableContainer.innerHTML = renderTableSkeleton(5, 4);
    salesPaginationContainer.innerHTML = "";
    frozenTableContainer.innerHTML = renderTableSkeleton(6, 4);
    frozenPaginationContainer.innerHTML = "";
    archiveTableContainer.innerHTML = renderTableSkeleton(6, 4);
    archivePaginationContainer.innerHTML = "";
  }
}

async function loadPage() {
  renderLoadingState();

  try {
    const data = await api(`/factory?salesPage=${currentSalesPage}&frozenPage=${currentFrozenPage}&archivePage=${currentArchivePage}`);
    viewerState = {
      canAdmin: Boolean(data.viewer?.canAdmin),
      activeCategoryId: data.viewer?.activeCategoryId || "",
      activeSessionId: data.viewer?.activeSessionId || ""
    };
    categoriesCache = data.categories || [];
    activeRoundCache = data.activeRound || null;
    adminCache = data.admin || null;
    categoriesManagerCache = data.admin?.categories || [];
    factoryWorkersCache = data.admin?.workers || [];
    currentSalesPage = data.activeRound?.salesPagination?.page || currentSalesPage;
    currentFrozenPage = data.admin?.frozenRounds?.pagination?.page || currentFrozenPage;
    currentArchivePage = data.admin?.archives?.pagination?.page || currentArchivePage;

    renderCurrentStatus();
    renderCategorySections();
    renderProjectionNote();
    renderPieChart();
    renderShareTable();
    renderAdminState();

    if (viewerState.canAdmin) {
      renderSalesSummary();
      renderSalesTable();
      renderFrozenTable();
      renderArchiveTable();
    } else {
      salesSummaryContainer.innerHTML = "";
      salesTableContainer.innerHTML = "";
      salesPaginationContainer.innerHTML = "";
      frozenTableContainer.innerHTML = "";
      frozenPaginationContainer.innerHTML = "";
      archiveTableContainer.innerHTML = "";
      archivePaginationContainer.innerHTML = "";
    }
  } catch (error) {
    const fallback = renderEmptyState("Unable to load factory page", error.message);
    categorySectionsContainer.innerHTML = fallback;
    projectionNote.innerHTML = fallback;
    shareTableContainer.innerHTML = "";
    salesSummaryContainer.innerHTML = "";
    salesTableContainer.innerHTML = "";
    frozenTableContainer.innerHTML = "";
    archiveTableContainer.innerHTML = "";
    showToast(error.message, "error");
  }
}

saleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(saleError, "");

  const payload = {
    roundId: saleRoundIdField.value || activeRoundCache?.id || "",
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
      showToast("Sale entry added.", "success");
    }

    const detailRoundId = roundDetailState.roundId;
    resetSaleForm();
    closeFormModal();
    await loadPage();

    if (detailRoundId && payload.roundId === detailRoundId) {
      await loadRoundDetail(detailRoundId);
    }

    announceMutation(["factory"]);
  } catch (error) {
    mountFormError(saleError, error.message);
    showToast(error.message, "error");
  }
});

workEntryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(workEntryError, "");

  const payload = {
    categoryId: workEntryCategoryIdField.value,
    minutes: Number(workEntryForm.elements.minutes.value || 0),
    note: workEntryForm.elements.note.value
  };

  try {
    const response = await api("/factory/entries", {
      method: "POST",
      body: payload
    });
    showToast(
      response.closedCurrentCategoryName
        ? `Logged work block and closed ${response.closedCurrentCategoryName} at the start of it.`
        : "Factory work block saved.",
      "success"
    );
    resetWorkEntryForm();
    closeFormModal();
    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    mountFormError(workEntryError, error.message);
    showToast(error.message, "error");
  }
});

sessionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(sessionError, "");

  const submitContext = {
    ...sessionFormContext
  };
  const payload = {
    roundId: sessionRoundIdField.value,
    userId: sessionForm.elements.userId.value,
    categoryId: sessionForm.elements.categoryId.value,
    startedAt: toIsoFromLocalInput(sessionForm.elements.startedAt.value),
    endedAt: sessionForm.elements.endedAt.value ? toIsoFromLocalInput(sessionForm.elements.endedAt.value) : "",
    note: sessionForm.elements.note.value
  };

  try {
    if (sessionIdField.value) {
      await api(`/factory/sessions/${sessionIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Factory session corrected.", "success");
    } else {
      await api("/factory/sessions", {
        method: "POST",
        body: payload
      });
      showToast("Factory work block saved.", "success");
    }

    sessionFormContext.restoreParentOnClose = false;
    resetSessionForm();
    closeFormModal();

    if (submitContext.source === "activeList") {
      await loadSessionCorrections(currentSessionsPage);
      showSessionsModal(submitContext.opener || openSessionsButton);
    } else if (submitContext.source === "roundDetail" && submitContext.roundId) {
      await loadRoundDetail(submitContext.roundId, submitContext.opener || roundDetailHost);
    }

    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    mountFormError(sessionError, error.message);
    showToast(error.message, "error");
  }
});

categoryForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(categoryError, "");

  const payload = {
    name: categoryForm.elements.name.value,
    section: categoryForm.elements.section.value,
    workMode: categoryForm.elements.workMode.value,
    helperText: categoryForm.elements.helperText.value,
    locked: categoryForm.elements.locked.checked,
    archived: categoryForm.elements.archived.checked
  };

  try {
    if (categoryIdField.value) {
      await api(`/factory/categories/${categoryIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Factory category updated.", "success");
    } else {
      await api("/factory/categories", {
        method: "POST",
        body: payload
      });
      showToast("Factory category created.", "success");
    }

    resetCategoryForm();
    closeFormModal();
    await loadPage();
    renderCategoriesManager();
    announceMutation(["factory"]);
  } catch (error) {
    mountFormError(categoryError, error.message);
    showToast(error.message, "error");
  }
});

openSaleFormButton?.addEventListener("click", () => {
  resetSaleForm();
  saleRoundIdField.value = activeRoundCache?.id || "";
  showSaleModal(openSaleFormButton);
});

saleResetButton?.addEventListener("click", () => {
  resetSaleForm();
});

workEntryResetButton?.addEventListener("click", () => {
  resetWorkEntryForm();
});

openSessionsButton?.addEventListener("click", async () => {
  await loadSessionCorrections(1);
  showSessionsModal(openSessionsButton);
});

sessionResetButton?.addEventListener("click", () => {
  const existingSession = sessionIdField.value
    ? currentSessionsCache.find((entry) => entry.id === sessionIdField.value)
      || roundDetailCache?.sessions?.find((entry) => entry.id === sessionIdField.value)
      || null
    : null;

  if (existingSession) {
    fillSessionForm(existingSession, {
      source: sessionFormContext.source,
      opener: sessionFormContext.opener,
      roundLabel: sessionFormContext.roundLabel,
      restoreParentOnClose: sessionFormContext.restoreParentOnClose
    });
    return;
  }

  resetSessionForm({
    source: sessionFormContext.source,
    roundId: sessionFormContext.roundId,
    roundLabel: sessionFormContext.roundLabel,
    opener: sessionFormContext.opener,
    restoreParentOnClose: sessionFormContext.restoreParentOnClose
  });
});

deleteSessionButton?.addEventListener("click", async () => {
  const session = currentSessionsCache.find((entry) => entry.id === sessionIdField.value)
    || roundDetailCache?.sessions?.find((entry) => entry.id === sessionIdField.value)
    || null;
  const submitContext = {
    ...sessionFormContext
  };

  if (!session && submitContext.source !== "roundDetail") {
    mountFormError(sessionError, "That session could not be found.");
    return;
  }

  const sessionLabel = session
    ? `${session.userName}'s ${session.categoryName}`
    : "this worker block";
  const targetLabel = submitContext.source === "roundDetail"
    ? submitContext.roundLabel || "this unpaid week"
    : "the active week";
  const confirmed = window.confirm(`Delete ${sessionLabel} work block from ${targetLabel}?`);

  if (!confirmed) {
    return;
  }

  try {
    await api(`/factory/sessions/${sessionIdField.value}`, {
      method: "DELETE"
    });
    showToast("Factory session deleted.", "success");
    sessionFormContext.restoreParentOnClose = false;
    resetSessionForm();
    closeFormModal();

    if (submitContext.source === "activeList") {
      await loadSessionCorrections(currentSessionsPage);
      showSessionsModal(submitContext.opener || openSessionsButton);
    } else if (submitContext.source === "roundDetail" && submitContext.roundId) {
      await loadRoundDetail(submitContext.roundId, submitContext.opener || roundDetailHost);
    }

    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    mountFormError(sessionError, error.message);
    showToast(error.message, "error");
  }
});

openCategoriesButton?.addEventListener("click", () => {
  renderCategoriesManager();
  showCategoriesManagerModal(openCategoriesButton);
});

openCategoryFormButton?.addEventListener("click", () => {
  resetCategoryForm();
  showCategoryFormModal(openCategoryFormButton);
});

categoryResetButton?.addEventListener("click", () => {
  resetCategoryForm();
});

freezeRoundButton?.addEventListener("click", async () => {
  const confirmed = window.confirm("Freeze the current factory week? Worker percentages will lock, the next week will open immediately, and sales can keep being added to the frozen week.");

  if (!confirmed) {
    return;
  }

  try {
    const response = await api("/factory/rounds/freeze", {
      method: "POST"
    });
    showToast(`Week ${response.frozenRound.roundNumber} frozen. Week ${response.nextRound.roundNumber} is now open.`, "success");
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
    showToast(`Week ${response.round.roundNumber} is now open.`, "success");
    await loadPage();
    announceMutation(["factory"]);
  } catch (error) {
    showToast(error.message, "error");
  }
});

subscribeToMutations(["factory"], () => {
  loadPage();
});

resetSaleForm();
resetWorkEntryForm();
resetSessionForm();
resetCategoryForm();
loadPage();
