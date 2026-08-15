import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const $ = (selector) => document.querySelector(selector);

const TYPE_LABELS = {
  EARN: "Earned money",
  SPEND: "Spent money",
  PURCHASE: "Purchase",
  ITEM_ADDED: "Received item",
  ITEM_REMOVED: "Used or lost item",
  BALANCE_CORRECTION: "Cash correction",
  ITEM_CORRECTION: "Item correction"
};

const themeToggleButton = $("#themeToggleButton");
const sessionButton = $("#sessionButton");
const trackerAccessStatus = $("#trackerAccessStatus");
const sessionStatus = $("#sessionStatus");
const sessionActions = $("#sessionActions");
const startSessionButton = $("#startSessionButton");
const endSessionButton = $("#endSessionButton");
const openActivityModalButton = $("#openActivityModalButton");
const currentBalanceValue = $("#currentBalanceValue");
const currentBalanceMeta = $("#currentBalanceMeta");
const sessionEarnedValue = $("#sessionEarnedValue");
const sessionSpentValue = $("#sessionSpentValue");
const sessionNetValue = $("#sessionNetValue");
const allTimeEarnedValue = $("#allTimeEarnedValue");
const allTimeSpentValue = $("#allTimeSpentValue");
const holdingsMeta = $("#holdingsMeta");
const holdingsTableBody = $("#holdingsTableBody");
const activityTableBody = $("#activityTableBody");
const ledgerMeta = $("#ledgerMeta");
const ledgerFooter = $("#ledgerFooter");
const previousActivityPage = $("#previousActivityPage");
const nextActivityPage = $("#nextActivityPage");
const activityPageLabel = $("#activityPageLabel");
const adminColumns = [...document.querySelectorAll(".tracker-admin-column")];

const loginModal = $("#loginModal");
const loginForm = $("#loginForm");
const loginError = $("#loginError");
const loginSubmitButton = $("#loginSubmitButton");
const startSessionModal = $("#startSessionModal");
const startSessionForm = $("#startSessionForm");
const startSessionError = $("#startSessionError");
const startSessionSubmitButton = $("#startSessionSubmitButton");
const activityModal = $("#activityModal");
const activityForm = $("#activityForm");
const activityTypeSelect = $("#activityTypeSelect");
const activityFormHint = $("#activityFormHint");
const activitySubmitButton = $("#activitySubmitButton");
const activityFormError = $("#activityFormError");
const moneyField = $("#moneyField");
const moneyFieldLabel = $("#moneyFieldLabel");
const targetBalanceField = $("#targetBalanceField");
const itemNameField = $("#itemNameField");
const quantityField = $("#quantityField");
const quantityFieldLabel = $("#quantityFieldLabel");
const targetQuantityField = $("#targetQuantityField");
const revertActivityModal = $("#revertActivityModal");
const revertActivityName = $("#revertActivityName");
const confirmRevertActivityButton = $("#confirmRevertActivityButton");

const state = {
  session: getSession(),
  currentUser: null,
  viewer: { isLoggedIn: false, canManage: false },
  activeSession: null,
  summary: { currentBalance: 0, allTime: {}, currentSession: {}, holdings: [] },
  activities: [],
  pagination: { page: 1, totalPages: 1, total: 0 },
  loading: true,
  revertingActivityId: null
};

function showToast(message, tone = "success") {
  const toast = document.createElement("div");
  toast.className = "toast " + tone;
  toast.textContent = message;
  $("#toastStack").appendChild(toast);
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
  if (state.session?.token) {
    headers.set("Authorization", "Bearer " + state.session.token);
  }
  return api(path, { ...options, headers });
}

function canManage() {
  return Boolean(state.viewer.canManage);
}

function formatMoney(value) {
  const number = Number(value || 0);
  return "$" + new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: Number.isInteger(number) ? 0 : 2,
    maximumFractionDigits: 2
  }).format(number);
}

function formatQuantity(value) {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function createCell(value, className = "") {
  const cell = document.createElement("td");
  cell.className = className;
  if (value instanceof Node) {
    cell.appendChild(value);
  } else {
    cell.textContent = value;
  }
  return cell;
}

function createMessageRow(message, columns) {
  const row = document.createElement("tr");
  const cell = createCell(message, "inventory-table-message");
  cell.colSpan = columns;
  row.appendChild(cell);
  return row;
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
  const admin = canManage();
  trackerAccessStatus.textContent = admin ? "Admin controls enabled" : "Public view";
  trackerAccessStatus.classList.toggle("is-live", admin);
  sessionActions.hidden = !admin;
  openActivityModalButton.hidden = !admin;
  adminColumns.forEach((column) => {
    column.hidden = !admin;
  });
}

function renderSession() {
  const active = state.activeSession;
  const current = state.summary.currentSession || {};
  sessionStatus.classList.toggle("is-active", Boolean(active));
  endSessionButton.hidden = !active;
  startSessionButton.hidden = Boolean(active);

  if (!active) {
    sessionStatus.textContent = "No active session";
    currentBalanceMeta.textContent = "All active entries combined";
    return;
  }

  const label = active.label || "Current session";
  sessionStatus.textContent = label + " started " + formatTimestamp(active.startedAt);
  currentBalanceMeta.textContent = formatQuantity(current.activityCount) + " active "
    + (current.activityCount === 1 ? "entry" : "entries") + " in this session";
}

function renderMetrics() {
  const summary = state.summary || {};
  const current = summary.currentSession || {};
  const allTime = summary.allTime || {};
  currentBalanceValue.textContent = formatMoney(summary.currentBalance);
  sessionEarnedValue.textContent = formatMoney(current.earned);
  sessionSpentValue.textContent = formatMoney(current.spent);
  sessionNetValue.textContent = formatMoney(current.net);
  allTimeEarnedValue.textContent = formatMoney(allTime.earned);
  allTimeSpentValue.textContent = formatMoney(allTime.spent);
}

function renderHoldings() {
  const holdings = state.summary.holdings || [];
  holdingsTableBody.replaceChildren();

  if (state.loading) {
    holdingsMeta.textContent = "Loading holdings...";
    holdingsTableBody.appendChild(createMessageRow("Loading current holdings...", 2));
    return;
  }

  holdingsMeta.textContent = holdings.length
    ? formatQuantity(holdings.length) + " tracked " + (holdings.length === 1 ? "item" : "items")
    : "No items on hand";

  if (!holdings.length) {
    holdingsTableBody.appendChild(createMessageRow("No items are currently tracked. Log a purchase or received item to begin.", 2));
    return;
  }

  holdings.forEach((holding) => {
    const row = document.createElement("tr");
    row.append(
      createCell(holding.name),
      createCell(formatQuantity(holding.quantity), "tracker-holding-quantity")
    );
    holdingsTableBody.appendChild(row);
  });
}

function activityChange(activity) {
  const moneyDelta = Number(activity.moneyDelta || 0);
  const itemDelta = Number(activity.itemQuantityDelta || 0);
  const container = document.createElement("div");
  const isCorrection = activity.type === "BALANCE_CORRECTION" || activity.type === "ITEM_CORRECTION";
  container.className = "tracker-delta " + (isCorrection ? "adjustment" : moneyDelta < 0 || itemDelta < 0 ? "negative" : "positive");
  const primary = document.createElement("strong");
  const pieces = [];

  if (moneyDelta) {
    pieces.push((moneyDelta > 0 ? "+" : "-") + formatMoney(Math.abs(moneyDelta)));
  }
  if (itemDelta) {
    pieces.push((itemDelta > 0 ? "+" : "-") + formatQuantity(Math.abs(itemDelta)) + " units");
  }

  primary.textContent = pieces.join(" / ") || "No net change";
  container.appendChild(primary);

  if (isCorrection) {
    const note = document.createElement("span");
    note.textContent = "Set total correction";
    container.appendChild(note);
  }

  return container;
}

function activityTitle(activity) {
  const container = document.createElement("div");
  container.className = "tracker-activity-title";
  const title = document.createElement("strong");
  title.textContent = TYPE_LABELS[activity.type] || activity.type;
  container.appendChild(title);

  if (activity.description) {
    const description = document.createElement("small");
    description.textContent = activity.description;
    container.appendChild(description);
  }

  if (activity.revertedAt) {
    const reverted = document.createElement("span");
    reverted.className = "tracker-reverted-label";
    reverted.textContent = "Reverted";
    container.appendChild(reverted);
  }

  return container;
}

function activityItem(activity) {
  if (!activity.itemName) {
    return "-";
  }

  const container = document.createElement("div");
  container.className = "tracker-item-cell";
  const name = document.createElement("strong");
  name.textContent = activity.itemName;
  const amount = document.createElement("span");
  amount.textContent = (activity.itemQuantityDelta > 0 ? "+" : "")
    + formatQuantity(activity.itemQuantityDelta) + " units";
  container.append(name, amount);
  return container;
}

function renderActivities() {
  const activities = state.activities || [];
  const columns = canManage() ? 5 : 4;
  activityTableBody.replaceChildren();
  previousActivityPage.disabled = state.pagination.page <= 1;
  nextActivityPage.disabled = state.pagination.page >= state.pagination.totalPages;
  activityPageLabel.textContent = "Page " + state.pagination.page + " of " + state.pagination.totalPages;
  ledgerMeta.textContent = state.pagination.total
    ? formatQuantity(state.pagination.total) + " total ledger " + (state.pagination.total === 1 ? "entry" : "entries")
    : "No entries yet";
  ledgerFooter.textContent = canManage()
    ? "Reverting keeps the original entry visible but removes it from the live totals."
    : "Every entry remains visible so the current totals stay easy to check.";

  if (state.loading) {
    activityTableBody.appendChild(createMessageRow("Loading ledger...", columns));
    return;
  }

  if (!activities.length) {
    activityTableBody.appendChild(createMessageRow("No activity has been logged yet.", columns));
    return;
  }

  activities.forEach((activity) => {
    const row = document.createElement("tr");
    row.classList.toggle("is-reverted", Boolean(activity.revertedAt));
    row.append(
      createCell(activityTitle(activity)),
      createCell(activityChange(activity)),
      createCell(activityItem(activity)),
      createCell(formatTimestamp(activity.createdAt), "tracker-date-cell")
    );

    if (canManage()) {
      const action = document.createElement("td");
      if (activity.revertedAt) {
        action.textContent = "Reverted";
        action.className = "tracker-date-cell";
      } else {
        const button = document.createElement("button");
        button.className = "inventory-button ghost compact";
        button.type = "button";
        button.dataset.revertActivityId = activity.id;
        button.textContent = "Revert";
        action.appendChild(button);
      }
      row.appendChild(action);
    }

    activityTableBody.appendChild(row);
  });
}

function renderTracker() {
  syncAccess();
  renderSession();
  renderMetrics();
  renderHoldings();
  renderActivities();
}

function hydrateSession() {
  state.currentUser = state.session?.token ? state.session.user || null : null;
  syncSessionButton();
}

async function loadTracker(page = state.pagination.page) {
  state.loading = true;
  state.pagination.page = page;
  renderTracker();

  try {
    const request = state.session?.token ? apiWithSession : api;
    const response = await request("/tracker?page=" + page);
    state.activeSession = response.activeSession || null;
    state.summary = response.summary || state.summary;
    state.activities = response.activities || [];
    state.pagination = response.pagination || state.pagination;
    state.viewer = response.viewer || state.viewer;

    if (!state.viewer.isLoggedIn && state.session?.token) {
      clearSession();
      state.session = null;
      state.currentUser = null;
      syncSessionButton();
    }
  } catch (error) {
    state.activeSession = null;
    state.summary = { currentBalance: 0, allTime: {}, currentSession: {}, holdings: [] };
    state.activities = [];
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    renderTracker();
  }
}

function showAdminDenied() {
  showToast(state.currentUser ? "Admin access is required." : "Log in as an admin to use tracker controls.", "error");
}

function openStartSessionModal() {
  if (!canManage()) {
    showAdminDenied();
    return;
  }
  startSessionForm.reset();
  setMessage(startSessionError, "");
  toggleModal(startSessionModal, true);
  window.requestAnimationFrame(() => startSessionForm.elements.label.focus());
}

function syncActivityForm() {
  const type = activityTypeSelect.value;
  const usesMoney = ["EARN", "SPEND", "PURCHASE"].includes(type);
  const usesTargetBalance = type === "BALANCE_CORRECTION";
  const usesItem = ["PURCHASE", "ITEM_ADDED", "ITEM_REMOVED", "ITEM_CORRECTION"].includes(type);
  const usesQuantity = ["PURCHASE", "ITEM_ADDED", "ITEM_REMOVED"].includes(type);
  const usesTargetQuantity = type === "ITEM_CORRECTION";

  moneyField.classList.toggle("hidden", !usesMoney);
  targetBalanceField.classList.toggle("hidden", !usesTargetBalance);
  itemNameField.classList.toggle("hidden", !usesItem);
  quantityField.classList.toggle("hidden", !usesQuantity);
  targetQuantityField.classList.toggle("hidden", !usesTargetQuantity);
  activityForm.elements.amount.required = usesMoney;
  activityForm.elements.targetBalance.required = usesTargetBalance;
  activityForm.elements.itemName.required = usesItem && type !== "PURCHASE";
  activityForm.elements.quantity.required = usesQuantity && type !== "PURCHASE";
  activityForm.elements.targetQuantity.required = usesTargetQuantity;

  const config = {
    EARN: ["Amount earned", "Record money that was made in this session."],
    SPEND: ["Amount spent", "Record cash that left your balance without adding an item."],
    PURCHASE: ["Purchase cost", "Optionally add the item and quantity received with this purchase."],
    ITEM_ADDED: ["Amount", "Record an item received without changing your cash total."],
    ITEM_REMOVED: ["Amount", "Record an item used, sold, or lost without changing your cash total."],
    BALANCE_CORRECTION: ["Amount", "Set cash on hand exactly. The ledger records only the difference."],
    ITEM_CORRECTION: ["Amount", "Set an item total exactly. The ledger records only the difference."]
  }[type];

  moneyFieldLabel.textContent = config[0];
  quantityFieldLabel.textContent = "Item quantity";
  activityFormHint.textContent = config[1];
}

function openActivityModal() {
  if (!canManage()) {
    showAdminDenied();
    return;
  }
  activityForm.reset();
  activityTypeSelect.value = "EARN";
  setMessage(activityFormError, "");
  syncActivityForm();
  toggleModal(activityModal, true);
  window.requestAnimationFrame(() => activityTypeSelect.focus());
}

function openRevertActivityModal(activity) {
  if (!canManage() || activity.revertedAt) {
    return;
  }
  state.revertingActivityId = activity.id;
  revertActivityName.textContent = TYPE_LABELS[activity.type] || "Selected activity";
  toggleModal(revertActivityModal, true);
}

sessionButton.addEventListener("click", async () => {
  if (sessionButton.dataset.state !== "session") {
    setMessage(loginError, "");
    toggleModal(loginModal, true);
    window.requestAnimationFrame(() => loginForm.elements.username.focus());
    return;
  }

  if (!window.confirm("Log out of this account?")) {
    return;
  }

  clearSession();
  state.session = null;
  state.currentUser = null;
  state.viewer = { isLoggedIn: false, canManage: false };
  syncSessionButton();
  await loadTracker(1);
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
    loginForm.reset();
    toggleModal(loginModal, false);
    syncSessionButton();
    await loadTracker(1);
    showToast("Logged in successfully.");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(loginSubmitButton, false, "Entering", "Enter");
  }
});

startSessionButton.addEventListener("click", openStartSessionModal);

startSessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(startSessionError, "");
  setLoading(startSessionSubmitButton, true, "Starting", "Start session");

  try {
    await apiWithSession("/tracker/sessions", {
      method: "POST",
      body: { label: startSessionForm.elements.label.value.trim() }
    });
    toggleModal(startSessionModal, false);
    await loadTracker(1);
    showToast("Session started.");
  } catch (error) {
    setMessage(startSessionError, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(startSessionSubmitButton, false, "Starting", "Start session");
  }
});

endSessionButton.addEventListener("click", async () => {
  if (!state.activeSession || !window.confirm("End the current session? New activity will no longer count toward it.")) {
    return;
  }

  setLoading(endSessionButton, true, "Ending", "End session");
  try {
    await apiWithSession("/tracker/sessions/" + state.activeSession.id + "/end", { method: "POST" });
    await loadTracker(1);
    showToast("Session ended.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(endSessionButton, false, "Ending", "End session");
  }
});

openActivityModalButton.addEventListener("click", openActivityModal);
activityTypeSelect.addEventListener("change", syncActivityForm);

activityForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(activityFormError, "");
  setLoading(activitySubmitButton, true, "Saving", "Save activity");

  try {
    await apiWithSession("/tracker/activities", {
      method: "POST",
      body: Object.fromEntries(new FormData(activityForm).entries())
    });
    toggleModal(activityModal, false);
    await loadTracker(1);
    showToast("Activity saved.");
  } catch (error) {
    setMessage(activityFormError, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(activitySubmitButton, false, "Saving", "Save activity");
  }
});

activityTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-revert-activity-id]");
  if (!button) {
    return;
  }
  const activity = state.activities.find((entry) => entry.id === button.dataset.revertActivityId);
  if (activity) {
    openRevertActivityModal(activity);
  }
});

confirmRevertActivityButton.addEventListener("click", async () => {
  if (!state.revertingActivityId) {
    return;
  }
  setLoading(confirmRevertActivityButton, true, "Reverting", "Revert activity");

  try {
    await apiWithSession("/tracker/activities/" + state.revertingActivityId + "/revert", { method: "POST" });
    state.revertingActivityId = null;
    toggleModal(revertActivityModal, false);
    await loadTracker(state.pagination.page);
    showToast("Activity reverted.");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(confirmRevertActivityButton, false, "Reverting", "Revert activity");
  }
});

previousActivityPage.addEventListener("click", () => {
  if (state.pagination.page > 1) {
    loadTracker(state.pagination.page - 1);
  }
});

nextActivityPage.addEventListener("click", () => {
  if (state.pagination.page < state.pagination.totalPages) {
    loadTracker(state.pagination.page + 1);
  }
});

[
  ["closeLoginButton", loginModal],
  ["closeLoginBackdrop", loginModal],
  ["closeStartSessionButton", startSessionModal],
  ["closeStartSessionBackdrop", startSessionModal],
  ["closeActivityButton", activityModal],
  ["closeActivityBackdrop", activityModal],
  ["closeRevertActivityButton", revertActivityModal],
  ["closeRevertActivityBackdrop", revertActivityModal],
  ["cancelRevertActivityButton", revertActivityModal]
].forEach(([buttonId, modal]) => {
  $("#" + buttonId).addEventListener("click", () => toggleModal(modal, false));
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }
  [revertActivityModal, activityModal, startSessionModal, loginModal].some((modal) => {
    if (!modal.classList.contains("hidden")) {
      toggleModal(modal, false);
      return true;
    }
    return false;
  });
});

initThemeToggle(themeToggleButton);
hydrateSession();
renderTracker();
await loadTracker(1);
