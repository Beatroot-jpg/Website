import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  badge,
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
  pageKey: "INVENTORY",
  title: "Inventory control",
  subtitle: "Track stock levels, receive new items, and log corrections."
});

const createForm = document.querySelector("#inventoryForm");
const adjustForm = document.querySelector("#adjustForm");
const createError = document.querySelector("#inventoryError");
const adjustError = document.querySelector("#adjustError");
const tableContainer = document.querySelector("#inventoryTable");
const recentMovementFeed = document.querySelector("#recentMovementFeed");
const itemSelect = document.querySelector("#adjustItemId");
const inventoryItemIdField = document.querySelector("#inventoryItemId");
const inventoryFormTitle = document.querySelector("#inventoryFormTitle");
const inventoryFormSubtitle = document.querySelector("#inventoryFormSubtitle");
const inventorySubmitButton = document.querySelector("#inventorySubmitButton");
const resetInventoryButton = document.querySelector("#resetInventoryForm");
const inventoryQuantityHint = document.querySelector("#inventoryQuantityHint");
const quantityField = createForm?.elements.quantity;
const movementIdField = document.querySelector("#inventoryMovementId");
const adjustFormTitle = document.querySelector("#adjustFormTitle");
const adjustFormSubtitle = document.querySelector("#adjustFormSubtitle");
const adjustSubmitButton = document.querySelector("#adjustSubmitButton");
const resetAdjustButton = document.querySelector("#resetAdjustForm");
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
let selectedItemIds = new Set();

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

function resetItemForm({ clearDraftState = false, clearUrl = true } = {}) {
  createForm.reset();
  inventoryItemIdField.value = "";
  inventoryFormTitle.textContent = "Create item";
  inventoryFormSubtitle.textContent = "Add a new inventory item and optional opening stock.";
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
  inventoryFormSubtitle.textContent = "Update item details. Use stock adjustment below to change quantity.";
  inventorySubmitButton.textContent = "Save item";
  inventoryQuantityHint.textContent = `Current stock is ${item.quantity} ${item.unit}. Quantity changes stay in the adjustment log.`;
  createForm.elements.name.value = item.name;
  createForm.elements.sku.value = item.sku || "";
  createForm.elements.category.value = item.category || "";
  createForm.elements.unit.value = item.unit;
  createForm.elements.quantity.value = item.quantity;
  createForm.elements.reorderLevel.value = item.reorderLevel;
  createForm.elements.notes.value = item.notes || "";
  if (quantityField) {
    quantityField.disabled = true;
  }
}

function resetAdjustmentForm({ clearDraftState = false, clearUrl = true } = {}) {
  adjustForm.reset();
  movementIdField.value = "";
  adjustFormTitle.textContent = "Adjust stock";
  adjustFormSubtitle.textContent = "Apply a stock in, stock out, or correction movement to an existing item.";
  adjustSubmitButton.textContent = "Apply adjustment";
  mountFormError(adjustError, "");

  if (itemsCache.length) {
    itemSelect.value = itemsCache[0].id;
  }

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
  adjustFormSubtitle.textContent = "Update this stock movement and the current quantity will reconcile automatically.";
  adjustSubmitButton.textContent = "Save adjustment";
  adjustForm.elements.itemId.value = movement.itemId;
  adjustForm.elements.quantityDelta.value = movement.quantityDelta;
  adjustForm.elements.type.value = movement.type;
  adjustForm.elements.reason.value = movement.reason || "";
}

function editableMovementTypes() {
  return new Set(["STOCK_IN", "STOCK_OUT", "CORRECTION"]);
}

function maybeOpenRequestedEdit() {
  if (requestedItemEditId) {
    const item = itemsCache.find((entry) => entry.id === requestedItemEditId);

    if (item) {
      fillItemForm(item);
      createForm.scrollIntoView({ behavior: "smooth", block: "start" });
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
    adjustForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function getVisibleItems(items) {
  let visibleItems = [...items];

  if (activeView === "low-stock") {
    visibleItems = visibleItems.filter((item) => item.reorderLevel > 0 && item.quantity <= item.reorderLevel);
  }

  if (activeView === "recent") {
    visibleItems = visibleItems
      .slice()
      .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt))
      .slice(0, 10);
  }

  if (searchQuery) {
    visibleItems = visibleItems.filter((item) => [
      item.name,
      item.sku,
      item.category,
      item.unit
    ].some((value) => `${value || ""}`.toLowerCase().includes(searchQuery)));
  }

  return visibleItems;
}

function currentViewLabel() {
  if (activeView === "low-stock") {
    return searchQuery ? `Low stock / ${searchQuery}` : "Low stock";
  }

  if (activeView === "recent") {
    return searchQuery ? `Recent / ${searchQuery}` : "Recent updates";
  }

  return searchQuery ? `Search / ${searchQuery}` : "All inventory";
}

function getSelectedItems(items = itemsCache) {
  const availableIds = new Set(items.map((item) => item.id));
  selectedItemIds = new Set([...selectedItemIds].filter((id) => availableIds.has(id)));
  return items.filter((item) => selectedItemIds.has(item.id));
}

function rerenderCollection() {
  renderToolbar(itemsCache);
  renderRecentMovementFeed(itemsCache);
  renderTable(itemsCache);
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
      "New stock-ins, stock-outs, and corrections will appear here."
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
            <p>${movement.type.replaceAll("_", " ")} ${Math.abs(movement.quantityDelta)} ${movement.itemUnit}</p>
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

function renderToolbar(items) {
  const visibleItems = getVisibleItems(items);
  const selectedItems = getSelectedItems(items);
  const savedView = loadSavedView("inventory");
  const filterLinks = [
    { label: "All", href: buildPageHref("./inventory.html", { hash: "inventoryTable" }), active: !activeView },
    { label: "Low stock", href: buildPageHref("./inventory.html", { view: "low-stock", hash: "inventoryTable" }), active: activeView === "low-stock" },
    { label: "Recent", href: buildPageHref("./inventory.html", { view: "recent", hash: "inventoryTable" }), active: activeView === "recent" }
  ];

  toolbarHost.innerHTML = `
    <div class="filter-chip-row">
      ${filterLinks.map((link) => `
        <a class="filter-chip ${link.active ? "active" : ""}" href="${link.href}">${link.label}</a>
      `).join("")}
      ${savedView ? `<a class="filter-chip saved" href="${savedView.href}">Saved: ${savedView.label}</a>` : ""}
    </div>
    <div class="toolbar-actions">
      <span class="toolbar-meta">${visibleItems.length} shown</span>
      <button class="ghost-button toolbar-button" type="button" data-action="save-view">Save view</button>
      ${savedView ? `<button class="ghost-button toolbar-button" type="button" data-action="clear-view">Clear saved</button>` : ""}
      <button class="ghost-button toolbar-button" type="button" data-action="export">Export CSV</button>
    </div>
    ${selectedItems.length ? `
      <div class="bulk-strip">
        <span class="toolbar-meta">${selectedItems.length} selected</span>
        <button class="ghost-button toolbar-button" type="button" data-bulk-adjust="-1">Bulk -1</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-adjust="1">Bulk +1</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-adjust="5">Bulk +5</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-export>Export selected</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-clear>Clear</button>
      </div>
    ` : ""}
  `;

  toolbarHost.querySelector('[data-action="save-view"]')?.addEventListener("click", () => {
    saveSavedView("inventory", {
      label: currentViewLabel(),
      href: buildPageHref("./inventory.html", {
        view: activeView,
        search: searchQuery,
        hash: "inventoryTable"
      })
    });
    showToast("Saved inventory view.", "success");
    renderToolbar(items);
  });

  toolbarHost.querySelector('[data-action="clear-view"]')?.addEventListener("click", () => {
    clearSavedView("inventory");
    showToast("Cleared saved inventory view.", "info");
    renderToolbar(items);
  });

  toolbarHost.querySelector('[data-action="export"]')?.addEventListener("click", () => {
    downloadCsv(
      "inventory-export.csv",
      [
        { label: "Name", value: (item) => item.name },
        { label: "SKU", value: (item) => item.sku || "" },
        { label: "Category", value: (item) => item.category || "" },
        { label: "Unit", value: (item) => item.unit },
        { label: "Quantity", value: (item) => item.quantity },
        { label: "Reorder Level", value: (item) => item.reorderLevel }
      ],
      visibleItems
    );
    showToast("Inventory CSV exported.", "success");
  });

  toolbarHost.querySelectorAll("[data-bulk-adjust]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await runBulkAdjustment(
          selectedItems.map((item) => item.id),
          Number(button.dataset.bulkAdjust)
        );
        selectedItemIds = new Set();
        await loadInventory();
        announceMutation(["inventory"]);
        showToast("Bulk inventory adjustment completed.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  toolbarHost.querySelector("[data-bulk-export]")?.addEventListener("click", () => {
    downloadCsv(
      "inventory-selected.csv",
      [
        { label: "Name", value: (item) => item.name },
        { label: "SKU", value: (item) => item.sku || "" },
        { label: "Category", value: (item) => item.category || "" },
        { label: "Unit", value: (item) => item.unit },
        { label: "Quantity", value: (item) => item.quantity },
        { label: "Reorder Level", value: (item) => item.reorderLevel }
      ],
      selectedItems
    );
    showToast("Selected inventory exported.", "success");
  });

  toolbarHost.querySelector("[data-bulk-clear]")?.addEventListener("click", () => {
    selectedItemIds = new Set();
    rerenderCollection();
  });
}

async function runInlineAdjustment(itemId, quantityDelta) {
  await api(`/inventory/${itemId}/adjust`, {
    method: "POST",
    body: {
      quantityDelta,
      type: quantityDelta > 0 ? "STOCK_IN" : "STOCK_OUT",
      reason: "Inline quick adjust"
    }
  });
}

async function runBulkAdjustment(itemIds, quantityDelta) {
  await api("/inventory/bulk-adjust", {
    method: "POST",
    body: {
      itemIds,
      quantityDelta,
      type: quantityDelta > 0 ? "STOCK_IN" : "STOCK_OUT",
      reason: "Bulk quick adjust"
    }
  });
}

function renderTable(items) {
  const visibleItems = getVisibleItems(items);
  const allVisibleSelected = visibleItems.length && visibleItems.every((item) => selectedItemIds.has(item.id));

  if (!visibleItems.length) {
    tableContainer.innerHTML = renderEmptyState(
      items.length ? "No matching inventory items" : "No inventory items yet",
      items.length
        ? "Try a broader search or remove the active dashboard filter."
        : "Create your first item with the form on the left."
    );
    return;
  }

  if (!hasShownFilterMessage && (searchQuery || activeView)) {
    const filterParts = [];

    if (activeView === "low-stock") {
      filterParts.push("low stock");
    }

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
            <th class="table-select-cell">
              <input class="table-check" type="checkbox" data-select-all ${allVisibleSelected ? "checked" : ""}>
            </th>
            <th>Item</th>
            <th>Stock</th>
            <th>Category</th>
            <th>Latest movement</th>
            <th>Quick adjust</th>
            <th>Action</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${visibleItems.map((item) => {
            const latestMovement = item.movements?.[0];
            const lowStock = item.quantity <= item.reorderLevel;
            const canEditMovement = latestMovement && editableMovementTypes().has(latestMovement.type);
            const isEditingItem = requestedItemEditId === item.id;
            const isEditingMovement = (item.movements || []).some((movement) => movement.id === requestedMovementEditId);

            return `
              <tr class="${selectedItemIds.has(item.id) ? "selected-row" : ""} ${isEditingItem || isEditingMovement ? "editing-row" : ""}">
                <td class="table-select-cell">
                  <input class="table-check" type="checkbox" data-select-item="${item.id}" ${selectedItemIds.has(item.id) ? "checked" : ""}>
                </td>
                <td>
                  <strong>${item.name}</strong>
                  <div class="subtle-row">${item.sku || "No SKU"} - ${item.unit}</div>
                </td>
                <td>${badge(`${item.quantity} on hand`, lowStock ? "warn" : "good")}</td>
                <td>${item.category || "Uncategorised"}</td>
                <td>
                  ${latestMovement ? `${latestMovement.type} (${latestMovement.quantityDelta})` : "No movements yet"}
                  ${canEditMovement ? `<div class="subtle-row">Editable recent log</div>` : ""}
                </td>
                <td>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-inline-adjust="${item.id}" data-delta="-1">-1</button>
                    <button class="mini-action" type="button" data-inline-adjust="${item.id}" data-delta="1">+1</button>
                    <button class="mini-action" type="button" data-inline-adjust="${item.id}" data-delta="5">+5</button>
                  </div>
                </td>
                <td>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-edit-item="${item.id}">Edit item</button>
                    ${canEditMovement ? `<button class="mini-action" type="button" data-edit-movement="${latestMovement.id}">Edit log</button>` : ""}
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

  tableContainer.querySelectorAll("[data-inline-adjust]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await runInlineAdjustment(button.dataset.inlineAdjust, Number(button.dataset.delta));
        await loadInventory();
        announceMutation(["inventory"]);
        showToast("Inventory updated inline.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  tableContainer.querySelectorAll("[data-edit-item]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedItemEditId = button.dataset.editItem;
      updateUrlParams({ editItem: requestedItemEditId }, ["editMovement"]);
      requestedMovementEditId = "";
      const item = itemsCache.find((entry) => entry.id === requestedItemEditId);

      if (item) {
        fillItemForm(item);
        createForm.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  tableContainer.querySelectorAll("[data-edit-movement]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedMovementEditId = button.dataset.editMovement;
      updateUrlParams({ editMovement: requestedMovementEditId }, ["editItem"]);
      requestedItemEditId = "";
      const movement = itemsCache
        .flatMap((item) => item.movements || [])
        .find((entry) => entry.id === requestedMovementEditId);

      if (movement) {
        fillMovementForm(movement);
        adjustForm.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  tableContainer.querySelector("[data-select-all]")?.addEventListener("change", (event) => {
    if (event.target.checked) {
      visibleItems.forEach((item) => selectedItemIds.add(item.id));
    } else {
      visibleItems.forEach((item) => selectedItemIds.delete(item.id));
    }

    rerenderCollection();
  });

  tableContainer.querySelectorAll("[data-select-item]").forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.target.checked) {
        selectedItemIds.add(input.dataset.selectItem);
      } else {
        selectedItemIds.delete(input.dataset.selectItem);
      }

      rerenderCollection();
    });
  });
}

async function loadInventory() {
  if (recentMovementFeed) {
    recentMovementFeed.innerHTML = "<div class='activity-card skeleton-card'></div><div class='activity-card skeleton-card'></div>";
  }
  tableContainer.innerHTML = renderTableSkeleton(8, 5);

  try {
    const { items } = await api("/inventory");
    itemsCache = items;
    getSelectedItems(itemsCache);
    populateItemSelect(itemsCache);
    restoreDraftForm(adjustForm, "inventory-adjust");
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
    sku: formData.get("sku"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    reorderLevel: Number(formData.get("reorderLevel") || 0),
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

subscribeToMutations(["inventory", "distribution"], () => {
  showToast("Live update received for inventory.", "info");
  loadInventory();
});

resetItemForm({ clearUrl: false });
resetAdjustmentForm({ clearUrl: false });
restoreDraftForm(createForm, "inventory-create");
restoreDraftForm(adjustForm, "inventory-adjust");
loadInventory();
