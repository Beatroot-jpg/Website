import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  activeStateBadge,
  badge,
  distributionStatusBadge,
  focusFormPanel,
  formatCurrency,
  formatDate,
  initProtectedPage,
  mountFormError,
  renderEmptyState,
  renderMetricSkeleton,
  renderTableSkeleton,
  showToast
} from "./ui.js";
import { bindDraftForm, buildPageHref, restoreDraftForm } from "./workflow.js";

initProtectedPage({
  pageKey: "DISTRIBUTION",
  title: "Distribution ledger",
  subtitle: "Hand out product, collect what comes back, and deposit dirty cash when the ledger is ready."
});

const OPEN_STATUSES = new Set(["ACTIVE", "PARTIAL"]);
const params = new URLSearchParams(window.location.search);
const rawView = (params.get("view") || "").toLowerCase();
const searchQuery = (params.get("search") || "").trim().toLowerCase();

const summaryGrid = document.querySelector("#distributionSummary");
const distributionTable = document.querySelector("#distributionTable");
const distributorTable = document.querySelector("#distributorTable");
const ledgerTable = document.querySelector("#distributionLedgerTable");
const ledgerToolbar = document.querySelector("#ledgerToolbar");

const runnerForm = document.querySelector("#runnerForm");
const runnerError = document.querySelector("#runnerError");
const runnerIdField = document.querySelector("#distributorId");
const runnerFormTitle = document.querySelector("#runnerFormTitle");
const runnerFormSubtitle = document.querySelector("#runnerFormSubtitle");
const runnerSubmitButton = document.querySelector("#runnerSubmitButton");
const resetRunnerButton = document.querySelector("#resetRunnerForm");

const distributionForm = document.querySelector("#distributionForm");
const distributionError = document.querySelector("#distributionError");
const distributionIdField = document.querySelector("#distributionId");
const distributionFormTitle = document.querySelector("#distributionFormTitle");
const distributionFormSubtitle = document.querySelector("#distributionFormSubtitle");
const distributionSubmitButton = document.querySelector("#distributionSubmitButton");
const resetDistributionButton = document.querySelector("#resetDistributionForm");
const distributionRunnerSelect = document.querySelector("#distributionRunnerId");
const distributionItemSelect = document.querySelector("#distributionItemId");
const distributionTotalHint = document.querySelector("#distributionTotalHint");

const collectionForm = document.querySelector("#collectionEntryForm");
const collectionError = document.querySelector("#collectionError");
const collectionEntryIdField = document.querySelector("#collectionEntryId");
const collectionFormTitle = document.querySelector("#collectionFormTitle");
const collectionFormSubtitle = document.querySelector("#collectionFormSubtitle");
const collectionSubmitButton = document.querySelector("#collectionSubmitButton");
const resetCollectionButton = document.querySelector("#resetCollectionForm");
const collectionDistributionSelect = document.querySelector("#collectionDistributionId");
const collectionBalanceHint = document.querySelector("#collectionBalanceHint");

const distributionToolbar = document.createElement("div");
distributionToolbar.className = "collection-tools";
distributionTable.before(distributionToolbar);

let itemsCache = [];
let distributorsCache = [];
let distributionsCache = [];
let ledgerCache = [];
let selectedLedgerIds = new Set();
let requestedDistributionEditId = params.get("editDistribution") || "";
let requestedDistributorEditId = params.get("editDistributor") || "";
let requestedCollectionEditId = params.get("editCollection") || "";

const runnerDraft = bindDraftForm(runnerForm, "runner-form-v2");
const distributionDraft = bindDraftForm(distributionForm, "distribution-form-v3");
const collectionDraft = bindDraftForm(collectionForm, "distribution-collection-form-v2");

if (runnerDraft.restored || distributionDraft.restored || collectionDraft.restored) {
  showToast("Restored saved distribution drafts.", "info");
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

function remainingBalance(distribution) {
  return Math.max(0, Number(distribution.totalOwed || 0) - Number(distribution.amountReturned || 0));
}

function humanizeCollectionAction(action) {
  switch (`${action || ""}`.toUpperCase()) {
    case "PARTIAL_PAYMENT":
      return "Partial payment";
    case "FULL_CLEAR":
      return "Full clear";
    case "FAULTY_CLEAR":
      return "Faulty clear";
    default:
      return action;
  }
}

function distributionView() {
  if (["all", "active", "partial", "cleared", "faulty"].includes(rawView)) {
    return rawView;
  }

  return "active";
}

function setDistributionLock(locked) {
  ["distributorId", "itemId", "quantity", "unitValue"].forEach((name) => {
    if (distributionForm.elements[name]) {
      distributionForm.elements[name].disabled = locked;
    }
  });
}

function updateDistributionTotalHint() {
  const quantity = Number(distributionForm.elements.quantity.value || 0);
  const unitValue = Number(distributionForm.elements.unitValue.value || 0);
  distributionTotalHint.textContent = quantity > 0 && unitValue >= 0
    ? `Total owed: ${formatCurrency(quantity * unitValue)}`
    : "Total owed will calculate here.";
}

function populateDistributionOptions() {
  const currentDistribution = requestedDistributionEditId
    ? distributionsCache.find((distribution) => distribution.id === requestedDistributionEditId)
    : null;
  const currentDistributorId = distributionForm.elements.distributorId.value || currentDistribution?.distributorId || "";
  const currentItemId = distributionForm.elements.itemId.value || currentDistribution?.itemId || "";
  const availableDistributors = distributorsCache.filter((distributor) => distributor.active || distributor.id === currentDistributorId);
  const availableItems = itemsCache.filter((item) => item.quantity > 0 || item.id === currentItemId);

  distributionRunnerSelect.innerHTML = availableDistributors.length
    ? availableDistributors.map((distributor) => `<option value="${distributor.id}">${distributor.name} - ${distributor.number}${distributor.active ? "" : " - inactive"}</option>`).join("")
    : "<option value=''>No runners available</option>";

  distributionItemSelect.innerHTML = availableItems.length
    ? availableItems.map((item) => `<option value="${item.id}">${item.name} - ${item.quantity} ${item.unit}${item.category ? ` - ${item.category}` : ""}</option>`).join("")
    : "<option value=''>No stock available</option>";

  if (currentDistributorId && availableDistributors.some((distributor) => distributor.id === currentDistributorId)) {
    distributionRunnerSelect.value = currentDistributorId;
  }

  if (currentItemId && availableItems.some((item) => item.id === currentItemId)) {
    distributionItemSelect.value = currentItemId;
  }
}

function populateCollectionOptions() {
  const openDistributions = distributionsCache.filter((distribution) => OPEN_STATUSES.has(distribution.status));
  const currentDistributionId = collectionEntryIdField.value
    ? ledgerCache.find((entry) => entry.id === collectionEntryIdField.value)?.distributionId
    : requestedDistributionEditId;
  const currentDistribution = distributionsCache.find((distribution) => distribution.id === currentDistributionId);
  const options = [...openDistributions];

  if (currentDistribution && !options.some((distribution) => distribution.id === currentDistribution.id)) {
    options.push(currentDistribution);
  }

  collectionDistributionSelect.innerHTML = options.length
    ? options.map((distribution) => `<option value="${distribution.id}">${distribution.item.name} - ${distribution.distributor.name} - ${formatCurrency(remainingBalance(distribution))} left</option>`).join("")
    : "<option value=''>No open distributions</option>";
}

function updateCollectionHint() {
  const distribution = distributionsCache.find((entry) => entry.id === collectionDistributionSelect.value);

  if (!distribution) {
    collectionBalanceHint.textContent = "Select an active distribution to see what is still owed.";
    return;
  }

  collectionBalanceHint.textContent = `${distribution.distributor.name} still owes ${formatCurrency(remainingBalance(distribution))} on ${distribution.item.name}.`;
}

function syncCollectionAmount() {
  const distribution = distributionsCache.find((entry) => entry.id === collectionDistributionSelect.value);
  const action = `${collectionForm.elements.action.value || ""}`.toUpperCase();

  if (!distribution) {
    return;
  }

  if (action === "FULL_CLEAR" && !collectionEntryIdField.value) {
    collectionForm.elements.amount.value = remainingBalance(distribution).toFixed(2);
  }

  if (action === "FAULTY_CLEAR") {
    collectionForm.elements.amount.value = "0.00";
  }
}

function resetRunnerForm({ clearDraftState = false, clearUrl = true } = {}) {
  runnerForm.reset();
  runnerIdField.value = "";
  runnerFormTitle.textContent = "Create runner";
  runnerFormSubtitle.textContent = "Enter the runner first, then review the active runner list directly underneath it.";
  runnerSubmitButton.textContent = "Save runner";
  runnerForm.elements.active.checked = true;
  mountFormError(runnerError, "");

  if (clearDraftState) {
    runnerDraft.clearDraft();
  }

  if (clearUrl) {
    requestedDistributorEditId = "";
    updateUrlParams({ editDistributor: "" }, ["editDistributor"]);
  }
}

function resetDistributionForm({ clearDraftState = false, clearUrl = true } = {}) {
  distributionForm.reset();
  distributionIdField.value = "";
  distributionFormTitle.textContent = "Create distribution";
  distributionFormSubtitle.textContent = "Hand product out here, then review the active distributions in the same section below.";
  distributionSubmitButton.textContent = "Save distribution";
  setDistributionLock(false);
  populateDistributionOptions();
  updateDistributionTotalHint();
  mountFormError(distributionError, "");

  if (clearDraftState) {
    distributionDraft.clearDraft();
  }

  if (clearUrl) {
    requestedDistributionEditId = "";
    updateUrlParams({ editDistribution: "" }, ["editDistribution"]);
  }
}

function resetCollectionForm({ clearDraftState = false, clearUrl = true } = {}) {
  collectionForm.reset();
  collectionEntryIdField.value = "";
  collectionFormTitle.textContent = "Collect payment";
  collectionFormSubtitle.textContent = "Log what comes back first, then work through the active ledger entries underneath.";
  collectionSubmitButton.textContent = "Save ledger entry";
  populateCollectionOptions();
  if (collectionDistributionSelect.options.length) {
    collectionDistributionSelect.value = collectionDistributionSelect.options[0].value;
  }
  collectionForm.elements.action.value = "PARTIAL_PAYMENT";
  updateCollectionHint();
  mountFormError(collectionError, "");

  if (clearDraftState) {
    collectionDraft.clearDraft();
  }

  if (clearUrl) {
    requestedCollectionEditId = "";
    requestedDistributionEditId = "";
    updateUrlParams({ editCollection: "", editDistribution: "" }, ["editCollection", "editDistribution"]);
  }
}

function fillRunnerForm(distributor) {
  runnerIdField.value = distributor.id;
  runnerFormTitle.textContent = `Edit ${distributor.name}`;
  runnerFormSubtitle.textContent = "Update the saved runner details used when handing out product.";
  runnerSubmitButton.textContent = "Save runner";
  runnerForm.elements.name.value = distributor.name;
  runnerForm.elements.number.value = distributor.number;
  runnerForm.elements.active.checked = distributor.active;
}

function fillDistributionForm(distribution) {
  populateDistributionOptions();
  distributionIdField.value = distribution.id;
  distributionFormTitle.textContent = `Edit ${distribution.item.name}`;
  distributionSubmitButton.textContent = "Save changes";
  distributionForm.elements.distributorId.value = distribution.distributorId;
  distributionForm.elements.itemId.value = distribution.itemId;
  distributionForm.elements.quantity.value = distribution.quantity;
  distributionForm.elements.unitValue.value = distribution.unitValue;
  distributionForm.elements.notes.value = distribution.notes || "";

  if ((distribution.collections || []).length) {
    distributionFormSubtitle.textContent = "Collections have already started, so only the notes can be changed.";
    setDistributionLock(true);
  } else {
    distributionFormSubtitle.textContent = "Update the runner, item, quantity, or value before collections begin.";
    setDistributionLock(false);
  }

  updateDistributionTotalHint();
}

function setCollectionTarget(distribution) {
  collectionEntryIdField.value = "";
  collectionFormTitle.textContent = `Collect from ${distribution.distributor.name}`;
  collectionFormSubtitle.textContent = "Log a partial payment, full clear, or faulty clear for this active run.";
  collectionSubmitButton.textContent = "Save ledger entry";
  populateCollectionOptions();
  collectionDistributionSelect.value = distribution.id;
  collectionForm.elements.amount.value = "";
  collectionForm.elements.action.value = "PARTIAL_PAYMENT";
  collectionForm.elements.note.value = "";
  updateCollectionHint();
}

function fillCollectionForm(entry) {
  collectionEntryIdField.value = entry.id;
  collectionFormTitle.textContent = `Edit ledger entry for ${entry.distribution.distributor.name}`;
  collectionFormSubtitle.textContent = "Update this pending collection before it is deposited into Dirty Money.";
  collectionSubmitButton.textContent = "Save changes";
  populateCollectionOptions();
  collectionDistributionSelect.value = entry.distributionId;
  collectionForm.elements.amount.value = entry.amount;
  collectionForm.elements.action.value = entry.action;
  collectionForm.elements.note.value = entry.note || "";
  updateCollectionHint();
}

function openRequestedTargets() {
  if (requestedDistributorEditId) {
    const distributor = distributorsCache.find((entry) => entry.id === requestedDistributorEditId);

    if (distributor) {
      fillRunnerForm(distributor);
      focusFormPanel(runnerForm, '[name="name"]');
    } else {
      requestedDistributorEditId = "";
      updateUrlParams({ editDistributor: "" }, ["editDistributor"]);
      showToast("That runner could not be found.", "error");
    }
  }

  if (requestedCollectionEditId) {
    const entry = ledgerCache.find((item) => item.id === requestedCollectionEditId);

    if (entry) {
      fillCollectionForm(entry);
      focusFormPanel(collectionForm, '[name="amount"]');
      return;
    }

    requestedCollectionEditId = "";
    updateUrlParams({ editCollection: "" }, ["editCollection"]);
    showToast("That ledger entry could not be found.", "error");
  }

  if (requestedDistributionEditId) {
    const distribution = distributionsCache.find((entry) => entry.id === requestedDistributionEditId);

    if (!distribution) {
      requestedDistributionEditId = "";
      updateUrlParams({ editDistribution: "" }, ["editDistribution"]);
      showToast("That distribution could not be found.", "error");
      return;
    }

    if (window.location.hash === "#collectionForm") {
      setCollectionTarget(distribution);
      focusFormPanel(collectionForm, '[name="amount"]');
      return;
    }

    fillDistributionForm(distribution);
    focusFormPanel(distributionForm, '[name="quantity"]');
  }
}

function visibleDistributions() {
  let distributions = [...distributionsCache];
  const view = distributionView();

  if (view === "active") {
    distributions = distributions.filter((distribution) => OPEN_STATUSES.has(distribution.status));
  } else if (view === "partial") {
    distributions = distributions.filter((distribution) => distribution.status === "PARTIAL");
  } else if (view === "cleared") {
    distributions = distributions.filter((distribution) => distribution.status === "CLEARED");
  } else if (view === "faulty") {
    distributions = distributions.filter((distribution) => distribution.status === "FAULTY");
  }

  if (searchQuery) {
    distributions = distributions.filter((distribution) => [
      distribution.item.name,
      distribution.distributor.name,
      distribution.distributor.number,
      distribution.notes,
      distribution.status
    ].some((value) => `${value || ""}`.toLowerCase().includes(searchQuery)));
  }

  return distributions;
}

function visibleLedgerEntries() {
  let entries = ledgerCache.filter((entry) => entry.status === "PENDING");

  if (searchQuery) {
    entries = entries.filter((entry) => [
      entry.distribution.item.name,
      entry.distribution.distributor.name,
      entry.distribution.distributor.number,
      entry.action,
      entry.note
    ].some((value) => `${value || ""}`.toLowerCase().includes(searchQuery)));
  }

  return entries;
}

function selectedLedgerEntries() {
  const knownIds = new Set(
    ledgerCache
      .filter((entry) => entry.status === "PENDING" && Number(entry.amount) > 0)
      .map((entry) => entry.id)
  );
  selectedLedgerIds = new Set([...selectedLedgerIds].filter((id) => knownIds.has(id)));
  return ledgerCache.filter((entry) => selectedLedgerIds.has(entry.id));
}

function renderSummary(summary) {
  if (!summaryGrid) {
    return;
  }

  summaryGrid.innerHTML = `
    <article class="metric-card neutral">
      <p>Active runs</p>
      <strong>${summary.activeCount || 0}</strong>
      <small>Still being worked</small>
    </article>
    <article class="metric-card warn">
      <p>Outstanding</p>
      <strong>${formatCurrency(summary.outstandingTotal || 0)}</strong>
      <small>Still owed back</small>
    </article>
    <article class="metric-card accent">
      <p>Pending dirty cash</p>
      <strong>${formatCurrency(summary.pendingLedgerTotal || 0)}</strong>
      <small>${summary.pendingLedgerCount || 0} waiting to deposit</small>
    </article>
    <article class="metric-card good">
      <p>Deposited dirty cash</p>
      <strong>${formatCurrency(summary.depositedLedgerTotal || 0)}</strong>
      <small>Already moved into the bank</small>
    </article>
    <article class="metric-card neutral">
      <p>Active runners</p>
      <strong>${summary.distributorCount || 0}</strong>
      <small>Saved runner contacts</small>
    </article>
  `;
}

function renderDistributionToolbar() {
  const view = distributionView();
  const links = [
    { label: "Active", view: "active" },
    { label: "Partial", view: "partial" },
    { label: "Cleared", view: "cleared" },
    { label: "Faulty", view: "faulty" },
    { label: "All", view: "all" }
  ];

  distributionToolbar.innerHTML = `
    <div class="filter-chip-row">
      ${links.map((link) => `
        <a class="filter-chip ${view === link.view ? "active" : ""}" href="${buildPageHref("./distribution.html", { view: link.view, search: searchQuery, hash: "distributionTable" })}">${link.label}</a>
      `).join("")}
    </div>
    <div class="toolbar-actions">
      <span class="toolbar-meta">${visibleDistributions().length} shown</span>
    </div>
  `;
}

function renderDistributions() {
  const distributions = visibleDistributions();

  if (!distributions.length) {
    distributionTable.innerHTML = renderEmptyState(
      distributionsCache.length ? "No matching distributions" : "No distributions yet",
      distributionsCache.length ? "Try another filter or search term." : "Create your first distribution from the form on the left."
    );
    return;
  }

  distributionTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Runner</th>
            <th>Quantity</th>
            <th>Value</th>
            <th>Total owed</th>
            <th>Returned</th>
            <th>Remaining</th>
            <th>Status</th>
            <th>Action</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${distributions.map((distribution) => `
            <tr class="${requestedDistributionEditId === distribution.id ? "editing-row" : ""}">
              <td><strong>${distribution.item.name}</strong><span class="subtle-row">${distribution.item.unit}</span></td>
              <td><strong>${distribution.distributor.name}</strong><span class="subtle-row">${distribution.distributor.number}</span></td>
              <td>${distribution.quantity}</td>
              <td>${formatCurrency(distribution.unitValue)}</td>
              <td>${formatCurrency(distribution.totalOwed)}</td>
              <td>${formatCurrency(distribution.amountReturned)}</td>
              <td>${formatCurrency(remainingBalance(distribution))}</td>
              <td>${distributionStatusBadge(distribution.status)}</td>
              <td>
                <div class="inline-table-actions">
                  ${OPEN_STATUSES.has(distribution.status) ? `<button class="mini-action" type="button" data-collect="${distribution.id}">Collect</button>` : ""}
                  <button class="mini-action" type="button" data-edit="${distribution.id}">Edit</button>
                </div>
              </td>
              <td>${formatDate(distribution.updatedAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  distributionTable.querySelectorAll("[data-collect]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedDistributionEditId = button.dataset.collect;
      updateUrlParams({ editDistribution: requestedDistributionEditId }, ["editCollection"]);
      const distribution = distributionsCache.find((entry) => entry.id === requestedDistributionEditId);

      if (distribution) {
        setCollectionTarget(distribution);
        window.location.hash = "collectionForm";
        focusFormPanel(collectionForm, '[name="amount"]');
      }
    });
  });

  distributionTable.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedDistributionEditId = button.dataset.edit;
      updateUrlParams({ editDistribution: requestedDistributionEditId }, ["editCollection"]);
      const distribution = distributionsCache.find((entry) => entry.id === requestedDistributionEditId);

      if (distribution) {
        fillDistributionForm(distribution);
        focusFormPanel(distributionForm, '[name="quantity"]');
      }
    });
  });
}

function renderDistributors() {
  if (!distributorsCache.length) {
    distributorTable.innerHTML = renderEmptyState("No runners yet", "Create the first runner from the form above.");
    return;
  }

  distributorTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Number</th>
            <th>Status</th>
            <th>Open runs</th>
            <th>Action</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${distributorsCache.map((distributor) => {
            const openRuns = distributionsCache.filter((distribution) => distribution.distributorId === distributor.id && OPEN_STATUSES.has(distribution.status)).length;

            return `
              <tr class="${requestedDistributorEditId === distributor.id ? "editing-row" : ""}">
                <td><strong>${distributor.name}</strong></td>
                <td>${distributor.number}</td>
                <td>${activeStateBadge(distributor.active)}</td>
                <td>${openRuns}</td>
                <td>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-edit-distributor="${distributor.id}">Edit</button>
                    <button class="mini-action" type="button" data-toggle-distributor="${distributor.id}">${distributor.active ? "Pause" : "Activate"}</button>
                  </div>
                </td>
                <td>${formatDate(distributor.updatedAt)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  distributorTable.querySelectorAll("[data-edit-distributor]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedDistributorEditId = button.dataset.editDistributor;
      updateUrlParams({ editDistributor: requestedDistributorEditId });
      const distributor = distributorsCache.find((entry) => entry.id === requestedDistributorEditId);

      if (distributor) {
        fillRunnerForm(distributor);
        focusFormPanel(runnerForm, '[name="name"]');
      }
    });
  });

  distributorTable.querySelectorAll("[data-toggle-distributor]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const distributor = distributorsCache.find((entry) => entry.id === button.dataset.toggleDistributor);

        if (!distributor) {
          return;
        }

        await api(`/distribution/distributors/${distributor.id}`, {
          method: "PATCH",
          body: {
            active: !distributor.active
          }
        });
        await loadPage();
        announceMutation(["distribution"]);
        showToast("Runner status updated.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

function renderLedgerToolbar() {
  const entries = visibleLedgerEntries();
  const selectedEntries = selectedLedgerEntries();
  const selectedTotal = selectedEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const pendingTotal = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);

  ledgerToolbar.innerHTML = `
    <div class="collection-tools">
      <div class="toolbar-actions">
        <span class="toolbar-meta">${entries.length} active entries</span>
        <span class="toolbar-meta">${formatCurrency(pendingTotal)} waiting to deposit</span>
      </div>
      ${selectedEntries.length ? `
        <div class="bulk-strip">
          <span class="toolbar-meta">${selectedEntries.length} selected</span>
          <span class="toolbar-meta">Deposit ${formatCurrency(selectedTotal)}</span>
          <button class="ghost-button toolbar-button" type="button" data-deposit-selected>Deposit</button>
          <button class="ghost-button toolbar-button" type="button" data-clear-selected>Clear</button>
        </div>
      ` : ""}
    </div>
  `;

  ledgerToolbar.querySelector("[data-deposit-selected]")?.addEventListener("click", async () => {
    try {
      await api("/distribution/deposits", {
        method: "POST",
        body: {
          collectionIds: selectedEntries.map((entry) => entry.id)
        }
      });
      selectedLedgerIds = new Set();
      await loadPage();
      announceMutation(["distribution", "bank"]);
      showToast("Selected dirty cash deposited into the bank.", "success");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  ledgerToolbar.querySelector("[data-clear-selected]")?.addEventListener("click", () => {
    selectedLedgerIds = new Set();
    renderLedgerToolbar();
    renderLedgerEntries();
  });
}

function renderLedgerEntries() {
  const entries = visibleLedgerEntries();
  const allSelectable = entries.filter((entry) => Number(entry.amount) > 0);
  const allSelected = allSelectable.length && allSelectable.every((entry) => selectedLedgerIds.has(entry.id));

  if (!entries.length) {
    ledgerTable.innerHTML = renderEmptyState("No active ledger entries", "Pending collections will show here until they are deposited into Dirty Money.");
    return;
  }

  ledgerTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th class="table-select-cell">
              <input class="table-check" type="checkbox" data-select-all ${allSelected ? "checked" : ""}>
            </th>
            <th>Runner</th>
            <th>Item</th>
            <th>Action</th>
            <th>Amount</th>
            <th>Logged by</th>
            <th>Action</th>
            <th>Recorded</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry) => {
            const selectable = entry.status === "PENDING" && Number(entry.amount) > 0;

            return `
              <tr class="${requestedCollectionEditId === entry.id ? "editing-row" : ""}">
                <td class="table-select-cell">
                  ${selectable ? `<input class="table-check" type="checkbox" data-select-entry="${entry.id}" ${selectedLedgerIds.has(entry.id) ? "checked" : ""}>` : ""}
                </td>
                <td><strong>${entry.distribution.distributor.name}</strong><span class="subtle-row">${entry.distribution.distributor.number}</span></td>
                <td>${entry.distribution.item.name}</td>
                <td>${badge(humanizeCollectionAction(entry.action), entry.action === "FAULTY_CLEAR" ? "danger" : entry.action === "FULL_CLEAR" ? "good" : "warn")}</td>
                <td>${formatCurrency(entry.amount)}</td>
                <td>${entry.createdBy?.name || "System"}</td>
                <td>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-edit-entry="${entry.id}">Edit</button>
                    <button class="mini-action danger-action" type="button" data-revert-entry="${entry.id}">Revert</button>
                    <button class="mini-action" type="button" data-open-distribution="${entry.distributionId}">Open run</button>
                  </div>
                </td>
                <td>${formatDate(entry.createdAt)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  ledgerTable.querySelector("[data-select-all]")?.addEventListener("change", (event) => {
    if (event.target.checked) {
      allSelectable.forEach((entry) => selectedLedgerIds.add(entry.id));
    } else {
      entries.forEach((entry) => selectedLedgerIds.delete(entry.id));
    }

    renderLedgerToolbar();
    renderLedgerEntries();
  });

  ledgerTable.querySelectorAll("[data-select-entry]").forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.target.checked) {
        selectedLedgerIds.add(input.dataset.selectEntry);
      } else {
        selectedLedgerIds.delete(input.dataset.selectEntry);
      }

      renderLedgerToolbar();
      renderLedgerEntries();
    });
  });

  ledgerTable.querySelectorAll("[data-edit-entry]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedCollectionEditId = button.dataset.editEntry;
      updateUrlParams({ editCollection: requestedCollectionEditId }, ["editDistribution"]);
      const entry = ledgerCache.find((item) => item.id === requestedCollectionEditId);

      if (entry) {
        fillCollectionForm(entry);
        window.location.hash = "collectionForm";
        focusFormPanel(collectionForm, '[name="amount"]');
      }
    });
  });

  ledgerTable.querySelectorAll("[data-revert-entry]").forEach((button) => {
    button.addEventListener("click", async () => {
      const entry = ledgerCache.find((item) => item.id === button.dataset.revertEntry);

      if (!entry) {
        return;
      }

      const confirmed = window.confirm("Revert this ledger entry and remove it from the active collection ledger?");

      if (!confirmed) {
        return;
      }

      try {
        await api(`/distribution/collections/${entry.id}`, {
          method: "DELETE"
        });

        if (requestedCollectionEditId === entry.id || collectionEntryIdField.value === entry.id) {
          resetCollectionForm({ clearDraftState: true });
        }

        selectedLedgerIds.delete(entry.id);
        await loadPage();
        announceMutation(["distribution"]);
        showToast("Ledger entry reverted.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  ledgerTable.querySelectorAll("[data-open-distribution]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedDistributionEditId = button.dataset.openDistribution;
      updateUrlParams({ editDistribution: requestedDistributionEditId }, ["editCollection"]);
      const distribution = distributionsCache.find((entry) => entry.id === requestedDistributionEditId);

      if (distribution) {
        setCollectionTarget(distribution);
        window.location.hash = "collectionForm";
        focusFormPanel(collectionForm, '[name="amount"]');
      }
    });
  });
}

async function loadPage() {
  if (summaryGrid) {
    summaryGrid.innerHTML = renderMetricSkeleton(5);
  }
  distributionTable.innerHTML = renderTableSkeleton(10, 5);
  distributorTable.innerHTML = renderTableSkeleton(6, 5);
  ledgerTable.innerHTML = renderTableSkeleton(10, 5);
  ledgerToolbar.innerHTML = "";

  try {
    const [distributionData, options] = await Promise.all([
      api("/distribution"),
      api("/distribution/options")
    ]);

    itemsCache = options.items || [];
    distributorsCache = distributionData.distributors || options.distributors || [];
    distributionsCache = distributionData.distributions || [];
    ledgerCache = distributionData.ledgerEntries || [];

    renderSummary(distributionData.summary || {});
    populateDistributionOptions();
    populateCollectionOptions();
    restoreDraftForm(runnerForm, "runner-form-v2");
    restoreDraftForm(distributionForm, "distribution-form-v3");
    restoreDraftForm(collectionForm, "distribution-collection-form-v2");
    updateDistributionTotalHint();
    updateCollectionHint();
    renderDistributionToolbar();
    renderDistributions();
    renderDistributors();
    renderLedgerToolbar();
    renderLedgerEntries();
    openRequestedTargets();
  } catch (error) {
    if (summaryGrid) {
      summaryGrid.innerHTML = renderEmptyState("Unable to load distribution page", error.message);
    }
    distributionTable.innerHTML = "";
    distributorTable.innerHTML = "";
    ledgerTable.innerHTML = "";
    ledgerToolbar.innerHTML = "";
    showToast(error.message, "error");
  }
}

runnerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(runnerError, "");

  const payload = {
    name: runnerForm.elements.name.value,
    number: runnerForm.elements.number.value,
    active: runnerForm.elements.active.checked
  };

  try {
    if (runnerIdField.value) {
      await api(`/distribution/distributors/${runnerIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Runner updated.", "success");
    } else {
      await api("/distribution/distributors", {
        method: "POST",
        body: payload
      });
      showToast("Runner created.", "success");
    }

    resetRunnerForm({ clearDraftState: true });
    await loadPage();
    announceMutation(["distribution"]);
  } catch (error) {
    mountFormError(runnerError, error.message);
    showToast(error.message, "error");
  }
});

distributionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(distributionError, "");

  const payload = {
    notes: distributionForm.elements.notes.value
  };

  if (!distributionIdField.value || !distributionForm.elements.quantity.disabled) {
    payload.distributorId = distributionForm.elements.distributorId.value;
    payload.itemId = distributionForm.elements.itemId.value;
    payload.quantity = Number(distributionForm.elements.quantity.value || 0);
    payload.unitValue = distributionForm.elements.unitValue.value;
  }

  try {
    if (distributionIdField.value) {
      await api(`/distribution/${distributionIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Distribution updated.", "success");
    } else {
      await api("/distribution", {
        method: "POST",
        body: payload
      });
      showToast("Distribution created and stock deducted.", "success");
    }

    resetDistributionForm({ clearDraftState: true });
    await loadPage();
    announceMutation(["distribution", "inventory"]);
  } catch (error) {
    mountFormError(distributionError, error.message);
    showToast(error.message, "error");
  }
});

collectionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(collectionError, "");

  const payload = {
    distributionId: collectionDistributionSelect.value,
    amount: collectionForm.elements.amount.value,
    action: collectionForm.elements.action.value,
    note: collectionForm.elements.note.value
  };

  try {
    if (collectionEntryIdField.value) {
      await api(`/distribution/collections/${collectionEntryIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Ledger entry updated.", "success");
    } else {
      await api(`/distribution/${payload.distributionId}/collections`, {
        method: "POST",
        body: payload
      });
      showToast("Collection logged.", "success");
    }

    resetCollectionForm({ clearDraftState: true });
    await loadPage();
    announceMutation(["distribution", "bank"]);
  } catch (error) {
    mountFormError(collectionError, error.message);
    showToast(error.message, "error");
  }
});

resetRunnerButton?.addEventListener("click", () => resetRunnerForm({ clearDraftState: true }));
resetDistributionButton?.addEventListener("click", () => resetDistributionForm({ clearDraftState: true }));
resetCollectionButton?.addEventListener("click", () => resetCollectionForm({ clearDraftState: true }));

distributionForm.elements.quantity?.addEventListener("input", updateDistributionTotalHint);
distributionForm.elements.unitValue?.addEventListener("input", updateDistributionTotalHint);
collectionDistributionSelect?.addEventListener("change", () => {
  updateCollectionHint();
  syncCollectionAmount();
});
collectionForm.elements.action?.addEventListener("change", syncCollectionAmount);

subscribeToMutations(["distribution", "inventory", "bank"], () => {
  showToast("Distribution page refreshed with live changes.", "info");
  loadPage();
});

resetRunnerForm({ clearUrl: false });
resetDistributionForm({ clearUrl: false });
resetCollectionForm({ clearUrl: false });
loadPage();
