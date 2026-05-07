import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
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

initProtectedPage({
  pageKey: "PRICE_LIST",
  title: "Price list and calculator",
  subtitle: "Keep one shared market list live for the whole team, then build and adjust deals underneath it without leaving the page.",
  requiredPermission: null
});

const priceTableContainer = document.querySelector("#priceTable");
const calculatorRowsContainer = document.querySelector("#calculatorRows");
const quoteSummaryContainer = document.querySelector("#quoteSummary");
const saleCalculatorPanel = document.querySelector("#saleCalculatorPanel");
const openPriceItemFormButton = document.querySelector("#openPriceItemFormButton");
const addCalculatorRowButton = document.querySelector("#addCalculatorRowButton");
const resetCalculatorButton = document.querySelector("#resetCalculatorButton");
const manualQuoteOverrideInput = document.querySelector("#manualQuoteOverride");

const priceItemForm = document.querySelector("#priceItemForm");
const priceItemFormHost = document.querySelector("#priceItemFormHost");
const priceItemFormContent = document.querySelector("#priceItemFormContent");
const priceItemFormTitle = document.querySelector("#priceItemFormTitle");
const priceItemFormSubtitle = document.querySelector("#priceItemFormSubtitle");
const priceItemError = document.querySelector("#priceItemError");
const priceItemSubmitButton = document.querySelector("#priceItemSubmitButton");
const resetPriceItemFormButton = document.querySelector("#resetPriceItemForm");
const deletePriceItemButton = document.querySelector("#deletePriceItemButton");
const priceItemIdField = document.querySelector("#priceItemId");

const pageParams = new URLSearchParams(window.location.search);
let requestedEditPriceItemId = pageParams.get("editPriceItem") || "";
let priceItemsCache = [];
let calculatorRows = [];

function escapeHtml(value) {
  return `${value ?? ""}`
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
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

function formatQuantity(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function createRowId() {
  return typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `row-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseWholeNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function parseMoney(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function buildCalculatorRow(seed = {}) {
  return {
    id: seed.id || createRowId(),
    itemId: seed.itemId || "",
    itemName: seed.itemName || "",
    quantity: Number.isInteger(seed.quantity) ? Math.max(0, seed.quantity) : 0,
    unitPrice: Number.isFinite(seed.unitPrice) ? Math.max(0, Number(seed.unitPrice)) : 0,
    priceMode: seed.priceMode || (seed.itemId ? "list" : "manual")
  };
}

function ensureCalculatorRows() {
  if (!calculatorRows.length) {
    calculatorRows = [buildCalculatorRow()];
  }
}

function getPriceItemById(itemId) {
  return priceItemsCache.find((item) => item.id === itemId) || null;
}

function getCalculatorRowById(rowId) {
  return calculatorRows.find((row) => row.id === rowId) || null;
}

function getLineTotal(row) {
  return Number(row.quantity || 0) * Number(row.unitPrice || 0);
}

function syncCalculatorRowsWithPriceList() {
  calculatorRows = calculatorRows.map((row) => {
    const item = getPriceItemById(row.itemId);

    if (!item) {
      return row.itemId
        ? {
          ...row,
          priceMode: "manual"
        }
        : row;
    }

    return {
      ...row,
      itemName: item.name,
      unitPrice: row.priceMode === "list" ? Number(item.unitPrice || 0) : Number(row.unitPrice || 0)
    };
  });

  ensureCalculatorRows();
}

function resetPriceItemForm({ clearUrl = true } = {}) {
  priceItemForm.reset();
  priceItemIdField.value = "";
  priceItemFormTitle.textContent = "Add priced item";
  priceItemFormSubtitle.textContent = "Set the shared value here so everyone can quote from the same market number.";
  priceItemSubmitButton.textContent = "Save item";
  deletePriceItemButton?.classList.add("hidden");
  mountFormError(priceItemError, "");

  if (clearUrl) {
    requestedEditPriceItemId = "";
    updateUrlParams({}, ["editPriceItem"]);
  }
}

function fillPriceItemForm(item) {
  priceItemIdField.value = item.id;
  priceItemFormTitle.textContent = `Edit ${item.name}`;
  priceItemFormSubtitle.textContent = "Change the live shared market value here. Everyone using the calculator will be working from this number.";
  priceItemSubmitButton.textContent = "Save changes";
  priceItemForm.elements.name.value = item.name;
  priceItemForm.elements.unitPrice.value = Number(item.unitPrice || 0).toFixed(2);
  deletePriceItemButton?.classList.remove("hidden");
  mountFormError(priceItemError, "");
}

function showPriceItemModal(opener = document.activeElement) {
  openFormModal({
    content: priceItemFormContent,
    host: priceItemFormHost,
    focusSelector: '[name="name"]',
    opener,
    onClose: () => {
      if (requestedEditPriceItemId) {
        requestedEditPriceItemId = "";
        updateUrlParams({}, ["editPriceItem"]);
      }
    }
  });
}

function maybeOpenRequestedEdit() {
  if (!requestedEditPriceItemId) {
    return;
  }

  const item = getPriceItemById(requestedEditPriceItemId);

  if (!item) {
    requestedEditPriceItemId = "";
    updateUrlParams({}, ["editPriceItem"]);
    showToast("That price list item could not be found.", "error");
    return;
  }

  fillPriceItemForm(item);
  showPriceItemModal();
}

function renderPriceTable() {
  if (!priceTableContainer) {
    return;
  }

  if (!priceItemsCache.length) {
    priceTableContainer.innerHTML = renderEmptyState(
      "No priced items yet",
      "Add the first item above and the shared calculator will start working from it straight away."
    );
    return;
  }

  priceTableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Price per item</th>
            <th>Last updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${priceItemsCache.map((item) => `
            <tr class="${requestedEditPriceItemId === item.id ? "editing-row" : ""}">
              <td>
                <strong>${escapeHtml(item.name)}</strong>
                <span class="subtle-row">Shared live value for quoting and deal building</span>
              </td>
              <td>
                <strong>${formatCurrency(item.unitPrice)}</strong>
                <span class="subtle-row">Per item</span>
              </td>
              <td>
                <strong>${formatDate(item.updatedAt)}</strong>
                <span class="subtle-row">Created ${formatDate(item.createdAt)}</span>
              </td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-add-price-item="${item.id}">Add to calculator</button>
                  <button class="mini-action" type="button" data-edit-price-item="${item.id}">Edit</button>
                  <button class="mini-action danger-action" type="button" data-delete-price-item="${item.id}">Delete</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  priceTableContainer.querySelectorAll("[data-add-price-item]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = getPriceItemById(button.dataset.addPriceItem);

      if (!item) {
        showToast("That price list item could not be found.", "error");
        return;
      }

      addItemToCalculator(item);
    });
  });

  priceTableContainer.querySelectorAll("[data-edit-price-item]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedEditPriceItemId = button.dataset.editPriceItem;
      updateUrlParams({ editPriceItem: requestedEditPriceItemId });
      const item = getPriceItemById(button.dataset.editPriceItem);

      if (!item) {
        showToast("That price list item could not be found.", "error");
        return;
      }

      fillPriceItemForm(item);
      showPriceItemModal(button);
    });
  });

  priceTableContainer.querySelectorAll("[data-delete-price-item]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await deletePriceItem(button.dataset.deletePriceItem, button);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

function buildItemOptions(row) {
  const options = ['<option value="">Choose an item from the price list</option>'];
  const selectedItem = getPriceItemById(row.itemId);

  if (!selectedItem && row.itemName) {
    options.push(`<option value="${escapeHtml(row.itemId || "")}" selected>${escapeHtml(`${row.itemName} (removed from list)`)}</option>`);
  }

  options.push(
    ...priceItemsCache.map((item) => `
      <option value="${escapeHtml(item.id)}" ${item.id === row.itemId ? "selected" : ""}>
        ${escapeHtml(item.name)} - ${formatCurrency(item.unitPrice)}
      </option>
    `)
  );

  return options.join("");
}

function getPriceModeCopy(row) {
  const item = getPriceItemById(row.itemId);

  if (item) {
    return row.priceMode === "manual"
      ? "Manual price override active"
      : "Using the shared list price";
  }

  return row.itemName
    ? "This line keeps its last manual price because the saved list item was removed"
    : "Pick an item to pull in the saved price";
}

function updateRowTotalDisplay(row) {
  const totalElement = calculatorRowsContainer?.querySelector(`[data-line-total-value="${row.id}"]`);
  const noteElement = calculatorRowsContainer?.querySelector(`[data-line-total-note="${row.id}"]`);

  if (totalElement) {
    totalElement.textContent = formatCurrency(getLineTotal(row));
  }

  if (noteElement) {
    noteElement.textContent = getPriceModeCopy(row);
  }
}

function renderCalculatorRows() {
  if (!calculatorRowsContainer) {
    return;
  }

  ensureCalculatorRows();

  calculatorRowsContainer.innerHTML = calculatorRows.map((row, index) => {
    const item = getPriceItemById(row.itemId);
    const lineTotal = getLineTotal(row);
    const priceModeCopy = getPriceModeCopy(row);

    return `
      <article class="activity-card price-quote-row">
        <div class="price-quote-row-copy">
          <strong>Line ${index + 1}${row.itemName ? ` - ${escapeHtml(row.itemName)}` : ""}</strong>
          <p>Choose the item, set the quantity, and adjust the price only if the real deal needs a manual override.</p>
        </div>

        <div class="stack-form">
          <label class="field-stack">
            <span>Item</span>
            <select data-row-id="${escapeHtml(row.id)}" data-field="itemId">
              ${buildItemOptions(row)}
            </select>
          </label>

          <label class="field-stack">
            <span>Quantity</span>
            <input
              type="number"
              min="0"
              step="1"
              value="${escapeHtml(row.quantity)}"
              data-row-id="${escapeHtml(row.id)}"
              data-field="quantity"
            >
          </label>

          <label class="field-stack">
            <span>Unit price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value="${escapeHtml(Number(row.unitPrice || 0).toFixed(2))}"
              data-row-id="${escapeHtml(row.id)}"
              data-field="unitPrice"
            >
          </label>

          <div class="price-line-total">
            <span>Line total</span>
            <strong data-line-total-value="${escapeHtml(row.id)}">${formatCurrency(lineTotal)}</strong>
            <small data-line-total-note="${escapeHtml(row.id)}">${escapeHtml(priceModeCopy)}</small>
          </div>

          <div class="inline-actions">
            <button
              class="ghost-button"
              type="button"
              data-row-action="use-list-price"
              data-row-id="${escapeHtml(row.id)}"
              ${item ? "" : "disabled"}
            >Use list price</button>
            <button
              class="ghost-button"
              type="button"
              data-row-action="remove-row"
              data-row-id="${escapeHtml(row.id)}"
              ${calculatorRows.length === 1 ? "disabled" : ""}
            >Remove row</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function renderQuoteSummary() {
  if (!quoteSummaryContainer) {
    return;
  }

  const totalUnits = calculatorRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const quotedLines = calculatorRows.filter((row) => row.itemId || row.itemName).length;
  const calculatedTotal = calculatorRows.reduce((sum, row) => sum + getLineTotal(row), 0);
  const manualOverrideActive = manualQuoteOverrideInput?.value !== "";
  const finalTotal = manualOverrideActive ? parseMoney(manualQuoteOverrideInput.value) : calculatedTotal;

  quoteSummaryContainer.innerHTML = `
    <div class="metric-grid">
      <article class="metric-card neutral">
        <p>Items in quote</p>
        <strong>${quotedLines}</strong>
        <small>How many separate priced lines are in this deal</small>
      </article>
      <article class="metric-card neutral">
        <p>Total units</p>
        <strong>${formatQuantity(totalUnits)}</strong>
        <small>Combined quantity across the whole quote</small>
      </article>
      <article class="metric-card good">
        <p>Calculated total</p>
        <strong>${formatCurrency(calculatedTotal)}</strong>
        <small>Pure total from the saved or line-level unit prices</small>
      </article>
      <article class="metric-card accent">
        <p>Final quote</p>
        <strong>${formatCurrency(finalTotal)}</strong>
        <small>${manualOverrideActive ? "Manual final total override is active" : "Using the calculated total with no final override"}</small>
      </article>
    </div>
  `;
}

function rerenderCalculator() {
  syncCalculatorRowsWithPriceList();
  renderCalculatorRows();
  renderQuoteSummary();
}

function addItemToCalculator(item, { showToastMessage = true } = {}) {
  const existingBlankRow = calculatorRows.find((row) => !row.itemId && !row.itemName && Number(row.unitPrice || 0) === 0);

  if (existingBlankRow) {
    existingBlankRow.itemId = item.id;
    existingBlankRow.itemName = item.name;
    existingBlankRow.unitPrice = Number(item.unitPrice || 0);
    existingBlankRow.priceMode = "list";
    existingBlankRow.quantity = existingBlankRow.quantity || 1;
  } else {
    calculatorRows.push(buildCalculatorRow({
      itemId: item.id,
      itemName: item.name,
      unitPrice: Number(item.unitPrice || 0),
      quantity: 1,
      priceMode: "list"
    }));
  }

  rerenderCalculator();
  saleCalculatorPanel?.scrollIntoView({ behavior: "smooth", block: "start" });

  if (showToastMessage) {
    showToast(`${item.name} added to the calculator.`, "success");
  }
}

function resetCalculator() {
  calculatorRows = [buildCalculatorRow()];

  if (manualQuoteOverrideInput) {
    manualQuoteOverrideInput.value = "";
  }

  rerenderCalculator();
}

async function deletePriceItem(itemId, opener = document.activeElement) {
  const item = getPriceItemById(itemId);

  if (!item) {
    throw new Error("That price list item could not be found.");
  }

  const confirmed = window.confirm(`Delete ${item.name} from the shared price list?`);

  if (!confirmed) {
    return false;
  }

  await api(`/price-list/${itemId}`, {
    method: "DELETE"
  });

  if (requestedEditPriceItemId === itemId || priceItemIdField.value === itemId) {
    resetPriceItemForm();
    closeFormModal({ restoreFocus: false });
  }

  await loadPriceList({ showSkeleton: false });
  announceMutation(["price_list"]);
  showToast("Price list item deleted.", "success");

  const fallbackFocusTarget = opener && typeof opener.focus === "function" && document.contains(opener)
    ? opener
    : openPriceItemFormButton;

  fallbackFocusTarget?.focus?.({ preventScroll: true });
  return true;
}

async function loadPriceList({ showSkeleton = true } = {}) {
  if (showSkeleton) {
    priceTableContainer.innerHTML = renderTableSkeleton(4, 5);
    quoteSummaryContainer.innerHTML = renderMetricSkeleton(4);
  }

  try {
    const data = await api("/price-list");
    priceItemsCache = data.items || [];
    rerenderCalculator();
    renderPriceTable();
    maybeOpenRequestedEdit();
  } catch (error) {
    const fallback = renderEmptyState("Unable to load shared pricing", error.message);
    priceTableContainer.innerHTML = fallback;
    quoteSummaryContainer.innerHTML = fallback;
    showToast(error.message, "error");
  }
}

priceItemForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(priceItemError, "");

  const editingItemId = priceItemIdField.value;
  const formData = new FormData(priceItemForm);
  const payload = {
    name: formData.get("name"),
    unitPrice: Number(formData.get("unitPrice") || 0)
  };

  try {
    if (editingItemId) {
      await api(`/price-list/${editingItemId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Shared price updated.", "success");
    } else {
      await api("/price-list", {
        method: "POST",
        body: payload
      });
      showToast("Price list item added.", "success");
    }

    resetPriceItemForm();
    closeFormModal();
    await loadPriceList({ showSkeleton: false });
    announceMutation(["price_list"]);
  } catch (error) {
    mountFormError(priceItemError, error.message);
    showToast(error.message, "error");
  }
});

openPriceItemFormButton?.addEventListener("click", () => {
  resetPriceItemForm();
  showPriceItemModal(openPriceItemFormButton);
});

resetPriceItemFormButton?.addEventListener("click", () => {
  resetPriceItemForm();
});

deletePriceItemButton?.addEventListener("click", async () => {
  try {
    const deleted = await deletePriceItem(priceItemIdField.value, deletePriceItemButton);

    if (deleted) {
      closeFormModal();
    }
  } catch (error) {
    mountFormError(priceItemError, error.message);
    showToast(error.message, "error");
  }
});

addCalculatorRowButton?.addEventListener("click", () => {
  calculatorRows.push(buildCalculatorRow());
  rerenderCalculator();
  showToast("New calculator row added.", "info");
});

resetCalculatorButton?.addEventListener("click", () => {
  resetCalculator();
  showToast("Calculator reset.", "info");
});

manualQuoteOverrideInput?.addEventListener("input", () => {
  renderQuoteSummary();
});

calculatorRowsContainer?.addEventListener("change", (event) => {
  const field = event.target?.dataset?.field;
  const rowId = event.target?.dataset?.rowId;

  if (!field || !rowId) {
    return;
  }

  const row = getCalculatorRowById(rowId);

  if (!row) {
    return;
  }

  if (field === "itemId") {
    const item = getPriceItemById(event.target.value);

    if (!item) {
      row.itemId = "";
      row.itemName = "";
      row.unitPrice = 0;
      row.priceMode = "manual";
      rerenderCalculator();
      return;
    }

    row.itemId = item.id;
    row.itemName = item.name;
    row.unitPrice = Number(item.unitPrice || 0);
    row.priceMode = "list";
    row.quantity = row.quantity || 1;
    rerenderCalculator();
    return;
  }

  if (field === "quantity") {
    row.quantity = parseWholeNumber(event.target.value);
    updateRowTotalDisplay(row);
    renderQuoteSummary();
  }
});

calculatorRowsContainer?.addEventListener("input", (event) => {
  const field = event.target?.dataset?.field;
  const rowId = event.target?.dataset?.rowId;

  if (!rowId || !["quantity", "unitPrice"].includes(field)) {
    return;
  }

  const row = getCalculatorRowById(rowId);

  if (!row) {
    return;
  }

  if (field === "quantity") {
    row.quantity = parseWholeNumber(event.target.value);
    updateRowTotalDisplay(row);
    renderQuoteSummary();
    return;
  }

  row.unitPrice = parseMoney(event.target.value);
  const item = getPriceItemById(row.itemId);
  row.priceMode = item && Math.abs(row.unitPrice - Number(item.unitPrice || 0)) < 0.005 ? "list" : "manual";
  updateRowTotalDisplay(row);
  renderQuoteSummary();
});

calculatorRowsContainer?.addEventListener("click", (event) => {
  const action = event.target?.dataset?.rowAction;
  const rowId = event.target?.dataset?.rowId;

  if (!action || !rowId) {
    return;
  }

  const row = getCalculatorRowById(rowId);

  if (!row) {
    return;
  }

  if (action === "use-list-price") {
    const item = getPriceItemById(row.itemId);

    if (!item) {
      showToast("Pick a saved item first to load its live list price.", "error");
      return;
    }

    row.itemName = item.name;
    row.unitPrice = Number(item.unitPrice || 0);
    row.priceMode = "list";
    renderCalculatorRows();
    renderQuoteSummary();
    showToast(`Using the saved price for ${item.name}.`, "success");
    return;
  }

  if (action === "remove-row") {
    calculatorRows = calculatorRows.filter((entry) => entry.id !== rowId);
    ensureCalculatorRows();
    rerenderCalculator();
    showToast("Calculator row removed.", "info");
  }
});

subscribeToMutations(["price_list"], () => {
  showToast("Live update received for shared pricing.", "info");
  loadPriceList({ showSkeleton: false });
});

ensureCalculatorRows();
renderCalculatorRows();
renderQuoteSummary();
loadPriceList();
