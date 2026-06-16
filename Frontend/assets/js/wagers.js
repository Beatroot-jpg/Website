import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const themeToggleButton = document.querySelector("#themeToggleButton");
const sessionButton = document.querySelector("#sessionButton");
const nightLabel = document.querySelector("#nightLabel");
const nightMeta = document.querySelector("#nightMeta");
const fightActionsHeader = document.querySelector("#fightActionsHeader");
const fightTableBody = document.querySelector("#fightTableBody");
const payoutActionsHeader = document.querySelector("#payoutActionsHeader");
const payoutTableBody = document.querySelector("#payoutTableBody");
const wagerAdminGrid = document.querySelector("#wagerAdminGrid");
const adminSummaryGrid = document.querySelector("#adminSummaryGrid");
const auditTableBody = document.querySelector("#auditTableBody");
const loginModal = document.querySelector("#loginModal");
const closeLoginButton = document.querySelector("#closeLoginButton");
const closeLoginBackdrop = document.querySelector("#closeLoginBackdrop");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const loginHint = document.querySelector("#loginHint");
const loginSubmitButton = document.querySelector("#loginSubmitButton");
const openFightModalButton = document.querySelector("#openFightModalButton");
const openBetModalButton = document.querySelector("#openBetModalButton");
const openNightModalButton = document.querySelector("#openNightModalButton");
const fightModal = document.querySelector("#fightModal");
const closeFightButton = document.querySelector("#closeFightButton");
const closeFightBackdrop = document.querySelector("#closeFightBackdrop");
const fightForm = document.querySelector("#fightForm");
const fightRedSelect = document.querySelector("#fightRedSelect");
const fightBlueSelect = document.querySelector("#fightBlueSelect");
const titleFightToggle = document.querySelector("#titleFightToggle");
const thresholdAmountInput = document.querySelector("#thresholdAmountInput");
const fightSubmitButton = document.querySelector("#fightSubmitButton");
const fightFormMessage = document.querySelector("#fightFormMessage");
const betModal = document.querySelector("#betModal");
const closeBetButton = document.querySelector("#closeBetButton");
const closeBetBackdrop = document.querySelector("#closeBetBackdrop");
const betForm = document.querySelector("#betForm");
const betFightSelect = document.querySelector("#betFightSelect");
const betPickSelect = document.querySelector("#betPickSelect");
const betPreviewText = document.querySelector("#betPreviewText");
const betSubmitButton = document.querySelector("#betSubmitButton");
const betFormMessage = document.querySelector("#betFormMessage");
const settleModal = document.querySelector("#settleModal");
const closeSettleButton = document.querySelector("#closeSettleButton");
const closeSettleBackdrop = document.querySelector("#closeSettleBackdrop");
const settleForm = document.querySelector("#settleForm");
const settleFightName = document.querySelector("#settleFightName");
const settleStatusSelect = document.querySelector("#settleStatusSelect");
const winnerSelectBlock = document.querySelector("#winnerSelectBlock");
const winnerSelect = document.querySelector("#winnerSelect");
const settleSubmitButton = document.querySelector("#settleSubmitButton");
const settleFormMessage = document.querySelector("#settleFormMessage");
const nightModal = document.querySelector("#nightModal");
const closeNightButton = document.querySelector("#closeNightButton");
const closeNightBackdrop = document.querySelector("#closeNightBackdrop");
const nightForm = document.querySelector("#nightForm");
const nightSubmitButton = document.querySelector("#nightSubmitButton");
const nightFormMessage = document.querySelector("#nightFormMessage");
const paidModal = document.querySelector("#paidModal");
const closePaidButton = document.querySelector("#closePaidButton");
const closePaidBackdrop = document.querySelector("#closePaidBackdrop");
const cancelPaidButton = document.querySelector("#cancelPaidButton");
const confirmPaidButton = document.querySelector("#confirmPaidButton");
const paidModalSummary = document.querySelector("#paidModalSummary");

const state = {
  session: getSession(),
  viewer: {
    isLoggedIn: false,
    canManage: false,
    canUseAdminPanel: false
  },
  night: null,
  fights: [],
  payouts: [],
  adminSummary: null,
  fighterDirectory: [],
  auditLog: [],
  pendingSettleFightId: null,
  pendingPaidBetId: null
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
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "TBA";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "TBA";
  }

  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatStatus(value) {
  return `${value || ""}`.toLowerCase().replaceAll("_", " ");
}

function getStatusTone(value) {
  if (["OPEN", "ACTIVE", "WON_PENDING"].includes(value)) {
    return "accent";
  }

  if (["COMPLETED", "PAID_OUT", "HOUSE_KEPT"].includes(value)) {
    return "good";
  }

  if (["CLOSED", "LOST_PENDING"].includes(value)) {
    return "warning";
  }

  if (["CANCELLED", "VOIDED"].includes(value)) {
    return "danger";
  }

  return "neutral";
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

function createSummaryItem(label, value, tone = "neutral") {
  const item = document.createElement("article");
  item.className = `status-card ${tone}`;

  const span = document.createElement("span");
  span.className = "status-card-label";
  span.textContent = label;

  const strong = document.createElement("strong");
  strong.textContent = value;

  item.append(span, strong);
  return item;
}

function syncSessionButton() {
  if (state.session?.user?.name && state.viewer.canManage) {
    sessionButton.textContent = state.session.user.name;
    sessionButton.dataset.state = "session";
    loginHint.textContent = "You can manage the wager book from this account.";
    return;
  }

  if (state.session?.user?.name && state.viewer.isLoggedIn) {
    sessionButton.textContent = "Public view";
    sessionButton.dataset.state = "session";
    loginHint.textContent = "This account can view the public book, but admin wager tools are hidden.";
    return;
  }

  sessionButton.textContent = "Login";
  sessionButton.dataset.state = "login";
  loginHint.textContent = "Public viewers can watch the book. Logged-in users can manage wagers.";
}

function renderNightHeader() {
  nightLabel.textContent = state.night?.label || "Tonight";
  nightMeta.textContent = state.night
    ? `Opened ${formatDateTime(state.night.openedAt)}. Public book updates live.`
    : "No active night loaded yet.";
}

function renderFightTable() {
  fightTableBody.textContent = "";
  fightActionsHeader.classList.toggle("hidden", !state.viewer.canManage);

  if (!state.fights.length) {
    fightTableBody.appendChild(createTableMessageRow("No wager fights are open yet.", state.viewer.canManage ? 5 : 4));
    return;
  }

  state.fights.forEach((fight) => {
    const row = document.createElement("tr");

    const matchup = document.createElement("td");
    const primary = document.createElement("div");
    primary.className = "table-primary wager-matchup";

    const title = document.createElement("strong");
    title.textContent = `${fight.fighterRedName} vs ${fight.fighterBlueName}`;

    const detail = document.createElement("span");
    detail.textContent = `${formatDateTime(fight.scheduledAt)}${fight.venue ? ` - ${fight.venue}` : ""}`;

    primary.append(title, detail);

    if (fight.titleFight) {
      primary.appendChild(createBadge("Title fight", "accent"));
    }

    matchup.appendChild(primary);

    const status = document.createElement("td");
    status.appendChild(createBadge(formatStatus(fight.status), getStatusTone(fight.status)));

    const totals = document.createElement("td");
    const book = document.createElement("div");
    book.className = "wager-book-lines";
    const redLine = document.createElement("span");
    redLine.textContent = `${fight.fighterRedName}: ${formatMoney(fight.book?.redTotal)} booked`;
    const blueLine = document.createElement("span");
    blueLine.textContent = `${fight.fighterBlueName}: ${formatMoney(fight.book?.blueTotal)} booked`;
    const thresholdLine = document.createElement("small");
    thresholdLine.textContent = `Band: ${formatMoney(fight.thresholdAmount)} each`;
    book.append(redLine, blueLine, thresholdLine);
    totals.appendChild(book);

    const winner = document.createElement("td");
    winner.textContent = fight.winnerName || (fight.status === "CANCELLED" ? "Void" : "Not settled");

    row.append(matchup, status, totals, winner);

    if (state.viewer.canManage) {
      const actions = document.createElement("td");
      const actionRow = document.createElement("div");
      actionRow.className = "table-action-row";

      if (fight.status === "OPEN" || fight.status === "CLOSED") {
        const bookButton = document.createElement("button");
        bookButton.className = "topbar-button ghost compact";
        bookButton.type = "button";
        bookButton.dataset.action = fight.status === "OPEN" ? "close-books" : "reopen-books";
        bookButton.dataset.fightId = fight.id;
        bookButton.textContent = fight.status === "OPEN" ? "Close books" : "Reopen";

        const settleButton = document.createElement("button");
        settleButton.className = "topbar-button accent compact";
        settleButton.type = "button";
        settleButton.dataset.action = "settle-fight";
        settleButton.dataset.fightId = fight.id;
        settleButton.textContent = "Settle";

        actionRow.append(bookButton, settleButton);
      } else {
        actionRow.appendChild(createBadge("Settled", getStatusTone(fight.status)));
      }

      actions.appendChild(actionRow);
      row.appendChild(actions);
    }

    fightTableBody.appendChild(row);
  });
}

function renderPayoutTable() {
  payoutTableBody.textContent = "";
  payoutActionsHeader.classList.toggle("hidden", !state.viewer.canManage);

  if (!state.payouts.length) {
    payoutTableBody.appendChild(createTableMessageRow("No winning payouts are waiting right now.", state.viewer.canManage ? 6 : 5));
    return;
  }

  state.payouts.forEach((bet) => {
    const row = document.createElement("tr");

    const bettor = document.createElement("td");
    bettor.textContent = bet.bettorName;

    const fight = document.createElement("td");
    fight.textContent = bet.matchup;

    const pick = document.createElement("td");
    pick.textContent = bet.pickedFighterName;

    const collect = document.createElement("td");
    collect.textContent = formatMoney(bet.projectedReturn);

    const status = document.createElement("td");
    status.appendChild(createBadge(bet.status === "WON_PENDING" ? "Collect" : "Paid", getStatusTone(bet.status)));

    row.append(bettor, fight, pick, collect, status);

    if (state.viewer.canManage) {
      const actions = document.createElement("td");

      if (bet.status === "WON_PENDING") {
        const paidButton = document.createElement("button");
        paidButton.className = "topbar-button accent compact";
        paidButton.type = "button";
        paidButton.dataset.action = "mark-paid";
        paidButton.dataset.betId = bet.id;
        paidButton.textContent = "Paid";
        actions.appendChild(paidButton);
      } else {
        actions.appendChild(createBadge("Done", "good"));
      }

      row.appendChild(actions);
    }

    payoutTableBody.appendChild(row);
  });
}

function renderAdminSummary() {
  adminSummaryGrid.textContent = "";

  if (!state.viewer.canManage || !state.adminSummary) {
    return;
  }

  adminSummaryGrid.append(
    createSummaryItem("Total staked", formatMoney(state.adminSummary.totalStaked), "accent"),
    createSummaryItem("House cut", formatMoney(state.adminSummary.houseCut), "good"),
    createSummaryItem("Pending payouts", formatMoney(state.adminSummary.pendingPayout), "warning"),
    createSummaryItem("Paid out", formatMoney(state.adminSummary.paidOut), "neutral"),
    createSummaryItem("Active exposure", formatMoney(state.adminSummary.activeExposure), "warning"),
    createSummaryItem("Projected net", formatMoney(state.adminSummary.projectedNet), Number(state.adminSummary.projectedNet) >= 0 ? "good" : "danger")
  );
}

function renderAuditTable() {
  auditTableBody.textContent = "";

  if (!state.viewer.canManage) {
    return;
  }

  if (!state.auditLog.length) {
    auditTableBody.appendChild(createTableMessageRow("No wager audit actions yet.", 4));
    return;
  }

  state.auditLog.forEach((entry) => {
    const row = document.createElement("tr");

    const action = document.createElement("td");
    action.appendChild(createBadge(formatStatus(entry.action), entry.revertedAt ? "neutral" : "accent"));

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
  wagerAdminGrid.classList.toggle("hidden", !state.viewer.canManage);
}

function renderPage() {
  renderNightHeader();
  renderFightTable();
  renderPayoutTable();
  renderAdminVisibility();
  renderAdminSummary();
  renderAuditTable();
  syncSessionButton();
}

function syncFighterOptions() {
  [fightRedSelect, fightBlueSelect].forEach((select) => {
    select.textContent = "";

    state.fighterDirectory.forEach((fighter) => {
      const option = document.createElement("option");
      option.value = fighter.id;
      option.textContent = `${fighter.name}${fighter.isChampion ? " - Champion" : ""}`;
      select.appendChild(option);
    });
  });
}

function getOpenFights() {
  return state.fights.filter((fight) => fight.status === "OPEN");
}

function syncBetFightOptions() {
  betFightSelect.textContent = "";

  getOpenFights().forEach((fight) => {
    const option = document.createElement("option");
    option.value = fight.id;
    option.textContent = `${fight.fighterRedName} vs ${fight.fighterBlueName}`;
    betFightSelect.appendChild(option);
  });

  syncBetPickOptions();
}

function syncBetPickOptions() {
  betPickSelect.textContent = "";
  const fight = state.fights.find((entry) => entry.id === betFightSelect.value);

  if (!fight) {
    syncBetPreview();
    return;
  }

  [fight.fighterRedName, fight.fighterBlueName].forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    betPickSelect.appendChild(option);
  });

  syncBetPreview();
}

function syncBetPreview() {
  const fight = state.fights.find((entry) => entry.id === betFightSelect.value);
  const pick = betPickSelect.value;
  const stake = Number(betForm?.elements.stake?.value || 0);

  if (!fight || !pick) {
    betPreviewText.textContent = "Select a fight and enter a stake.";
    return;
  }

  const remaining = pick === fight.fighterRedName
    ? Number(fight.book?.redRemaining || 0)
    : Number(fight.book?.blueRemaining || 0);
  const houseCut = Math.max(0, stake * 0.1);
  const projectedReturn = Math.max(0, stake + (stake - houseCut));

  betPreviewText.textContent = `Available on ${pick}: ${formatMoney(remaining)}. House keeps ${formatMoney(houseCut)}. Winning return: ${formatMoney(projectedReturn)}.`;
}

function openLoginModal() {
  setMessage(loginError, "");
  toggleModal(loginModal, true);
  window.requestAnimationFrame(() => loginForm?.elements.username?.focus());
}

function closeLoginModal() {
  toggleModal(loginModal, false);
}

function openFightModal() {
  if (state.fighterDirectory.length < 2) {
    showToast("Add at least two active fighters on the leaderboard first.", "info");
    return;
  }

  fightForm.reset();
  setMessage(fightFormMessage, "");
  thresholdAmountInput.value = "1000000";
  syncFighterOptions();
  toggleModal(fightModal, true);
  window.requestAnimationFrame(() => fightRedSelect.focus());
}

function closeFightModal() {
  toggleModal(fightModal, false);
}

function openBetModal() {
  if (!getOpenFights().length) {
    showToast("No open wager books are available.", "info");
    return;
  }

  betForm.reset();
  setMessage(betFormMessage, "");
  syncBetFightOptions();
  toggleModal(betModal, true);
  window.requestAnimationFrame(() => betFightSelect.focus());
}

function closeBetModal() {
  toggleModal(betModal, false);
}

function openSettleModal(fightId) {
  const fight = state.fights.find((entry) => entry.id === fightId);

  if (!fight) {
    showToast("That fight could not be found.", "error");
    return;
  }

  state.pendingSettleFightId = fight.id;
  settleForm.reset();
  setMessage(settleFormMessage, "");
  settleFightName.textContent = `${fight.fighterRedName} vs ${fight.fighterBlueName}`;
  winnerSelect.textContent = "";
  [fight.fighterRedName, fight.fighterBlueName].forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    winnerSelect.appendChild(option);
  });
  winnerSelectBlock.classList.remove("hidden");
  toggleModal(settleModal, true);
  window.requestAnimationFrame(() => settleStatusSelect.focus());
}

function closeSettleModal() {
  state.pendingSettleFightId = null;
  toggleModal(settleModal, false);
}

function openNightModal() {
  nightForm.reset();
  setMessage(nightFormMessage, "");
  toggleModal(nightModal, true);
  window.requestAnimationFrame(() => nightForm?.elements.label?.focus());
}

function closeNightModal() {
  toggleModal(nightModal, false);
}

function openPaidModal(betId) {
  const bet = state.payouts.find((entry) => entry.id === betId);

  if (!bet) {
    showToast("That payout could not be found.", "error");
    return;
  }

  state.pendingPaidBetId = bet.id;
  paidModalSummary.textContent = `${bet.bettorName} should collect ${formatMoney(bet.projectedReturn)} for ${bet.pickedFighterName}.`;
  toggleModal(paidModal, true);
}

function closePaidModal() {
  state.pendingPaidBetId = null;
  toggleModal(paidModal, false);
}

async function loadWagersData({ silent = false } = {}) {
  try {
    const payload = await apiWithOptionalSession("/wagers");
    state.night = payload.night || null;
    state.fights = Array.isArray(payload.fights) ? payload.fights : [];
    state.payouts = Array.isArray(payload.payouts) ? payload.payouts : [];
    state.adminSummary = payload.adminSummary || null;
    state.fighterDirectory = Array.isArray(payload.fighterDirectory) ? payload.fighterDirectory : [];
    state.auditLog = Array.isArray(payload.auditLog) ? payload.auditLog : [];
    state.viewer = payload.viewer || state.viewer;
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
    loadWagersData({ silent: true });
  }, 30000);
}

initThemeToggle(themeToggleButton);
syncSessionButton();
loadWagersData();
startRefreshLoop();

sessionButton?.addEventListener("click", () => {
  if (state.session?.token && state.viewer.isLoggedIn) {
    clearSession();
    state.session = null;
    state.viewer = {
      isLoggedIn: false,
      canManage: false,
      canUseAdminPanel: false
    };
    state.adminSummary = null;
    state.fighterDirectory = [];
    state.auditLog = [];
    renderPage();
    loadWagersData({ silent: true });
    showToast("Logged out.", "info");
    return;
  }

  openLoginModal();
});

closeLoginButton?.addEventListener("click", closeLoginModal);
closeLoginBackdrop?.addEventListener("click", closeLoginModal);
closeFightButton?.addEventListener("click", closeFightModal);
closeFightBackdrop?.addEventListener("click", closeFightModal);
closeBetButton?.addEventListener("click", closeBetModal);
closeBetBackdrop?.addEventListener("click", closeBetModal);
closeSettleButton?.addEventListener("click", closeSettleModal);
closeSettleBackdrop?.addEventListener("click", closeSettleModal);
closeNightButton?.addEventListener("click", closeNightModal);
closeNightBackdrop?.addEventListener("click", closeNightModal);
closePaidButton?.addEventListener("click", closePaidModal);
closePaidBackdrop?.addEventListener("click", closePaidModal);
cancelPaidButton?.addEventListener("click", closePaidModal);
openFightModalButton?.addEventListener("click", openFightModal);
openBetModalButton?.addEventListener("click", openBetModal);
openNightModalButton?.addEventListener("click", openNightModal);

titleFightToggle?.addEventListener("change", () => {
  thresholdAmountInput.value = titleFightToggle.checked ? "5000000" : "1000000";
});

betFightSelect?.addEventListener("change", syncBetPickOptions);
betPickSelect?.addEventListener("change", syncBetPreview);
betForm?.addEventListener("input", syncBetPreview);

settleStatusSelect?.addEventListener("change", () => {
  winnerSelectBlock.classList.toggle("hidden", settleStatusSelect.value === "CANCELLED");
});

fightTableBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  try {
    if (button.dataset.action === "settle-fight") {
      openSettleModal(button.dataset.fightId);
      return;
    }

    if (button.dataset.action === "close-books" || button.dataset.action === "reopen-books") {
      button.disabled = true;
      await apiWithOptionalSession(`/wagers/fights/${button.dataset.fightId}/books`, {
        method: "PATCH",
        body: {
          action: button.dataset.action === "close-books" ? "CLOSE" : "REOPEN"
        }
      });
      await loadWagersData();
      showToast(button.dataset.action === "close-books" ? "Books closed." : "Books reopened.", "success");
    }
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

payoutTableBody?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='mark-paid']");

  if (!button) {
    return;
  }

  openPaidModal(button.dataset.betId);
});

auditTableBody?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action='revert-audit']");

  if (!button || button.disabled) {
    return;
  }

  button.disabled = true;

  try {
    await apiWithOptionalSession(`/wagers/audit/${button.dataset.auditId}/revert`, {
      method: "POST"
    });
    await loadWagersData();
    showToast("Audit action reverted.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

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
    await loadWagersData();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(loginSubmitButton, false, "Entering", "Enter");
  }
});

fightForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(fightFormMessage, "");
  setButtonLoadingState(fightSubmitButton, true, "Opening", "Open books");

  try {
    await apiWithOptionalSession("/wagers/fights", {
      method: "POST",
      body: {
        fighterRedId: fightForm.elements.fighterRedId.value,
        fighterBlueId: fightForm.elements.fighterBlueId.value,
        scheduledAt: fightForm.elements.scheduledAt.value,
        venue: fightForm.elements.venue.value,
        titleFight: fightForm.elements.titleFight.checked,
        thresholdAmount: Number(fightForm.elements.thresholdAmount.value),
        notes: fightForm.elements.notes.value
      }
    });
    closeFightModal();
    await loadWagersData();
    showToast("Books opened.", "success");
  } catch (error) {
    setMessage(fightFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(fightSubmitButton, false, "Opening", "Open books");
  }
});

betForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(betFormMessage, "");
  setButtonLoadingState(betSubmitButton, true, "Adding", "Add wager");

  try {
    await apiWithOptionalSession("/wagers/bets", {
      method: "POST",
      body: {
        wagerFightId: betForm.elements.wagerFightId.value,
        bettorName: betForm.elements.bettorName.value,
        pickedFighterName: betForm.elements.pickedFighterName.value,
        stake: Number(betForm.elements.stake.value),
        notes: betForm.elements.notes.value
      }
    });
    closeBetModal();
    await loadWagersData();
    showToast("Wager added.", "success");
  } catch (error) {
    setMessage(betFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(betSubmitButton, false, "Adding", "Add wager");
  }
});

settleForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(settleFormMessage, "");
  setButtonLoadingState(settleSubmitButton, true, "Settling", "Settle fight");

  try {
    await apiWithOptionalSession(`/wagers/fights/${state.pendingSettleFightId}/settle`, {
      method: "PATCH",
      body: {
        status: settleForm.elements.status.value,
        winnerName: settleForm.elements.status.value === "COMPLETED" ? winnerSelect.value : ""
      }
    });
    closeSettleModal();
    await loadWagersData();
    showToast("Fight settled.", "success");
  } catch (error) {
    setMessage(settleFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(settleSubmitButton, false, "Settling", "Settle fight");
  }
});

nightForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(nightFormMessage, "");
  setButtonLoadingState(nightSubmitButton, true, "Starting", "Start new night");

  try {
    await apiWithOptionalSession("/wagers/nights/start", {
      method: "POST",
      body: {
        label: nightForm.elements.label.value,
        notes: nightForm.elements.notes.value
      }
    });
    closeNightModal();
    await loadWagersData();
    showToast("New wager night started.", "success");
  } catch (error) {
    setMessage(nightFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(nightSubmitButton, false, "Starting", "Start new night");
  }
});

confirmPaidButton?.addEventListener("click", async () => {
  if (!state.pendingPaidBetId) {
    return;
  }

  setButtonLoadingState(confirmPaidButton, true, "Paying", "Mark paid");

  try {
    await apiWithOptionalSession(`/wagers/bets/${state.pendingPaidBetId}/settle`, {
      method: "PATCH",
      body: {
        action: "PAY_OUT",
        settlementNote: "Marked paid by bookie."
      }
    });
    closePaidModal();
    await loadWagersData();
    showToast("Payout marked paid.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(confirmPaidButton, false, "Paying", "Mark paid");
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  [
    [paidModal, closePaidModal],
    [nightModal, closeNightModal],
    [settleModal, closeSettleModal],
    [betModal, closeBetModal],
    [fightModal, closeFightModal],
    [loginModal, closeLoginModal]
  ].some(([modal, close]) => {
    if (!modal.classList.contains("hidden")) {
      close();
      return true;
    }

    return false;
  });
});
