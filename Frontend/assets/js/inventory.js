import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const themeToggleButton = document.querySelector("#themeToggleButton");
const sessionButton = document.querySelector("#sessionButton");
const inventoryAccessStatus = document.querySelector("#inventoryAccessStatus");
const dirtyMoneyValue = document.querySelector("#dirtyMoneyValue");
const openMoneyModalButton = document.querySelector("#openMoneyModalButton");
const inventoryTableBody = document.querySelector("#inventoryTableBody");
const inventoryTableMeta = document.querySelector("#inventoryTableMeta");
const quickEditHint = document.querySelector("#quickEditHint");
const openInventoryModalButton = document.querySelector("#openInventoryModalButton");
const adminSection = document.querySelector("#adminSection");
const createRestorePointButton = document.querySelector("#createRestorePointButton");
const openRestoreModalButton = document.querySelector("#openRestoreModalButton");
const auditTableBody = document.querySelector("#auditTableBody");
const auditTableMeta = document.querySelector("#auditTableMeta");
const previousAuditPageButton = document.querySelector("#previousAuditPageButton");
const nextAuditPageButton = document.querySelector("#nextAuditPageButton");
const auditPageLabel = document.querySelector("#auditPageLabel");

const loginModal = document.querySelector("#loginModal");
const closeLoginButton = document.querySelector("#closeLoginButton");
const closeLoginBackdrop = document.querySelector("#closeLoginBackdrop");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const loginSubmitButton = document.querySelector("#loginSubmitButton");

const moneyModal = document.querySelector("#moneyModal");
const closeMoneyButton = document.querySelector("#closeMoneyButton");
const closeMoneyBackdrop = document.querySelector("#closeMoneyBackdrop");
const moneyForm = document.querySelector("#moneyForm");
const moneyOperationSelect = document.querySelector("#moneyOperationSelect");
const moneyValueLabel = document.querySelector("#moneyValueLabel");
const moneyOperationHint = document.querySelector("#moneyOperationHint");
const moneySubmitButton = document.querySelector("#moneySubmitButton");
const moneyFormMessage = document.querySelector("#moneyFormMessage");

const inventoryModal = document.querySelector("#inventoryModal");
const closeInventoryButton = document.querySelector("#closeInventoryButton");
const closeInventoryBackdrop = document.querySelector("#closeInventoryBackdrop");
const inventoryForm = document.querySelector("#inventoryForm");
const inventoryModeTabs = [...document.querySelectorAll("[data-inventory-mode]")];
const itemSelectField = document.querySelector("#itemSelectField");
const inventoryItemSelect = document.querySelector("#inventoryItemSelect");
const inventorySubmitButton = document.querySelector("#inventorySubmitButton");
const inventoryFormMessage = document.querySelector("#inventoryFormMessage");

const deleteInventoryItemButton = document.querySelector("#deleteInventoryItemButton");
const deleteInventoryModal = document.querySelector("#deleteInventoryModal");
const closeDeleteInventoryButton = document.querySelector("#closeDeleteInventoryButton");
const closeDeleteInventoryBackdrop = document.querySelector("#closeDeleteInventoryBackdrop");
const cancelDeleteInventoryButton = document.querySelector("#cancelDeleteInventoryButton");
const confirmDeleteInventoryButton = document.querySelector("#confirmDeleteInventoryButton");
const deleteInventoryName = document.querySelector("#deleteInventoryName");

const revertAuditModal = document.querySelector("#revertAuditModal");
const closeRevertAuditButton = document.querySelector("#closeRevertAuditButton");
const closeRevertAuditBackdrop = document.querySelector("#closeRevertAuditBackdrop");
const cancelRevertAuditButton = document.querySelector("#cancelRevertAuditButton");
const confirmRevertAuditButton = document.querySelector("#confirmRevertAuditButton");
const revertAuditSummary = document.querySelector("#revertAuditSummary");
const restoreModal = document.querySelector("#restoreModal");
const closeRestoreButton = document.querySelector("#closeRestoreButton");
const closeRestoreBackdrop = document.querySelector("#closeRestoreBackdrop");
const restoreForm = document.querySelector("#restoreForm");
const restorePointSelect = document.querySelector("#restorePointSelect");
const restoreSubmitButton = document.querySelector("#restoreSubmitButton");
const restoreFormMessage = document.querySelector("#restoreFormMessage");

const state = {
  session: getSession(),
  currentUser: null,
  viewer: {
    isLoggedIn: false,
    canManage: false,
    canUseAdminTools: false
  },
  dirtyMoney: "0.00",
  items: [],
  inventoryLoading: true,
  requiresLogin: false,
  inventoryMode: "create",
  auditPage: 1,
  auditTotalPages: 1,
  auditTotal: 0,
  auditLoading: false,
  auditEntries: [],
  restorePoints: [],
  pendingDeleteItemId: null,
  pendingRevertAuditId: null
};

function showToast(message, tone = "success") {
  const stack = document.querySelector("#toastStack");

  if (!stack) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  stack.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 3400);
}

function setMessage(element, message = "") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function setButtonLoading(button, loading, loadingLabel, idleLabel) {
  if (!button) {
    return;
  }

  button.disabled = loading;
  button.textContent = loading ? loadingLabel : idleLabel;
}

function toggleModal(modal, visible) {
  modal?.classList.toggle("hidden", !visible);
  modal?.setAttribute("aria-hidden", visible ? "false" : "true");
}

function getSessionHeaders(headers = {}) {
  const merged = new Headers(headers);

  if (state.session?.token) {
    merged.set("Authorization", `Bearer ${state.session.token}`);
  }

  return merged;
}

function apiWithSession(path, options = {}) {
  return api(path, {
    ...options,
    headers: getSessionHeaders(options.headers)
  });
}

function formatMoney(value) {
  const amount = Number(value || 0);

  return `$${new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount)}`;
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function humanize(value) {
  return `${value || ""}`
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function canManageInventory() {
  return Boolean(state.viewer.canManage);
}

function canUseAdminTools() {
  return Boolean(state.viewer.canUseAdminTools);
}

function promptForManagement() {
  if (!state.currentUser) {
    openLoginModal();
    return;
  }

  showToast("This account does not have Inventory access.", "error");
}

function syncSessionButton() {
  if (state.currentUser?.name) {
    sessionButton.textContent = state.currentUser.name;
    sessionButton.dataset.state = "session";
    return;
  }

  sessionButton.textContent = "Login";
  sessionButton.dataset.state = "login";
}

function syncAccess() {
  const canManage = canManageInventory();
  const canUseAdmin = canUseAdminTools();

  inventoryAccessStatus.textContent = canManage
    ? "Editing enabled"
    : state.currentUser
      ? "View only"
      : "Login required";
  inventoryAccessStatus.classList.toggle("is-live", canManage);
  quickEditHint.textContent = canManage
    ? "Double-click any value to make a quick edit. Press Enter to save."
    : state.currentUser
      ? "This account can view the register but needs Inventory access to edit it."
      : "Log in to view the register and make inventory edits.";
  adminSection.hidden = !canUseAdmin;
  adminSection.classList.toggle("hidden", !canUseAdmin);

  if (!canUseAdmin) {
    state.auditPage = 1;
    state.auditTotalPages = 1;
    state.restorePoints = [];
  }
}

function stockTone(item) {
  const quantity = Number(item.quantity || 0);
  const lowPoint = Number(item.reorderLevel || 0);

  if (lowPoint <= 0) {
    return { tone: "neutral", label: item.unit || "unit" };
  }

  if (quantity <= lowPoint) {
    return { tone: "danger", label: "Low" };
  }

  if (quantity < lowPoint * 2) {
    return { tone: "warning", label: "Watch" };
  }

  return { tone: "good", label: "Healthy" };
}

function createCell(text, className = "") {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = text;
  return cell;
}

function createEditableCell(item, field, value, displayValue, className = "") {
  const cell = createCell(displayValue, className);
  cell.dataset.editField = field;
  cell.dataset.itemId = item.id;
  cell.dataset.rawValue = `${value ?? ""}`;
  cell.title = canManageInventory() ? "Double-click to edit" : "Inventory access is required to edit";
  return cell;
}

function createStockCell(item) {
  const tone = stockTone(item);
  const cell = document.createElement("td");
  cell.dataset.editField = "quantity";
  cell.dataset.itemId = item.id;
  cell.dataset.rawValue = `${item.quantity}`;
  cell.title = canManageInventory() ? "Double-click to edit" : "Inventory access is required to edit";

  const value = document.createElement("span");
  value.className = `inventory-stock-value ${tone.tone}`;
  const amount = document.createElement("strong");
  amount.textContent = new Intl.NumberFormat("en-AU").format(item.quantity);
  const label = document.createElement("small");
  label.textContent = tone.label;
  value.append(amount, label);
  cell.appendChild(value);
  return cell;
}

function createInventoryMessageRow(message) {
  const row = document.createElement("tr");
  const cell = createCell(message, "inventory-table-message");
  cell.colSpan = 6;
  row.appendChild(cell);
  return row;
}

function renderInventoryTable() {
  inventoryTableBody.replaceChildren();

  if (state.inventoryLoading) {
    inventoryTableBody.appendChild(createInventoryMessageRow("Loading inventory..."));
    inventoryTableMeta.textContent = "Loading inventory...";
    return;
  }

  if (state.requiresLogin) {
    inventoryTableBody.appendChild(createInventoryMessageRow("Log in to view the inventory register."));
    inventoryTableMeta.textContent = "Login required";
    return;
  }

  if (!state.items.length) {
    inventoryTableBody.appendChild(createInventoryMessageRow("No stock listings yet. Use Update inventory to add the first item."));
    inventoryTableMeta.textContent = "0 active listings";
    return;
  }

  state.items.forEach((item) => {
    const row = document.createElement("tr");
    row.append(
      createEditableCell(item, "name", item.name, item.name, "inventory-item-name"),
      createStockCell(item),
      createEditableCell(item, "reorderLevel", item.reorderLevel, new Intl.NumberFormat("en-AU").format(item.reorderLevel)),
      createEditableCell(item, "internalPrice", item.internalPrice, formatMoney(item.internalPrice), "inventory-money-cell"),
      createEditableCell(item, "externalPrice", item.externalPrice, formatMoney(item.externalPrice), "inventory-money-cell"),
      createCell(formatDateTime(item.updatedAt), "inventory-updated-cell")
    );
    inventoryTableBody.appendChild(row);
  });

  inventoryTableMeta.textContent = `${state.items.length} active ${state.items.length === 1 ? "listing" : "listings"}`;
}

function renderAuditTable() {
  auditTableBody.replaceChildren();

  if (!canUseAdminTools()) {
    return;
  }

  if (state.auditLoading) {
    const row = document.createElement("tr");
    const cell = createCell("Loading action history...", "inventory-table-message");
    cell.colSpan = 5;
    row.appendChild(cell);
    auditTableBody.appendChild(row);
    return;
  }

  if (!state.auditEntries.length) {
    const row = document.createElement("tr");
    const cell = createCell("No inventory actions have been recorded yet.", "inventory-table-message");
    cell.colSpan = 5;
    row.appendChild(cell);
    auditTableBody.appendChild(row);
  } else {
    state.auditEntries.forEach((entry) => {
      const row = document.createElement("tr");
      const actionCell = document.createElement("td");
      const actionRow = document.createElement("div");
      actionRow.className = "inventory-audit-actions";

      if (entry.canRevert) {
        const revertButton = document.createElement("button");
        revertButton.className = "inventory-button ghost compact";
        revertButton.type = "button";
        revertButton.dataset.auditAction = "revert";
        revertButton.dataset.auditId = entry.id;
        revertButton.textContent = "Revert";
        actionRow.appendChild(revertButton);
      } else {
        const stateLabel = document.createElement("span");
        stateLabel.className = "inventory-audit-state";
        stateLabel.textContent = entry.revertedAt ? "Reverted" : "Recorded";
        actionRow.appendChild(stateLabel);
      }

      actionCell.appendChild(actionRow);
      row.append(
        createCell(humanize(entry.action), "inventory-item-name"),
        createCell(entry.summary),
        createCell(entry.actorName || "System"),
        createCell(formatDateTime(entry.createdAt), "inventory-updated-cell"),
        actionCell
      );
      auditTableBody.appendChild(row);
    });
  }

  auditTableMeta.textContent = state.auditTotal
    ? `Showing ${(state.auditPage - 1) * 10 + 1}-${Math.min(state.auditPage * 10, state.auditTotal)} of ${state.auditTotal} actions`
    : "0 recorded actions";
  auditPageLabel.textContent = `Page ${state.auditPage} of ${state.auditTotalPages}`;
  previousAuditPageButton.disabled = state.auditLoading || state.auditPage <= 1;
  nextAuditPageButton.disabled = state.auditLoading || state.auditPage >= state.auditTotalPages;
}

function populateInventorySelect() {
  inventoryItemSelect.replaceChildren();

  state.items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    inventoryItemSelect.appendChild(option);
  });
}

function fillInventoryForm(item) {
  if (!item) {
    return;
  }

  inventoryForm.elements.name.value = item.name || "";
  inventoryForm.elements.quantity.value = item.quantity ?? 0;
  inventoryForm.elements.reorderLevel.value = item.reorderLevel ?? 0;
  inventoryForm.elements.internalPrice.value = item.internalPrice ?? "0";
  inventoryForm.elements.externalPrice.value = item.externalPrice ?? "0";
  inventoryForm.elements.unit.value = item.unit || "unit";
}

function syncInventoryFormMode(mode = state.inventoryMode) {
  state.inventoryMode = mode;
  const isEditing = mode === "edit";

  inventoryModeTabs.forEach((tab) => {
    const active = tab.dataset.inventoryMode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  itemSelectField.classList.toggle("hidden", !isEditing);
  deleteInventoryItemButton.classList.toggle("hidden", !isEditing);
  inventorySubmitButton.textContent = isEditing ? "Save listing" : "Add listing";

  if (!isEditing) {
    inventoryForm.reset();
    inventoryForm.elements.unit.value = "unit";
    return;
  }

  populateInventorySelect();
  fillInventoryForm(state.items.find((item) => item.id === inventoryItemSelect.value) || state.items[0]);
}

function populateRestorePoints() {
  restorePointSelect.replaceChildren();

  if (!state.restorePoints.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No restore points available";
    restorePointSelect.appendChild(option);
    restorePointSelect.disabled = true;
    restoreSubmitButton.disabled = true;
    return;
  }

  state.restorePoints.forEach((point) => {
    const option = document.createElement("option");
    option.value = point.id;
    option.textContent = `${point.label} - ${formatDateTime(point.createdAt)}`;
    restorePointSelect.appendChild(option);
  });

  restorePointSelect.disabled = false;
  restoreSubmitButton.disabled = false;
}

async function loadInventory() {
  if (!state.session?.token) {
    state.inventoryLoading = false;
    state.requiresLogin = true;
    state.items = [];
    dirtyMoneyValue.textContent = "--";
    syncAccess();
    renderInventoryTable();
    return;
  }

  state.inventoryLoading = true;
  state.requiresLogin = false;
  renderInventoryTable();

  try {
    const response = await apiWithSession("/inventory");
    state.requiresLogin = false;
    state.dirtyMoney = response.dirtyMoney || "0.00";
    state.items = response.items || [];
    state.viewer = response.viewer || state.viewer;
    dirtyMoneyValue.textContent = formatMoney(state.dirtyMoney);
  } catch (error) {
    state.items = [];
    state.requiresLogin = true;
    dirtyMoneyValue.textContent = "--";
    if (error.message !== "Authentication required.") {
      showToast(error.message, "error");
    }
  } finally {
    state.inventoryLoading = false;
    syncAccess();
    renderInventoryTable();
  }
}

async function loadAudit() {
  if (!canUseAdminTools()) {
    return;
  }

  state.auditLoading = true;
  renderAuditTable();

  try {
    const response = await apiWithSession(`/inventory/audit?page=${state.auditPage}`);
    state.auditEntries = response.entries || [];
    state.auditPage = response.page || 1;
    state.auditTotalPages = response.totalPages || 1;
    state.auditTotal = response.total || 0;
  } catch (error) {
    state.auditEntries = [];
    showToast(error.message, "error");
  } finally {
    state.auditLoading = false;
    renderAuditTable();
  }
}

async function loadRestorePoints() {
  if (!canUseAdminTools()) {
    return;
  }

  try {
    const response = await apiWithSession("/inventory/restore-points");
    state.restorePoints = response.restorePoints || [];
  } catch (error) {
    state.restorePoints = [];
    showToast(error.message, "error");
  }
}

async function refreshAdminData() {
  if (!canUseAdminTools()) {
    return;
  }

  await Promise.all([loadAudit(), loadRestorePoints()]);
}

async function updateItem(itemId, payload, successMessage) {
  const response = await apiWithSession(`/inventory/items/${itemId}`, {
    method: "PATCH",
    body: payload
  });
  state.items = state.items.map((item) => (item.id === response.item.id ? response.item : item));
  renderInventoryTable();
  populateInventorySelect();
  showToast(successMessage, "success");
  await refreshAdminData();
}

function normalizeInlineValue(field, value) {
  const trimmed = `${value ?? ""}`.trim();

  if (field === "name") {
    if (!trimmed) {
      throw new Error("Item name cannot be empty.");
    }
    return trimmed;
  }

  const numeric = Number(trimmed);
  const isQuantity = field === "quantity" || field === "reorderLevel";

  if (!Number.isFinite(numeric) || numeric < 0 || (isQuantity && !Number.isInteger(numeric))) {
    throw new Error(isQuantity ? "Use a whole number that is zero or greater." : "Use a money value that is zero or greater.");
  }

  return isQuantity ? numeric : numeric.toFixed(2);
}

function openInlineEditor(cell) {
  if (!canManageInventory()) {
    promptForManagement();
    return;
  }

  if (cell.querySelector("input")) {
    return;
  }

  const item = state.items.find((entry) => entry.id === cell.dataset.itemId);
  const field = cell.dataset.editField;

  if (!item || !field) {
    return;
  }

  const originalValue = cell.dataset.rawValue;
  const input = document.createElement("input");
  input.className = "inventory-inline-editor";
  input.value = originalValue;
  input.type = field === "name" ? "text" : "number";

  if (field !== "name") {
    input.min = "0";
    input.step = field === "quantity" || field === "reorderLevel" ? "1" : "0.01";
    input.inputMode = field === "quantity" || field === "reorderLevel" ? "numeric" : "decimal";
  }

  let completed = false;

  const restore = () => {
    if (completed) {
      return;
    }
    completed = true;
    renderInventoryTable();
  };

  const save = async () => {
    if (completed) {
      return;
    }

    let nextValue;
    try {
      nextValue = normalizeInlineValue(field, input.value);
    } catch (error) {
      showToast(error.message, "error");
      input.focus();
      return;
    }

    if (`${nextValue}` === `${originalValue}`) {
      restore();
      return;
    }

    completed = true;
    input.disabled = true;

    try {
      await updateItem(item.id, { [field]: nextValue }, `${humanize(field)} updated.`);
    } catch (error) {
      renderInventoryTable();
      showToast(error.message, "error");
    }
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      restore();
    }
  });
  input.addEventListener("blur", save, { once: true });

  cell.replaceChildren(input);
  input.focus();
  input.select();
}

function openLoginModal() {
  setMessage(loginError, "");
  toggleModal(loginModal, true);
  window.requestAnimationFrame(() => loginForm.elements.username.focus());
}

function closeLoginModal() {
  toggleModal(loginModal, false);
}

function openMoneyModal() {
  if (!canManageInventory()) {
    promptForManagement();
    return;
  }

  moneyForm.reset();
  moneyOperationSelect.value = "SET";
  syncMoneyOperationCopy();
  setMessage(moneyFormMessage, "");
  toggleModal(moneyModal, true);
  window.requestAnimationFrame(() => moneyForm.elements.value.focus());
}

function closeMoneyModal() {
  toggleModal(moneyModal, false);
}

function syncMoneyOperationCopy() {
  const operation = moneyOperationSelect.value;
  const copy = {
    SET: ["New balance", "Set replaces the current dirty-money balance."],
    ADD: ["Amount to add", "Add increases the current dirty-money balance."],
    SUBTRACT: ["Amount to subtract", "Subtract cannot reduce the balance below $0."]
  };
  const [label, hint] = copy[operation] || copy.SET;
  moneyValueLabel.textContent = label;
  moneyOperationHint.textContent = hint;
}

function openInventoryModal() {
  if (!canManageInventory()) {
    promptForManagement();
    return;
  }

  setMessage(inventoryFormMessage, "");
  syncInventoryFormMode("create");
  toggleModal(inventoryModal, true);
  window.requestAnimationFrame(() => inventoryForm.elements.name.focus());
}

function closeInventoryModal() {
  toggleModal(inventoryModal, false);
}

function openDeleteInventoryModal() {
  if (!canManageInventory()) {
    promptForManagement();
    return;
  }

  const item = state.items.find((entry) => entry.id === inventoryItemSelect.value);

  if (!item) {
    showToast("Choose a listing to delete.", "error");
    return;
  }

  state.pendingDeleteItemId = item.id;
  deleteInventoryName.textContent = item.name;
  toggleModal(deleteInventoryModal, true);
}

function closeDeleteInventoryModal() {
  state.pendingDeleteItemId = null;
  toggleModal(deleteInventoryModal, false);
  setButtonLoading(confirmDeleteInventoryButton, false, "Deleting", "Delete listing");
}

function openRevertAuditModal(entry) {
  if (!entry?.canRevert) {
    showToast("This action cannot be reverted.", "error");
    return;
  }

  state.pendingRevertAuditId = entry.id;
  revertAuditSummary.textContent = entry.summary;
  toggleModal(revertAuditModal, true);
}

function closeRevertAuditModal() {
  state.pendingRevertAuditId = null;
  toggleModal(revertAuditModal, false);
  setButtonLoading(confirmRevertAuditButton, false, "Reverting", "Revert action");
}

async function openRestoreModal() {
  if (!canUseAdminTools()) {
    promptForManagement();
    return;
  }

  await loadRestorePoints();
  populateRestorePoints();
  restoreForm.reset();
  setMessage(restoreFormMessage, "");
  toggleModal(restoreModal, true);
}

function closeRestoreModal() {
  toggleModal(restoreModal, false);
}

async function hydrateSession() {
  state.currentUser = null;

  if (!state.session?.token) {
    syncSessionButton();
    return;
  }

  try {
    const response = await apiWithSession("/auth/me");
    state.currentUser = response.user;
    state.session = { ...state.session, user: response.user };
    saveSession(state.session);
  } catch (_error) {
    clearSession();
    state.session = null;
  }

  syncSessionButton();
}

inventoryTableBody.addEventListener("dblclick", (event) => {
  const cell = event.target.closest("td[data-edit-field]");

  if (cell) {
    openInlineEditor(cell);
  }
});

sessionButton.addEventListener("click", async () => {
  if (sessionButton.dataset.state !== "session") {
    openLoginModal();
    return;
  }

  if (!window.confirm("Log out of this account?")) {
    return;
  }

  clearSession();
  state.session = null;
  state.currentUser = null;
  state.viewer = { isLoggedIn: false, canManage: false, canUseAdminTools: false };
  syncSessionButton();
  syncAccess();
  await loadInventory();
});

openMoneyModalButton.addEventListener("click", openMoneyModal);
openInventoryModalButton.addEventListener("click", openInventoryModal);
createRestorePointButton.addEventListener("click", async () => {
  if (!canUseAdminTools()) {
    promptForManagement();
    return;
  }

  setButtonLoading(createRestorePointButton, true, "Backing up", "Create restore point");
  try {
    await apiWithSession("/inventory/restore-points", { method: "POST", body: {} });
    showToast("Restore point created.", "success");
    await refreshAdminData();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setButtonLoading(createRestorePointButton, false, "Backing up", "Create restore point");
  }
});
openRestoreModalButton.addEventListener("click", openRestoreModal);

previousAuditPageButton.addEventListener("click", async () => {
  if (state.auditPage <= 1) {
    return;
  }
  state.auditPage -= 1;
  await loadAudit();
});

nextAuditPageButton.addEventListener("click", async () => {
  if (state.auditPage >= state.auditTotalPages) {
    return;
  }
  state.auditPage += 1;
  await loadAudit();
});

closeLoginButton.addEventListener("click", closeLoginModal);
closeLoginBackdrop.addEventListener("click", closeLoginModal);
closeMoneyButton.addEventListener("click", closeMoneyModal);
closeMoneyBackdrop.addEventListener("click", closeMoneyModal);
closeInventoryButton.addEventListener("click", closeInventoryModal);
closeInventoryBackdrop.addEventListener("click", closeInventoryModal);
closeRestoreButton.addEventListener("click", closeRestoreModal);
closeRestoreBackdrop.addEventListener("click", closeRestoreModal);
closeDeleteInventoryButton.addEventListener("click", closeDeleteInventoryModal);
closeDeleteInventoryBackdrop.addEventListener("click", closeDeleteInventoryModal);
cancelDeleteInventoryButton.addEventListener("click", closeDeleteInventoryModal);
closeRevertAuditButton.addEventListener("click", closeRevertAuditModal);
closeRevertAuditBackdrop.addEventListener("click", closeRevertAuditModal);
cancelRevertAuditButton.addEventListener("click", closeRevertAuditModal);

moneyOperationSelect.addEventListener("change", syncMoneyOperationCopy);

inventoryModeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    if (tab.dataset.inventoryMode === "edit" && !state.items.length) {
      showToast("Add an inventory listing before editing the list.", "info");
      return;
    }

    syncInventoryFormMode(tab.dataset.inventoryMode);
  });
});

inventoryItemSelect.addEventListener("change", () => {
  fillInventoryForm(state.items.find((item) => item.id === inventoryItemSelect.value));
});

deleteInventoryItemButton.addEventListener("click", openDeleteInventoryModal);

auditTableBody.addEventListener("click", (event) => {
  const actionButton = event.target.closest("button[data-audit-action]");

  if (!actionButton || actionButton.dataset.auditAction !== "revert") {
    return;
  }

  const entry = state.auditEntries.find((auditEntry) => auditEntry.id === actionButton.dataset.auditId);
  openRevertAuditModal(entry);
});

confirmDeleteInventoryButton.addEventListener("click", async () => {
  const itemId = state.pendingDeleteItemId;

  if (!itemId) {
    return;
  }

  setButtonLoading(confirmDeleteInventoryButton, true, "Deleting", "Delete listing");
  try {
    const response = await apiWithSession(`/inventory/items/${itemId}`, { method: "DELETE" });
    state.items = state.items.filter((item) => item.id !== itemId);
    populateInventorySelect();
    renderInventoryTable();
    closeDeleteInventoryModal();
    closeInventoryModal();
    showToast(response.message || "Inventory listing deleted.", "success");
    await refreshAdminData();
  } catch (error) {
    showToast(error.message, "error");
    setButtonLoading(confirmDeleteInventoryButton, false, "Deleting", "Delete listing");
  }
});

confirmRevertAuditButton.addEventListener("click", async () => {
  const auditId = state.pendingRevertAuditId;

  if (!auditId) {
    return;
  }

  setButtonLoading(confirmRevertAuditButton, true, "Reverting", "Revert action");
  try {
    const response = await apiWithSession(`/inventory/audit/${auditId}/revert`, {
      method: "POST",
      body: {}
    });
    closeRevertAuditModal();
    showToast(response.message || "Action reverted.", "success");
    await loadInventory();
    await refreshAdminData();
  } catch (error) {
    showToast(error.message, "error");
    setButtonLoading(confirmRevertAuditButton, false, "Reverting", "Revert action");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginError, "");
  setButtonLoading(loginSubmitButton, true, "Entering", "Enter");

  try {
    const response = await api("/auth/login", {
      method: "POST",
      body: Object.fromEntries(new FormData(loginForm).entries())
    });
    state.session = response;
    state.currentUser = response.user;
    saveSession(response);
    closeLoginModal();
    loginForm.reset();
    syncSessionButton();
    await loadInventory();
    await refreshAdminData();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(loginSubmitButton, false, "Entering", "Enter");
  }
});

moneyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(moneyFormMessage, "");
  setButtonLoading(moneySubmitButton, true, "Saving", "Save balance");

  try {
    const response = await apiWithSession("/inventory/dirty-money", {
      method: "POST",
      body: Object.fromEntries(new FormData(moneyForm).entries())
    });
    state.dirtyMoney = response.dirtyMoney;
    dirtyMoneyValue.textContent = formatMoney(state.dirtyMoney);
    closeMoneyModal();
    showToast("Dirty money updated.", "success");
    await refreshAdminData();
  } catch (error) {
    setMessage(moneyFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(moneySubmitButton, false, "Saving", "Save balance");
  }
});

inventoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(inventoryFormMessage, "");
  const isEditing = state.inventoryMode === "edit";
  setButtonLoading(inventorySubmitButton, true, isEditing ? "Saving" : "Adding", isEditing ? "Save listing" : "Add listing");
  const formData = new FormData(inventoryForm);
  const payload = {
    name: `${formData.get("name") || ""}`.trim(),
    quantity: formData.get("quantity"),
    reorderLevel: formData.get("reorderLevel"),
    internalPrice: formData.get("internalPrice"),
    externalPrice: formData.get("externalPrice"),
    unit: `${formData.get("unit") || ""}`.trim()
  };

  try {
    if (isEditing) {
      const itemId = `${formData.get("itemId") || ""}`;
      await updateItem(itemId, payload, "Inventory listing updated.");
      closeInventoryModal();
    } else {
      const response = await apiWithSession("/inventory/items", {
        method: "POST",
        body: payload
      });
      state.items = [...state.items, response.item].sort((left, right) => left.name.localeCompare(right.name));
      renderInventoryTable();
      populateInventorySelect();
      closeInventoryModal();
      showToast("Inventory listing added.", "success");
      await refreshAdminData();
    }
  } catch (error) {
    setMessage(inventoryFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(inventorySubmitButton, false, isEditing ? "Saving" : "Adding", isEditing ? "Save listing" : "Add listing");
  }
});

restoreForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!restoreForm.elements.confirmed.checked) {
    setMessage(restoreFormMessage, "Confirm that you want to reinstate this backup.");
    return;
  }

  setMessage(restoreFormMessage, "");
  setButtonLoading(restoreSubmitButton, true, "Restoring", "Reinstate backup");

  try {
    const restorePointId = `${new FormData(restoreForm).get("restorePointId") || ""}`;
    const response = await apiWithSession(`/inventory/restore-points/${restorePointId}/restore`, {
      method: "POST",
      body: {}
    });
    closeRestoreModal();
    showToast(response.message || "Restore point reinstated.", "success");
    await loadInventory();
    await refreshAdminData();
  } catch (error) {
    setMessage(restoreFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoading(restoreSubmitButton, false, "Restoring", "Reinstate backup");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  [revertAuditModal, deleteInventoryModal, restoreModal, inventoryModal, moneyModal, loginModal].some((modal) => {
    if (!modal.classList.contains("hidden")) {
      toggleModal(modal, false);
      return true;
    }
    return false;
  });
});

initThemeToggle(themeToggleButton);
syncSessionButton();
syncAccess();
renderInventoryTable();

await hydrateSession();
await loadInventory();
await refreshAdminData();