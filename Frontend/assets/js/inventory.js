import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  badge,
  closeFormModal,
  formatDate,
  initProtectedPage,
  mountFormError,
  openFormModal,
  renderEmptyState,
  renderTableSkeleton,
  showToast
} from "./ui.js";
import {
  bindDraftForm,
  buildPageHref,
  downloadCsv,
  restoreDraftForm
} from "./workflow.js";

initProtectedPage({
  pageKey: "INVENTORY",
  title: "Inventory control",
  subtitle: "Track stock levels, add new items, and keep movement logs simple."
});

const createForm = document.querySelector("#inventoryForm");
const adjustForm = document.querySelector("#adjustForm");
const createError = document.querySelector("#inventoryError");
const adjustError = document.querySelector("#adjustError");
const summaryContainer = document.querySelector("#inventorySummary");
const tableContainer = document.querySelector("#inventoryTable");
const recentMovementFeed = document.querySelector("#recentMovementFeed");
const itemSelect = document.querySelector("#adjustItemId");
const inventoryItemIdField = document.querySelector("#inventoryItemId");
const inventoryFormTitle = document.querySelector("#inventoryFormTitle");
const inventoryFormSubtitle = document.querySelector("#inventoryFormSubtitle");
const inventorySubmitButton = document.querySelector("#inventorySubmitButton");
const resetInventoryButton = document.querySelector("#resetInventoryForm");
const inventoryQuantityHint = document.querySelector("#inventoryQuantityHint");
const openInventoryFormButton = document.querySelector("#openInventoryFormButton");
const inventoryFormHost = document.querySelector("#inventoryFormHost");
const inventoryFormContent = document.querySelector("#inventoryFormContent");
const quantityField = createForm?.elements.quantity;
const movementIdField = document.querySelector("#inventoryMovementId");
const adjustFormTitle = document.querySelector("#adjustFormTitle");
const adjustFormSubtitle = document.querySelector("#adjustFormSubtitle");
const adjustSubmitButton = document.querySelector("#adjustSubmitButton");
const resetAdjustButton = document.querySelector("#resetAdjustForm");
const adjustQuantityHint = document.querySelector("#adjustQuantityHint");
const openAdjustFormButton = document.querySelector("#openAdjustFormButton");
const adjustFormHost = document.querySelector("#adjustFormHost");
const adjustFormContent = document.querySelector("#adjustFormContent");
const toolbarHost = document.createElement("div");
const initialParams = new URLSearchParams(window.location.search);
const searchQuery = (initialParams.get("search") || "").trim().toLowerCase();
const activeView = initialParams.get("view") || "";
let requestedItemEditId = initialParams.get("editItem") || "";
let requestedMovementEditId = initialParams.get("editMovement") || "";
const createDraft = bindDraftForm(createForm, "inventory-create");
const adjustDraft = bindDraftForm(adjustForm, "inventory-adjust");

toolbarHost.className = "collection-tools";
tableContainer.before(toolbarHost);

let itemsCache = [];
let hasShownFilterMessage = false;

if (createDraft.restored || adjustDraft.restored) {
  showToast("Restored saved inventory drafts.", "info");
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

function populateItemSelect(items) {
  itemSelect.innerHTML = items.length
    ? items.map((item) => `<option value="${item.id}">${item.name} - ${item.quantity} ${item.unit}</option>`).join("")
    : "<option value=''>No items available</option>";
  adjustForm.querySelector("button").disabled = items.length === 0;
}

function formatMovementType(type) {
  switch (`${type || ""}`.toUpperCase()) {
    case "STOCK_IN":
      return "Add";
    case "STOCK_OUT":
      return "Subtract";
    case "CORRECTION":
      return "Correction";
    case "DISTRIBUTED":
      return "Distributed";
    default:
      return type;
  }
}

function movementDisplayQuantity(movement, fallbackQuantity = 0) {
  if (`${movement?.type || ""}`.toUpperCase() === "CORRECTION") {
    return Number(movement?.displayQuantity ?? fallbackQuantity ?? 0);
  }

  return Math.abs(Number(movement?.quantityDelta || 0));
}

function decorateItems(items = []) {
  return items.map((item) => {
    let rollingQuantity = Number(item.quantity || 0);
    const movements = (item.movements || []).map((movement) => {
      const signedDelta = Number(movement.quantityDelta || 0);
      const displayQuantity = movement.type === "CORRECTION"
        ? rollingQuantity
        : Math.abs(signedDelta);

      rollingQuantity -= signedDelta;

      return {
        ...movement,
        displayQuantity
      };
    });

    return {
      ...item,
      movements
    };
  });
}

function updateAdjustmentHint() {
  if (!adjustQuantityHint || !adjustForm?.elements?.type) {
    return;
  }

  const type = `${adjustForm.elements.type.value || ""}`.toUpperCase();

  if (type === "STOCK_OUT") {
    adjustQuantityHint.textContent = "Subtract removes this amount from stock on hand.";
    return;
  }

  if (type === "CORRECTION") {
    adjustQuantityHint.textContent = "Correction sets stock on hand to the exact amount, even if that amount is 0.";
    return;
  }

  adjustQuantityHint.textContent = "Add increases stock on hand by this amount.";
}

function resetItemForm({ clearDraftState = false, clearUrl = true } = {}) {
  createForm.reset();
  inventoryItemIdField.value = "";
  inventoryFormTitle.textContent = "Add new item";
  inventoryFormSubtitle.textContent = "Use this form to add a new stock item or update one that already exists.";
  inventorySubmitButton.textContent = "Create item";
  inventoryQuantityHint.textContent = "Starting quantity is only used when creating a new item.";

  if (quantityField) {
    quantityField.disabled = false;
    quantityField.value = "0";
  }

  mountFormError(createError, "");

  if (clearDraftState) {
    createDraft.clearDraft();
  }

  if (clearUrl) {
    requestedItemEditId = "";
    updateUrlParams({ editItem: "" }, ["editItem"]);
  }
}

function fillItemForm(item) {
  inventoryItemIdField.value = item.id;
  inventoryFormTitle.textContent = `Edit ${item.name}`;
  inventoryFormSubtitle.textContent = "Update the item details here. Use the stock popup when you need to change quantity.";
  inventorySubmitButton.textContent = "Save item";
  inventoryQuantityHint.textContent = `Current stock is ${item.quantity} ${item.unit}.`;
  mountFormError(createError, "");
  createForm.elements.name.value = item.name;
  createForm.elements.category.value = item.category || "";
  createForm.elements.unit.value = item.unit;
  createForm.elements.quantity.value = item.quantity;
  createForm.elements.notes.value = item.notes || "";

  if (quantityField) {
    quantityField.disabled = true;
  }
}

function resetAdjustmentForm({ clearDraftState = false, clearUrl = true } = {}) {
  adjustForm.reset();
  movementIdField.value = "";
  adjustFormTitle.textContent = "Adjust stock";
  adjustFormSubtitle.textContent = "Pick an item, enter the amount, and record what happened in plain terms.";
  adjustSubmitButton.textContent = "Apply adjustment";
  mountFormError(adjustError, "");

  if (itemsCache.length) {
    itemSelect.value = itemsCache[0].id;
  }

  updateAdjustmentHint();

  if (clearDraftState) {
    adjustDraft.clearDraft();
  }

  if (clearUrl) {
    requestedMovementEditId = "";
    updateUrlParams({ editMovement: "" }, ["editMovement"]);
  }
}

function fillMovementForm(movement) {
  movementIdField.value = movement.id;
  adjustFormTitle.textContent = "Edit stock log";
  adjustFormSubtitle.textContent = "Update this stock movement. Correction sets stock to an exact amount.";
  adjustSubmitButton.textContent = "Save adjustment";
  mountFormError(adjustError, "");
  adjustForm.elements.itemId.value = movement.itemId;
  adjustForm.elements.quantityDelta.value = movementDisplayQuantity(movement);
  adjustForm.elements.type.value = movement.type;
  adjustForm.elements.reason.value = movement.reason || "";
  updateAdjustmentHint();
}

function showInventoryItemModal(opener = document.activeElement) {
  openFormModal({
    content: inventoryFormContent,
    host: inventoryFormHost,
    focusSelector: '[name="name"]',
    opener,
    onClose: () => {
      if (requestedItemEditId) {
        requestedItemEditId = "";
        updateUrlParams({ editItem: "" }, ["editItem"]);
      }
    }
  });
}

function showAdjustmentModal(opener = document.activeElement) {
  openFormModal({
    content: adjustFormContent,
    host: adjustFormHost,
    focusSelector: '[name="quantityDelta"]',
    opener,
    onClose: () => {
      if (requestedMovementEditId) {
        requestedMovementEditId = "";
        updateUrlParams({ editMovement: "" }, ["editMovement"]);
      }
    }
  });
}

function editableMovementTypes() {
  return new Set(["STOCK_IN", "STOCK_OUT", "CORRECTION"]);
}

function maybeOpenRequestedEdit() {
  if (requestedItemEditId) {
    const item = itemsCache.find((entry) => entry.id === requestedItemEditId);

    if (item) {
      fillItemForm(item);
      showInventoryItemModal();
    } else {
      requestedItemEditId = "";
      updateUrlParams({ editItem: "" }, ["editItem"]);
      showToast("That inventory item could not be found.", "error");
    }
  }

  if (requestedMovementEditId) {
    const movement = itemsCache
      .flatMap((item) => item.movements || [])
      .find((entry) => entry.id === requestedMovementEditId);

    if (!movement) {
      requestedMovementEditId = "";
      updateUrlParams({ editMovement: "" }, ["editMovement"]);
      showToast("That stock log could not be found.", "error");
      return;
    }

    if (!editableMovementTypes().has(movement.type)) {
      requestedMovementEditId = "";
      updateUrlParams({ editMovement: "" }, ["editMovement"]);
      showToast("That movement must be edited from its source system.", "info");
      return;
    }

    fillMovementForm(movement);
    showAdjustmentModal();
  }
}

function getVisibleItems(items) {
  let visibleItems = [...items];

  if (activeView === "recent") {
    visibleItems = visibleItems
      .slice()
      .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
      .slice(0, 10);
  }

  if (searchQuery) {
    visibleItems = visibleItems.filter((item) => [
      item.name,
      item.category,
      item.unit,
      item.notes
    ].some((value) => `${value || ""}`.toLowerCase().includes(searchQuery)));
  }

  return visibleItems;
}

function currentViewLabel() {
  if (activeView === "recent") {
    return searchQuery ? `Recent / ${searchQuery}` : "Recent updates";
  }

  return searchQuery ? `Search / ${searchQuery}` : "All inventory";
}

function rerenderCollection() {
  renderSummary(itemsCache);
  renderToolbar(itemsCache);
  renderTable(itemsCache);
  renderRecentMovementFeed(itemsCache);
}

function renderRecentMovementFeed(items) {
  const recentMovements = items
    .flatMap((item) => (item.movements || []).map((movement) => ({
      ...movement,
      itemName: item.name,
      itemUnit: item.unit,
      itemId: item.id
    })))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 8);

  if (!recentMovementFeed) {
    return;
  }

  if (!recentMovements.length) {
    recentMovementFeed.innerHTML = renderEmptyState(
      "No recent stock logs",
      "New adds, subtracts, and corrections will appear here."
    );
    return;
  }

  recentMovementFeed.innerHTML = recentMovements.map((movement) => {
    const editable = editableMovementTypes().has(movement.type);
    const href = editable
      ? `./inventory.html?editMovement=${movement.id}#adjustForm`
      : `./inventory.html?editItem=${movement.itemId}#inventoryForm`;

    return `
      <a class="activity-link" href="${href}">
        <article class="activity-card ${requestedMovementEditId === movement.id ? "editing-card" : ""}">
          <div>
            <strong>${movement.itemName}</strong>
            <p>${formatMovementType(movement.type)} <span class="emphasis-inline">${movementDisplayQuantity(movement)} ${movement.itemUnit}</span></p>
          </div>
          <div class="activity-meta">
            ${badge(editable ? "Edit log" : "Source-linked", editable ? "accent" : "neutral")}
            <small>${formatDate(movement.createdAt)}</small>
          </div>
        </article>
      </a>
    `;
  }).join("");
}

function renderSummary(items) {
  if (!summaryContainer) {
    return;
  }

  const visibleItems = getVisibleItems(items);
  const totalUnits = visibleItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const categories = new Set(visibleItems.map((item) => (item.category || "").trim()).filter(Boolean)).size;
  const updatedToday = visibleItems.filter((item) => {
    const updated = new Date(item.updatedAt);
    const now = new Date();

    return updated.getFullYear() === now.getFullYear()
      && updated.getMonth() === now.getMonth()
      && updated.getDate() === now.getDate();
  }).length;

  summaryContainer.innerHTML = `
    <div class="inventory-summary-strip">
      <article class="inventory-summary-card">
        <span class="inventory-summary-label">Items shown</span>
        <strong>${visibleItems.length}</strong>
      </article>
      <article class="inventory-summary-card">
        <span class="inventory-summary-label">Units in stock</span>
        <strong>${totalUnits}</strong>
      </article>
      <article class="inventory-summary-card">
        <span class="inventory-summary-label">Categories</span>
        <strong>${categories || 0}</strong>
      </article>
      <article class="inventory-summary-card">
        <span class="inventory-summary-label">Updated today</span>
        <strong>${updatedToday}</strong>
      </article>
    </div>
  `;
}

function renderToolbar(items) {
  const visibleItems = getVisibleItems(items);
  const filterLinks = [
    { label: "All", href: buildPageHref("./inventory.html", { hash: "inventoryTable" }), active: !activeView },
    { label: "Recent", href: buildPageHref("./inventory.html", { view: "recent", hash: "inventoryTable" }), active: activeView === "recent" }
  ];
  const searchMeta = searchQuery ? `Search: "${searchQuery}"` : currentViewLabel();

  toolbarHost.innerHTML = `
    <div class="filter-chip-row inventory-filter-row">
      ${filterLinks.map((link) => `
        <a class="filter-chip ${link.active ? "active" : ""}" href="${link.href}">${link.label}</a>
      `).join("")}
    </div>
    <div class="toolbar-actions inventory-toolbar-actions">
      <span class="toolbar-meta">${searchMeta}</span>
      <button class="ghost-button toolbar-button" type="button" data-action="export">Export CSV</button>
    </div>
  `;

  toolbarHost.querySelector('[data-action="export"]')?.addEventListener("click", () => {
    downloadCsv(
      "inventory-export.csv",
      [
        { label: "Name", value: (item) => item.name },
        { label: "Category", value: (item) => item.category || "" },
        { label: "Unit", value: (item) => item.unit },
        { label: "Quantity", value: (item) => item.quantity },
        { label: "Notes", value: (item) => item.notes || "" }
      ],
      visibleItems
    );
    showToast("Inventory CSV exported.", "success");
  });
}

function openItemEditor(itemId) {
  requestedItemEditId = itemId;
  updateUrlParams({ editItem: requestedItemEditId }, ["editMovement"]);
  requestedMovementEditId = "";
  const item = itemsCache.find((entry) => entry.id === requestedItemEditId);

  if (item) {
    fillItemForm(item);
    showInventoryItemModal();
  }
}

function openAdjustmentForm(itemId) {
  requestedItemEditId = "";
  requestedMovementEditId = "";
  updateUrlParams({}, ["editItem", "editMovement"]);
  resetAdjustmentForm({ clearUrl: false });
  itemSelect.value = itemId;
  showAdjustmentModal();
}

function openMovementEditor(movementId) {
  requestedMovementEditId = movementId;
  updateUrlParams({ editMovement: requestedMovementEditId }, ["editItem"]);
  requestedItemEditId = "";
  const movement = itemsCache
    .flatMap((item) => item.movements || [])
    .find((entry) => entry.id === requestedMovementEditId);

  if (movement) {
    fillMovementForm(movement);
    showAdjustmentModal();
  }
}

async function deleteInventoryItem(itemId) {
  const item = itemsCache.find((entry) => entry.id === itemId);

  if (!item) {
    showToast("That inventory item could not be found.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete ${item.name} completely? This will also remove linked distribution and bank history for that item.`);

  if (!confirmed) {
    return;
  }

  await api(`/inventory/${itemId}`, {
    method: "DELETE"
  });

  if (inventoryItemIdField.value === itemId) {
    resetItemForm({ clearDraftState: true });
    closeFormModal();
  }

  if (adjustForm.elements.itemId.value === itemId) {
    resetAdjustmentForm({ clearDraftState: true });
    closeFormModal();
  }

  showToast("Inventory item deleted.", "success");
}

function renderTable(items) {
  const visibleItems = getVisibleItems(items);

  if (!visibleItems.length) {
    tableContainer.innerHTML = renderEmptyState(
      items.length ? "No matching inventory items" : "No inventory items yet",
      items.length
        ? "Try a broader search or remove the current filter."
        : "Use the action buttons on this page to add the first item or stock change."
    );
    return;
  }

  if (!hasShownFilterMessage && (searchQuery || activeView)) {
    const filterParts = [];

    if (activeView === "recent") {
      filterParts.push("recent updates");
    }

    if (searchQuery) {
      filterParts.push(`search "${searchQuery}"`);
    }

    showToast(`Showing ${filterParts.join(" + ")} inventory view.`, "info");
    hasShownFilterMessage = true;
  }

  tableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Stock on hand</th>
            <th>Category</th>
            <th>Latest activity</th>
            <th>Actions</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${visibleItems.map((item) => {
            const latestMovement = item.movements?.[0];
            const canEditMovement = latestMovement && editableMovementTypes().has(latestMovement.type);
            const isEditingItem = requestedItemEditId === item.id;
            const isEditingMovement = (item.movements || []).some((movement) => movement.id === requestedMovementEditId);

            return `
              <tr class="${isEditingItem || isEditingMovement ? "editing-row" : ""}">
                <td>
                  <strong>${item.name}</strong>
                  <span class="subtle-row">${item.notes || item.unit}</span>
                </td>
                <td>
                  <div class="stock-readout">
                    <span class="stock-number">${item.quantity}</span>
                    <span class="stock-unit">${item.unit}</span>
                  </div>
                </td>
                <td>${item.category || "Uncategorised"}</td>
                <td>
                  ${latestMovement
                    ? `<div class="stock-summary"><strong>${formatMovementType(latestMovement.type)}</strong><span class="muted">${movementDisplayQuantity(latestMovement)} ${item.unit}</span></div>`
                    : "No activity yet"}
                </td>
                <td>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-edit-item="${item.id}">Edit item</button>
                    <button class="mini-action" type="button" data-adjust-item="${item.id}">Adjust stock</button>
                    ${canEditMovement ? `<button class="mini-action" type="button" data-edit-movement="${latestMovement.id}">Edit log</button>` : ""}
                    <button class="mini-action danger-action" type="button" data-delete-item="${item.id}">Delete</button>
                  </div>
                </td>
                <td>${formatDate(item.updatedAt)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  tableContainer.querySelectorAll("[data-edit-item]").forEach((button) => {
    button.addEventListener("click", () => openItemEditor(button.dataset.editItem));
  });

  tableContainer.querySelectorAll("[data-adjust-item]").forEach((button) => {
    button.addEventListener("click", () => openAdjustmentForm(button.dataset.adjustItem));
  });

  tableContainer.querySelectorAll("[data-edit-movement]").forEach((button) => {
    button.addEventListener("click", () => openMovementEditor(button.dataset.editMovement));
  });

  tableContainer.querySelectorAll("[data-delete-item]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await deleteInventoryItem(button.dataset.deleteItem);
        await loadInventory();
        announceMutation(["inventory"]);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

async function loadInventory() {
  if (summaryContainer) {
    summaryContainer.innerHTML = "<div class='inventory-summary-card skeleton-card'></div><div class='inventory-summary-card skeleton-card'></div>";
  }
  if (recentMovementFeed) {
    recentMovementFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";
  }
  tableContainer.innerHTML = renderTableSkeleton(6, 5);

  try {
    const { items } = await api("/inventory");
    itemsCache = decorateItems(items);
    populateItemSelect(itemsCache);
    restoreDraftForm(adjustForm, "inventory-adjust");
    updateAdjustmentHint();
    rerenderCollection();
    maybeOpenRequestedEdit();
  } catch (error) {
    tableContainer.innerHTML = renderEmptyState("Unable to load inventory", error.message);
    showToast(error.message, "error");
  }
}

createForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(createError, "");

  const editingItemId = inventoryItemIdField.value;
  const formData = new FormData(createForm);
  const payload = {
    name: formData.get("name"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    notes: formData.get("notes")
  };

  if (!editingItemId) {
    payload.quantity = Number(formData.get("quantity") || 0);
  }

  try {
    if (editingItemId) {
      await api(`/inventory/${editingItemId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Inventory item updated.", "success");
    } else {
      await api("/inventory", {
        method: "POST",
        body: payload
      });
      showToast("Inventory item created.", "success");
    }

    resetItemForm({ clearDraftState: true });
    closeFormModal();
    await loadInventory();
    announceMutation(["inventory"]);
  } catch (error) {
    mountFormError(createError, error.message);
    showToast(error.message, "error");
  }
});

adjustForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(adjustError, "");

  const editingMovementId = movementIdField.value;
  const formData = new FormData(adjustForm);
  const payload = {
    itemId: formData.get("itemId"),
    quantityDelta: Number(formData.get("quantityDelta") || 0),
    type: formData.get("type"),
    reason: formData.get("reason")
  };

  try {
    if (editingMovementId) {
      await api(`/inventory/movements/${editingMovementId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Stock log updated.", "success");
    } else {
      await api(`/inventory/${payload.itemId}/adjust`, {
        method: "POST",
        body: payload
      });
      showToast("Inventory adjusted.", "success");
    }

    resetAdjustmentForm({ clearDraftState: true });
    closeFormModal();
    await loadInventory();
    announceMutation(["inventory"]);
  } catch (error) {
    mountFormError(adjustError, error.message);
    showToast(error.message, "error");
  }
});

resetInventoryButton?.addEventListener("click", () => {
  resetItemForm({ clearDraftState: true });
});

resetAdjustButton?.addEventListener("click", () => {
  resetAdjustmentForm({ clearDraftState: true });
});

openInventoryFormButton?.addEventListener("click", () => {
  requestedItemEditId = "";
  requestedMovementEditId = "";
  resetItemForm();
  updateUrlParams({ editItem: "", editMovement: "" }, ["editItem", "editMovement"]);
  showInventoryItemModal(openInventoryFormButton);
});

openAdjustFormButton?.addEventListener("click", () => {
  if (!itemsCache.length) {
    showToast("Add an inventory item first, then adjust stock.", "info");
    return;
  }

  requestedItemEditId = "";
  requestedMovementEditId = "";
  resetAdjustmentForm();
  updateUrlParams({ editItem: "", editMovement: "" }, ["editItem", "editMovement"]);
  itemSelect.value = itemsCache[0].id;
  showAdjustmentModal(openAdjustFormButton);
});

adjustForm?.elements?.type?.addEventListener("change", updateAdjustmentHint);

subscribeToMutations(["inventory", "distribution"], () => {
  showToast("Live update received for inventory.", "info");
  loadInventory();
});

resetItemForm({ clearUrl: false });
resetAdjustmentForm({ clearUrl: false });
restoreDraftForm(createForm, "inventory-create");
restoreDraftForm(adjustForm, "inventory-adjust");
loadInventory();
