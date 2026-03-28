import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import { hasPermission } from "./session.js";
import {
  bankTransactionBadge,
  formatCurrency,
  formatDate,
  initProtectedPage,
  mountFormError,
  renderEmptyState,
  renderMetricSkeleton,
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
  pageKey: "BANK",
  title: "Bank ledger",
  subtitle: "Monitor balance changes and log manual credits or debits."
});

const summaryGrid = document.querySelector("#bankSummary");
const tableContainer = document.querySelector("#transactionTable");
const transactionForm = document.querySelector("#transactionForm");
const transactionError = document.querySelector("#transactionError");
const transactionIdField = document.querySelector("#transactionId");
const transactionFormTitle = document.querySelector("#transactionFormTitle");
const transactionFormSubtitle = document.querySelector("#transactionFormSubtitle");
const transactionSubmitButton = document.querySelector("#transactionSubmitButton");
const resetTransactionButton = document.querySelector("#resetTransactionForm");
const toolbarHost = document.createElement("div");
const initialParams = new URLSearchParams(window.location.search);
const searchQuery = (initialParams.get("search") || "").trim().toLowerCase();
const activeView = initialParams.get("view") || "";
let requestedTransactionEditId = initialParams.get("editTransaction") || "";
const transactionDraft = bindDraftForm(transactionForm, "bank-transaction");

toolbarHost.className = "collection-tools";
tableContainer.before(toolbarHost);

let hasShownFilterMessage = false;
let transactionsCache = [];
let selectedTransactionIds = new Set();

if (transactionDraft.restored) {
  showToast("Restored saved bank transaction draft.", "info");
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

function resetTransactionForm({ clearDraftState = false, clearUrl = true } = {}) {
  transactionForm.reset();
  transactionIdField.value = "";
  transactionFormTitle.textContent = "Add transaction";
  transactionFormSubtitle.textContent = "Use this for manual deposits, withdrawals, or corrections.";
  transactionSubmitButton.textContent = "Record transaction";
  mountFormError(transactionError, "");

  if (clearDraftState) {
    transactionDraft.clearDraft();
  }

  if (clearUrl) {
    requestedTransactionEditId = "";
    updateUrlParams({ editTransaction: "" }, ["editTransaction"]);
  }
}

function fillTransactionForm(transaction) {
  transactionIdField.value = transaction.id;
  transactionFormTitle.textContent = "Edit transaction";
  transactionFormSubtitle.textContent = "Update this manual ledger entry and the live balance will recalculate.";
  transactionSubmitButton.textContent = "Save transaction";
  transactionForm.elements.type.value = transaction.type;
  transactionForm.elements.amount.value = transaction.amount;
  transactionForm.elements.description.value = transaction.description || "";
}

function maybeOpenRequestedEdit() {
  if (!requestedTransactionEditId) {
    return;
  }

  const transaction = transactionsCache.find((entry) => entry.id === requestedTransactionEditId);

  if (!transaction) {
    requestedTransactionEditId = "";
    updateUrlParams({ editTransaction: "" }, ["editTransaction"]);
    showToast("That bank transaction could not be found.", "error");
    return;
  }

  if (transaction.distributionId || transaction.sourceSystem !== "manual") {
    requestedTransactionEditId = "";
    updateUrlParams({ editTransaction: "" }, ["editTransaction"]);
    showToast("That ledger entry is edited from its source system.", "info");
    return;
  }

  fillTransactionForm(transaction);
  transactionForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSummary(balance, recentTransactions) {
  summaryGrid.innerHTML = `
    <article class="metric-card good">
      <p>Current balance</p>
      <strong>${formatCurrency(balance)}</strong>
      <small>Live across all recorded transactions</small>
    </article>
    <article class="metric-card neutral">
      <p>Recent transaction count</p>
      <strong>${recentTransactions.length}</strong>
      <small>Last 5 entries</small>
    </article>
  `;
}

function getVisibleTransactions(transactions) {
  let visibleTransactions = [...transactions];

  if (activeView === "credits") {
    visibleTransactions = visibleTransactions.filter((transaction) => transaction.type === "CREDIT");
  }

  if (activeView === "debits") {
    visibleTransactions = visibleTransactions.filter((transaction) => transaction.type === "DEBIT");
  }

  if (searchQuery) {
    visibleTransactions = visibleTransactions.filter((transaction) => [
      transaction.type,
      transaction.description,
      transaction.sourceSystem,
      transaction.amount
    ].some((value) => `${value || ""}`.toLowerCase().includes(searchQuery)));
  }

  return visibleTransactions;
}

function currentViewLabel() {
  if (activeView === "credits") {
    return searchQuery ? `Credits / ${searchQuery}` : "Credits";
  }

  if (activeView === "debits") {
    return searchQuery ? `Debits / ${searchQuery}` : "Debits";
  }

  return searchQuery ? `Search / ${searchQuery}` : "All transactions";
}

function getSelectedTransactions(transactions = transactionsCache) {
  const availableIds = new Set(transactions.map((transaction) => transaction.id));
  selectedTransactionIds = new Set([...selectedTransactionIds].filter((id) => availableIds.has(id)));
  return transactions.filter((transaction) => selectedTransactionIds.has(transaction.id));
}

function rerenderBankViews() {
  renderToolbar(transactionsCache);
  renderTransactions(transactionsCache);
}

function renderToolbar(transactions) {
  const visibleTransactions = getVisibleTransactions(transactions);
  const selectedTransactions = getSelectedTransactions(transactions);
  const selectedNet = selectedTransactions.reduce((sum, transaction) => (
    transaction.type === "DEBIT" ? sum - Number(transaction.amount) : sum + Number(transaction.amount)
  ), 0);
  const savedView = loadSavedView("bank");
  const filterLinks = [
    { label: "All", href: buildPageHref("./bank.html", { hash: "transactionTable" }), active: !activeView },
    { label: "Credits", href: buildPageHref("./bank.html", { view: "credits", hash: "transactionTable" }), active: activeView === "credits" },
    { label: "Debits", href: buildPageHref("./bank.html", { view: "debits", hash: "transactionTable" }), active: activeView === "debits" }
  ];

  toolbarHost.innerHTML = `
    <div class="filter-chip-row">
      ${filterLinks.map((link) => `
        <a class="filter-chip ${link.active ? "active" : ""}" href="${link.href}">${link.label}</a>
      `).join("")}
      ${savedView ? `<a class="filter-chip saved" href="${savedView.href}">Saved: ${savedView.label}</a>` : ""}
    </div>
    <div class="toolbar-actions">
      <span class="toolbar-meta">${visibleTransactions.length} shown</span>
      <button class="ghost-button toolbar-button" type="button" data-action="save-view">Save view</button>
      ${savedView ? `<button class="ghost-button toolbar-button" type="button" data-action="clear-view">Clear saved</button>` : ""}
      <button class="ghost-button toolbar-button" type="button" data-action="export">Export CSV</button>
    </div>
    ${selectedTransactions.length ? `
      <div class="bulk-strip">
        <span class="toolbar-meta">${selectedTransactions.length} selected</span>
        <span class="toolbar-meta">Net ${formatCurrency(selectedNet)}</span>
        <button class="ghost-button toolbar-button" type="button" data-bulk-export>Export selected</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-clear>Clear</button>
      </div>
    ` : ""}
  `;

  toolbarHost.querySelector('[data-action="save-view"]')?.addEventListener("click", () => {
    saveSavedView("bank", {
      label: currentViewLabel(),
      href: buildPageHref("./bank.html", {
        view: activeView,
        search: searchQuery,
        hash: "transactionTable"
      })
    });
    showToast("Saved bank view.", "success");
    renderToolbar(transactions);
  });

  toolbarHost.querySelector('[data-action="clear-view"]')?.addEventListener("click", () => {
    clearSavedView("bank");
    showToast("Cleared saved bank view.", "info");
    renderToolbar(transactions);
  });

  toolbarHost.querySelector('[data-action="export"]')?.addEventListener("click", () => {
    downloadCsv(
      "bank-transactions.csv",
      [
        { label: "Type", value: (transaction) => transaction.type },
        { label: "Amount", value: (transaction) => transaction.amount },
        { label: "Source", value: (transaction) => transaction.sourceSystem },
        { label: "Description", value: (transaction) => transaction.description || "" },
        { label: "Created At", value: (transaction) => formatDate(transaction.createdAt) }
      ],
      visibleTransactions
    );
    showToast("Bank CSV exported.", "success");
  });

  toolbarHost.querySelector("[data-bulk-export]")?.addEventListener("click", () => {
    downloadCsv(
      "bank-selected-transactions.csv",
      [
        { label: "Type", value: (transaction) => transaction.type },
        { label: "Amount", value: (transaction) => transaction.amount },
        { label: "Source", value: (transaction) => transaction.sourceSystem },
        { label: "Description", value: (transaction) => transaction.description || "" },
        { label: "Created At", value: (transaction) => formatDate(transaction.createdAt) }
      ],
      selectedTransactions
    );
    showToast("Selected bank transactions exported.", "success");
  });

  toolbarHost.querySelector("[data-bulk-clear]")?.addEventListener("click", () => {
    selectedTransactionIds = new Set();
    rerenderBankViews();
  });
}

function renderTransactions(transactions) {
  const visibleTransactions = getVisibleTransactions(transactions);
  const allVisibleSelected = visibleTransactions.length
    && visibleTransactions.every((transaction) => selectedTransactionIds.has(transaction.id));

  if (!visibleTransactions.length) {
    tableContainer.innerHTML = renderEmptyState(
      transactions.length ? "No matching transactions" : "No transactions yet",
      transactions.length
        ? "Try a broader search from the dashboard or header search."
        : "Use the form on this page to add your first credit or debit."
    );
    return;
  }

  if (!hasShownFilterMessage && (searchQuery || activeView)) {
    const filterParts = [];

    if (activeView === "credits") {
      filterParts.push("credits");
    }

    if (activeView === "debits") {
      filterParts.push("debits");
    }

    if (searchQuery) {
      filterParts.push(`search "${searchQuery}"`);
    }

    showToast(`Showing ${filterParts.join(" + ")} bank view.`, "info");
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
            <th>Type</th>
            <th>Amount</th>
            <th>Source</th>
            <th>Description</th>
            <th>Action</th>
            <th>Recorded</th>
          </tr>
        </thead>
        <tbody>
          ${visibleTransactions.map((transaction) => `
            <tr class="${selectedTransactionIds.has(transaction.id) ? "selected-row" : ""} ${requestedTransactionEditId === transaction.id ? "editing-row" : ""}">
              <td class="table-select-cell">
                <input class="table-check" type="checkbox" data-select-transaction="${transaction.id}" ${selectedTransactionIds.has(transaction.id) ? "checked" : ""}>
              </td>
              <td>${bankTransactionBadge(transaction.type)}</td>
              <td>${formatCurrency(transaction.amount)}</td>
              <td>${transaction.sourceSystem}</td>
              <td>${transaction.description || "No description"}</td>
              <td>
                <div class="inline-table-actions">
                  ${transaction.distributionId
                    ? hasPermission("DISTRIBUTION")
                      ? `<a class="mini-action" href="./distribution.html?editDistribution=${transaction.distributionId}#distributionForm">Open source</a>`
                      : `<span class="badge neutral">Linked entry</span>`
                    : transaction.sourceSystem === "manual"
                      ? `<button class="mini-action" type="button" data-edit-transaction="${transaction.id}">Edit</button>`
                      : ""}
                </div>
              </td>
              <td>${formatDate(transaction.createdAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  tableContainer.querySelectorAll("[data-edit-transaction]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedTransactionEditId = button.dataset.editTransaction;
      updateUrlParams({ editTransaction: requestedTransactionEditId });
      const transaction = transactionsCache.find((entry) => entry.id === requestedTransactionEditId);

      if (transaction) {
        fillTransactionForm(transaction);
        transactionForm.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  tableContainer.querySelector("[data-select-all]")?.addEventListener("change", (event) => {
    if (event.target.checked) {
      visibleTransactions.forEach((transaction) => selectedTransactionIds.add(transaction.id));
    } else {
      visibleTransactions.forEach((transaction) => selectedTransactionIds.delete(transaction.id));
    }

    rerenderBankViews();
  });

  tableContainer.querySelectorAll("[data-select-transaction]").forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.target.checked) {
        selectedTransactionIds.add(input.dataset.selectTransaction);
      } else {
        selectedTransactionIds.delete(input.dataset.selectTransaction);
      }

      rerenderBankViews();
    });
  });
}

async function loadBank() {
  summaryGrid.innerHTML = renderMetricSkeleton(2);
  tableContainer.innerHTML = renderTableSkeleton(7, 6);

  try {
    const [{ balance, recentTransactions }, { transactions }] = await Promise.all([
      api("/bank/summary"),
      api("/bank/transactions")
    ]);

    transactionsCache = transactions;
    getSelectedTransactions(transactionsCache);
    renderSummary(balance, recentTransactions);
    rerenderBankViews();
    maybeOpenRequestedEdit();
  } catch (error) {
    summaryGrid.innerHTML = renderEmptyState("Unable to load bank summary", error.message);
    tableContainer.innerHTML = "";
    showToast(error.message, "error");
  }
}

transactionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(transactionError, "");

  const editingTransactionId = transactionIdField.value;
  const formData = new FormData(transactionForm);
  const payload = {
    type: formData.get("type"),
    amount: Number(formData.get("amount") || 0),
    description: formData.get("description")
  };

  try {
    if (editingTransactionId) {
      await api(`/bank/transactions/${editingTransactionId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Bank transaction updated.", "success");
    } else {
      await api("/bank/transactions", {
        method: "POST",
        body: payload
      });
      showToast("Bank transaction recorded.", "success");
    }

    resetTransactionForm({ clearDraftState: true });
    await loadBank();
    announceMutation(["bank"]);
  } catch (error) {
    mountFormError(transactionError, error.message);
    showToast(error.message, "error");
  }
});

resetTransactionButton?.addEventListener("click", () => {
  resetTransactionForm({ clearDraftState: true });
});

subscribeToMutations(["bank", "distribution"], () => {
  showToast("Live update received for the bank ledger.", "info");
  loadBank();
});

resetTransactionForm({ clearUrl: false });
restoreDraftForm(transactionForm, "bank-transaction");
loadBank();
