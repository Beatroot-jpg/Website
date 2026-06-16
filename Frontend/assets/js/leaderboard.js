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
const leaderboardSecurityStatus = document.querySelector("#leaderboardSecurityStatus");
const leaderboardSecurityOwnerNote = document.querySelector("#leaderboardSecurityOwnerNote");
const openSecurityLockButton = document.querySelector("#openSecurityLockButton");
const archivedFightersTableBody = document.querySelector("#archivedFightersTableBody");
const archivedFightersTableMeta = document.querySelector("#archivedFightersTableMeta");
const archivedFightersPageLabel = document.querySelector("#archivedFightersPageLabel");
const previousArchivedFightersPageButton = document.querySelector("#previousArchivedFightersPageButton");
const nextArchivedFightersPageButton = document.querySelector("#nextArchivedFightersPageButton");
const scoreLogTableBody = document.querySelector("#scoreLogTableBody");
const auditSearchInput = document.querySelector("#auditSearchInput");
const auditActionFilter = document.querySelector("#auditActionFilter");
const auditLogMeta = document.querySelector("#auditLogMeta");
const auditPageLabel = document.querySelector("#auditPageLabel");
const previousAuditPageButton = document.querySelector("#previousAuditPageButton");
const nextAuditPageButton = document.querySelector("#nextAuditPageButton");
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
const fighterEditFlowNote = document.querySelector("#fighterEditFlowNote");
const fighterOverrideToggleRow = document.querySelector("#fighterOverrideToggleRow");
const fighterEnableOverrideToggle = document.querySelector("#fighterEnableOverrideToggle");
const fighterOverrideWarning = document.querySelector("#fighterOverrideWarning");
const fighterPointsField = document.querySelector("#fighterPointsField");
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
const applyNoShowPenaltyButton = document.querySelector("#applyNoShowPenaltyButton");
const awardPointsSubmitButton = document.querySelector("#awardPointsSubmitButton");
const awardPointsMessage = document.querySelector("#awardPointsMessage");
const awardPreviewCurrent = document.querySelector("#awardPreviewCurrent");
const awardPreviewDelta = document.querySelector("#awardPreviewDelta");
const awardPreviewProjected = document.querySelector("#awardPreviewProjected");
const awardPreviewBreakdown = document.querySelector("#awardPreviewBreakdown");
const awardBeltModal = document.querySelector("#awardBeltModal");
const closeAwardBeltButton = document.querySelector("#closeAwardBeltButton");
const closeAwardBeltBackdrop = document.querySelector("#closeAwardBeltBackdrop");
const awardBeltForm = document.querySelector("#awardBeltForm");
const beltFighterSelect = document.querySelector("#beltFighterSelect");
const awardBeltSubmitButton = document.querySelector("#awardBeltSubmitButton");
const awardBeltMessage = document.querySelector("#awardBeltMessage");
const beltPreviewSummary = document.querySelector("#beltPreviewSummary");
const securityLockModal = document.querySelector("#securityLockModal");
const closeSecurityLockButton = document.querySelector("#closeSecurityLockButton");
const closeSecurityLockBackdrop = document.querySelector("#closeSecurityLockBackdrop");
const securityLockForm = document.querySelector("#securityLockForm");
const securityWritesLockedInput = document.querySelector("#securityWritesLockedInput");
const securityLockReasonInput = document.querySelector("#securityLockReasonInput");
const securityLockSubmitButton = document.querySelector("#securityLockSubmitButton");
const securityLockMessage = document.querySelector("#securityLockMessage");
const scoringConfigModal = document.querySelector("#scoringConfigModal");
const closeScoringButton = document.querySelector("#closeScoringButton");
const closeScoringBackdrop = document.querySelector("#closeScoringBackdrop");
const scoringConfigForm = document.querySelector("#scoringConfigForm");
const scoringConfigSubmitButton = document.querySelector("#scoringConfigSubmitButton");
const scoringConfigMessage = document.querySelector("#scoringConfigMessage");
const scoringPreviewWin = document.querySelector("#scoringPreviewWin");
const scoringPreviewLoss = document.querySelector("#scoringPreviewLoss");
const scoringPreviewNoShow = document.querySelector("#scoringPreviewNoShow");
const scoringPreviewMax = document.querySelector("#scoringPreviewMax");
const scoringPreviewSummary = document.querySelector("#scoringPreviewSummary");
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
const contactFightModal = document.querySelector("#contactFightModal");
const closeContactFightButton = document.querySelector("#closeContactFightButton");
const closeContactFightBackdrop = document.querySelector("#closeContactFightBackdrop");
const contactFightMatchup = document.querySelector("#contactFightMatchup");
const contactFightList = document.querySelector("#contactFightList");
const scoreFightModal = document.querySelector("#scoreFightModal");
const closeScoreFightButton = document.querySelector("#closeScoreFightButton");
const closeScoreFightBackdrop = document.querySelector("#closeScoreFightBackdrop");
const scoreFightForm = document.querySelector("#scoreFightForm");
const scoreFightMatchup = document.querySelector("#scoreFightMatchup");
const scoreFightWinnerSelect = document.querySelector("#scoreFightWinnerSelect");
const scoreFightSubmitButton = document.querySelector("#scoreFightSubmitButton");
const scoreFightMessage = document.querySelector("#scoreFightMessage");
const scoreFightRedPreviewTotal = document.querySelector("#scoreFightRedPreviewTotal");
const scoreFightRedPreviewBreakdown = document.querySelector("#scoreFightRedPreviewBreakdown");
const scoreFightBluePreviewTotal = document.querySelector("#scoreFightBluePreviewTotal");
const scoreFightBluePreviewBreakdown = document.querySelector("#scoreFightBluePreviewBreakdown");

const state = {
  session: getSession(),
  viewer: {
    isLoggedIn: false,
    canManage: false,
    canUseAdminPanel: false,
    isOwner: false
  },
  scoringConfig: null,
  fighters: [],
  fighterDirectory: [],
  archivedFighters: [],
  securityState: null,
  leaderCards: {},
  hallOfFame: [],
  fightCard: [],
  auditLog: [],
  auditTotalCount: 0,
  lastPublicRefreshAt: null,
  leaderboardPage: 1,
  leaderboardPageSize: 25,
  archivedFightersPage: 1,
  archivedFightersPageSize: 6,
  leaderboardSearchQuery: "",
  auditPage: 1,
  auditPageSize: 25,
  auditSearchQuery: "",
  auditActionFilter: "ALL",
  fighterFormMode: "create",
  pendingDeleteFighterId: null,
  pendingContactFightId: null,
  pendingScoreFightId: null
};

const leaderboardRefreshIntervalMs = 30000;
let leaderboardRefreshHandle = null;
let auditSearchDebounceHandle = null;
const AUDIT_ACTION_OPTIONS = [
  "BELT_AWARDED",
  "BELT_VACATED",
  "FIGHT_CREATED",
  "FIGHT_DELETED",
  "FIGHT_SCORED",
  "FIGHT_UPDATED",
  "FIGHTER_ARCHIVED",
  "FIGHTER_CORRECTED",
  "FIGHTER_CREATED",
  "FIGHTER_RESTORED",
  "FIGHTER_SCORED",
  "FIGHTER_UPDATED",
  "HALL_OF_FAME_CREATED",
  "HALL_OF_FAME_DELETED",
  "HALL_OF_FAME_UPDATED",
  "SCORING_UPDATED",
  "SECURITY_LOCK_UPDATED"
];

function resetAdminState() {
  state.scoringConfig = null;
  state.fighterDirectory = [];
  state.archivedFighters = [];
  state.securityState = null;
  state.auditLog = [];
  state.auditTotalCount = 0;
  state.auditPage = 1;
  state.archivedFightersPage = 1;
  state.auditSearchQuery = "";
  state.auditActionFilter = "ALL";
  if (auditSearchInput) {
    auditSearchInput.value = "";
  }
  if (auditActionFilter) {
    auditActionFilter.value = "ALL";
  }
}

function normalizeViewer(viewer) {
  const canManage = Boolean(viewer?.canManage ?? viewer?.isAdmin ?? false);
  const canUseAdminPanel = Boolean(viewer?.canUseAdminPanel ?? viewer?.isAdmin ?? false);
  const isOwner = Boolean(viewer?.isOwner);
  const hasExplicitLoginState = typeof viewer?.isLoggedIn === "boolean";
  const isLoggedIn = hasExplicitLoginState
    ? viewer.isLoggedIn
    : Boolean(state.session?.token && (state.viewer.isLoggedIn || canManage || canUseAdminPanel));

  return {
    isLoggedIn,
    canManage,
    canUseAdminPanel,
    isOwner
  };
}

function getSignedOutViewer() {
  return {
    isLoggedIn: false,
    canManage: false,
    canUseAdminPanel: false,
    isOwner: false
  };
}

function getStoredSessionViewer() {
  if (!state.session?.token) {
    return getSignedOutViewer();
  }

  return {
    isLoggedIn: true,
    canManage: false,
    canUseAdminPanel: false,
    isOwner: false
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
    archived: Boolean(fighter?.archived),
    phoneNumber: typeof fighter?.phoneNumber === "string" ? fighter.phoneNumber : "",
    archivedAt: fighter?.archivedAt || null,
    restoredAt: fighter?.restoredAt || null,
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

function formatWholeNumber(value) {
  return new Intl.NumberFormat("en-AU", {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function formatPhoneLink(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function parseWholeNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function clampWholeNumber(value, minimum, maximum) {
  return Math.min(Math.max(parseWholeNumber(value, minimum), minimum), maximum);
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

function formatAuditActionLabel(action) {
  return `${action || "UNKNOWN"}`
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getScoringConfigValues(source = state.scoringConfig) {
  return {
    winPoints: parseWholeNumber(source?.winPoints, 0),
    lossPoints: parseWholeNumber(source?.lossPoints, 0),
    noShowPoints: parseWholeNumber(source?.noShowPoints, -10),
    charismaMax: Math.max(0, parseWholeNumber(source?.charismaMax, 0)),
    dominanceMax: Math.max(0, parseWholeNumber(source?.dominanceMax, 0)),
    titleWinBonus: Math.max(0, parseWholeNumber(source?.titleWinBonus, 0)),
    inactivityGraceDays: Math.max(0, parseWholeNumber(source?.inactivityGraceDays, 0)),
    inactivityWeeklyPenalty: Math.max(0, parseWholeNumber(source?.inactivityWeeklyPenalty, 0)),
    eliminationDays: Math.max(0, parseWholeNumber(source?.eliminationDays, 0))
  };
}

function buildBoutPreviewScore({
  config = state.scoringConfig,
  result,
  charismaPoints = 0,
  dominancePoints = 0,
  applyTitleWinBonus = false
}) {
  const scoringConfig = getScoringConfigValues(config);
  const normalizedResult = result === "LOSS" ? "LOSS" : "WIN";
  const safeCharismaPoints = clampWholeNumber(charismaPoints, 0, scoringConfig.charismaMax);
  const safeDominancePoints = clampWholeNumber(dominancePoints, 0, scoringConfig.dominanceMax);
  const bonusPoints = applyTitleWinBonus ? scoringConfig.titleWinBonus : 0;
  const resultPoints = normalizedResult === "WIN" ? scoringConfig.winPoints : scoringConfig.lossPoints;

  return {
    result: normalizedResult,
    resultPoints,
    charismaPoints: safeCharismaPoints,
    dominancePoints: safeDominancePoints,
    bonusPoints,
    totalDelta: resultPoints + safeCharismaPoints + safeDominancePoints + bonusPoints
  };
}

function normalizeSecurityState(securityState) {
  return {
    writesLocked: Boolean(securityState?.writesLocked),
    lockReason: securityState?.lockReason || "",
    lockedAt: securityState?.lockedAt || null,
    lockedByName: securityState?.lockedByName || ""
  };
}

function isWriteLockedForViewer() {
  return Boolean(state.securityState?.writesLocked && !state.viewer.isOwner);
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
  openDeleteFighterButton.classList.toggle("hidden", mode !== "edit");
  fighterEnableOverrideToggle.checked = false;

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
    fighterForm.elements.phoneNumber.value = "";
    fighterForm.elements.lastFightAt.value = "";
  } else {
    fighterFormKicker.textContent = "Edit Fighter";
    fighterFormTitle.textContent = "Update contender";
    fighterFormSubmitButton.textContent = "Save fighter";
    syncFighterSelectOptions();
    syncSelectedFighterIntoForm(fighterSelect.value);
  }

  syncFighterOverrideState();
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

function syncFighterOverrideState() {
  const isEditMode = state.fighterFormMode === "edit";
  const overrideEnabled = isEditMode ? fighterEnableOverrideToggle.checked : false;
  const showAdvancedFields = isEditMode && overrideEnabled;
  const showPointsField = !isEditMode || overrideEnabled;

  fighterEditFlowNote?.classList.toggle("hidden", !isEditMode);
  fighterOverrideToggleRow?.classList.toggle("hidden", !isEditMode);
  fighterOverrideWarning?.classList.toggle("hidden", !isEditMode || !overrideEnabled);
  fighterPointsField?.classList.toggle("hidden", !showPointsField);
  fighterAdvancedFields?.classList.toggle("hidden", !showAdvancedFields);

  if (fighterForm?.elements.points) {
    fighterForm.elements.points.disabled = isEditMode && !overrideEnabled;
    fighterForm.elements.points.required = !isEditMode || overrideEnabled;
  }

  fighterAdvancedFields?.querySelectorAll("input").forEach((input) => {
    input.disabled = !showAdvancedFields;
    if (input.type !== "datetime-local") {
      input.required = showAdvancedFields;
    }
  });
}

function openDeleteFighterModal(fighter) {
  state.pendingDeleteFighterId = fighter.id;
  deleteFighterName.textContent = fighter.name;
  toggleModal(deleteFighterModal, true);
}

function closeDeleteFighterModal() {
  state.pendingDeleteFighterId = null;
  toggleModal(deleteFighterModal, false);
  setButtonLoadingState(confirmDeleteFighterButton, false, "Archiving", "Archive fighter");
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
  syncAwardPreview();
  toggleModal(awardPointsModal, true);
  window.requestAnimationFrame(() => {
    awardFighterSelect.focus();
  });
}

function closeAwardPointsModal() {
  toggleModal(awardPointsModal, false);
}

function getSelectedAwardFighter() {
  return state.fighterDirectory.find((fighter) => fighter.id === awardFighterSelect.value) || null;
}

function syncAwardPreview() {
  const fighter = getSelectedAwardFighter();
  const currentPoints = fighter?.points ?? 0;
  const isCorrection = awardEntryTypeSelect.value === "CORRECTION";
  const result = awardPointsForm.elements.result.value;
  const correctionPoints = parseWholeNumber(awardPointsForm.elements.correctionPoints.value, 0);

  let delta = 0;
  let breakdown = "Select a fighter to preview the change.";

  if (fighter) {
    if (isCorrection) {
      delta = correctionPoints;
      breakdown = `Direct correction of ${formatDelta(correctionPoints)} points for ${fighter.name}.`;
    } else {
      const preview = buildBoutPreviewScore({
        result,
        charismaPoints: awardPointsForm.elements.charismaPoints.value,
        dominancePoints: awardPointsForm.elements.dominancePoints.value,
        applyTitleWinBonus: awardPointsForm.elements.applyTitleWinBonus.checked
      });

      delta = preview.totalDelta;
      breakdown = [
        `${preview.result === "WIN" ? "Win" : "Loss"} ${formatDelta(preview.resultPoints)}`,
        `Charisma ${formatDelta(preview.charismaPoints)}`,
        `Dominance ${formatDelta(preview.dominancePoints)}`,
        preview.bonusPoints ? `Title bonus ${formatDelta(preview.bonusPoints)}` : null
      ].filter(Boolean).join(" | ");
    }
  }

  awardPreviewCurrent.textContent = formatWholeNumber(currentPoints);
  awardPreviewDelta.textContent = formatDelta(delta);
  awardPreviewProjected.textContent = formatWholeNumber(currentPoints + delta);
  awardPreviewBreakdown.textContent = breakdown;
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
  syncBeltPreview();
  toggleModal(awardBeltModal, true);
  window.requestAnimationFrame(() => {
    beltFighterSelect.focus();
  });
}

function closeAwardBeltModal() {
  toggleModal(awardBeltModal, false);
}

function syncBeltPreview() {
  const currentChampion = getCurrentChampion();
  const nextChampion = state.fighterDirectory.find((fighter) => fighter.id === beltFighterSelect.value) || null;

  if (!currentChampion && !nextChampion) {
    beltPreviewSummary.textContent = "The belt will remain vacant and the #1 slot stays reserved.";
    return;
  }

  if (!nextChampion) {
    beltPreviewSummary.textContent = `${currentChampion?.name || "The current belt holder"} will lose the belt and the #1 slot will become vacant.`;
    return;
  }

  if (currentChampion?.id === nextChampion.id) {
    beltPreviewSummary.textContent = `${nextChampion.name} remains the belt holder and keeps the reserved #1 slot.`;
    return;
  }

  beltPreviewSummary.textContent = `${currentChampion?.name || "Vacant belt"} -> ${nextChampion.name}. The selected fighter will become rank #1 as belt holder.`;
}

function syncSecurityFormState() {
  const writesLocked = securityWritesLockedInput.checked;
  securityLockReasonInput.disabled = !writesLocked;

  if (!writesLocked) {
    securityLockReasonInput.value = "";
  }
}

function openSecurityLockModal() {
  if (!state.viewer.isOwner) {
    showToast("Only the owner can change the security lock.", "info");
    return;
  }

  setMessage(securityLockMessage, "");
  securityWritesLockedInput.checked = Boolean(state.securityState?.writesLocked);
  securityLockReasonInput.value = state.securityState?.lockReason || "";
  syncSecurityFormState();
  toggleModal(securityLockModal, true);
  window.requestAnimationFrame(() => {
    securityWritesLockedInput.focus();
  });
}

function closeSecurityLockModal() {
  toggleModal(securityLockModal, false);
}

function getArchivedFightersTotalPages() {
  return Math.max(1, Math.ceil(state.archivedFighters.length / state.archivedFightersPageSize));
}

function normalizeArchivedFightersPage() {
  state.archivedFightersPage = Math.min(Math.max(1, state.archivedFightersPage), getArchivedFightersTotalPages());
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
  syncScoringPreview();
  toggleModal(scoringConfigModal, true);
  window.requestAnimationFrame(() => {
    scoringConfigForm?.elements.startingPoints?.focus();
  });
}

function closeScoringConfigModal() {
  toggleModal(scoringConfigModal, false);
}

function syncScoringPreview() {
  const scoringConfig = getScoringConfigValues({
    winPoints: scoringConfigForm?.elements.winPoints?.value,
    lossPoints: scoringConfigForm?.elements.lossPoints?.value,
    noShowPoints: scoringConfigForm?.elements.noShowPoints?.value,
    charismaMax: scoringConfigForm?.elements.charismaMax?.value,
    dominanceMax: scoringConfigForm?.elements.dominanceMax?.value,
    titleWinBonus: scoringConfigForm?.elements.titleWinBonus?.value,
    inactivityGraceDays: scoringConfigForm?.elements.inactivityGraceDays?.value,
    inactivityWeeklyPenalty: scoringConfigForm?.elements.inactivityWeeklyPenalty?.value,
    eliminationDays: scoringConfigForm?.elements.eliminationDays?.value
  });
  const maxBoutSwing = scoringConfig.winPoints
    + scoringConfig.charismaMax
    + scoringConfig.dominanceMax
    + scoringConfig.titleWinBonus;

  scoringPreviewWin.textContent = formatDelta(scoringConfig.winPoints);
  scoringPreviewLoss.textContent = formatDelta(scoringConfig.lossPoints);
  scoringPreviewNoShow.textContent = formatDelta(scoringConfig.noShowPoints);
  scoringPreviewMax.textContent = formatDelta(maxBoutSwing);

  scoringPreviewSummary.textContent = scoringConfig.eliminationDays > scoringConfig.inactivityGraceDays
    ? `Decay starts after ${scoringConfig.inactivityGraceDays} idle days at ${scoringConfig.inactivityWeeklyPenalty} points per week. Fighters flip to eliminated after ${scoringConfig.eliminationDays} idle days.`
    : "Elimination days must stay higher than grace days or the rules will not save.";
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

function getFighterContactByName(name) {
  return state.fighterDirectory.find((fighter) => fighter.name === name) || null;
}

function createContactFightCard(label, fighter) {
  const card = document.createElement("article");
  card.className = "contact-fight-card";

  const labelElement = document.createElement("span");
  labelElement.textContent = label;

  const nameElement = document.createElement("strong");
  nameElement.textContent = fighter?.name || "Unknown fighter";

  const phone = fighter?.phoneNumber || "";
  const phoneElement = document.createElement("p");
  phoneElement.textContent = phone || "No phone number saved.";

  card.append(labelElement, nameElement, phoneElement);

  if (phone) {
    const callButton = document.createElement("a");
    callButton.className = "topbar-button accent compact";
    callButton.href = `tel:${formatPhoneLink(phone)}`;
    callButton.textContent = "Call fighter";
    card.appendChild(callButton);
  }

  return card;
}

function openContactFightModal(fightId) {
  const fight = state.fightCard.find((entry) => entry.id === fightId);

  if (!fight) {
    showToast("That fight could not be found.", "error");
    return;
  }

  state.pendingContactFightId = fight.id;
  contactFightList.textContent = "";
  contactFightMatchup.textContent = `${fight.fighterRedName} vs ${fight.fighterBlueName}`;
  contactFightList.append(
    createContactFightCard("Red corner", getFighterContactByName(fight.fighterRedName)),
    createContactFightCard("Blue corner", getFighterContactByName(fight.fighterBlueName))
  );

  toggleModal(contactFightModal, true);
  window.requestAnimationFrame(() => {
    closeContactFightButton?.focus();
  });
}

function closeContactFightModal() {
  state.pendingContactFightId = null;
  toggleModal(contactFightModal, false);
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
  syncScoreFightPreview();
  toggleModal(scoreFightModal, true);
  window.requestAnimationFrame(() => {
    scoreFightWinnerSelect.focus();
  });
}

function closeScoreFightModal() {
  state.pendingScoreFightId = null;
  toggleModal(scoreFightModal, false);
}

function getActiveFightPreviewContext() {
  const fight = state.fightCard.find((entry) => entry.id === state.pendingScoreFightId) || null;

  if (!fight) {
    return {
      fight: null,
      redFighter: null,
      blueFighter: null
    };
  }

  return {
    fight,
    redFighter: state.fighterDirectory.find((fighter) => fighter.name === fight.fighterRedName) || null,
    blueFighter: state.fighterDirectory.find((fighter) => fighter.name === fight.fighterBlueName) || null
  };
}

function syncScoreFightPreview() {
  const { redFighter, blueFighter } = getActiveFightPreviewContext();
  const winnerCorner = scoreFightForm?.elements.winnerCorner?.value || "RED";
  const redWin = winnerCorner === "RED";
  const blueWin = winnerCorner === "BLUE";
  const applyTitleWinBonus = Boolean(scoreFightForm?.elements.applyTitleWinBonus?.checked);
  const redPreview = buildBoutPreviewScore({
    result: redWin ? "WIN" : "LOSS",
    charismaPoints: scoreFightForm?.elements.redCharismaPoints?.value,
    dominancePoints: scoreFightForm?.elements.redDominancePoints?.value,
    applyTitleWinBonus: redWin && applyTitleWinBonus
  });
  const bluePreview = buildBoutPreviewScore({
    result: blueWin ? "WIN" : "LOSS",
    charismaPoints: scoreFightForm?.elements.blueCharismaPoints?.value,
    dominancePoints: scoreFightForm?.elements.blueDominancePoints?.value,
    applyTitleWinBonus: blueWin && applyTitleWinBonus
  });

  if (redFighter) {
    const projectedWins = redFighter.wins + (redWin ? 1 : 0);
    const projectedLosses = redFighter.losses + (redWin ? 0 : 1);
    scoreFightRedPreviewTotal.textContent = formatWholeNumber(redFighter.points + redPreview.totalDelta);
    scoreFightRedPreviewBreakdown.textContent = `${formatDelta(redPreview.totalDelta)} points | projected record ${projectedWins}-${projectedLosses}`;
  } else {
    scoreFightRedPreviewTotal.textContent = "Missing";
    scoreFightRedPreviewBreakdown.textContent = "Red corner fighter is not currently on the ladder.";
  }

  if (blueFighter) {
    const projectedWins = blueFighter.wins + (blueWin ? 1 : 0);
    const projectedLosses = blueFighter.losses + (blueWin ? 0 : 1);
    scoreFightBluePreviewTotal.textContent = formatWholeNumber(blueFighter.points + bluePreview.totalDelta);
    scoreFightBluePreviewBreakdown.textContent = `${formatDelta(bluePreview.totalDelta)} points | projected record ${projectedWins}-${projectedLosses}`;
  } else {
    scoreFightBluePreviewTotal.textContent = "Missing";
    scoreFightBluePreviewBreakdown.textContent = "Blue corner fighter is not currently on the ladder.";
  }
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
    createRuleCard("No Show", `${config.noShowPoints} pts`, "warning"),
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
  const writesLocked = isWriteLockedForViewer();

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

      const contactButton = document.createElement("button");
      contactButton.className = "topbar-button ghost compact";
      contactButton.type = "button";
      contactButton.dataset.action = "contact-fight";
      contactButton.dataset.fightId = fight.id;
      contactButton.textContent = "Contact";
      actionRow.appendChild(contactButton);

      const scoreButton = document.createElement("button");
      scoreButton.className = "topbar-button ghost compact";
      scoreButton.type = "button";
      scoreButton.dataset.action = "score-fight";
      scoreButton.dataset.fightId = fight.id;
      scoreButton.textContent = "Score";
      scoreButton.disabled = writesLocked;
      actionRow.appendChild(scoreButton);

      actions.appendChild(actionRow);
      row.appendChild(actions);
    }

    fightCardTableBody.appendChild(row);
  });
}

function renderSecurityStatus() {
  if (!leaderboardSecurityStatus) {
    return;
  }

  leaderboardSecurityStatus.textContent = "";

  const heading = document.createElement("strong");
  const paragraph = document.createElement("p");

  if (state.securityState?.writesLocked) {
    heading.textContent = "Leaderboard writes are locked";
    paragraph.textContent = state.securityState.lockReason
      ? `Locked by ${state.securityState.lockedByName || "Owner"} on ${formatDateTime(state.securityState.lockedAt)}. Reason: ${state.securityState.lockReason}`
      : `Locked by ${state.securityState.lockedByName || "Owner"} on ${formatDateTime(state.securityState.lockedAt)}.`;
  } else {
    heading.textContent = "Leaderboard writes are open";
    paragraph.textContent = "Staff with access can still submit leaderboard changes right now.";
  }

  leaderboardSecurityStatus.append(heading, paragraph);

  if (leaderboardSecurityOwnerNote) {
    leaderboardSecurityOwnerNote.classList.toggle("hidden", state.viewer.isOwner || !state.viewer.canManage);
  }

  if (openSecurityLockButton) {
    openSecurityLockButton.disabled = !state.viewer.isOwner;
  }
}

function renderArchivedFightersTable() {
  archivedFightersTableBody.textContent = "";
  const writesLocked = isWriteLockedForViewer();

  if (!state.archivedFighters.length) {
    archivedFightersTableBody.appendChild(createTableMessageRow("No archived fighters right now.", 5));
    archivedFightersTableMeta.textContent = "No archived fighters.";
    archivedFightersPageLabel.textContent = "Page 1 of 1";
    previousArchivedFightersPageButton.disabled = true;
    nextArchivedFightersPageButton.disabled = true;
    return;
  }

  normalizeArchivedFightersPage();
  const totalPages = getArchivedFightersTotalPages();
  const pageStart = (state.archivedFightersPage - 1) * state.archivedFightersPageSize;
  const visibleFighters = state.archivedFighters.slice(pageStart, pageStart + state.archivedFightersPageSize);

  visibleFighters.forEach((fighter) => {
    const row = document.createElement("tr");

    const fighterCell = document.createElement("td");
    const fighterPrimary = document.createElement("div");
    fighterPrimary.className = "table-primary";
    const fighterName = document.createElement("strong");
    fighterName.textContent = fighter.name;
    const fighterNotes = document.createElement("span");
    fighterNotes.textContent = fighter.notes || "Archived from the live ladder.";
    fighterPrimary.append(fighterName, fighterNotes);
    fighterCell.appendChild(fighterPrimary);

    const scoreCell = document.createElement("td");
    scoreCell.textContent = `${fighter.effectivePoints}`;

    const recordCell = document.createElement("td");
    recordCell.textContent = `${fighter.wins}-${fighter.losses}`;

    const archivedCell = document.createElement("td");
    archivedCell.textContent = formatDateTime(fighter.archivedAt);

    const actionsCell = document.createElement("td");
    const actionRow = document.createElement("div");
    actionRow.className = "table-action-row";
    const restoreButton = document.createElement("button");
    restoreButton.className = "topbar-button ghost compact";
    restoreButton.type = "button";
    restoreButton.dataset.action = "restore-fighter";
    restoreButton.dataset.fighterId = fighter.id;
    restoreButton.textContent = "Restore";
    restoreButton.disabled = writesLocked;
    actionRow.appendChild(restoreButton);
    actionsCell.appendChild(actionRow);

    row.append(fighterCell, scoreCell, recordCell, archivedCell, actionsCell);
    archivedFightersTableBody.appendChild(row);
  });

  const totalFighters = state.archivedFighters.length;
  const visibleStart = totalFighters === 0 ? 0 : pageStart + 1;
  const visibleEnd = Math.min(pageStart + state.archivedFightersPageSize, totalFighters);
  archivedFightersTableMeta.textContent = `Showing ${visibleStart}-${visibleEnd} of ${totalFighters} archived fighters`;
  archivedFightersPageLabel.textContent = `Page ${state.archivedFightersPage} of ${totalPages}`;
  previousArchivedFightersPageButton.disabled = state.archivedFightersPage <= 1;
  nextArchivedFightersPageButton.disabled = state.archivedFightersPage >= totalPages;
}

function syncAuditActionFilterOptions() {
  if (!auditActionFilter) {
    return;
  }

  const currentValue = state.auditActionFilter;
  auditActionFilter.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = "ALL";
  allOption.textContent = "All actions";
  auditActionFilter.appendChild(allOption);

  AUDIT_ACTION_OPTIONS.forEach((action) => {
    const option = document.createElement("option");
    option.value = action;
    option.textContent = formatAuditActionLabel(action);
    auditActionFilter.appendChild(option);
  });

  const nextValue = AUDIT_ACTION_OPTIONS.includes(currentValue) || currentValue === "ALL"
    ? currentValue
    : "ALL";

  state.auditActionFilter = nextValue;
  auditActionFilter.value = nextValue;
}

function getAuditTotalPages() {
  return Math.max(1, Math.ceil(state.auditTotalCount / state.auditPageSize));
}

function renderScoreLogTable() {
  scoreLogTableBody.textContent = "";
  syncAuditActionFilterOptions();
  const entries = Array.isArray(state.auditLog) ? state.auditLog : [];
  const totalPages = getAuditTotalPages();
  const visibleStart = state.auditTotalCount === 0 ? 0 : ((state.auditPage - 1) * state.auditPageSize) + 1;
  const visibleEnd = Math.min(state.auditPage * state.auditPageSize, state.auditTotalCount);

  if (!entries.length) {
    scoreLogTableBody.appendChild(createTableMessageRow(
      state.auditTotalCount
        ? "No audit entries match the current filters."
        : "No audit activity has been recorded yet.",
      4
    ));
    if (auditLogMeta) {
      auditLogMeta.textContent = state.auditTotalCount
        ? "No audit entries match the current filters."
        : "Showing recent audit activity.";
    }
    if (auditPageLabel) {
      auditPageLabel.textContent = "Page 1 of 1";
    }
    if (previousAuditPageButton) {
      previousAuditPageButton.disabled = true;
    }
    if (nextAuditPageButton) {
      nextAuditPageButton.disabled = true;
    }
    return;
  }

  entries.forEach((entry) => {
    const row = document.createElement("tr");

    const actionCell = document.createElement("td");
    actionCell.textContent = formatAuditActionLabel(entry.action);

    const detailsCell = document.createElement("td");
    const detailsPrimary = document.createElement("div");
    detailsPrimary.className = "table-primary";
    const detailsSummary = document.createElement("strong");
    detailsSummary.textContent = entry.summary;
    const detailsSub = document.createElement("span");
    detailsSub.textContent = entry.entityType
      ? `${entry.entityType}${entry.entityId ? ` | ${entry.entityId}` : ""}`
      : "Leaderboard";
    detailsPrimary.append(detailsSummary, detailsSub);
    detailsCell.appendChild(detailsPrimary);

    const actorCell = document.createElement("td");
    actorCell.textContent = entry.actorName || "Unknown";

    const whenCell = document.createElement("td");
    whenCell.textContent = formatDateTime(entry.createdAt);

    row.append(actionCell, detailsCell, actorCell, whenCell);
    scoreLogTableBody.appendChild(row);
  });

  if (auditLogMeta) {
    auditLogMeta.textContent = `Showing ${visibleStart}-${visibleEnd} of ${state.auditTotalCount} audit actions`;
  }

  if (auditPageLabel) {
    auditPageLabel.textContent = `Page ${state.auditPage} of ${totalPages}`;
  }

  if (previousAuditPageButton) {
    previousAuditPageButton.disabled = state.auditPage <= 1;
  }

  if (nextAuditPageButton) {
    nextAuditPageButton.disabled = state.auditPage >= totalPages;
  }
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
  const writesLocked = isWriteLockedForViewer();
  leaderboardUtilityGrid.classList.toggle("hidden", !showUtilityStrip);
  leaderboardScoringCard.classList.toggle("hidden", !state.viewer.canManage);
  leaderboardScoreLogCard.classList.toggle("hidden", !state.viewer.canManage);
  leaderboardAdminCard.classList.toggle("hidden", !state.viewer.canManage);
  fightCardActionsHeader.classList.toggle("hidden", !state.viewer.canManage);

  [
    openCreateFighterButton,
    openAwardPointsButton,
    openAwardBeltButton,
    openEditFighterButton,
    openScoringConfigButton,
    openHallOfFameButton,
    openFightCardButton
  ].forEach((button) => {
    if (!button) {
      return;
    }

    button.disabled = writesLocked;
  });
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
  fighterForm.elements.phoneNumber.value = fighter.phoneNumber || "";
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
  awardPointsForm.elements.correctionPoints.disabled = !isCorrection;
  syncAwardPreview();
}

function applyNoShowPenaltyToCorrection() {
  awardEntryTypeSelect.value = "CORRECTION";
  awardPointsForm.elements.correctionPoints.value = getScoringConfigValues().noShowPoints;
  syncAwardEntryType();
  syncAwardPreview();
}

function buildAdminAuditQueryString() {
  const params = new URLSearchParams();
  params.set("auditPage", String(state.auditPage));
  params.set("auditPageSize", String(state.auditPageSize));

  if (state.auditSearchQuery.trim()) {
    params.set("auditSearch", state.auditSearchQuery.trim());
  }

  if (state.auditActionFilter !== "ALL") {
    params.set("auditAction", state.auditActionFilter);
  }

  return params.toString();
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
    const queryString = buildAdminAuditQueryString();
    const payload = await api(`/leaderboard/admin${queryString ? `?${queryString}` : ""}`, {
      headers: getSessionHeaders()
    });
    state.scoringConfig = payload.scoringConfig || null;
    state.fighterDirectory = Array.isArray(payload.fighterDirectory)
      ? payload.fighterDirectory.map((fighter, index) => normalizeFighter(fighter, index))
      : state.fighters.map((fighter, index) => normalizeFighter(fighter, index));
    state.archivedFighters = Array.isArray(payload.archivedFighters)
      ? payload.archivedFighters.map((fighter, index) => normalizeFighter(fighter, index))
      : [];
    state.securityState = normalizeSecurityState(payload.securityState);
    state.auditLog = Array.isArray(payload.auditLog?.entries) ? payload.auditLog.entries : [];
    state.auditPage = Number.isFinite(Number(payload.auditLog?.page))
      ? Number(payload.auditLog.page)
      : state.auditPage;
    state.auditPageSize = Number.isFinite(Number(payload.auditLog?.pageSize))
      ? Number(payload.auditLog.pageSize)
      : state.auditPageSize;
    state.auditTotalCount = Number.isFinite(Number(payload.auditLog?.totalCount))
      ? Number(payload.auditLog.totalCount)
      : state.auditLog.length;
    state.auditSearchQuery = typeof payload.auditLog?.searchQuery === "string"
      ? payload.auditLog.searchQuery
      : state.auditSearchQuery;
    state.auditActionFilter = typeof payload.auditLog?.actionFilter === "string"
      ? payload.auditLog.actionFilter
      : state.auditActionFilter;
    if (auditSearchInput && auditSearchInput.value !== state.auditSearchQuery) {
      auditSearchInput.value = state.auditSearchQuery;
    }
    state.viewer = normalizeViewer(payload.viewer);
  } catch (error) {
    if (error.status === 401) {
      clearSession();
      state.session = null;
      state.viewer = getSignedOutViewer();
      resetAdminState();

      if (!silentUnauthorized) {
        showToast("Session expired. Please log in again.", "info");
        openLoginModal();
      }

      return;
    }

    if (!silentUnauthorized) {
      showToast(error.message, "error");
    }
  }
}

function renderLeaderboardPage() {
  normalizeLeaderboardPage();
  normalizeArchivedFightersPage();
  syncSessionButton();
  syncLeaderboardControls();
  renderChampionSpotlight();
  renderScoringRules();
  renderLeaderboardTable();
  renderLeaderCards();
  renderFightCardTable();
  renderHallOfFameTable();
  renderSecurityStatus();
  renderArchivedFightersTable();
  renderScoreLogTable();
}

async function refreshAdminLeaderboardPanels({ silentUnauthorized = true } = {}) {
  await loadAdminLeaderboardData({ silentUnauthorized });
  renderLeaderboardPage();
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

openSecurityLockButton?.addEventListener("click", () => {
  openSecurityLockModal();
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
    return;
  }

  if (actionButton.dataset.action === "contact-fight") {
    openContactFightModal(actionButton.dataset.fightId);
  }
});

archivedFightersTableBody?.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button[data-action]");

  if (!actionButton || actionButton.dataset.action !== "restore-fighter") {
    return;
  }

  const fighter = state.archivedFighters.find((entry) => entry.id === actionButton.dataset.fighterId);

  if (!fighter) {
    showToast("That archived fighter could not be found.", "error");
    return;
  }

  try {
    await apiWithOptionalSession(`/leaderboard/fighters/${fighter.id}/restore`, {
      method: "POST"
    });

    await loadLeaderboardData();
    showToast(`${fighter.name} restored to the live ladder.`, "success");
  } catch (error) {
    showToast(error.message, "error");
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

previousArchivedFightersPageButton?.addEventListener("click", () => {
  if (state.archivedFightersPage <= 1) {
    return;
  }

  state.archivedFightersPage -= 1;
  renderArchivedFightersTable();
});

nextArchivedFightersPageButton?.addEventListener("click", () => {
  if (state.archivedFightersPage >= getArchivedFightersTotalPages()) {
    return;
  }

  state.archivedFightersPage += 1;
  renderArchivedFightersTable();
});

leaderboardSearchInput?.addEventListener("input", () => {
  state.leaderboardSearchQuery = leaderboardSearchInput.value;
  state.leaderboardPage = 1;
  renderLeaderboardTable();
});

auditSearchInput?.addEventListener("input", () => {
  state.auditSearchQuery = auditSearchInput.value;
  state.auditPage = 1;
  if (auditSearchDebounceHandle) {
    window.clearTimeout(auditSearchDebounceHandle);
  }
  auditSearchDebounceHandle = window.setTimeout(() => {
    refreshAdminLeaderboardPanels();
  }, 220);
});

auditActionFilter?.addEventListener("change", () => {
  state.auditActionFilter = auditActionFilter.value || "ALL";
  state.auditPage = 1;
  refreshAdminLeaderboardPanels();
});

previousAuditPageButton?.addEventListener("click", () => {
  if (state.auditPage <= 1) {
    return;
  }

  state.auditPage -= 1;
  refreshAdminLeaderboardPanels();
});

nextAuditPageButton?.addEventListener("click", () => {
  if (state.auditPage >= getAuditTotalPages()) {
    return;
  }

  state.auditPage += 1;
  refreshAdminLeaderboardPanels();
});

fighterSelect?.addEventListener("change", () => {
  syncSelectedFighterIntoForm(fighterSelect.value);
});

awardEntryTypeSelect?.addEventListener("change", syncAwardEntryType);
fighterEnableOverrideToggle?.addEventListener("change", syncFighterOverrideState);
awardFighterSelect?.addEventListener("change", syncAwardPreview);
awardFightSelect?.addEventListener("change", syncAwardPreview);
beltFighterSelect?.addEventListener("change", syncBeltPreview);
scoreFightWinnerSelect?.addEventListener("change", syncScoreFightPreview);
applyNoShowPenaltyButton?.addEventListener("click", applyNoShowPenaltyToCorrection);
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
closeSecurityLockButton?.addEventListener("click", closeSecurityLockModal);
closeSecurityLockBackdrop?.addEventListener("click", closeSecurityLockModal);
closeScoringButton?.addEventListener("click", closeScoringConfigModal);
closeScoringBackdrop?.addEventListener("click", closeScoringConfigModal);
closeHallOfFameButton?.addEventListener("click", closeHallOfFameModal);
closeHallOfFameBackdrop?.addEventListener("click", closeHallOfFameModal);
closeFightCardButton?.addEventListener("click", closeFightCardModal);
closeFightCardBackdrop?.addEventListener("click", closeFightCardModal);
closeContactFightButton?.addEventListener("click", closeContactFightModal);
closeContactFightBackdrop?.addEventListener("click", closeContactFightModal);
closeScoreFightButton?.addEventListener("click", closeScoreFightModal);
closeScoreFightBackdrop?.addEventListener("click", closeScoreFightModal);

awardPointsForm?.addEventListener("input", syncAwardPreview);
scoringConfigForm?.addEventListener("input", syncScoringPreview);
scoreFightForm?.addEventListener("input", syncScoreFightPreview);

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

  if (!contactFightModal.classList.contains("hidden")) {
    closeContactFightModal();
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

  if (!securityLockModal.classList.contains("hidden")) {
    closeSecurityLockModal();
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
    phoneNumber: fighterForm.elements.phoneNumber.value.trim(),
    active: fighterForm.elements.active.checked,
    notes: fighterForm.elements.notes.value.trim()
  };

  if (state.fighterFormMode === "create") {
    payload.points = Number(fighterForm.elements.points.value);
  }

  if (state.fighterFormMode === "edit" && fighterEnableOverrideToggle.checked) {
    payload.applyStatOverride = true;
    payload.points = Number(fighterForm.elements.points.value);
    payload.wins = Number(fighterForm.elements.wins.value);
    payload.losses = Number(fighterForm.elements.losses.value);
    payload.charismaPoints = Number(fighterForm.elements.charismaPoints.value);
    payload.dominancePoints = Number(fighterForm.elements.dominancePoints.value);
    payload.lastFightAt = fighterForm.elements.lastFightAt.value || "";
  }

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

  setButtonLoadingState(confirmDeleteFighterButton, true, "Archiving", "Archive fighter");

  try {
    await apiWithOptionalSession(`/leaderboard/fighters/${fighterId}`, {
      method: "DELETE"
    });

    closeDeleteFighterModal();
    closeFighterFormModal();
    await loadLeaderboardData();
    showToast("Fighter archived.", "success");
  } catch (error) {
    setButtonLoadingState(confirmDeleteFighterButton, false, "Archiving", "Archive fighter");
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

securityWritesLockedInput?.addEventListener("change", syncSecurityFormState);

securityLockForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(securityLockMessage, "");
  setButtonLoadingState(securityLockSubmitButton, true, "Saving", "Save security lock");

  const payload = {
    writesLocked: securityWritesLockedInput.checked,
    lockReason: securityLockReasonInput.value.trim()
  };

  try {
    await apiWithOptionalSession("/leaderboard/security", {
      method: "PATCH",
      body: payload
    });

    closeSecurityLockModal();
    await loadLeaderboardData({ includeAdmin: true });
    showToast(payload.writesLocked ? "Leaderboard writes locked." : "Leaderboard writes unlocked.", "success");
  } catch (error) {
    setMessage(securityLockMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(securityLockSubmitButton, false, "Saving", "Save security lock");
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
