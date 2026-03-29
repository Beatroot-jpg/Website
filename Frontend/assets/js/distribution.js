import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  distributionStatusBadge,
  formatCurrency,
  formatDate,
  initProtectedPage,
  mountFormError,
  renderEmptyState,
  renderTableSkeleton,
  showToast
} from "./ui.js";
import {
  bindDraftForm,
  buildPageHref,
  clearSavedView,
  downloadCsv,
  loadSavedView,
  restoreDraftForm,
  saveSavedView
} from "./workflow.js";

initProtectedPage({
  pageKey: "DISTRIBUTION",
  title: "Distribution assignments",
  subtitle: "Allocate stock to people and optionally record incoming funds."
});

const distributionForm = document.querySelector("#distributionForm");
const distributionError = document.querySelector("#distributionError");
const distributionIdField = document.querySelector("#distributionId");
const distributionFormTitle = document.querySelector("#distributionFormTitle");
const distributionFormSubtitle = document.querySelector("#distributionFormSubtitle");
const distributionSubmitButton = document.querySelector("#distributionSubmitButton");
const resetDistributionButton = document.querySelector("#resetDistributionForm");
const tableContainer = document.querySelector("#distributionTable");
const itemSelect = document.querySelector("#distributionItemId");
const userSelect = document.querySelector("#distributionAssignedToId");
const toolbarHost = document.createElement("div");
const initialParams = new URLSearchParams(window.location.search);
const searchQuery = (initialParams.get("search") || "").trim().toLowerCase();
const activeView = initialParams.get("view") || "";
let requestedDistributionEditId = initialParams.get("editDistribution") || "";
const distributionDraft = bindDraftForm(distributionForm, "distribution-form");

toolbarHost.className = "collection-tools";
tableContainer.before(toolbarHost);

let hasShownFilterMessage = false;
let distributionsCache = [];
let selectedDistributionIds = new Set();

if (distributionDraft.restored) {
  showToast("Restored saved distribution draft.", "info");
}

function updateUrlParams(updates = {}, removeKeys = []) {
  const params = new URLSearchParams(window.location.search);

  Object.entries(updates).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
  });

  removeKeys.forEach((key) => params.delete(key));

  const query = params.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
}

function resetDistributionForm({ clearDraftState = false, clearUrl = true } = {}) {
  distributionForm.reset();
  distributionIdField.value = "";
  distributionFormTitle.textContent = "Create assignment";
  distributionFormSubtitle.textContent = "Allocate inventory to a person and log any incoming cash at the same time.";
  distributionSubmitButton.textContent = "Save distribution";
  mountFormError(distributionError, "");

  if (clearDraftState) {
    distributionDraft.clearDraft();
  }

  if (clearUrl) {
    requestedDistributionEditId = "";
    updateUrlParams({ editDistribution: "" }, ["editDistribution"]);
  }
}

function fillDistributionForm(distribution) {
  distributionIdField.value = distribution.id;
  distributionFormTitle.textContent = `Edit ${distribution.item.name}`;
  distributionFormSubtitle.textContent = "Update this assignment and the linked stock and bank values will reconcile.";
  distributionSubmitButton.textContent = "Save changes";
  distributionForm.elements.itemId.value = distribution.itemId;
  distributionForm.elements.assignedToId.value = distribution.assignedToId;
  distributionForm.elements.quantity.value = distribution.quantity;
  distributionForm.elements.status.value = distribution.status;
  distributionForm.elements.unitPrice.value = distribution.unitPrice || "";
  distributionForm.elements.amountCollected.value = distribution.amountCollected || "";
  distributionForm.elements.notes.value = distribution.notes || "";
}

function maybeOpenRequestedEdit() {
  if (!requestedDistributionEditId) {
    return;
  }

  const distribution = distributionsCache.find((entry) => entry.id === requestedDistributionEditId);

  if (!distribution) {
    requestedDistributionEditId = "";
    updateUrlParams({ editDistribution: "" }, ["editDistribution"]);
    showToast("That distribution could not be found.", "error");
    return;
  }

  fillDistributionForm(distribution);
  distributionForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function populateOptions(items, users) {
  itemSelect.innerHTML = items.length
    ? items.map((item) => `<option value="${item.id}">${item.name} - ${item.quantity} ${item.unit}</option>`).join("")
    : "<option value=''>No stock available</option>";

  userSelect.innerHTML = users.length
    ? users.map((user) => `<option value="${user.id}">${user.name} - ${user.role}${user.active ? "" : " - inactive"}</option>`).join("")
    : "<option value=''>No users available</option>";
}

function getVisibleDistributions(distributions) {
  let visibleDistributions = [...distributions];

  if (activeView === "open") {
    visibleDistributions = visibleDistributions.filter((distribution) => !["COMPLETED", "CANCELLED"].includes(distribution.status));
  }

  if (activeView === "completed") {
    visibleDistributions = visibleDistributions.filter((distribution) => distribution.status === "COMPLETED");
  }

  if (activeView === "cancelled") {
    visibleDistributions = visibleDistributions.filter((distribution) => distribution.status === "CANCELLED");
  }

  if (searchQuery) {
    visibleDistributions = visibleDistributions.filter((distribution) => [
      distribution.item.name,
      distribution.assignedTo.name,
      distribution.status,
      distribution.notes
    ].some((value) => `${value || ""}`.toLowerCase().includes(searchQuery)));
  }

  return visibleDistributions;
}

function currentViewLabel() {
  if (activeView === "open") {
    return searchQuery ? `Open / ${searchQuery}` : "Open distributions";
  }

  if (activeView === "completed") {
    return searchQuery ? `Completed / ${searchQuery}` : "Completed";
  }

  if (activeView === "cancelled") {
    return searchQuery ? `Cancelled / ${searchQuery}` : "Cancelled";
  }

  return searchQuery ? `Search / ${searchQuery}` : "All distributions";
}

function getSelectedDistributions(distributions = distributionsCache) {
  const availableIds = new Set(distributions.map((distribution) => distribution.id));
  selectedDistributionIds = new Set([...selectedDistributionIds].filter((id) => availableIds.has(id)));
  return distributions.filter((distribution) => selectedDistributionIds.has(distribution.id));
}

function rerenderDistributionViews() {
  renderToolbar(distributionsCache);
  renderDistributions(distributionsCache);
}

function renderToolbar(distributions) {
  const visibleDistributions = getVisibleDistributions(distributions);
  const selectedDistributions = getSelectedDistributions(distributions);
  const savedView = loadSavedView("distribution");
  const filterLinks = [
    { label: "All", href: buildPageHref("./distribution.html", { hash: "distributionTable" }), active: !activeView },
    { label: "Open", href: buildPageHref("./distribution.html", { view: "open", hash: "distributionTable" }), active: activeView === "open" },
    { label: "Completed", href: buildPageHref("./distribution.html", { view: "completed", hash: "distributionTable" }), active: activeView === "completed" },
    { label: "Cancelled", href: buildPageHref("./distribution.html", { view: "cancelled", hash: "distributionTable" }), active: activeView === "cancelled" }
  ];

  toolbarHost.innerHTML = `
    <div class="filter-chip-row">
      ${filterLinks.map((link) => `
        <a class="filter-chip ${link.active ? "active" : ""}" href="${link.href}">${link.label}</a>
      `).join("")}
      ${savedView ? `<a class="filter-chip saved" href="${savedView.href}">Saved: ${savedView.label}</a>` : ""}
    </div>
    <div class="toolbar-actions">
      <span class="toolbar-meta">${visibleDistributions.length} shown</span>
      <button class="ghost-button toolbar-button" type="button" data-action="save-view">Save view</button>
      ${savedView ? `<button class="ghost-button toolbar-button" type="button" data-action="clear-view">Clear saved</button>` : ""}
      <button class="ghost-button toolbar-button" type="button" data-action="export">Export CSV</button>
    </div>
    ${selectedDistributions.length ? `
      <div class="bulk-strip">
        <span class="toolbar-meta">${selectedDistributions.length} selected</span>
        <button class="ghost-button toolbar-button" type="button" data-bulk-status="COMPLETED">Mark complete</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-status="CANCELLED">Cancel selected</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-export>Export selected</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-clear>Clear</button>
      </div>
    ` : ""}
  `;

  toolbarHost.querySelector('[data-action="save-view"]')?.addEventListener("click", () => {
    saveSavedView("distribution", {
      label: currentViewLabel(),
      href: buildPageHref("./distribution.html", {
        view: activeView,
        search: searchQuery,
        hash: "distributionTable"
      })
    });
    showToast("Saved distribution view.", "success");
    renderToolbar(distributions);
  });

  toolbarHost.querySelector('[data-action="clear-view"]')?.addEventListener("click", () => {
    clearSavedView("distribution");
    showToast("Cleared saved distribution view.", "info");
    renderToolbar(distributions);
  });

  toolbarHost.querySelector('[data-action="export"]')?.addEventListener("click", () => {
    downloadCsv(
      "distribution-export.csv",
      [
        { label: "Item", value: (distribution) => distribution.item.name },
        { label: "Assigned To", value: (distribution) => distribution.assignedTo.name },
        { label: "Quantity", value: (distribution) => distribution.quantity },
        { label: "Status", value: (distribution) => distribution.status },
        { label: "Amount Collected", value: (distribution) => distribution.bankTransaction?.amount || "" },
        { label: "Created At", value: (distribution) => formatDate(distribution.createdAt) }
      ],
      visibleDistributions
    );
    showToast("Distribution CSV exported.", "success");
  });

  toolbarHost.querySelectorAll("[data-bulk-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await updateBulkDistributionStatus(
          selectedDistributions.map((distribution) => distribution.id),
          button.dataset.bulkStatus
        );
        selectedDistributionIds = new Set();
        await loadDistribution();
        announceMutation(["distribution", "inventory", "bank"]);
        showToast("Bulk distribution update completed.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  toolbarHost.querySelector("[data-bulk-export]")?.addEventListener("click", () => {
    downloadCsv(
      "distribution-selected.csv",
      [
        { label: "Item", value: (distribution) => distribution.item.name },
        { label: "Assigned To", value: (distribution) => distribution.assignedTo.name },
        { label: "Quantity", value: (distribution) => distribution.quantity },
        { label: "Status", value: (distribution) => distribution.status },
        { label: "Amount Collected", value: (distribution) => distribution.bankTransaction?.amount || "" },
        { label: "Created At", value: (distribution) => formatDate(distribution.createdAt) }
      ],
      selectedDistributions
    );
    showToast("Selected distributions exported.", "success");
  });

  toolbarHost.querySelector("[data-bulk-clear]")?.addEventListener("click", () => {
    selectedDistributionIds = new Set();
    rerenderDistributionViews();
  });
}

async function updateDistributionStatus(distributionId, status) {
  await api(`/distribution/${distributionId}/status`, {
    method: "PATCH",
    body: { status }
  });
}

async function updateBulkDistributionStatus(ids, status) {
  await api("/distribution/bulk-status", {
    method: "PATCH",
    body: { ids, status }
  });
}

function renderDistributions(distributions) {
  const visibleDistributions = getVisibleDistributions(distributions);
  const allVisibleSelected = visibleDistributions.length
    && visibleDistributions.every((distribution) => selectedDistributionIds.has(distribution.id));

  if (!visibleDistributions.length) {
    tableContainer.innerHTML = renderEmptyState(
      distributions.length ? "No matching distributions" : "No distributions yet",
      distributions.length
        ? "Try a broader search or remove the current saved filter."
        : "Create the first stock assignment with the form on this page."
    );
    return;
  }

  if (!hasShownFilterMessage && (searchQuery || activeView)) {
    const filterParts = [];

    if (activeView) {
      filterParts.push(activeView);
    }

    if (searchQuery) {
      filterParts.push(`search "${searchQuery}"`);
    }

    showToast(`Showing ${filterParts.join(" + ")} distribution view.`, "info");
    hasShownFilterMessage = true;
  }

  tableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th class="table-select-cell">
              <input class="table-check" type="checkbox" data-select-all ${allVisibleSelected ? "checked" : ""}>
            </th>
            <th>Item</th>
            <th>Assigned to</th>
            <th>Quantity</th>
            <th>Status</th>
            <th>Cash logged</th>
            <th>Action</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${visibleDistributions.map((distribution) => `
            <tr class="${selectedDistributionIds.has(distribution.id) ? "selected-row" : ""} ${requestedDistributionEditId === distribution.id ? "editing-row" : ""}">
              <td class="table-select-cell">
                <input class="table-check" type="checkbox" data-select-distribution="${distribution.id}" ${selectedDistributionIds.has(distribution.id) ? "checked" : ""}>
              </td>
              <td>
                <strong>${distribution.item.name}</strong>
                <span class="subtle-row">${distribution.item.unit}</span>
              </td>
              <td>${distribution.assignedTo.name}</td>
              <td>${distribution.quantity}</td>
              <td>${distributionStatusBadge(distribution.status)}</td>
              <td>${distribution.bankTransaction ? `${formatCurrency(distribution.bankTransaction.amount)} dirty` : "Not recorded"}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-edit-distribution="${distribution.id}">Edit</button>
                  ${distribution.status !== "COMPLETED" ? `<button class="mini-action" type="button" data-status-id="${distribution.id}" data-status="COMPLETED">Complete</button>` : ""}
                  ${distribution.status !== "CANCELLED" ? `<button class="mini-action" type="button" data-status-id="${distribution.id}" data-status="CANCELLED">Cancel</button>` : ""}
                </div>
              </td>
              <td>${formatDate(distribution.createdAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  tableContainer.querySelectorAll("[data-edit-distribution]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedDistributionEditId = button.dataset.editDistribution;
      updateUrlParams({ editDistribution: requestedDistributionEditId });
      const distribution = distributionsCache.find((entry) => entry.id === requestedDistributionEditId);

      if (distribution) {
        fillDistributionForm(distribution);
        distributionForm.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  tableContainer.querySelectorAll("[data-status-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await updateDistributionStatus(button.dataset.statusId, button.dataset.status);
        await loadDistribution();
        announceMutation(["distribution", "inventory", "bank"]);
        showToast("Distribution updated inline.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  tableContainer.querySelector("[data-select-all]")?.addEventListener("change", (event) => {
    if (event.target.checked) {
      visibleDistributions.forEach((distribution) => selectedDistributionIds.add(distribution.id));
    } else {
      visibleDistributions.forEach((distribution) => selectedDistributionIds.delete(distribution.id));
    }

    rerenderDistributionViews();
  });

  tableContainer.querySelectorAll("[data-select-distribution]").forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.target.checked) {
        selectedDistributionIds.add(input.dataset.selectDistribution);
      } else {
        selectedDistributionIds.delete(input.dataset.selectDistribution);
      }

      rerenderDistributionViews();
    });
  });
}

async function loadDistribution() {
  tableContainer.innerHTML = renderTableSkeleton(8, 6);

  try {
    const [{ distributions }, options] = await Promise.all([
      api("/distribution"),
      api("/distribution/options")
    ]);

    distributionsCache = distributions;
    getSelectedDistributions(distributionsCache);
    populateOptions(options.items || [], options.users || []);
    restoreDraftForm(distributionForm, "distribution-form");
    rerenderDistributionViews();
    maybeOpenRequestedEdit();
  } catch (error) {
    tableContainer.innerHTML = renderEmptyState("Unable to load distributions", error.message);
    showToast(error.message, "error");
  }
}

distributionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(distributionError, "");

  const editingDistributionId = distributionIdField.value;
  const formData = new FormData(distributionForm);
  const payload = {
    itemId: formData.get("itemId"),
    assignedToId: formData.get("assignedToId"),
    quantity: Number(formData.get("quantity") || 0),
    unitPrice: formData.get("unitPrice"),
    amountCollected: formData.get("amountCollected"),
    status: formData.get("status"),
    notes: formData.get("notes")
  };

  try {
    if (editingDistributionId) {
      await api(`/distribution/${editingDistributionId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Distribution updated.", "success");
    } else {
      await api("/distribution", {
        method: "POST",
        body: payload
      });
      showToast("Distribution recorded and stock updated.", "success");
    }

    resetDistributionForm({ clearDraftState: true });
    await loadDistribution();
    announceMutation(["distribution", "inventory", "bank"]);
  } catch (error) {
    mountFormError(distributionError, error.message);
    showToast(error.message, "error");
  }
});

resetDistributionButton?.addEventListener("click", () => {
  resetDistributionForm({ clearDraftState: true });
});

subscribeToMutations(["distribution", "inventory", "bank", "users"], () => {
  showToast("Live update received for distributions.", "info");
  loadDistribution();
});

resetDistributionForm({ clearUrl: false });
restoreDraftForm(distributionForm, "distribution-form");
loadDistribution();
