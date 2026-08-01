import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const themeToggleButton = $("#themeToggleButton");
const sessionButton = $("#sessionButton");
const dispatchAccessStatus = $("#dispatchAccessStatus");
const openPhonebookButton = $("#openPhonebookButton");
const openDispatchModalButton = $("#openDispatchModalButton");
const dispatchSearchInput = $("#dispatchSearchInput");
const dispatchScopeSelect = $("#dispatchScopeSelect");
const dispatchTableBody = $("#dispatchTableBody");
const dispatchTableMeta = $("#dispatchTableMeta");
const previousDispatchPageButton = $("#previousDispatchPageButton");
const nextDispatchPageButton = $("#nextDispatchPageButton");
const dispatchPageLabel = $("#dispatchPageLabel");
const dispatchAdminSection = $("#dispatchAdminSection");
const collectionTableBody = $("#collectionTableBody");
const collectionTableMeta = $("#collectionTableMeta");
const previousCollectionPageButton = $("#previousCollectionPageButton");
const nextCollectionPageButton = $("#nextCollectionPageButton");
const collectionPageLabel = $("#collectionPageLabel");
const depositCollectionsButton = $("#depositCollectionsButton");
const dispatchAuditTableBody = $("#dispatchAuditTableBody");
const dispatchAuditTableMeta = $("#dispatchAuditTableMeta");
const previousAuditPageButton = $("#previousAuditPageButton");
const nextAuditPageButton = $("#nextAuditPageButton");
const dispatchAuditPageLabel = $("#dispatchAuditPageLabel");

const loginModal = $("#loginModal");
const loginForm = $("#loginForm");
const loginError = $("#loginError");
const loginSubmitButton = $("#loginSubmitButton");
const dispatchModal = $("#dispatchModal");
const dispatchForm = $("#dispatchForm");
const dispatchFormMessage = $("#dispatchFormMessage");
const dispatchSubmitButton = $("#dispatchSubmitButton");
const dispatchContactSelect = $("#dispatchContactSelect");
const dispatchInventorySelect = $("#dispatchInventorySelect");
const dispatchSaleTypeSelect = $("#dispatchSaleTypeSelect");
const dispatchDueDateField = $("#dispatchDueDateField");
const dispatchDueDateInput = $("#dispatchDueDateInput");
const dispatchTotalPreview = $("#dispatchTotalPreview");
const phonebookModal = $("#phonebookModal");
const phonebookTableBody = $("#phonebookTableBody");
const phonebookIncludeInactive = $("#phonebookIncludeInactive");
const contactModal = $("#contactModal");
const contactModalTitle = $("#contactModalTitle");
const contactForm = $("#contactForm");
const contactFormMessage = $("#contactFormMessage");
const contactSubmitButton = $("#contactSubmitButton");
const contactActiveField = $("#contactActiveField");
const paymentModal = $("#paymentModal");
const paymentRecordContext = $("#paymentRecordContext");
const paymentForm = $("#paymentForm");
const paymentFormMessage = $("#paymentFormMessage");
const paymentSubmitButton = $("#paymentSubmitButton");
const editRecordModal = $("#editRecordModal");
const editRecordForm = $("#editRecordForm");
const editRecordFormMessage = $("#editRecordFormMessage");
const editRecordSubmitButton = $("#editRecordSubmitButton");
const editRecordDueDateField = $("#editRecordDueDateField");
const voidModal = $("#voidModal");
const voidRecordContext = $("#voidRecordContext");
const voidForm = $("#voidForm");
const voidFormMessage = $("#voidFormMessage");
const voidSubmitButton = $("#voidSubmitButton");
const revertModal = $("#revertModal");
const revertSummary = $("#revertSummary");
const confirmRevertButton = $("#confirmRevertButton");

const state = {
  session: getSession(),
  currentUser: null,
  viewer: { isLoggedIn: false, isAdmin: false },
  records: [],
  registerLoading: true,
  requiresLogin: false,
  registerPage: 1,
  registerTotal: 0,
  registerTotalPages: 1,
  contacts: [],
  inventoryItems: [],
  collectionLoading: false,
  collections: [],
  collectionPage: 1,
  collectionTotal: 0,
  collectionTotalPages: 1,
  selectedPaymentIds: new Set(),
  auditLoading: false,
  auditEntries: [],
  auditPage: 1,
  auditTotal: 0,
  auditTotalPages: 1,
  editingContactId: null,
  selectedRecordId: null,
  pendingAuditId: null
};

function showToast(message, tone = "success") {
  const stack = $("#toastStack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  stack.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3400);
}

function setMessage(element, message = "") {
  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function setLoading(button, loading, loadingLabel, idleLabel) {
  button.disabled = loading;
  button.textContent = loading ? loadingLabel : idleLabel;
}

function toggleModal(modal, visible) {
  modal.classList.toggle("hidden", !visible);
  modal.setAttribute("aria-hidden", visible ? "false" : "true");
}

function apiWithSession(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (state.session?.token) headers.set("Authorization", `Bearer ${state.session.token}`);
  return api(path, { ...options, headers });
}

function isAdmin() {
  return Boolean(state.viewer.isAdmin);
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `$${new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount)}`;
}

function formatDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Sydney" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" }).format(date);
}

function dateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function humanize(value) {
  return `${value || ""}`.toLowerCase().split("_").filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function createCell(value, className = "") {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = value;
  return cell;
}

function createMessageRow(message, columns) {
  const row = document.createElement("tr");
  const cell = createCell(message, "dispatch-table-message");
  cell.colSpan = columns;
  row.appendChild(cell);
  return row;
}

function selectedRecord() {
  return state.records.find((record) => record.id === state.selectedRecordId) || null;
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
  const admin = isAdmin();
  dispatchAccessStatus.textContent = admin ? "Admin controls enabled" : state.currentUser ? "Member view" : "Login required";
  dispatchAccessStatus.classList.toggle("is-live", admin);
  openPhonebookButton.hidden = !admin;
  openDispatchModalButton.hidden = !admin;
  dispatchAdminSection.hidden = !admin;
  dispatchAdminSection.classList.toggle("hidden", !admin);
  $$(".dispatch-admin-column").forEach((column) => { column.hidden = !admin; });
  if (!admin) {
    state.selectedPaymentIds.clear();
    state.collections = [];
    state.auditEntries = [];
  }
}
function statusPill(status) {
  const pill = document.createElement("span");
  pill.className = `dispatch-status-pill ${`${status}`.toLowerCase()}`;
  pill.textContent = humanize(status);
  return pill;
}

function renderRegister() {
  dispatchTableBody.replaceChildren();
  const columns = isAdmin() ? 7 : 5;
  if (state.registerLoading) {
    dispatchTableBody.appendChild(createMessageRow("Loading Dispatch...", columns));
    dispatchTableMeta.textContent = "Loading Dispatch...";
    return;
  }
  if (state.requiresLogin) {
    dispatchTableBody.appendChild(createMessageRow("Log in to view Dispatch.", columns));
    dispatchTableMeta.textContent = "Login required";
    return;
  }
  if (!state.records.length) {
    dispatchTableBody.appendChild(createMessageRow("No dispatches match this view.", columns));
    dispatchTableMeta.textContent = "0 records";
    return;
  }

  state.records.forEach((record) => {
    const row = document.createElement("tr");
    const released = document.createElement("td");
    const item = document.createElement("strong");
    item.className = "dispatch-item-name";
    item.textContent = record.itemName;
    const quantity = document.createElement("small");
    quantity.textContent = `${new Intl.NumberFormat("en-AU").format(record.quantity)} ${record.unit}`;
    released.append(item, quantity);
    const status = document.createElement("td");
    status.appendChild(statusPill(record.status));
    row.append(
      createCell(record.contactName, "dispatch-item-name"),
      released,
      createCell(record.saleType === "PAID_UPFRONT" ? "Paid upfront" : "On credit"),
      createCell(formatDate(record.dueDate), "dispatch-updated-cell"),
      status
    );

    if (isAdmin()) {
      row.appendChild(createCell(formatMoney(record.balance), "dispatch-money-cell"));
      const actions = document.createElement("td");
      const actionRow = document.createElement("div");
      actionRow.className = "dispatch-audit-actions";
      if (!["PAID", "VOIDED"].includes(record.status)) {
        const collect = document.createElement("button");
        collect.className = "dispatch-button gold compact";
        collect.type = "button";
        collect.dataset.recordAction = "collect";
        collect.dataset.recordId = record.id;
        collect.textContent = "Collect";
        actionRow.appendChild(collect);
      }
      const edit = document.createElement("button");
      edit.className = "dispatch-button ghost compact";
      edit.type = "button";
      edit.dataset.recordAction = "edit";
      edit.dataset.recordId = record.id;
      edit.textContent = "Edit";
      edit.disabled = record.status === "VOIDED";
      const voidButton = document.createElement("button");
      voidButton.className = "dispatch-button danger compact";
      voidButton.type = "button";
      voidButton.dataset.recordAction = "void";
      voidButton.dataset.recordId = record.id;
      voidButton.textContent = "Void";
      voidButton.disabled = record.status === "VOIDED";
      actionRow.append(edit, voidButton);
      actions.appendChild(actionRow);
      row.appendChild(actions);
    }
    dispatchTableBody.appendChild(row);
  });

  dispatchTableMeta.textContent = `Showing ${(state.registerPage - 1) * 25 + 1}-${Math.min(state.registerPage * 25, state.registerTotal)} of ${state.registerTotal} dispatches`;
  dispatchPageLabel.textContent = `Page ${state.registerPage} of ${state.registerTotalPages}`;
  previousDispatchPageButton.disabled = state.registerPage <= 1;
  nextDispatchPageButton.disabled = state.registerPage >= state.registerTotalPages;
}

function renderCollections() {
  collectionTableBody.replaceChildren();
  if (!isAdmin()) return;
  if (state.collectionLoading) {
    collectionTableBody.appendChild(createMessageRow("Loading pending collections...", 6));
    return;
  }
  if (!state.collections.length) {
    collectionTableBody.appendChild(createMessageRow("No pending collections to deposit.", 6));
  } else {
    state.collections.forEach((payment) => {
      const row = document.createElement("tr");
      const selection = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = payment.id;
      checkbox.checked = state.selectedPaymentIds.has(payment.id);
      checkbox.dataset.collectionId = payment.id;
      selection.appendChild(checkbox);
      row.append(
        selection,
        createCell(payment.dispatch?.contactName || "Unknown", "dispatch-item-name"),
        createCell(payment.dispatch ? `${payment.dispatch.itemName} (${payment.dispatch.unit})` : "Unknown"),
        createCell(formatMoney(payment.amount), "dispatch-money-cell"),
        createCell(payment.recordedByName),
        createCell(formatDateTime(payment.createdAt), "dispatch-updated-cell")
      );
      collectionTableBody.appendChild(row);
    });
  }
  collectionTableMeta.textContent = state.collectionTotal
    ? `${state.selectedPaymentIds.size} selected. ${state.collectionTotal} pending collection ${state.collectionTotal === 1 ? "entry" : "entries"}.`
    : "0 pending collection entries";
  collectionPageLabel.textContent = `Page ${state.collectionPage} of ${state.collectionTotalPages}`;
  previousCollectionPageButton.disabled = state.collectionPage <= 1;
  nextCollectionPageButton.disabled = state.collectionPage >= state.collectionTotalPages;
  depositCollectionsButton.disabled = !state.selectedPaymentIds.size;
}

function renderAudit() {
  dispatchAuditTableBody.replaceChildren();
  if (!isAdmin()) return;
  if (state.auditLoading) {
    dispatchAuditTableBody.appendChild(createMessageRow("Loading Dispatch history...", 5));
    return;
  }
  if (!state.auditEntries.length) {
    dispatchAuditTableBody.appendChild(createMessageRow("No Dispatch actions have been recorded yet.", 5));
  } else {
    state.auditEntries.forEach((entry) => {
      const row = document.createElement("tr");
      const action = document.createElement("td");
      if (entry.canRevert) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dispatch-button ghost compact";
        button.dataset.auditAction = "revert";
        button.dataset.auditId = entry.id;
        button.textContent = "Revert";
        action.appendChild(button);
      } else {
        const label = document.createElement("span");
        label.className = "dispatch-audit-state";
        label.textContent = entry.revertedAt ? "Reverted" : "Recorded";
        action.appendChild(label);
      }
      row.append(
        createCell(humanize(entry.action), "dispatch-item-name"),
        createCell(entry.summary),
        createCell(entry.actorName),
        createCell(formatDateTime(entry.createdAt), "dispatch-updated-cell"),
        action
      );
      dispatchAuditTableBody.appendChild(row);
    });
  }
  dispatchAuditTableMeta.textContent = state.auditTotal
    ? `Showing ${(state.auditPage - 1) * 10 + 1}-${Math.min(state.auditPage * 10, state.auditTotal)} of ${state.auditTotal} actions`
    : "0 recorded actions";
  dispatchAuditPageLabel.textContent = `Page ${state.auditPage} of ${state.auditTotalPages}`;
  previousAuditPageButton.disabled = state.auditPage <= 1;
  nextAuditPageButton.disabled = state.auditPage >= state.auditTotalPages;
}

function renderPhonebook() {
  phonebookTableBody.replaceChildren();
  if (!state.contacts.length) {
    phonebookTableBody.appendChild(createMessageRow("No active phonebook contacts yet.", 5));
    return;
  }
  state.contacts.forEach((contact) => {
    const row = document.createElement("tr");
    const action = document.createElement("td");
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "dispatch-button ghost compact";
    edit.dataset.contactAction = "edit";
    edit.dataset.contactId = contact.id;
    edit.textContent = "Edit";
    action.appendChild(edit);
    row.append(
      createCell(contact.name, "dispatch-item-name"),
      createCell(contact.phoneNumber),
      createCell(`${contact.activeDispatchCount} active`),
      createCell(formatMoney(contact.outstanding), "dispatch-money-cell"),
      action
    );
    phonebookTableBody.appendChild(row);
  });
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

async function loadDispatch() {
  if (!state.session?.token) {
    state.records = [];
    state.registerLoading = false;
    state.requiresLogin = true;
    state.viewer = { isLoggedIn: false, isAdmin: false };
    syncAccess();
    renderRegister();
    return;
  }
  state.registerLoading = true;
  state.requiresLogin = false;
  renderRegister();
  try {
    const params = new URLSearchParams({
      page: `${state.registerPage}`,
      scope: dispatchScopeSelect.value,
      search: dispatchSearchInput.value.trim()
    });
    const response = await apiWithSession(`/dispatch?${params}`);
    state.records = response.records || [];
    state.registerPage = response.page || 1;
    state.registerTotal = response.total || 0;
    state.registerTotalPages = response.totalPages || 1;
    state.viewer = response.viewer || state.viewer;
  } catch (error) {
    state.records = [];
    state.requiresLogin = true;
    if (error.message === "Invalid or expired session." || error.message === "Authentication required.") {
      clearSession();
      state.session = null;
      state.currentUser = null;
      syncSessionButton();
    } else {
      showToast(error.message, "error");
    }
  } finally {
    state.registerLoading = false;
    syncAccess();
    renderRegister();
  }
}

async function loadContacts({ includeInactive = false } = {}) {
  if (!isAdmin()) return;
  const query = includeInactive ? "?includeInactive=true" : "";
  const response = await apiWithSession(`/dispatch/contacts${query}`);
  state.contacts = response.contacts || [];
}

async function loadInventoryOptions() {
  const response = await apiWithSession("/inventory");
  state.inventoryItems = response.items || [];
}

async function loadCollections() {
  if (!isAdmin()) return;
  state.collectionLoading = true;
  renderCollections();
  try {
    const response = await apiWithSession(`/dispatch/collections?page=${state.collectionPage}`);
    state.collections = response.payments || [];
    state.collectionPage = response.page || 1;
    state.collectionTotal = response.total || 0;
    state.collectionTotalPages = response.totalPages || 1;

  } catch (error) {
    state.collections = [];
    showToast(error.message, "error");
  } finally {
    state.collectionLoading = false;
    renderCollections();
  }
}

async function loadAudit() {
  if (!isAdmin()) return;
  state.auditLoading = true;
  renderAudit();
  try {
    const response = await apiWithSession(`/dispatch/audit?page=${state.auditPage}`);
    state.auditEntries = response.entries || [];
    state.auditPage = response.page || 1;
    state.auditTotal = response.total || 0;
    state.auditTotalPages = response.totalPages || 1;
  } catch (error) {
    state.auditEntries = [];
    showToast(error.message, "error");
  } finally {
    state.auditLoading = false;
    renderAudit();
  }
}

async function refreshAdminData() {
  if (!isAdmin()) return;
  await Promise.all([loadCollections(), loadAudit()]);
}

function populateDispatchOptions() {
  dispatchContactSelect.replaceChildren();
  state.contacts.forEach((contact) => {
    const option = document.createElement("option");
    option.value = contact.id;
    option.textContent = `${contact.name} - ${contact.phoneNumber}`;
    dispatchContactSelect.appendChild(option);
  });
  dispatchInventorySelect.replaceChildren();
  state.inventoryItems.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.dataset.price = item.externalPrice || "0";
    option.textContent = `${item.name} (${item.quantity} ${item.unit})`;
    dispatchInventorySelect.appendChild(option);
  });
}

function syncDispatchForm() {
  const credit = dispatchSaleTypeSelect.value === "ON_CREDIT";
  dispatchDueDateField.classList.toggle("hidden", !credit);
  dispatchDueDateInput.required = credit;
  const item = state.inventoryItems.find((entry) => entry.id === dispatchInventorySelect.value);
  if (item && !dispatchForm.elements.unitPrice.value) dispatchForm.elements.unitPrice.value = item.externalPrice || "0";
  const quantity = Number(dispatchForm.elements.quantity.value || 0);
  const price = Number(dispatchForm.elements.unitPrice.value || 0);
  dispatchTotalPreview.textContent = formatMoney(quantity * price);
}

async function openDispatchModal() {
  try {
    await Promise.all([loadContacts(), loadInventoryOptions()]);
    if (!state.contacts.length) {
      showToast("Add an active person in Phonebook before creating a dispatch.", "info");
      await openPhonebookModal();
      return;
    }
    if (!state.inventoryItems.length) {
      showToast("Add an Inventory listing before creating a dispatch.", "info");
      return;
    }
    populateDispatchOptions();
    dispatchForm.reset();
    dispatchSaleTypeSelect.value = "PAID_UPFRONT";
    setMessage(dispatchFormMessage, "");
    syncDispatchForm();
    toggleModal(dispatchModal, true);
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function openPhonebookModal() {
  try {
    await loadContacts({ includeInactive: phonebookIncludeInactive.checked });
    renderPhonebook();
    toggleModal(phonebookModal, true);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function openContactModal(contact = null) {
  state.editingContactId = contact?.id || null;
  contactForm.reset();
  setMessage(contactFormMessage, "");
  contactModalTitle.textContent = contact ? "Edit person" : "Add person";
  contactSubmitButton.textContent = contact ? "Save person" : "Add person";
  contactActiveField.hidden = !contact;
  if (contact) {
    contactForm.elements.name.value = contact.name;
    contactForm.elements.phoneNumber.value = contact.phoneNumber;
    contactForm.elements.notes.value = contact.notes || "";
    contactForm.elements.active.checked = contact.active;
  }
  toggleModal(contactModal, true);
}

function openPaymentModal(record) {
  state.selectedRecordId = record.id;
  paymentForm.reset();
  setMessage(paymentFormMessage, "");
  paymentForm.elements.amount.max = record.balance;
  paymentRecordContext.textContent = `${record.contactName} owes ${formatMoney(record.balance)} for ${record.itemName}.`;
  toggleModal(paymentModal, true);
}

function openEditRecordModal(record) {
  state.selectedRecordId = record.id;
  editRecordForm.reset();
  setMessage(editRecordFormMessage, "");
  editRecordForm.elements.unitPrice.value = record.unitPrice;
  editRecordForm.elements.dueDate.value = dateInputValue(record.dueDate);
  editRecordForm.elements.notes.value = record.notes || "";
  editRecordDueDateField.classList.toggle("hidden", record.saleType !== "ON_CREDIT");
  editRecordForm.elements.dueDate.required = record.saleType === "ON_CREDIT";
  toggleModal(editRecordModal, true);
}

function openVoidModal(record) {
  state.selectedRecordId = record.id;
  voidForm.reset();
  setMessage(voidFormMessage, "");
  voidRecordContext.textContent = `${record.contactName}: ${record.itemName}, ${record.quantity} ${record.unit}.`;
  toggleModal(voidModal, true);
}

function closeModal(modal) {
  toggleModal(modal, false);
}

function bindClose(buttonId, modal) {
  $(`#${buttonId}`).addEventListener("click", () => closeModal(modal));
}

sessionButton.addEventListener("click", async () => {
  if (sessionButton.dataset.state !== "session") {
    setMessage(loginError, "");
    toggleModal(loginModal, true);
    window.requestAnimationFrame(() => loginForm.elements.username.focus());
    return;
  }
  if (!window.confirm("Log out of this account?")) return;
  clearSession();
  state.session = null;
  state.currentUser = null;
  syncSessionButton();
  await loadDispatch();
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginError, "");
  setLoading(loginSubmitButton, true, "Entering", "Enter");
  try {
    const session = await api("/auth/login", {
      method: "POST",
      body: Object.fromEntries(new FormData(loginForm).entries())
    });
    state.session = session;
    state.currentUser = session.user;
    saveSession(session);
    closeModal(loginModal);
    loginForm.reset();
    syncSessionButton();
    await loadDispatch();
    await refreshAdminData();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(loginSubmitButton, false, "Entering", "Enter");
  }
});

openPhonebookButton.addEventListener("click", openPhonebookModal);
openDispatchModalButton.addEventListener("click", openDispatchModal);
$("#openContactModalButton").addEventListener("click", () => openContactModal());
phonebookIncludeInactive.addEventListener("change", async () => {
  try {
    await loadContacts({ includeInactive: phonebookIncludeInactive.checked });
    renderPhonebook();
  } catch (error) {
    showToast(error.message, "error");
  }
});

phonebookTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-contact-action]");
  if (!button) return;
  const contact = state.contacts.find((entry) => entry.id === button.dataset.contactId);
  if (contact) openContactModal(contact);
});

dispatchForm.addEventListener("input", syncDispatchForm);
dispatchSaleTypeSelect.addEventListener("change", syncDispatchForm);
dispatchInventorySelect.addEventListener("change", () => {
  const item = state.inventoryItems.find((entry) => entry.id === dispatchInventorySelect.value);
  if (item) dispatchForm.elements.unitPrice.value = item.externalPrice || "0";
  syncDispatchForm();
});

dispatchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(dispatchFormMessage, "");
  setLoading(dispatchSubmitButton, true, "Releasing", "Release stock");
  try {
    const body = Object.fromEntries(new FormData(dispatchForm).entries());
    const response = await apiWithSession("/dispatch/records", { method: "POST", body });
    closeModal(dispatchModal);
    showToast(`${response.record.itemName} released to ${response.record.contactName}.`, "success");
    state.registerPage = 1;
    await loadDispatch();
    await refreshAdminData();
  } catch (error) {
    setMessage(dispatchFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(dispatchSubmitButton, false, "Releasing", "Release stock");
  }
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(contactFormMessage, "");
  const editing = Boolean(state.editingContactId);
  setLoading(contactSubmitButton, true, "Saving", editing ? "Save person" : "Add person");
  try {
    const body = Object.fromEntries(new FormData(contactForm).entries());
    if (editing) body.active = contactForm.elements.active.checked;
    const response = await apiWithSession(editing ? `/dispatch/contacts/${state.editingContactId}` : "/dispatch/contacts", {
      method: editing ? "PATCH" : "POST",
      body
    });
    closeModal(contactModal);
    await loadContacts({ includeInactive: phonebookIncludeInactive.checked });
    renderPhonebook();
    showToast(`${response.contact.name} saved to Phonebook.`, "success");
  } catch (error) {
    setMessage(contactFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(contactSubmitButton, false, "Saving", editing ? "Save person" : "Add person");
  }
});

dispatchTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-record-action]");
  if (!button) return;
  const record = state.records.find((entry) => entry.id === button.dataset.recordId);
  if (!record) return;
  if (button.dataset.recordAction === "collect") openPaymentModal(record);
  if (button.dataset.recordAction === "edit") openEditRecordModal(record);
  if (button.dataset.recordAction === "void") openVoidModal(record);
});

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const record = selectedRecord();
  if (!record) return;
  setMessage(paymentFormMessage, "");
  setLoading(paymentSubmitButton, true, "Recording", "Record payment");
  try {
    const body = Object.fromEntries(new FormData(paymentForm).entries());
    await apiWithSession(`/dispatch/records/${record.id}/payments`, { method: "POST", body });
    closeModal(paymentModal);
    showToast("Payment recorded in the collection ledger.", "success");
    await loadDispatch();
    await refreshAdminData();
  } catch (error) {
    setMessage(paymentFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(paymentSubmitButton, false, "Recording", "Record payment");
  }
});

editRecordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const record = selectedRecord();
  if (!record) return;
  setMessage(editRecordFormMessage, "");
  setLoading(editRecordSubmitButton, true, "Saving", "Save correction");
  try {
    const body = Object.fromEntries(new FormData(editRecordForm).entries());
    await apiWithSession(`/dispatch/records/${record.id}`, { method: "PATCH", body });
    closeModal(editRecordModal);
    showToast("Dispatch correction saved.", "success");
    await loadDispatch();
    await refreshAdminData();
  } catch (error) {
    setMessage(editRecordFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(editRecordSubmitButton, false, "Saving", "Save correction");
  }
});

voidForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const record = selectedRecord();
  if (!record) return;
  setMessage(voidFormMessage, "");
  setLoading(voidSubmitButton, true, "Voiding", "Void dispatch");
  try {
    const body = {
      returnStock: voidForm.elements.returnStock.checked,
      note: voidForm.elements.note.value
    };
    await apiWithSession(`/dispatch/records/${record.id}/void`, { method: "POST", body });
    closeModal(voidModal);
    showToast("Dispatch voided.", "success");
    await loadDispatch();
    await refreshAdminData();
  } catch (error) {
    setMessage(voidFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(voidSubmitButton, false, "Voiding", "Void dispatch");
  }
});

collectionTableBody.addEventListener("change", (event) => {
  const checkbox = event.target.closest("input[data-collection-id]");
  if (!checkbox) return;
  if (checkbox.checked) state.selectedPaymentIds.add(checkbox.dataset.collectionId);
  else state.selectedPaymentIds.delete(checkbox.dataset.collectionId);
  renderCollections();
});

depositCollectionsButton.addEventListener("click", async () => {
  const paymentIds = [...state.selectedPaymentIds];
  if (!paymentIds.length) return;
  if (!window.confirm(`Deposit ${paymentIds.length} selected collection ${paymentIds.length === 1 ? "entry" : "entries"} into Dirty Money?`)) return;
  setLoading(depositCollectionsButton, true, "Depositing", "Deposit selected");
  try {
    const response = await apiWithSession("/dispatch/collections/deposit", { method: "POST", body: { paymentIds } });
    state.selectedPaymentIds.clear();
    showToast(response.message, "success");
    await loadCollections();
    await loadAudit();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(depositCollectionsButton, false, "Depositing", "Deposit selected");
  }
});

dispatchAuditTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-audit-action]");
  if (!button) return;
  const entry = state.auditEntries.find((auditEntry) => auditEntry.id === button.dataset.auditId);
  if (!entry?.canRevert) return;
  state.pendingAuditId = entry.id;
  revertSummary.textContent = entry.summary;
  toggleModal(revertModal, true);
});

confirmRevertButton.addEventListener("click", async () => {
  if (!state.pendingAuditId) return;
  setLoading(confirmRevertButton, true, "Reverting", "Revert action");
  try {
    const response = await apiWithSession(`/dispatch/audit/${state.pendingAuditId}/revert`, { method: "POST", body: {} });
    closeModal(revertModal);
    state.pendingAuditId = null;
    showToast(response.message, "success");
    await loadDispatch();
    await refreshAdminData();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(confirmRevertButton, false, "Reverting", "Revert action");
  }
});

previousDispatchPageButton.addEventListener("click", async () => {
  if (state.registerPage <= 1) return;
  state.registerPage -= 1;
  await loadDispatch();
});
nextDispatchPageButton.addEventListener("click", async () => {
  if (state.registerPage >= state.registerTotalPages) return;
  state.registerPage += 1;
  await loadDispatch();
});
previousCollectionPageButton.addEventListener("click", async () => {
  if (state.collectionPage <= 1) return;
  state.collectionPage -= 1;
  await loadCollections();
});
nextCollectionPageButton.addEventListener("click", async () => {
  if (state.collectionPage >= state.collectionTotalPages) return;
  state.collectionPage += 1;
  await loadCollections();
});
previousAuditPageButton.addEventListener("click", async () => {
  if (state.auditPage <= 1) return;
  state.auditPage -= 1;
  await loadAudit();
});
nextAuditPageButton.addEventListener("click", async () => {
  if (state.auditPage >= state.auditTotalPages) return;
  state.auditPage += 1;
  await loadAudit();
});

dispatchScopeSelect.addEventListener("change", async () => {
  state.registerPage = 1;
  await loadDispatch();
});
let searchTimer;
dispatchSearchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(async () => {
    state.registerPage = 1;
    await loadDispatch();
  }, 260);
});

bindClose("closeLoginButton", loginModal);
bindClose("closeLoginBackdrop", loginModal);
bindClose("closeDispatchButton", dispatchModal);
bindClose("closeDispatchBackdrop", dispatchModal);
bindClose("closePhonebookButton", phonebookModal);
bindClose("closePhonebookBackdrop", phonebookModal);
bindClose("closeContactButton", contactModal);
bindClose("closeContactBackdrop", contactModal);
bindClose("closePaymentButton", paymentModal);
bindClose("closePaymentBackdrop", paymentModal);
bindClose("closeEditRecordButton", editRecordModal);
bindClose("closeEditRecordBackdrop", editRecordModal);
bindClose("closeVoidButton", voidModal);
bindClose("closeVoidBackdrop", voidModal);
bindClose("closeRevertButton", revertModal);
bindClose("closeRevertBackdrop", revertModal);
$("#cancelRevertButton").addEventListener("click", () => closeModal(revertModal));

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  [revertModal, voidModal, editRecordModal, paymentModal, contactModal, phonebookModal, dispatchModal, loginModal].some((modal) => {
    if (!modal.classList.contains("hidden")) {
      closeModal(modal);
      return true;
    }
    return false;
  });
});

initThemeToggle(themeToggleButton);
syncSessionButton();
syncAccess();
renderRegister();
await hydrateSession();
await loadDispatch();
await refreshAdminData();
