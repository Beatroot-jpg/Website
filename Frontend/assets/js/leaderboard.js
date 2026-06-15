import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const themeToggleButton = document.querySelector("#themeToggleButton");
const sessionButton = document.querySelector("#sessionButton");
const championSpotlight = document.querySelector("#championSpotlight");
const contenderRail = document.querySelector("#contenderRail");
const leaderboardRuleGrid = document.querySelector("#leaderboardRuleGrid");
const leaderboardTableBody = document.querySelector("#leaderboardTableBody");
const leaderboardTableMeta = document.querySelector("#leaderboardTableMeta");
const leaderboardSearchInput = document.querySelector("#leaderboardSearchInput");
const leaderboardPageLabel = document.querySelector("#leaderboardPageLabel");
const previousLeaderboardPageButton = document.querySelector("#previousLeaderboardPageButton");
const nextLeaderboardPageButton = document.querySelector("#nextLeaderboardPageButton");
const leaderCardsGrid = document.querySelector("#leaderCardsGrid");
const leaderboardUtilityGrid = document.querySelector("#leaderboardUtilityGrid");
const leaderboardScoringCard = document.querySelector("#leaderboardScoringCard");
const leaderboardScoreLogCard = document.querySelector("#leaderboardScoreLogCard");
const leaderboardAdminCard = document.querySelector("#leaderboardAdminCard");
const scoreLogTableBody = document.querySelector("#scoreLogTableBody");
const fightCardActionsHeader = document.querySelector("#fightCardActionsHeader");
const fightCardTableBody = document.querySelector("#fightCardTableBody");
const hallOfFameTableBody = document.querySelector("#hallOfFameTableBody");
const loginModal = document.querySelector("#loginModal");
const closeLoginButton = document.querySelector("#closeLoginButton");
const closeLoginBackdrop = document.querySelector("#closeLoginBackdrop");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const loginHint = document.querySelector("#loginHint");
const loginSubmitButton = document.querySelector("#loginSubmitButton");
const openCreateFighterButton = document.querySelector("#openCreateFighterButton");
const openAwardPointsButton = document.querySelector("#openAwardPointsButton");
const openAwardBeltButton = document.querySelector("#openAwardBeltButton");
const openEditFighterButton = document.querySelector("#openEditFighterButton");
const openScoringConfigButton = document.querySelector("#openScoringConfigButton");
const openHallOfFameButton = document.querySelector("#openHallOfFameButton");
const openFightCardButton = document.querySelector("#openFightCardButton");
const fighterFormModal = document.querySelector("#fighterFormModal");
const closeFighterButton = document.querySelector("#closeFighterButton");
const closeFighterBackdrop = document.querySelector("#closeFighterBackdrop");
const fighterForm = document.querySelector("#fighterForm");
const fighterFormKicker = document.querySelector("#fighterFormKicker");
const fighterFormTitle = document.querySelector("#fighterFormTitle");
const fighterSelectBlock = document.querySelector("#fighterSelectBlock");
const fighterAdvancedFields = document.querySelector("#fighterAdvancedFields");
const fighterSelect = document.querySelector("#fighterSelect");
const fighterFormSubmitButton = document.querySelector("#fighterFormSubmitButton");
const openDeleteFighterButton = document.querySelector("#openDeleteFighterButton");
const fighterFormMessage = document.querySelector("#fighterFormMessage");
const deleteFighterModal = document.querySelector("#deleteFighterModal");
const closeDeleteFighterButton = document.querySelector("#closeDeleteFighterButton");
const closeDeleteFighterBackdrop = document.querySelector("#closeDeleteFighterBackdrop");
const cancelDeleteFighterButton = document.querySelector("#cancelDeleteFighterButton");
const confirmDeleteFighterButton = document.querySelector("#confirmDeleteFighterButton");
const deleteFighterName = document.querySelector("#deleteFighterName");
const awardPointsModal = document.querySelector("#awardPointsModal");
const closeAwardButton = document.querySelector("#closeAwardButton");
const closeAwardBackdrop = document.querySelector("#closeAwardBackdrop");
const awardPointsForm = document.querySelector("#awardPointsForm");
const awardFighterSelect = document.querySelector("#awardFighterSelect");
const awardEntryTypeSelect = document.querySelector("#awardEntryTypeSelect");
const awardFightSelect = document.querySelector("#awardFightSelect");
const boutFields = document.querySelector("#boutFields");
const correctionFields = document.querySelector("#correctionFields");
const awardPointsSubmitButton = document.querySelector("#awardPointsSubmitButton");
const awardPointsMessage = document.querySelector("#awardPointsMessage");
const awardBeltModal = document.querySelector("#awardBeltModal");
const closeAwardBeltButton = document.querySelector("#closeAwardBeltButton");
const closeAwardBeltBackdrop = document.querySelector("#closeAwardBeltBackdrop");
const awardBeltForm = document.querySelector("#awardBeltForm");
const beltFighterSelect = document.querySelector("#beltFighterSelect");
const awardBeltSubmitButton = document.querySelector("#awardBeltSubmitButton");
const awardBeltMessage = document.querySelector("#awardBeltMessage");
const scoringConfigModal = document.querySelector("#scoringConfigModal");
const closeScoringButton = document.querySelector("#closeScoringButton");
const closeScoringBackdrop = document.querySelector("#closeScoringBackdrop");
const scoringConfigForm = document.querySelector("#scoringConfigForm");
const scoringConfigSubmitButton = document.querySelector("#scoringConfigSubmitButton");
const scoringConfigMessage = document.querySelector("#scoringConfigMessage");
const hallOfFameModal = document.querySelector("#hallOfFameModal");
const closeHallOfFameButton = document.querySelector("#closeHallOfFameButton");
const closeHallOfFameBackdrop = document.querySelector("#closeHallOfFameBackdrop");
const hallOfFameForm = document.querySelector("#hallOfFameForm");
const hallOfFameSubmitButton = document.querySelector("#hallOfFameSubmitButton");
const hallOfFameMessage = document.querySelector("#hallOfFameMessage");
const fightCardModal = document.querySelector("#fightCardModal");
const closeFightCardButton = document.querySelector("#closeFightCardButton");
const closeFightCardBackdrop = document.querySelector("#closeFightCardBackdrop");
const fightCardForm = document.querySelector("#fightCardForm");
const fightCardRedSelect = document.querySelector("#fightCardRedSelect");
const fightCardBlueSelect = document.querySelector("#fightCardBlueSelect");
const fightCardSubmitButton = document.querySelector("#fightCardSubmitButton");
const fightCardMessage = document.querySelector("#fightCardMessage");
const scoreFightModal = document.querySelector("#scoreFightModal");
const closeScoreFightButton = document.querySelector("#closeScoreFightButton");
const closeScoreFightBackdrop = document.querySelector("#closeScoreFightBackdrop");
const scoreFightForm = document.querySelector("#scoreFightForm");
const scoreFightMatchup = document.querySelector("#scoreFightMatchup");
const scoreFightWinnerSelect = document.querySelector("#scoreFightWinnerSelect");
const scoreFightSubmitButton = document.querySelector("#scoreFightSubmitButton");
const scoreFightMessage = document.querySelector("#scoreFightMessage");

const state = {
  session: getSession(),
  viewer: {
    isLoggedIn: false,
    canManage: false,
    canUseAdminPanel: false
  },
  scoringConfig: null,
  fighters: [],
  fighterDirectory: [],
  leaderCards: {},
  hallOfFame: [],
  fightCard: [],
  scoreLog: [],
  lastPublicRefreshAt: null,
  leaderboardPage: 1,
  leaderboardPageSize: 25,
  leaderboardSearchQuery: "",
  fighterFormMode: "create",
  pendingDeleteFighterId: null,
  pendingScoreFightId: null
};

const leaderboardRefreshIntervalMs = 30000;
let leaderboardRefreshHandle = null;

function resetAdminState() {
  state.scoringConfig = null;
  state.fighterDirectory = [];
  state.scoreLog = [];
}

function normalizeViewer(viewer) {
  const canManage = Boolean(viewer?.canManage ?? viewer?.isAdmin ?? false);
  const canUseAdminPanel = Boolean(viewer?.canUseAdminPanel ?? viewer?.isAdmin ?? false);
  const hasExplicitLoginState = typeof viewer?.isLoggedIn === "boolean";
  const isLoggedIn = hasExplicitLoginState
    ? viewer.isLoggedIn
    : Boolean(state.session?.token && (state.viewer.isLoggedIn || canManage || canUseAdminPanel));

  return {
    isLoggedIn,
    canManage,
    canUseAdminPanel
  };
}

function getSignedOutViewer() {
  return {
    isLoggedIn: false,
    canManage: false,
    canUseAdminPanel: false
  };
}

function getStoredSessionViewer() {
  if (!state.session?.token) {
    return getSignedOutViewer();
  }

  return {
    isLoggedIn: true,
    canManage: false,
    canUseAdminPanel: false
  };
}

function normalizeFighter(fighter, index = 0) {
  const basePoints = Number.isFinite(Number(fighter?.points)) ? Number(fighter.points) : 0;
  const effectivePoints = Number.isFinite(Number(fighter?.effectivePoints))
    ? Number(fighter.effectivePoints)
    : basePoints;

  return {
    ...fighter,
    id: fighter?.id || `fighter-${index + 1}`,
    name: fighter?.name || `Fighter ${index + 1}`,
    rank: Number.isFinite(Number(fighter?.rank)) ? Number(fighter.rank) : index + 1,
    points: basePoints,
    effectivePoints,
    wins: Number.isFinite(Number(fighter?.wins)) ? Number(fighter.wins) : 0,
    losses: Number.isFinite(Number(fighter?.losses)) ? Number(fighter.losses) : 0,
    charismaPoints: Number.isFinite(Number(fighter?.charismaPoints)) ? Number(fighter.charismaPoints) : 0,
    dominancePoints: Number.isFinite(Number(fighter?.dominancePoints)) ? Number(fighter.dominancePoints) : 0,
    inactivityPenalty: Number.isFinite(Number(fighter?.inactivityPenalty)) ? Number(fighter.inactivityPenalty) : 0,
    daysSinceFight: Number.isFinite(Number(fighter?.daysSinceFight)) ? Number(fighter.daysSinceFight) : 0,
    active: fighter?.active !== false,
    isChampion: Boolean(fighter?.isChampion),
    badges: Array.isArray(fighter?.badges) ? fighter.badges : []
  };
}

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
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function formatDelta(value) {
  const parsed = Number(value || 0);
  return parsed >= 0 ? `+${parsed}` : `${parsed}`;
}

function formatRefreshStamp(value) {
  if (!value) {
    return "Waiting for update";
  }

  return formatDateTime(value);
}

function getDisplayBadges(fighter) {
  const fighterBadges = Array.isArray(fighter.badges) ? [...fighter.badges] : [];

  if (fighter.rank === 2 && !fighterBadges.includes("Top Contender")) {
    fighterBadges.unshift("Top Contender");
  }

  return fighterBadges;
}

function getCurrentChampion() {
  return state.fighters.find((fighter) => fighter.isChampion) || null;
}

function getTopContender() {
  return state.fighters.find((fighter) => fighter.rank === 2) || null;
}

function getSessionHeaders(headers = {}) {
  const merged = new Headers(headers);

  if (state.session?.token) {
    merged.set("Authorization", `Bearer ${state.session.token}`);
  }

  return merged;
}

async function apiWithOptionalSession(path, options = {}) {
  const headers = getSessionHeaders(options.headers);

  return api(path, {
    ...options,
    headers
  });
}

function toggleModal(modal, visible) {
  modal.classList.toggle("hidden", !visible);
  modal.setAttribute("aria-hidden", visible ? "false" : "true");
}

function openLoginModal() {
  toggleModal(loginModal, true);
  setMessage(loginError, "");
  window.requestAnimationFrame(() => {
    loginForm?.elements.username?.focus();
  });
}

function closeLoginModal() {
  toggleModal(loginModal, false);
}

function openFighterFormModal(mode) {
  state.fighterFormMode = mode;
  fighterForm.reset();
  setMessage(fighterFormMessage, "");
  fighterSelectBlock.classList.toggle("hidden", mode !== "edit");
  fighterSelect.required = mode === "edit";
  fighterAdvancedFields.classList.toggle("hidden", mode !== "edit");
  fighterAdvancedFields.querySelectorAll("input").forEach((input) => {
    input.disabled = mode !== "edit";
  });
  openDeleteFighterButton.classList.toggle("hidden", mode !== "edit");

  if (mode === "create") {
    fighterFormKicker.textContent = "Create Fighter";
    fighterFormTitle.textContent = "Add a new contender";
    fighterFormSubmitButton.textContent = "Create fighter";
    fighterForm.elements.points.value = state.scoringConfig?.startingPoints ?? 20;
    fighterForm.elements.wins.value = 0;
    fighterForm.elements.losses.value = 0;
    fighterForm.elements.charismaPoints.value = 0;
    fighterForm.elements.dominancePoints.value = 0;
    fighterForm.elements.active.checked = true;
    fighterForm.elements.lastFightAt.value = "";
  } else {
    fighterFormKicker.textContent = "Edit Fighter";
    fighterFormTitle.textContent = "Update contender";
    fighterFormSubmitButton.textContent = "Save fighter";
    syncFighterSelectOptions();
    syncSelectedFighterIntoForm(fighterSelect.value);
  }

  toggleModal(fighterFormModal, true);
  window.requestAnimationFrame(() => {
    if (mode === "edit") {
      fighterSelect.focus();
      return;
    }

    fighterForm?.elements.name?.focus();
  });
}

function closeFighterFormModal() {
  toggleModal(fighterFormModal, false);
}

function openDeleteFighterModal(fighter) {
  state.pendingDeleteFighterId = fighter.id;
  deleteFighterName.textContent = fighter.name;
  toggleModal(deleteFighterModal, true);
}

function closeDeleteFighterModal() {
  state.pendingDeleteFighterId = null;
  toggleModal(deleteFighterModal, false);
  setButtonLoadingState(confirmDeleteFighterButton, false, "Deleting", "Delete fighter");
}

function openAwardPointsModal() {
  awardPointsForm.reset();
  setMessage(awardPointsMessage, "");
  syncAwardFighterOptions();
  syncAwardFightOptions();
  awardPointsForm.elements.charismaPoints.value = 0;
  awardPointsForm.elements.dominancePoints.value = 0;
  awardPointsForm.elements.correctionPoints.value = 0;
  awardPointsForm.elements.awardedAt.value = formatDateTimeLocalValue(new Date());
  syncAwardEntryType();
  toggleModal(awardPointsModal, true);
  window.requestAnimationFrame(() => {
    awardFighterSelect.focus();
  });
}

function closeAwardPointsModal() {
  toggleModal(awardPointsModal, false);
}

function syncBeltFighterOptions() {
  beltFighterSelect.textContent = "";

  const vacantOption = document.createElement("option");
  vacantOption.value = "";
  vacantOption.textContent = "Vacant belt slot";
  beltFighterSelect.appendChild(vacantOption);

  state.fighterDirectory
    .filter((fighter) => fighter.active)
    .forEach((fighter) => {
      const option = document.createElement("option");
      option.value = fighter.id;
      option.textContent = fighter.name;
      beltFighterSelect.appendChild(option);
    });
}

function openAwardBeltModal() {
  awardBeltForm.reset();
  setMessage(awardBeltMessage, "");
  syncBeltFighterOptions();
  const champion = getCurrentChampion();
  beltFighterSelect.value = champion?.id || "";
  awardBeltForm.elements.awardedAt.value = formatDateTimeLocalValue(new Date());
  toggleModal(awardBeltModal, true);
  window.requestAnimationFrame(() => {
    beltFighterSelect.focus();
  });
}

function closeAwardBeltModal() {
  toggleModal(awardBeltModal, false);
}

function openScoringConfigModal() {
  if (!state.scoringConfig) {
    return;
  }

  setMessage(scoringConfigMessage, "");
  Object.entries(state.scoringConfig).forEach(([key, value]) => {
    if (scoringConfigForm.elements[key]) {
      scoringConfigForm.elements[key].value = value;
    }
  });
  toggleModal(scoringConfigModal, true);
  window.requestAnimationFrame(() => {
    scoringConfigForm?.elements.startingPoints?.focus();
  });
}

function closeScoringConfigModal() {
  toggleModal(scoringConfigModal, false);
}

function openHallOfFameModal() {
  hallOfFameForm.reset();
  setMessage(hallOfFameMessage, "");
  hallOfFameForm.elements.wonAt.value = formatDateTimeLocalValue(new Date());
  toggleModal(hallOfFameModal, true);
  window.requestAnimationFrame(() => {
    hallOfFameForm?.elements.fighterName?.focus();
  });
}

function closeHallOfFameModal() {
  toggleModal(hallOfFameModal, false);
}

function openFightCardModal() {
  fightCardForm.reset();
  setMessage(fightCardMessage, "");
  syncFightFighterOptions();
  toggleModal(fightCardModal, true);
  window.requestAnimationFrame(() => {
    fightCardForm?.elements.fighterRedName?.focus();
  });
}

function closeFightCardModal() {
  toggleModal(fightCardModal, false);
}

function openScoreFightModal(fightId) {
  const fight = state.fightCard.find((entry) => entry.id === fightId);

  if (!fight) {
    showToast("That fight could not be found.", "error");
    return;
  }

  state.pendingScoreFightId = fight.id;
  scoreFightForm.reset();
  setMessage(scoreFightMessage, "");
  scoreFightMatchup.textContent = `${fight.fighterRedName} vs ${fight.fighterBlueName}`;
  scoreFightWinnerSelect.options[0].textContent = `${fight.fighterRedName} wins`;
  scoreFightWinnerSelect.options[1].textContent = `${fight.fighterBlueName} wins`;
  scoreFightWinnerSelect.value = "RED";
  scoreFightForm.elements.awardedAt.value = formatDateTimeLocalValue(new Date());
  scoreFightForm.elements.redCharismaPoints.value = 0;
  scoreFightForm.elements.redDominancePoints.value = 0;
  scoreFightForm.elements.blueCharismaPoints.value = 0;
  scoreFightForm.elements.blueDominancePoints.value = 0;
  toggleModal(scoreFightModal, true);
  window.requestAnimationFrame(() => {
    scoreFightWinnerSelect.focus();
  });
}

function closeScoreFightModal() {
  state.pendingScoreFightId = null;
  toggleModal(scoreFightModal, false);
}

function syncSessionButton() {
  if (state.session?.user?.name && state.viewer.canManage) {
    sessionButton.textContent = state.session.user.name;
    sessionButton.dataset.state = "session";
    loginHint.textContent = "You can use the leaderboard forms from this account.";
    return;
  }

  if (state.session?.user?.name) {
    sessionButton.textContent = "Resume admin";
    sessionButton.dataset.state = "resume";
    loginHint.textContent = "Your public view is live. Resume admin tools only when you need to manage the ladder.";
    return;
  }

  sessionButton.textContent = "Login";
  sessionButton.dataset.state = "login";
  loginHint.textContent = "Logged-in users can run the leaderboard forms.";
}

function getFilteredFighters() {
  const query = state.leaderboardSearchQuery.trim().toLowerCase();

  if (!query) {
    return state.fighters;
  }

  return state.fighters.filter((fighter) => fighter.name.toLowerCase().includes(query));
}

function getLeaderboardTotalPages() {
  return Math.max(1, Math.ceil(getFilteredFighters().length / state.leaderboardPageSize));
}

function normalizeLeaderboardPage() {
  state.leaderboardPage = Math.min(Math.max(1, state.leaderboardPage), getLeaderboardTotalPages());
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

function createRuleCard(label, value, tone = "neutral") {
  const article = document.createElement("article");
  article.className = "leader-rule-card";

  const heading = document.createElement("p");
  heading.className = "status-card-label";
  heading.textContent = label;

  const strong = document.createElement("strong");
  strong.className = `leader-rule-value ${tone}`;
  strong.textContent = value;

  article.append(heading, strong);
  return article;
}

function createHeroPlaceholder(message) {
  const placeholder = document.createElement("div");
  placeholder.className = "champion-empty";
  placeholder.textContent = message;
  return placeholder;
}

function renderChampionSpotlight() {
  championSpotlight.textContent = "";
  contenderRail.textContent = "";

  if (!state.fighters.length) {
    championSpotlight.appendChild(createHeroPlaceholder("No fighters are on the ladder yet."));
    contenderRail.appendChild(createHeroPlaceholder("No contender data yet."));
    return;
  }

  const champion = getCurrentChampion();
  const championCard = document.createElement("article");
  championCard.className = "champion-card";

  const belt = document.createElement("span");
  belt.className = "champion-belt";
  belt.textContent = champion ? "Current Champion" : "Belt Vacant";

  const name = document.createElement("h3");
  name.textContent = champion ? champion.name : "No belt holder";

  const meta = document.createElement("p");
  meta.className = "champion-meta";
  meta.textContent = champion
    ? `${champion.effectivePoints} ladder points | ${champion.wins} wins | ${champion.charismaPoints} charisma | ${champion.dominancePoints} dominance`
    : "#1 stays reserved until an admin awards the belt to a fighter.";

  const badgeRow = document.createElement("div");
  badgeRow.className = "badge-row hero-badge-row";
  if (champion) {
    const championBadges = getDisplayBadges(champion);

    championBadges.forEach((badge) => {
      badgeRow.appendChild(createBadge(badge, badge === "Champion" ? "accent" : "neutral"));
    });
  } else {
    badgeRow.appendChild(createBadge("Reserved #1 slot", "warning"));
  }

  championCard.append(belt, name, meta, badgeRow);
  championSpotlight.appendChild(championCard);

  const topContender = getTopContender();
  const contenderCard = document.createElement("article");
  contenderCard.className = "contender-card is-top-contender";

  const contenderLabel = document.createElement("span");
  contenderLabel.className = "contender-rank";
  contenderLabel.textContent = "Top Contender";

  const contenderName = document.createElement("strong");
  contenderName.textContent = topContender ? topContender.name : "Waiting";

  const contenderSummary = document.createElement("p");
  const pointsBehindLeader = champion && topContender
    ? Math.max(0, champion.effectivePoints - topContender.effectivePoints)
    : 0;
  contenderSummary.textContent = topContender
    ? champion
      ? `#2 on the ladder | ${topContender.effectivePoints} pts | ${pointsBehindLeader} behind the belt`
      : `First contender in line | ${topContender.effectivePoints} pts | Waiting on a belt holder`
    : "No one is sitting in the contender slot yet.";

  const contenderBadges = document.createElement("div");
  contenderBadges.className = "badge-row";

  if (topContender) {
    getDisplayBadges(topContender)
      .filter((badge) => !["Champion", "Top Contender"].includes(badge))
      .slice(0, 2)
      .forEach((badge) => {
        contenderBadges.appendChild(createBadge(badge));
      });
  } else {
    contenderBadges.appendChild(createBadge("Open slot"));
  }

  contenderCard.append(contenderLabel, contenderName, contenderSummary, contenderBadges);

  const trackerCard = document.createElement("article");
  trackerCard.className = "contender-card leaderboard-status-card";

  const trackerLabel = document.createElement("span");
  trackerLabel.className = "contender-rank";
  trackerLabel.textContent = "Live Tracker";

  const trackerHeadline = document.createElement("strong");
  trackerHeadline.textContent = `${state.fighters.length} active fighters`;

  const trackerSummary = document.createElement("p");
  trackerSummary.textContent = `Updated ${formatRefreshStamp(state.lastPublicRefreshAt)}`;

  const trackerBadges = document.createElement("div");
  trackerBadges.className = "badge-row";
  trackerBadges.appendChild(createBadge(`${state.fightCard.length} fights booked`, state.fightCard.length ? "accent" : "neutral"));
  trackerBadges.appendChild(createBadge(`${state.hallOfFame.length} hall of fame`, "neutral"));

  trackerCard.append(trackerLabel, trackerHeadline, trackerSummary, trackerBadges);
  contenderRail.append(contenderCard, trackerCard);
}

function renderScoringRules() {
  leaderboardRuleGrid.textContent = "";

  if (!state.scoringConfig) {
    leaderboardRuleGrid.appendChild(createHeroPlaceholder("Scoring rules unavailable."));
    return;
  }

  const config = state.scoringConfig;
  leaderboardRuleGrid.append(
    createRuleCard("Start", `${config.startingPoints} pts`, "accent"),
    createRuleCard("Win", `${config.winPoints} pts`, "accent"),
    createRuleCard("Loss", `${config.lossPoints} pts`, "warning"),
    createRuleCard("Charisma", `0-${config.charismaMax}`),
    createRuleCard("Dominance", `0-${config.dominanceMax}`),
    createRuleCard("Decay", `${config.inactivityWeeklyPenalty} per week`)
  );
}

function renderLeaderboardTable() {
  leaderboardTableBody.textContent = "";
  const filteredFighters = getFilteredFighters();
  const champion = getCurrentChampion();

  if (!filteredFighters.length) {
    leaderboardTableBody.appendChild(
      createTableMessageRow(
        state.fighters.length
          ? "No fighters match this search."
          : "No ranked fighters yet.",
        5
      )
    );
    leaderboardTableMeta.textContent = state.fighters.length
      ? "No matches for the current search"
      : "No ladder entries yet";
    leaderboardPageLabel.textContent = "Page 1 of 1";
    previousLeaderboardPageButton.disabled = true;
    nextLeaderboardPageButton.disabled = true;
    return;
  }

  normalizeLeaderboardPage();
  const totalPages = getLeaderboardTotalPages();
  const pageStart = (state.leaderboardPage - 1) * state.leaderboardPageSize;
  const visibleFighters = filteredFighters.slice(pageStart, pageStart + state.leaderboardPageSize);
  const shouldShowVacantChampionRow = !champion && state.leaderboardPage === 1 && !state.leaderboardSearchQuery.trim();

  if (shouldShowVacantChampionRow) {
    const row = document.createElement("tr");
    row.className = "leaderboard-row champion";

    const rankCell = document.createElement("td");
    const rankMark = document.createElement("span");
    rankMark.className = "leaderboard-rank-mark";
    rankMark.textContent = "#1";
    rankCell.appendChild(rankMark);

    const fighterCell = document.createElement("td");
    const fighterPrimary = document.createElement("div");
    fighterPrimary.className = "table-primary";
    const namePlate = document.createElement("div");
    namePlate.className = "leaderboard-nameplate";
    const name = document.createElement("strong");
    name.textContent = "Belt Vacant";
    const beltHolderTag = document.createElement("span");
    beltHolderTag.className = "leaderboard-belt-inline";
    beltHolderTag.textContent = "Reserved slot";
    namePlate.append(name, beltHolderTag);
    const badges = document.createElement("div");
    badges.className = "badge-row";
    badges.appendChild(createBadge("Awaiting champion", "warning"));
    fighterPrimary.append(namePlate, badges);
    fighterCell.appendChild(fighterPrimary);

    const scoreCell = document.createElement("td");
    scoreCell.textContent = "-";

    const recordCell = document.createElement("td");
    recordCell.textContent = "-";

    const statusCell = document.createElement("td");
    const statusRow = document.createElement("div");
    statusRow.className = "badge-row";
    statusRow.appendChild(createBadge("Open belt", "warning"));
    statusCell.appendChild(statusRow);

    row.append(rankCell, fighterCell, scoreCell, recordCell, statusCell);
    leaderboardTableBody.appendChild(row);
  }

  visibleFighters.forEach((fighter) => {
    const row = document.createElement("tr");
    row.className = fighter.isChampion
      ? "leaderboard-row champion"
      : fighter.rank <= 4
        ? "leaderboard-row contender"
        : "leaderboard-row";

    const rankCell = document.createElement("td");
    const rankMark = document.createElement("span");
    rankMark.className = "leaderboard-rank-mark";
    rankMark.textContent = `#${fighter.rank}`;
    rankCell.appendChild(rankMark);

    const fighterCell = document.createElement("td");
    const fighterPrimary = document.createElement("div");
    fighterPrimary.className = "table-primary";
    const namePlate = document.createElement("div");
    namePlate.className = "leaderboard-nameplate";
    const name = document.createElement("strong");
    name.textContent = fighter.name;
    namePlate.appendChild(name);

    if (fighter.isChampion) {
      const beltHolderTag = document.createElement("span");
      beltHolderTag.className = "leaderboard-belt-inline";
      beltHolderTag.textContent = "Belt holder";
      namePlate.appendChild(beltHolderTag);
    }

    const badges = document.createElement("div");
    badges.className = "badge-row";
    const fighterBadges = getDisplayBadges(fighter);
    fighterBadges.forEach((badge) => {
      badges.appendChild(
        createBadge(
          badge,
          badge === "Champion" || badge === "Top Contender"
            ? "accent"
            : badge === "Cold"
              ? "warning"
              : "neutral"
        )
      );
    });
    fighterPrimary.append(namePlate, badges);
    fighterCell.appendChild(fighterPrimary);

    const scoreCell = document.createElement("td");
    const scorePrimary = document.createElement("div");
    scorePrimary.className = "table-primary";
    const score = document.createElement("strong");
    score.textContent = `${fighter.effectivePoints}`;
    const scoreSub = document.createElement("span");
    scoreSub.textContent = fighter.inactivityPenalty > 0
      ? `${fighter.points} base | ${formatDelta(-fighter.inactivityPenalty)} decay`
      : "Live ladder points";
    scorePrimary.append(score, scoreSub);
    scoreCell.appendChild(scorePrimary);

    const recordCell = document.createElement("td");
    const recordPrimary = document.createElement("div");
    recordPrimary.className = "table-primary";
    const record = document.createElement("strong");
    record.textContent = `${fighter.wins}-${fighter.losses}`;
    const recordSub = document.createElement("span");
    recordSub.textContent = `${fighter.wins + fighter.losses} scored bouts`;
    recordPrimary.append(record, recordSub);
    recordCell.appendChild(recordPrimary);

    const statusCell = document.createElement("td");
    const statusRow = document.createElement("div");
    statusRow.className = "badge-row";

    const visibleBadges = getDisplayBadges(fighter).filter((badge) => badge !== "Champion" || fighter.rank !== 1);
    const hasColdState = fighter.daysSinceFight > 0 && !visibleBadges.includes("Cold") && !visibleBadges.includes("Eliminated");

    visibleBadges.slice(0, 3).forEach((badge) => {
      statusRow.appendChild(
        createBadge(
          badge,
          badge === "Top Contender" || badge === "Champion"
            ? "accent"
            : badge === "Cold"
              ? "warning"
              : "neutral"
        )
      );
    });

    if (!visibleBadges.length) {
      statusRow.appendChild(createBadge("Active", "neutral"));
    }

    if (hasColdState) {
      statusRow.appendChild(createBadge(`${fighter.daysSinceFight} days idle`, "neutral"));
    }

    statusCell.appendChild(statusRow);

    row.append(rankCell, fighterCell, scoreCell, recordCell, statusCell);
    leaderboardTableBody.appendChild(row);
  });

  const totalFighters = filteredFighters.length;
  const visibleStart = totalFighters === 0 ? 0 : pageStart + 1;
  const visibleEnd = Math.min(pageStart + state.leaderboardPageSize, totalFighters);
  leaderboardTableMeta.textContent = state.leaderboardSearchQuery.trim()
    ? `Showing ${visibleStart}-${visibleEnd} of ${totalFighters} matching fighters`
    : `Showing ${visibleStart}-${visibleEnd} of ${totalFighters} ranked fighters | Updated ${formatRefreshStamp(state.lastPublicRefreshAt)}`;
  leaderboardPageLabel.textContent = `Page ${state.leaderboardPage} of ${totalPages}`;
  previousLeaderboardPageButton.disabled = state.leaderboardPage <= 1;
  nextLeaderboardPageButton.disabled = state.leaderboardPage >= totalPages;
}

function renderLeaderCards() {
  leaderCardsGrid.textContent = "";

  const cards = [
    {
      label: "Most Wins",
      fighter: state.leaderCards.wins,
      tone: "accent",
      summary: (fighter) => `${fighter.wins} wins`
    },
    {
      label: "Most Charisma",
      fighter: state.leaderCards.charisma,
      tone: "accent",
      summary: (fighter) => `${fighter.charismaPoints} charisma points`
    },
    {
      label: "Most Dominant",
      fighter: state.leaderCards.dominance,
      tone: "accent",
      summary: (fighter) => `${fighter.dominancePoints} dominance points`
    }
  ];

  cards.forEach((card) => {
    if (!card.fighter) {
      leaderCardsGrid.appendChild(createRuleCard(card.label, "No leader yet"));
      return;
    }

    const article = document.createElement("article");
    article.className = "leader-rule-card";

    const heading = document.createElement("p");
    heading.className = "status-card-label";
    heading.textContent = card.label;

    const name = document.createElement("strong");
    name.className = `leader-rule-value ${card.tone}`;
    name.textContent = card.fighter.name;

    const summary = document.createElement("span");
    summary.className = "leader-card-copy";
    summary.textContent = card.summary(card.fighter);

    article.append(heading, name, summary);
    leaderCardsGrid.appendChild(article);
  });
}

function renderFightCardTable() {
  fightCardTableBody.textContent = "";
  fightCardActionsHeader.classList.toggle("hidden", !state.viewer.canManage);

  if (!state.fightCard.length) {
    fightCardTableBody.appendChild(createTableMessageRow("No upcoming fights scheduled.", state.viewer.canManage ? 5 : 4));
    return;
  }

  state.fightCard.forEach((fight) => {
    const row = document.createElement("tr");

    const matchup = document.createElement("td");
    matchup.textContent = `${fight.fighterRedName} vs ${fight.fighterBlueName}`;

    const when = document.createElement("td");
    when.textContent = formatDateTime(fight.scheduledAt);

    const venue = document.createElement("td");
    venue.textContent = fight.venue || "TBA";

    const notes = document.createElement("td");
    notes.textContent = fight.notes || "-";

    row.append(matchup, when, venue, notes);

    if (state.viewer.canManage) {
      const actions = document.createElement("td");
      const actionRow = document.createElement("div");
      actionRow.className = "table-action-row";

      const scoreButton = document.createElement("button");
      scoreButton.className = "topbar-button ghost compact";
      scoreButton.type = "button";
      scoreButton.dataset.action = "score-fight";
      scoreButton.dataset.fightId = fight.id;
      scoreButton.textContent = "Score";
      actionRow.appendChild(scoreButton);

      actions.appendChild(actionRow);
      row.appendChild(actions);
    }

    fightCardTableBody.appendChild(row);
  });
}

function renderScoreLogTable() {
  scoreLogTableBody.textContent = "";

  if (!state.scoreLog.length) {
    scoreLogTableBody.appendChild(createTableMessageRow("No scoring activity has been recorded yet.", 5));
    return;
  }

  state.scoreLog.forEach((entry) => {
    const row = document.createElement("tr");

    const fighterCell = document.createElement("td");
    fighterCell.textContent = entry.fighterName;

    const typeCell = document.createElement("td");
    typeCell.textContent = entry.entryType === "CORRECTION"
      ? "Correction"
      : entry.result === "WIN"
        ? "Fight win"
        : entry.result === "LOSS"
          ? "Fight loss"
          : "Fight";

    const changeCell = document.createElement("td");
    const changePrimary = document.createElement("div");
    changePrimary.className = "table-primary";
    const changeValue = document.createElement("strong");
    changeValue.className = Number(entry.totalDelta) >= 0 ? "score-delta-positive" : "score-delta-negative";
    changeValue.textContent = `${formatDelta(entry.totalDelta)} pts`;
    const changeSub = document.createElement("span");
    changeSub.textContent = `Result ${formatDelta(entry.resultPoints)} | Charisma ${formatDelta(entry.charismaPoints)} | Dominance ${formatDelta(entry.dominancePoints)} | Bonus ${formatDelta(entry.bonusPoints)}`;
    changePrimary.append(changeValue, changeSub);
    changeCell.appendChild(changePrimary);

    const fightCell = document.createElement("td");
    fightCell.textContent = entry.fightLabel || "Manual";

    const whenCell = document.createElement("td");
    whenCell.textContent = formatDateTime(entry.awardedAt);

    row.append(fighterCell, typeCell, changeCell, fightCell, whenCell);
    scoreLogTableBody.appendChild(row);
  });
}

function renderHallOfFameTable() {
  hallOfFameTableBody.textContent = "";

  if (!state.hallOfFame.length) {
    hallOfFameTableBody.appendChild(createTableMessageRow("No hall of fame entries yet.", 5));
    return;
  }

  state.hallOfFame.forEach((entry) => {
    const row = document.createElement("tr");

    const fighter = document.createElement("td");
    fighter.textContent = entry.fighterName;

    const title = document.createElement("td");
    title.textContent = entry.title;

    const points = document.createElement("td");
    points.textContent = entry.pointsAtTitle ?? "-";

    const wonAt = document.createElement("td");
    wonAt.textContent = formatDateTime(entry.wonAt);

    const notes = document.createElement("td");
    notes.textContent = entry.notes || "-";

    row.append(fighter, title, points, wonAt, notes);
    hallOfFameTableBody.appendChild(row);
  });
}

function syncLeaderboardControls() {
  const showUtilityStrip = state.viewer.canManage;
  leaderboardUtilityGrid.classList.toggle("hidden", !showUtilityStrip);
  leaderboardScoringCard.classList.toggle("hidden", !state.viewer.canManage);
  leaderboardScoreLogCard.classList.toggle("hidden", !state.viewer.canManage);
  leaderboardAdminCard.classList.toggle("hidden", !state.viewer.canManage);
  fightCardActionsHeader.classList.toggle("hidden", !state.viewer.canManage);
}

function syncFighterSelectOptions() {
  fighterSelect.textContent = "";

  state.fighterDirectory.forEach((fighter) => {
    const option = document.createElement("option");
    option.value = fighter.id;
    option.textContent = `${fighter.name}${fighter.isChampion ? " - Champion" : ""}`;
    fighterSelect.appendChild(option);
  });
}

function syncSelectedFighterIntoForm(fighterId) {
  const fighter = state.fighterDirectory.find((entry) => entry.id === fighterId);

  if (!fighter) {
    return;
  }

  fighterForm.elements.name.value = fighter.name;
  fighterForm.elements.points.value = fighter.points;
  fighterForm.elements.wins.value = fighter.wins;
  fighterForm.elements.losses.value = fighter.losses;
  fighterForm.elements.charismaPoints.value = fighter.charismaPoints;
  fighterForm.elements.dominancePoints.value = fighter.dominancePoints;
  fighterForm.elements.lastFightAt.value = formatDateTimeLocalValue(fighter.lastFightAt);
  fighterForm.elements.active.checked = fighter.active;
  fighterForm.elements.notes.value = fighter.notes || "";
}

function syncAwardFighterOptions() {
  awardFighterSelect.textContent = "";

  state.fighterDirectory
    .filter((fighter) => fighter.active)
    .forEach((fighter) => {
      const option = document.createElement("option");
      option.value = fighter.id;
      option.textContent = fighter.name;
      awardFighterSelect.appendChild(option);
    });
}

function syncAwardFightOptions() {
  awardFightSelect.textContent = "";

  const blankOption = document.createElement("option");
  blankOption.value = "";
  blankOption.textContent = "No linked fight";
  awardFightSelect.appendChild(blankOption);

  state.fightCard.forEach((fight) => {
    const option = document.createElement("option");
    option.value = fight.id;
    option.textContent = `${fight.fighterRedName} vs ${fight.fighterBlueName}`;
    awardFightSelect.appendChild(option);
  });
}

function syncFightFighterOptions() {
  const selects = [fightCardRedSelect, fightCardBlueSelect];

  selects.forEach((select) => {
    select.textContent = "";

    state.fighterDirectory
      .filter((fighter) => fighter.active)
      .forEach((fighter) => {
        const option = document.createElement("option");
        option.value = fighter.name;
        option.textContent = fighter.name;
        select.appendChild(option);
      });
  });

  if (fightCardRedSelect.options.length > 0) {
    fightCardRedSelect.selectedIndex = 0;
  }

  if (fightCardBlueSelect.options.length > 1) {
    fightCardBlueSelect.selectedIndex = 1;
  } else if (fightCardBlueSelect.options.length > 0) {
    fightCardBlueSelect.selectedIndex = 0;
  }
}

function syncAwardEntryType() {
  const isCorrection = awardEntryTypeSelect.value === "CORRECTION";
  boutFields.classList.toggle("hidden", isCorrection);
  correctionFields.classList.toggle("hidden", !isCorrection);
  awardPointsForm.elements.result.disabled = isCorrection;
  awardPointsForm.elements.charismaPoints.disabled = isCorrection;
  awardPointsForm.elements.dominancePoints.disabled = isCorrection;
  awardPointsForm.elements.applyTitleWinBonus.disabled = isCorrection;
  awardPointsForm.elements.applyFinishBonus.disabled = isCorrection;
  awardPointsForm.elements.correctionPoints.disabled = !isCorrection;
}

async function loadPublicLeaderboardData() {
  const payload = await api("/leaderboard/public");
  state.lastPublicRefreshAt = payload.generatedAt || new Date().toISOString();
  state.fighters = Array.isArray(payload.fighters)
    ? payload.fighters.map((fighter, index) => normalizeFighter(fighter, index))
    : [];
  state.leaderCards = {
    wins: payload.leaderCards?.wins ? normalizeFighter(payload.leaderCards.wins) : null,
    charisma: payload.leaderCards?.charisma ? normalizeFighter(payload.leaderCards.charisma) : null,
    dominance: payload.leaderCards?.dominance ? normalizeFighter(payload.leaderCards.dominance) : null
  };
  state.hallOfFame = Array.isArray(payload.hallOfFame) ? payload.hallOfFame : [];
  state.fightCard = Array.isArray(payload.fightCard) ? payload.fightCard : [];
  state.viewer = getStoredSessionViewer();
}

async function loadAdminLeaderboardData({ silentUnauthorized = true } = {}) {
  if (!state.session?.token) {
    state.viewer = getSignedOutViewer();
    resetAdminState();
    return;
  }

  try {
    const payload = await api("/leaderboard/admin", {
      headers: getSessionHeaders()
    });
    state.scoringConfig = payload.scoringConfig || null;
    state.fighterDirectory = Array.isArray(payload.fighterDirectory)
      ? payload.fighterDirectory.map((fighter, index) => normalizeFighter(fighter, index))
      : state.fighters.map((fighter, index) => normalizeFighter(fighter, index));
    state.scoreLog = Array.isArray(payload.scoreLog) ? payload.scoreLog : [];
    state.viewer = normalizeViewer(payload.viewer);
  } catch (error) {
    clearSession();
    state.session = null;
    state.viewer = getSignedOutViewer();

    resetAdminState();

    if (!silentUnauthorized) {
      showToast("Session expired. Please log in again.", "info");
      openLoginModal();
    }
  }
}

function renderLeaderboardPage() {
  normalizeLeaderboardPage();
  syncSessionButton();
  syncLeaderboardControls();
  renderChampionSpotlight();
  renderScoringRules();
  renderLeaderboardTable();
  renderLeaderCards();
  renderFightCardTable();
  renderHallOfFameTable();
  renderScoreLogTable();
}

async function loadLeaderboardData({ silent = false, includeAdmin = state.viewer.canManage } = {}) {
  try {
    await loadPublicLeaderboardData();
  } catch (error) {
    if (!silent) {
      showToast(error.message, "error");
    }
    return;
  }

  if (includeAdmin) {
    await loadAdminLeaderboardData({ silentUnauthorized: silent });
  } else {
    resetAdminState();
  }

  renderLeaderboardPage();
}

function startLeaderboardRefreshLoop() {
  if (leaderboardRefreshHandle) {
    window.clearInterval(leaderboardRefreshHandle);
  }

  leaderboardRefreshHandle = window.setInterval(() => {
    if (document.hidden) {
      return;
    }

    loadLeaderboardData({ silent: true });
  }, leaderboardRefreshIntervalMs);
}

sessionButton?.addEventListener("click", async () => {
  if (sessionButton.dataset.state === "resume") {
    await loadAdminLeaderboardData({ silentUnauthorized: false });
    renderLeaderboardPage();
    return;
  }

  if (sessionButton.dataset.state === "session") {
    if (window.confirm("Log out of the current session?")) {
      clearSession();
      state.session = null;
      state.viewer = getSignedOutViewer();
      resetAdminState();
      await loadLeaderboardData();
      showToast("Logged out.", "success");
    }

    return;
  }

  openLoginModal();
});

openCreateFighterButton?.addEventListener("click", () => {
  openFighterFormModal("create");
});

openEditFighterButton?.addEventListener("click", () => {
  if (!state.fighterDirectory.length) {
    showToast("There are no fighters to edit yet.", "info");
    return;
  }

  openFighterFormModal("edit");
});

openAwardPointsButton?.addEventListener("click", () => {
  if (!state.fighterDirectory.length) {
    showToast("Add a fighter before awarding points.", "info");
    return;
  }

  openAwardPointsModal();
});

openAwardBeltButton?.addEventListener("click", () => {
  openAwardBeltModal();
});

openScoringConfigButton?.addEventListener("click", openScoringConfigModal);
openHallOfFameButton?.addEventListener("click", openHallOfFameModal);
openFightCardButton?.addEventListener("click", () => {
  if (state.fighterDirectory.filter((fighter) => fighter.active).length < 2) {
    showToast("You need at least two active fighters before scheduling a fight.", "info");
    return;
  }

  openFightCardModal();
});

fightCardTableBody?.addEventListener("click", (event) => {
  const actionButton = event.target.closest("button[data-action]");

  if (!actionButton) {
    return;
  }

  if (actionButton.dataset.action === "score-fight") {
    openScoreFightModal(actionButton.dataset.fightId);
  }
});

previousLeaderboardPageButton?.addEventListener("click", () => {
  if (state.leaderboardPage <= 1) {
    return;
  }

  state.leaderboardPage -= 1;
  renderLeaderboardTable();
});

nextLeaderboardPageButton?.addEventListener("click", () => {
  if (state.leaderboardPage >= getLeaderboardTotalPages()) {
    return;
  }

  state.leaderboardPage += 1;
  renderLeaderboardTable();
});

leaderboardSearchInput?.addEventListener("input", () => {
  state.leaderboardSearchQuery = leaderboardSearchInput.value;
  state.leaderboardPage = 1;
  renderLeaderboardTable();
});

fighterSelect?.addEventListener("change", () => {
  syncSelectedFighterIntoForm(fighterSelect.value);
});

awardEntryTypeSelect?.addEventListener("change", syncAwardEntryType);
openDeleteFighterButton?.addEventListener("click", () => {
  const fighter = state.fighterDirectory.find((entry) => entry.id === fighterSelect.value);

  if (!fighter) {
    showToast("Select a fighter to delete.", "info");
    return;
  }

  openDeleteFighterModal(fighter);
});

closeLoginButton?.addEventListener("click", closeLoginModal);
closeLoginBackdrop?.addEventListener("click", closeLoginModal);
closeFighterButton?.addEventListener("click", closeFighterFormModal);
closeFighterBackdrop?.addEventListener("click", closeFighterFormModal);
closeDeleteFighterButton?.addEventListener("click", closeDeleteFighterModal);
closeDeleteFighterBackdrop?.addEventListener("click", closeDeleteFighterModal);
cancelDeleteFighterButton?.addEventListener("click", closeDeleteFighterModal);
closeAwardButton?.addEventListener("click", closeAwardPointsModal);
closeAwardBackdrop?.addEventListener("click", closeAwardPointsModal);
closeAwardBeltButton?.addEventListener("click", closeAwardBeltModal);
closeAwardBeltBackdrop?.addEventListener("click", closeAwardBeltModal);
closeScoringButton?.addEventListener("click", closeScoringConfigModal);
closeScoringBackdrop?.addEventListener("click", closeScoringConfigModal);
closeHallOfFameButton?.addEventListener("click", closeHallOfFameModal);
closeHallOfFameBackdrop?.addEventListener("click", closeHallOfFameModal);
closeFightCardButton?.addEventListener("click", closeFightCardModal);
closeFightCardBackdrop?.addEventListener("click", closeFightCardModal);
closeScoreFightButton?.addEventListener("click", closeScoreFightModal);
closeScoreFightBackdrop?.addEventListener("click", closeScoreFightModal);

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!fightCardModal.classList.contains("hidden")) {
    closeFightCardModal();
    return;
  }

  if (!scoreFightModal.classList.contains("hidden")) {
    closeScoreFightModal();
    return;
  }

  if (!deleteFighterModal.classList.contains("hidden")) {
    closeDeleteFighterModal();
    return;
  }

  if (!hallOfFameModal.classList.contains("hidden")) {
    closeHallOfFameModal();
    return;
  }

  if (!awardBeltModal.classList.contains("hidden")) {
    closeAwardBeltModal();
    return;
  }

  if (!scoringConfigModal.classList.contains("hidden")) {
    closeScoringConfigModal();
    return;
  }

  if (!awardPointsModal.classList.contains("hidden")) {
    closeAwardPointsModal();
    return;
  }

  if (!fighterFormModal.classList.contains("hidden")) {
    closeFighterFormModal();
    return;
  }

  if (!loginModal.classList.contains("hidden")) {
    closeLoginModal();
  }
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginError, "");
  setButtonLoadingState(loginSubmitButton, true, "Entering", "Enter");

  const payload = Object.fromEntries(new FormData(loginForm).entries());

  try {
    const session = await api("/auth/login", {
      method: "POST",
      body: payload
    });

    saveSession(session);
    state.session = session;
    closeLoginModal();
    loginForm.reset();
    await loadLeaderboardData({ includeAdmin: true });
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(loginSubmitButton, false, "Entering", "Enter");
  }
});

fighterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(fighterFormMessage, "");
  setButtonLoadingState(
    fighterFormSubmitButton,
    true,
    state.fighterFormMode === "create" ? "Creating" : "Saving",
    state.fighterFormMode === "create" ? "Create fighter" : "Save fighter"
  );

  const payload = {
    name: fighterForm.elements.name.value.trim(),
    points: Number(fighterForm.elements.points.value),
    wins: Number(fighterForm.elements.wins.value),
    losses: Number(fighterForm.elements.losses.value),
    charismaPoints: Number(fighterForm.elements.charismaPoints.value),
    dominancePoints: Number(fighterForm.elements.dominancePoints.value),
    active: fighterForm.elements.active.checked,
    notes: fighterForm.elements.notes.value.trim(),
    lastFightAt: fighterForm.elements.lastFightAt.value || ""
  };

  try {
    if (state.fighterFormMode === "create") {
      await apiWithOptionalSession("/leaderboard/fighters", {
        method: "POST",
        body: payload
      });
    } else {
      await apiWithOptionalSession(`/leaderboard/fighters/${fighterSelect.value}`, {
        method: "PATCH",
        body: payload
      });
    }

    closeFighterFormModal();
    await loadLeaderboardData();
    showToast(state.fighterFormMode === "create" ? "Fighter created." : "Fighter updated.", "success");
  } catch (error) {
    setMessage(fighterFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(
      fighterFormSubmitButton,
      false,
      state.fighterFormMode === "create" ? "Creating" : "Saving",
      state.fighterFormMode === "create" ? "Create fighter" : "Save fighter"
    );
  }
});

confirmDeleteFighterButton?.addEventListener("click", async () => {
  const fighterId = state.pendingDeleteFighterId;

  if (!fighterId) {
    return;
  }

  setButtonLoadingState(confirmDeleteFighterButton, true, "Deleting", "Delete fighter");

  try {
    await apiWithOptionalSession(`/leaderboard/fighters/${fighterId}`, {
      method: "DELETE"
    });

    closeDeleteFighterModal();
    closeFighterFormModal();
    await loadLeaderboardData();
    showToast("Fighter deleted.", "success");
  } catch (error) {
    setButtonLoadingState(confirmDeleteFighterButton, false, "Deleting", "Delete fighter");
    showToast(error.message, "error");
  }
});

awardPointsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(awardPointsMessage, "");
  setButtonLoadingState(awardPointsSubmitButton, true, "Submitting", "Submit points");

  const payload = {
    entryType: awardPointsForm.elements.entryType.value,
    result: awardPointsForm.elements.result.value,
    charismaPoints: Number(awardPointsForm.elements.charismaPoints.value || 0),
    dominancePoints: Number(awardPointsForm.elements.dominancePoints.value || 0),
    applyTitleWinBonus: awardPointsForm.elements.applyTitleWinBonus.checked,
    applyFinishBonus: awardPointsForm.elements.applyFinishBonus.checked,
    correctionPoints: Number(awardPointsForm.elements.correctionPoints.value || 0),
    fightId: awardPointsForm.elements.fightId.value || "",
    awardedAt: awardPointsForm.elements.awardedAt.value || "",
    note: awardPointsForm.elements.note.value.trim()
  };

  try {
    await apiWithOptionalSession(`/leaderboard/fighters/${awardFighterSelect.value}/award`, {
      method: "POST",
      body: payload
    });

    closeAwardPointsModal();
    await loadLeaderboardData();
    showToast("Points awarded.", "success");
  } catch (error) {
    setMessage(awardPointsMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(awardPointsSubmitButton, false, "Submitting", "Submit points");
  }
});

awardBeltForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(awardBeltMessage, "");
  setButtonLoadingState(awardBeltSubmitButton, true, "Saving", "Save belt holder");

  const payload = {
    fighterId: beltFighterSelect.value || "",
    awardedAt: awardBeltForm.elements.awardedAt.value || ""
  };

  try {
    await apiWithOptionalSession("/leaderboard/champion", {
      method: "POST",
      body: payload
    });

    closeAwardBeltModal();
    await loadLeaderboardData();
    showToast(payload.fighterId ? "Belt holder updated." : "Belt slot vacated.", "success");
  } catch (error) {
    setMessage(awardBeltMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(awardBeltSubmitButton, false, "Saving", "Save belt holder");
  }
});

scoringConfigForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(scoringConfigMessage, "");
  setButtonLoadingState(scoringConfigSubmitButton, true, "Saving", "Save scoring");

  const payload = Object.fromEntries(new FormData(scoringConfigForm).entries());

  try {
    await apiWithOptionalSession("/leaderboard/scoring", {
      method: "PATCH",
      body: payload
    });

    closeScoringConfigModal();
    await loadLeaderboardData();
    showToast("Scoring table updated.", "success");
  } catch (error) {
    setMessage(scoringConfigMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(scoringConfigSubmitButton, false, "Saving", "Save scoring");
  }
});

hallOfFameForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(hallOfFameMessage, "");
  setButtonLoadingState(hallOfFameSubmitButton, true, "Adding", "Add entry");

  const payload = Object.fromEntries(new FormData(hallOfFameForm).entries());

  try {
    await apiWithOptionalSession("/leaderboard/hall-of-fame", {
      method: "POST",
      body: payload
    });

    closeHallOfFameModal();
    await loadLeaderboardData();
    showToast("Hall of fame entry added.", "success");
  } catch (error) {
    setMessage(hallOfFameMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(hallOfFameSubmitButton, false, "Adding", "Add entry");
  }
});

fightCardForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(fightCardMessage, "");
  setButtonLoadingState(fightCardSubmitButton, true, "Scheduling", "Schedule fight");

  const payload = Object.fromEntries(new FormData(fightCardForm).entries());

  try {
    await apiWithOptionalSession("/leaderboard/fights", {
      method: "POST",
      body: payload
    });

    closeFightCardModal();
    await loadLeaderboardData();
    showToast("Fight scheduled.", "success");
  } catch (error) {
    setMessage(fightCardMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(fightCardSubmitButton, false, "Scheduling", "Schedule fight");
  }
});

scoreFightForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.pendingScoreFightId) {
    showToast("No fight is selected for scoring.", "error");
    return;
  }

  setMessage(scoreFightMessage, "");
  setButtonLoadingState(scoreFightSubmitButton, true, "Scoring", "Score fight");

  const payload = {
    winnerCorner: scoreFightForm.elements.winnerCorner.value,
    redCharismaPoints: Number(scoreFightForm.elements.redCharismaPoints.value || 0),
    redDominancePoints: Number(scoreFightForm.elements.redDominancePoints.value || 0),
    blueCharismaPoints: Number(scoreFightForm.elements.blueCharismaPoints.value || 0),
    blueDominancePoints: Number(scoreFightForm.elements.blueDominancePoints.value || 0),
    applyTitleWinBonus: scoreFightForm.elements.applyTitleWinBonus.checked,
    applyFinishBonus: scoreFightForm.elements.applyFinishBonus.checked,
    awardedAt: scoreFightForm.elements.awardedAt.value || "",
    note: scoreFightForm.elements.note.value.trim()
  };

  try {
    await apiWithOptionalSession(`/leaderboard/fights/${state.pendingScoreFightId}/score`, {
      method: "POST",
      body: payload
    });

    closeScoreFightModal();
    await loadLeaderboardData();
    showToast("Fight scored and ladder updated.", "success");
  } catch (error) {
    setMessage(scoreFightMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(scoreFightSubmitButton, false, "Scoring", "Score fight");
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadLeaderboardData({ silent: true });
  }
});

window.addEventListener("focus", () => {
  loadLeaderboardData({ silent: true });
});

initThemeToggle(themeToggleButton);
syncSessionButton();
syncLeaderboardControls();
startLeaderboardRefreshLoop();
await loadLeaderboardData();
