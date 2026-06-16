import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const themeToggleButton = document.querySelector("#themeToggleButton");
const sessionButton = document.querySelector("#sessionButton");
const trustFundMeta = document.querySelector("#trustFundMeta");
const trustFundSummaryGrid = document.querySelector("#trustFundSummaryGrid");
const weekComparisonChart = document.querySelector("#weekComparisonChart");
const transactionTableBody = document.querySelector("#transactionTableBody");
const trustAdminGrid = document.querySelector("#trustAdminGrid");
const openCreateLogButton = document.querySelector("#openCreateLogButton");
const auditTableBody = document.querySelector("#auditTableBody");
const loginModal = document.querySelector("#loginModal");
const closeLoginButton = document.querySelector("#closeLoginButton");
const closeLoginBackdrop = document.querySelector("#closeLoginBackdrop");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const loginHint = document.querySelector("#loginHint");
const loginSubmitButton = document.querySelector("#loginSubmitButton");
const createLogModal = document.querySelector("#createLogModal");
const closeCreateLogButton = document.querySelector("#closeCreateLogButton");
const closeCreateLogBackdrop = document.querySelector("#closeCreateLogBackdrop");
const createLogForm = document.querySelector("#createLogForm");
const logPreviewText = document.querySelector("#logPreviewText");
const createLogSubmitButton = document.querySelector("#createLogSubmitButton");
const createLogMessage = document.querySelector("#createLogMessage");

const state = {
  session: getSession(),
  viewer: {
    isLoggedIn: false,
    isAdmin: false,
    canManage: false
  },
  totals: {
    currentTotal: "0.00",
    totalMade: "0.00",
    totalSpent: "0.00"
  },
  weekComparison: null,
  recentTransactions: [],
  auditLog: []
};

let refreshHandle = null;

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
  }, 3200);
}

function setMessage(element, message = "") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.toggle("hidden", !message);
}

function setButtonLoadingState(button, loading, busyLabel, idleLabel) {
  if (!button) {
    return;
  }

  button.classList.toggle("is-loading", loading);
  button.disabled = loading;
  button.textContent = loading ? busyLabel : idleLabel;
}

function getSessionHeaders(headers = {}) {
  const merged = new Headers(headers);

  if (state.session?.token) {
    merged.set("Authorization", `Bearer ${state.session.token}`);
  }

  return merged;
}

function normalizeViewer(viewer = {}) {
  const sessionIsAdmin = state.session?.user?.role === "ADMIN";
  const isAdmin = Boolean(viewer?.isAdmin && sessionIsAdmin);

  return {
    isLoggedIn: Boolean(viewer?.isLoggedIn || state.session?.token),
    isAdmin,
    canManage: Boolean(viewer?.canManage && isAdmin)
  };
}

async function apiWithOptionalSession(path, options = {}) {
  return api(path, {
    ...options,
    headers: getSessionHeaders(options.headers)
  });
}

function toggleModal(modal, visible) {
  modal?.classList.toggle("hidden", !visible);
  modal?.setAttribute("aria-hidden", visible ? "false" : "true");
}

function formatMoney(value) {
  const amount = Number(value || 0);
  const formattedAmount = new Intl.NumberFormat("en-AU", {
    maximumFractionDigits: 0
  }).format(Math.abs(amount));

  return `${amount < 0 ? "-" : ""}$${formattedAmount}`;
}

function formatDateTime(value) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatDateTimeLocalValue(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function formatType(value) {
  return `${value || ""}`
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function getTypeTone(type) {
  if (type === "PROFIT") {
    return "good";
  }

  if (type === "PURCHASE") {
    return "warning";
  }

  return "danger";
}

function createBadge(text, tone = "neutral") {
  const badge = document.createElement("span");
  badge.className = `status-pill ${tone}`;
  badge.textContent = text;
  return badge;
}

function createTableMessageRow(message, columnCount) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columnCount;
  cell.className = "table-message-cell";
  cell.textContent = message;
  row.appendChild(cell);
  return row;
}

function createSummaryCard(label, value, tone = "neutral") {
  const card = document.createElement("article");
  card.className = `trust-summary-card ${tone}`;

  const span = document.createElement("span");
  span.textContent = label;

  const strong = document.createElement("strong");
  strong.textContent = value;

  card.append(span, strong);
  return card;
}

function syncSessionButton() {
  if (state.session?.user?.name && state.viewer.canManage) {
    sessionButton.textContent = state.session.user.name;
    sessionButton.dataset.state = "session";
    loginHint.textContent = "You can create and revert trust fund logs from this account.";
    return;
  }

  if (state.session?.user?.name && state.viewer.isLoggedIn) {
    sessionButton.textContent = "Public view";
    sessionButton.dataset.state = "session";
    loginHint.textContent = "This account can view the live fund, but admin tools are hidden.";
    return;
  }

  sessionButton.textContent = "Login";
  sessionButton.dataset.state = "login";
  loginHint.textContent = "Public viewers can watch the live fund. Admins can create and revert logs.";
}

function renderSummary() {
  trustFundSummaryGrid.textContent = "";
  trustFundSummaryGrid.append(
    createSummaryCard("Current total", formatMoney(state.totals.currentTotal), Number(state.totals.currentTotal) >= 0 ? "good" : "danger"),
    createSummaryCard("Total made", formatMoney(state.totals.totalMade), "accent"),
    createSummaryCard("Total spent", formatMoney(state.totals.totalSpent), "warning")
  );

  trustFundMeta.textContent = "Live totals update from every logged profit, expense, and purchase.";
}

function renderTransactions() {
  transactionTableBody.textContent = "";

  if (!state.recentTransactions.length) {
    transactionTableBody.appendChild(createTableMessageRow("No trust fund actions have been logged yet.", 5));
    return;
  }

  state.recentTransactions.forEach((transaction) => {
    const row = document.createElement("tr");

    const type = document.createElement("td");
    type.appendChild(createBadge(formatType(transaction.transactionType), getTypeTone(transaction.transactionType)));

    const amount = document.createElement("td");
    amount.textContent = formatMoney(transaction.amount);

    const impact = document.createElement("td");
    const delta = Number(transaction.delta || 0);
    impact.textContent = `${delta >= 0 ? "+" : ""}${formatMoney(delta)}`;
    impact.className = delta >= 0 ? "score-delta-positive" : "score-delta-negative";

    const description = document.createElement("td");
    description.textContent = transaction.description || "-";

    const when = document.createElement("td");
    when.textContent = formatDateTime(transaction.loggedAt);

    row.append(type, amount, impact, description, when);
    transactionTableBody.appendChild(row);
  });
}

function getWeekMetricTone(key, value) {
  if (key === "made") {
    return "good";
  }

  if (key === "spent") {
    return "warning";
  }

  return Number(value || 0) >= 0 ? "good" : "danger";
}

function createWeekBar(label, value, maxValue, tone) {
  const amount = Number(value || 0);
  const card = document.createElement("div");
  card.className = "trust-week-bar-card";

  const heading = document.createElement("span");
  heading.textContent = label;

  const strong = document.createElement("strong");
  strong.textContent = formatMoney(amount);

  const track = document.createElement("div");
  track.className = "trust-week-bar-track";

  const fill = document.createElement("div");
  fill.className = `trust-week-bar-fill ${tone}`;
  fill.style.width = `${Math.max(3, Math.min(100, (Math.abs(amount) / maxValue) * 100))}%`;

  track.appendChild(fill);
  card.append(heading, strong, track);
  return card;
}

function renderWeekComparison() {
  weekComparisonChart.textContent = "";

  const current = state.weekComparison?.current;
  const previous = state.weekComparison?.previous;

  if (!current || !previous) {
    const empty = document.createElement("p");
    empty.className = "helper-copy";
    empty.textContent = "No week comparison available yet.";
    weekComparisonChart.appendChild(empty);
    return;
  }

  const metrics = [
    { key: "made", label: "Money made" },
    { key: "spent", label: "Money spent" },
    { key: "net", label: "Net movement" }
  ];
  const maxValue = Math.max(
    1,
    ...metrics.flatMap((metric) => [
      Math.abs(Number(current[metric.key] || 0)),
      Math.abs(Number(previous[metric.key] || 0))
    ])
  );

  metrics.forEach((metric) => {
    const row = document.createElement("article");
    row.className = "trust-week-row";

    const header = document.createElement("div");
    header.className = "trust-week-row-header";

    const title = document.createElement("strong");
    title.textContent = metric.label;

    const delta = Number(current[metric.key] || 0) - Number(previous[metric.key] || 0);
    const deltaText = document.createElement("span");
    deltaText.textContent = `${delta >= 0 ? "+" : ""}${formatMoney(delta)} vs last week`;
    deltaText.className = delta >= 0 ? "score-delta-positive" : "score-delta-negative";

    const bars = document.createElement("div");
    bars.className = "trust-week-bars";
    bars.append(
      createWeekBar(current.label, current[metric.key], maxValue, getWeekMetricTone(metric.key, current[metric.key])),
      createWeekBar(previous.label, previous[metric.key], maxValue, getWeekMetricTone(metric.key, previous[metric.key]))
    );

    header.append(title, deltaText);
    row.append(header, bars);
    weekComparisonChart.appendChild(row);
  });
}

function renderAuditTable() {
  auditTableBody.textContent = "";

  if (!state.viewer.canManage) {
    return;
  }

  if (!state.auditLog.length) {
    auditTableBody.appendChild(createTableMessageRow("No trust fund audit actions yet.", 4));
    return;
  }

  state.auditLog.forEach((entry) => {
    const row = document.createElement("tr");

    const action = document.createElement("td");
    action.appendChild(createBadge(formatType(entry.action), entry.revertedAt ? "neutral" : "accent"));

    const summary = document.createElement("td");
    summary.textContent = entry.revertedAt
      ? `${entry.summary} Reverted by ${entry.revertedByName || "admin"}.`
      : entry.summary;

    const when = document.createElement("td");
    when.textContent = `${formatDateTime(entry.createdAt)} by ${entry.actorName}`;

    const actions = document.createElement("td");
    const revertButton = document.createElement("button");
    revertButton.className = "topbar-button ghost compact";
    revertButton.type = "button";
    revertButton.dataset.action = "revert-audit";
    revertButton.dataset.auditId = entry.id;
    revertButton.textContent = entry.revertedAt ? "Reverted" : "Revert";
    revertButton.disabled = !entry.canRevert;
    actions.appendChild(revertButton);

    row.append(action, summary, when, actions);
    auditTableBody.appendChild(row);
  });
}

function renderAdminVisibility() {
  const showAdmin = Boolean(state.viewer.canManage);
  trustAdminGrid.classList.toggle("hidden", !showAdmin);
  trustAdminGrid.hidden = !showAdmin;
  trustAdminGrid.setAttribute("aria-hidden", showAdmin ? "false" : "true");

  if (!showAdmin) {
    auditTableBody.textContent = "";
  }
}

function renderPage() {
  renderSummary();
  renderWeekComparison();
  renderTransactions();
  renderAdminVisibility();
  renderAuditTable();
  syncSessionButton();
}

function syncLogPreview() {
  const type = createLogForm?.elements.transactionType?.value || "PROFIT";
  const amount = Number(createLogForm?.elements.amount?.value || 0);
  const currentTotal = Number(state.totals.currentTotal || 0);
  const delta = type === "PROFIT" ? amount : -amount;
  const nextTotal = currentTotal + delta;
  const label = formatType(type);

  logPreviewText.textContent = `${label} will ${delta >= 0 ? "add" : "subtract"} ${formatMoney(amount)}. New projected current total: ${formatMoney(nextTotal)}.`;
}

function openLoginModal() {
  setMessage(loginError, "");
  toggleModal(loginModal, true);
  window.requestAnimationFrame(() => loginForm?.elements.username?.focus());
}

function closeLoginModal() {
  toggleModal(loginModal, false);
}

function openCreateLogModal() {
  createLogForm.reset();
  createLogForm.elements.loggedAt.value = formatDateTimeLocalValue(new Date());
  setMessage(createLogMessage, "");
  syncLogPreview();
  toggleModal(createLogModal, true);
  window.requestAnimationFrame(() => createLogForm?.elements.transactionType?.focus());
}

function closeCreateLogModal() {
  toggleModal(createLogModal, false);
}

async function loadTrustFundData({ silent = false } = {}) {
  try {
    const payload = await apiWithOptionalSession("/trust-fund");
    state.totals = payload.totals || state.totals;
    state.weekComparison = payload.weekComparison || null;
    state.recentTransactions = Array.isArray(payload.recentTransactions) ? payload.recentTransactions : [];
    state.auditLog = Array.isArray(payload.auditLog) ? payload.auditLog : [];
    state.viewer = normalizeViewer(payload.viewer);
    renderPage();
  } catch (error) {
    if (!silent) {
      showToast(error.message, "error");
    }
  }
}

function startRefreshLoop() {
  if (refreshHandle) {
    window.clearInterval(refreshHandle);
  }

  refreshHandle = window.setInterval(() => {
    loadTrustFundData({ silent: true });
  }, 30000);
}

initThemeToggle(themeToggleButton);
syncSessionButton();
loadTrustFundData();
startRefreshLoop();

sessionButton?.addEventListener("click", () => {
  if (state.session?.token && state.viewer.isLoggedIn) {
    clearSession();
    state.session = null;
    state.viewer = {
      isLoggedIn: false,
      isAdmin: false,
      canManage: false
    };
    state.auditLog = [];
    renderPage();
    loadTrustFundData({ silent: true });
    showToast("Logged out.", "info");
    return;
  }

  openLoginModal();
});

closeLoginButton?.addEventListener("click", closeLoginModal);
closeLoginBackdrop?.addEventListener("click", closeLoginModal);
closeCreateLogButton?.addEventListener("click", closeCreateLogModal);
closeCreateLogBackdrop?.addEventListener("click", closeCreateLogModal);
openCreateLogButton?.addEventListener("click", openCreateLogModal);
createLogForm?.addEventListener("input", syncLogPreview);

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginError, "");
  setButtonLoadingState(loginSubmitButton, true, "Entering", "Enter");

  try {
    const payload = await api("/auth/login", {
      method: "POST",
      body: {
        username: loginForm.elements.username.value,
        password: loginForm.elements.password.value
      }
    });
    saveSession(payload);
    state.session = payload;
    closeLoginModal();
    await loadTrustFundData();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(loginSubmitButton, false, "Entering", "Enter");
  }
});

createLogForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(createLogMessage, "");
  setButtonLoadingState(createLogSubmitButton, true, "Creating", "Create log");

  try {
    await apiWithOptionalSession("/trust-fund/transactions", {
      method: "POST",
      body: {
        transactionType: createLogForm.elements.transactionType.value,
        amount: Number(createLogForm.elements.amount.value),
        loggedAt: createLogForm.elements.loggedAt.value,
        description: createLogForm.elements.description.value
      }
    });
    closeCreateLogModal();
    await loadTrustFundData();
    showToast("Trust fund log created.", "success");
  } catch (error) {
    setMessage(createLogMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(createLogSubmitButton, false, "Creating", "Create log");
  }
});

auditTableBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='revert-audit']");

  if (!button || button.disabled) {
    return;
  }

  button.disabled = true;

  try {
    await apiWithOptionalSession(`/trust-fund/audit/${button.dataset.auditId}/revert`, {
      method: "POST"
    });
    await loadTrustFundData();
    showToast("Audit action reverted.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  [
    [createLogModal, closeCreateLogModal],
    [loginModal, closeLoginModal]
  ].some(([modal, close]) => {
    if (!modal.classList.contains("hidden")) {
      close();
      return true;
    }

    return false;
  });
});
