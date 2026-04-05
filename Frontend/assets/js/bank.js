import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  bankMoneyBadge,
  bankTransactionBadge,
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
  subtitle: "Track clean and dirty money with simple add, correction, and subtract entries."
});

const summaryGrid = document.querySelector("#bankSummary");
const tableContainer = document.querySelector("#transactionTable");
const paginationContainer = document.querySelector("#transactionPagination");
const transactionForm = document.querySelector("#transactionForm");
const transactionError = document.querySelector("#transactionError");
const transactionIdField = document.querySelector("#transactionId");
const transactionFormTitle = document.querySelector("#transactionFormTitle");
const transactionFormSubtitle = document.querySelector("#transactionFormSubtitle");
const transactionSubmitButton = document.querySelector("#transactionSubmitButton");
const resetTransactionButton = document.querySelector("#resetTransactionForm");
const transactionAmountHint = document.querySelector("#transactionAmountHint");
const openTransactionFormButton = document.querySelector("#openTransactionFormButton");
const transactionFormHost = document.querySelector("#transactionFormHost");
const transactionFormContent = document.querySelector("#transactionFormContent");
const toolbarHost = document.createElement("div");
const initialParams = new URLSearchParams(window.location.search);
const searchQuery = (initialParams.get("search") || "").trim().toLowerCase();
const activeView = initialParams.get("view") || "";
let currentPage = Number.parseInt(initialParams.get("page") || "1", 10);
let requestedTransactionEditId = initialParams.get("editTransaction") || "";
const transactionDraft = bindDraftForm(transactionForm, "bank-transaction");
const pageSize = 12;

toolbarHost.className = "collection-tools";
tableContainer.before(toolbarHost);

let hasShownFilterMessage = false;
let transactionsCache = [];
let selectedTransactionIds = new Set();
let paginationState = { page: 1, totalPages: 1, total: 0, pageSize };

if (!Number.isFinite(currentPage) || currentPage < 1) {
  currentPage = 1;
}

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
  transactionFormSubtitle.textContent = "Use add to stack money on top, correction to set an exact balance, or subtract to take money away.";
  transactionSubmitButton.textContent = "Record transaction";
  transactionForm.elements.moneyType.value = "CLEAN";
  transactionForm.elements.entryType.value = "ADD";
  updateAmountHint();
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
  transactionFormSubtitle.textContent = "Update this manual ledger entry and the live clean/dirty balances will recalculate.";
  transactionSubmitButton.textContent = "Save transaction";
  mountFormError(transactionError, "");
  transactionForm.elements.moneyType.value = transaction.moneyType || "CLEAN";
  transactionForm.elements.entryType.value = transaction.entryType || "CORRECTION";
  transactionForm.elements.amount.value = transaction.amount;
  transactionForm.elements.description.value = transaction.description || "";
  updateAmountHint();
}

function showTransactionModal(opener = document.activeElement) {
  openFormModal({
    content: transactionFormContent,
    host: transactionFormHost,
    focusSelector: '[name="amount"]',
    opener,
    onClose: () => {
      if (requestedTransactionEditId) {
        requestedTransactionEditId = "";
        updateUrlParams({ editTransaction: "" }, ["editTransaction"]);
      }
    }
  });
}

function updateAmountHint() {
  if (!transactionAmountHint) {
    return;
  }

  const entryType = `${transactionForm.elements.entryType.value || ""}`.toUpperCase();
  transactionAmountHint.textContent = entryType === "SUBTRACT"
    ? "Subtract removes this amount from the selected money balance."
    : entryType === "ADD"
      ? "Add increases the selected money balance by this amount."
      : "Correction sets the selected money balance to this exact amount, even if that amount is 0.";
}

function maybeOpenRequestedEdit() {
  if (!requestedTransactionEditId) {
    return;
  }

  const transaction = transactionsCache.find((entry) => entry.id === requestedTransactionEditId);

  if (!transaction) {
    requestedTransactionEditId = "";
    updateUrlParams({ editTransaction: "" }, ["editTransaction"]);
    showToast("That bank transaction could not be found on this page.", "error");
    return;
  }

  if (transaction.distributionId || !["manual", "manual_addition", "manual_correction"].includes(transaction.sourceSystem)) {
    requestedTransactionEditId = "";
    updateUrlParams({ editTransaction: "" }, ["editTransaction"]);
    showToast("That ledger entry is edited from its source system.", "info");
    return;
  }

  fillTransactionForm(transaction);
  showTransactionModal();
}

function renderSummary(balances, recentTransactions) {
  summaryGrid.innerHTML = `
    <article class="metric-card good">
      <p>Clean money</p>
      <strong>${formatCurrency(balances.clean)}</strong>
      <small>Live clean balance</small>
    </article>
    <article class="metric-card accent">
      <p>Dirty money</p>
      <strong>${formatCurrency(balances.dirty)}</strong>
      <small>Live dirty balance</small>
    </article>
  `;
}

function buildTransactionSourceHref(transaction) {
  if (transaction.sourceSystem === "distribution_deposit") {
    return "./distribution.html#distributionLedgerTable";
  }

  if (transaction.distributionId) {
    return `./bank.html?search=${encodeURIComponent(transaction.description || transaction.moneyType)}#transactionTable`;
  }

  if (["manual", "manual_addition", "manual_correction"].includes(transaction.sourceSystem)) {
    return `./bank.html?editTransaction=${transaction.id}#transactionForm`;
  }

  return "";
}

function describeSource(transaction) {
  if (transaction.sourceSystem === "distribution_deposit") {
    const linkedCount = transaction.depositedCollections?.length || 0;
    return linkedCount ? `Distribution deposit - ${linkedCount} ledger ${linkedCount === 1 ? "entry" : "entries"}` : "Distribution deposit";
  }

  if (["manual", "manual_addition", "manual_correction"].includes(transaction.sourceSystem)) {
    return "Manual entry";
  }

  return transaction.sourceSystem;
}

function getSelectedTransactions(transactions = transactionsCache) {
  const availableIds = new Set(transactions.map((transaction) => transaction.id));
  selectedTransactionIds = new Set([...selectedTransactionIds].filter((id) => availableIds.has(id)));
  return transactions.filter((transaction) => selectedTransactionIds.has(transaction.id));
}

function rerenderBankViews() {
  renderToolbar(transactionsCache);
  renderTransactions(transactionsCache, paginationState);
  renderPagination(paginationState);
}

function currentViewLabel() {
  if (activeView === "clean") {
    return searchQuery ? `Clean / ${searchQuery}` : "Clean money";
  }

  if (activeView === "dirty") {
    return searchQuery ? `Dirty / ${searchQuery}` : "Dirty money";
  }

  if (activeView === "subtract") {
    return searchQuery ? `Subtract / ${searchQuery}` : "Subtract entries";
  }

  return searchQuery ? `Search / ${searchQuery}` : "All transactions";
}

function buildQuery() {
  const params = new URLSearchParams({
    page: `${currentPage}`,
    pageSize: `${pageSize}`
  });

  if (searchQuery) {
    params.set("q", searchQuery);
  }

  if (activeView === "clean") {
    params.set("moneyType", "CLEAN");
  }

  if (activeView === "dirty") {
    params.set("moneyType", "DIRTY");
  }

  if (activeView === "subtract") {
    params.set("entryType", "SUBTRACT");
  }

  return params.toString();
}

function renderToolbar(transactions) {
  const selectedTransactions = getSelectedTransactions(transactions);
  const selectedNet = selectedTransactions.reduce((sum, transaction) => (
    transaction.entryType === "SUBTRACT" ? sum - Number(transaction.amount) : sum + Number(transaction.amount)
  ), 0);
  const savedView = loadSavedView("bank");
  const filterLinks = [
    { label: "All", href: buildPageHref("./bank.html", { hash: "transactionTable" }), active: !activeView },
    { label: "Clean", href: buildPageHref("./bank.html", { view: "clean", hash: "transactionTable" }), active: activeView === "clean" },
    { label: "Dirty", href: buildPageHref("./bank.html", { view: "dirty", hash: "transactionTable" }), active: activeView === "dirty" },
    { label: "Subtract", href: buildPageHref("./bank.html", { view: "subtract", hash: "transactionTable" }), active: activeView === "subtract" }
  ];

  toolbarHost.innerHTML = `
    <div class="filter-chip-row">
      ${filterLinks.map((link) => `
        <a class="filter-chip ${link.active ? "active" : ""}" href="${link.href}">${link.label}</a>
      `).join("")}
      ${savedView ? `<a class="filter-chip saved" href="${savedView.href}">Saved: ${savedView.label}</a>` : ""}
    </div>
    <div class="toolbar-actions">
      <span class="toolbar-meta">${paginationState.total} total</span>
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
        { label: "Money Type", value: (transaction) => transaction.moneyType },
        { label: "Function", value: (transaction) => transaction.entryType },
        { label: "Amount", value: (transaction) => transaction.amount },
        { label: "User", value: (transaction) => transaction.createdBy?.name || "System" },
        { label: "Source", value: (transaction) => transaction.sourceSystem },
        { label: "Description", value: (transaction) => transaction.description || "" },
        { label: "Created At", value: (transaction) => formatDate(transaction.createdAt) }
      ],
      transactions
    );
    showToast("Bank CSV exported.", "success");
  });

  toolbarHost.querySelector("[data-bulk-export]")?.addEventListener("click", () => {
    downloadCsv(
      "bank-selected-transactions.csv",
      [
        { label: "Money Type", value: (transaction) => transaction.moneyType },
        { label: "Function", value: (transaction) => transaction.entryType },
        { label: "Amount", value: (transaction) => transaction.amount },
        { label: "User", value: (transaction) => transaction.createdBy?.name || "System" },
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

function renderTransactions(transactions, pagination) {
  const allVisibleSelected = transactions.length
    && transactions.every((transaction) => selectedTransactionIds.has(transaction.id));

  if (!transactions.length) {
    tableContainer.innerHTML = renderEmptyState(
      pagination.total ? "No matching transactions on this page" : "No transactions yet",
      pagination.total
        ? "Try another page or a broader filter."
        : "Use the new ledger entry button on this page to add the first clean or dirty money record."
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
            <th>Money type</th>
            <th>Function</th>
            <th>Amount</th>
            <th>User</th>
            <th>Source</th>
            <th>Description</th>
            <th>Action</th>
            <th>Recorded</th>
          </tr>
        </thead>
        <tbody>
          ${transactions.map((transaction) => `
            <tr class="${selectedTransactionIds.has(transaction.id) ? "selected-row" : ""} ${requestedTransactionEditId === transaction.id ? "editing-row" : ""}">
              <td class="table-select-cell">
                <input class="table-check" type="checkbox" data-select-transaction="${transaction.id}" ${selectedTransactionIds.has(transaction.id) ? "checked" : ""}>
              </td>
              <td>${bankMoneyBadge(transaction.moneyType)}</td>
              <td>${bankTransactionBadge(transaction.entryType, transaction.entryType === "SUBTRACT" ? "Subtract" : transaction.entryType === "ADD" ? "Add" : "Correction")}</td>
              <td>
                <div class="ledger-row">
                  <strong class="ledger-amount">${formatCurrency(transaction.amount)}</strong>
                </div>
              </td>
              <td>${transaction.createdBy?.name || "System"}</td>
              <td>${describeSource(transaction)}</td>
              <td>${transaction.description || "No description"}</td>
              <td>
                <div class="inline-table-actions">
                  ${["manual", "manual_addition", "manual_correction"].includes(transaction.sourceSystem) && !transaction.distributionId
                    ? `
                      <button class="mini-action" type="button" data-edit-transaction="${transaction.id}">Edit</button>
                      <button class="mini-action danger-action" type="button" data-revert-transaction="${transaction.id}">Revert</button>
                    `
                    : transaction.sourceSystem === "distribution_deposit"
                      ? `
                        <a class="mini-action" href="${buildTransactionSourceHref(transaction)}">Open distribution</a>
                        <button class="mini-action danger-action" type="button" data-revert-transaction="${transaction.id}">Revert deposit</button>
                      `
                      : buildTransactionSourceHref(transaction)
                        ? `<a class="mini-action" href="${buildTransactionSourceHref(transaction)}">${transaction.sourceSystem === "distribution_deposit" ? "Open ledger" : "View entry"}</a>`
                      : `<span class="badge neutral">System entry</span>`}
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
        showTransactionModal(button);
      }
    });
  });

  tableContainer.querySelectorAll("[data-revert-transaction]").forEach((button) => {
    button.addEventListener("click", async () => {
      const transaction = transactionsCache.find((entry) => entry.id === button.dataset.revertTransaction);

      if (!transaction) {
        return;
      }

      const isDeposit = transaction.sourceSystem === "distribution_deposit";
      const confirmed = window.confirm(
        isDeposit
          ? "Revert this dirty money deposit and move its ledger entries back into the distribution ledger?"
          : "Revert this manual bank entry?"
      );

      if (!confirmed) {
        return;
      }

      try {
        await api(`/bank/transactions/${transaction.id}/revert`, {
          method: "POST"
        });

        if (requestedTransactionEditId === transaction.id || transactionIdField.value === transaction.id) {
          resetTransactionForm({ clearDraftState: true });
          closeFormModal();
        }

        currentPage = 1;
        updateUrlParams({ page: "1", editTransaction: "" }, ["editTransaction"]);
        await loadBank();
        announceMutation(isDeposit ? ["bank", "distribution"] : ["bank"]);
        showToast(
          isDeposit ? "Deposit reverted. Those ledger entries are editable again from Distribution." : "Bank entry reverted.",
          "success"
        );
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  tableContainer.querySelector("[data-select-all]")?.addEventListener("change", (event) => {
    if (event.target.checked) {
      transactions.forEach((transaction) => selectedTransactionIds.add(transaction.id));
    } else {
      transactions.forEach((transaction) => selectedTransactionIds.delete(transaction.id));
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

function renderPagination(pagination) {
  if (!paginationContainer) {
    return;
  }

  if (pagination.totalPages <= 1) {
    paginationContainer.innerHTML = pagination.total
      ? `<span class="pager-label">${pagination.total} total entries</span>`
      : "";
    return;
  }

  paginationContainer.innerHTML = `
    <span class="pager-label">Page ${pagination.page} of ${pagination.totalPages}</span>
    <button class="ghost-button pager-button" type="button" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Prev</button>
    <button class="ghost-button pager-button" type="button" data-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
  `;

  paginationContainer.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextPage = Number(button.dataset.page);

      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > pagination.totalPages) {
        return;
      }

      currentPage = nextPage;
      updateUrlParams({ page: `${currentPage}` });
      await loadBank();
    });
  });
}

async function loadBank() {
  summaryGrid.innerHTML = renderMetricSkeleton(2);
  tableContainer.innerHTML = renderTableSkeleton(9, 6);
  if (paginationContainer) {
    paginationContainer.innerHTML = "";
  }

  try {
    const [{ balances, recentTransactions }, { transactions, pagination }] = await Promise.all([
      api("/bank/summary"),
      api(`/bank/transactions?${buildQuery()}`)
    ]);

    if (pagination && currentPage > pagination.totalPages) {
      currentPage = pagination.totalPages;
      updateUrlParams({ page: `${currentPage}` });
      await loadBank();
      return;
    }

    transactionsCache = transactions || [];
    paginationState = pagination || paginationState;
    getSelectedTransactions(transactionsCache);
    renderSummary(balances, recentTransactions || []);
    rerenderBankViews();
    maybeOpenRequestedEdit();
  } catch (error) {
    summaryGrid.innerHTML = renderEmptyState("Unable to load bank summary", error.message);
    tableContainer.innerHTML = "";
    if (paginationContainer) {
      paginationContainer.innerHTML = "";
    }
    showToast(error.message, "error");
  }
}

transactionForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(transactionError, "");

  const editingTransactionId = transactionIdField.value;
  const formData = new FormData(transactionForm);
  const payload = {
    moneyType: formData.get("moneyType"),
    entryType: formData.get("entryType"),
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

    currentPage = 1;
    updateUrlParams({ page: "1", editTransaction: "" }, ["editTransaction"]);
    resetTransactionForm({ clearDraftState: true });
    closeFormModal();
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

openTransactionFormButton?.addEventListener("click", () => {
  resetTransactionForm();
  showTransactionModal(openTransactionFormButton);
});

transactionForm?.elements.entryType?.addEventListener("change", updateAmountHint);

subscribeToMutations(["bank", "distribution"], () => {
  showToast("Live update received for the bank ledger.", "info");
  loadBank();
});

resetTransactionForm({ clearUrl: false });
restoreDraftForm(transactionForm, "bank-transaction");
updateAmountHint();
loadBank();
