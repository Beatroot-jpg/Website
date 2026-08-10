import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const CATEGORIES = [
  { key: "STREET_DEALER", label: "Street Dealer" },
  { key: "ELECTRICAL", label: "Electrical" },
  { key: "MINING", label: "Mining" },
  { key: "METH_COOK", label: "Meth Cook" },
  { key: "TRUCKING", label: "Trucking" },
  { key: "BIN_DIVING", label: "Bin Diving" },
  { key: "WEED", label: "Weed" },
  { key: "TAXI", label: "Taxi" }
];

const $ = (selector) => document.querySelector(selector);

const themeToggleButton = $("#themeToggleButton");
const sessionButton = $("#sessionButton");
const hallAccessStatus = $("#hallAccessStatus");
const openEntryModalButton = $("#openEntryModalButton");
const hallBoardMeta = $("#hallBoardMeta");
const hallCategoryGrid = $("#hallCategoryGrid");
const loginModal = $("#loginModal");
const loginForm = $("#loginForm");
const loginError = $("#loginError");
const loginSubmitButton = $("#loginSubmitButton");
const entryModal = $("#entryModal");
const entryModalTitle = $("#entryModalTitle");
const entryForm = $("#entryForm");
const entryCategorySelect = $("#entryCategorySelect");
const entryFormMessage = $("#entryFormMessage");
const entrySubmitButton = $("#entrySubmitButton");
const deleteEntryButton = $("#deleteEntryButton");
const deleteEntryModal = $("#deleteEntryModal");
const deleteEntryName = $("#deleteEntryName");
const confirmDeleteEntryButton = $("#confirmDeleteEntryButton");

const state = {
  session: getSession(),
  currentUser: null,
  viewer: { isLoggedIn: false, canManage: false },
  entries: [],
  loading: true,
  editingEntryId: null,
  deletingEntryId: null
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
  if (state.session && state.session.token) {
    headers.set("Authorization", "Bearer " + state.session.token);
  }
  return api(path, { ...options, headers });
}

function canManage() {
  return Boolean(state.viewer.canManage);
}

function getCategory(key) {
  return CATEGORIES.find((category) => category.key === key) || CATEGORIES[0];
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const categoryDifference = CATEGORIES.findIndex((category) => category.key === left.category)
      - CATEGORIES.findIndex((category) => category.key === right.category);

    if (categoryDifference !== 0) {
      return categoryDifference;
    }

    return left.name.localeCompare(right.name);
  });
}

function selectedEntry(id) {
  return state.entries.find((entry) => entry.id === id) || null;
}

function syncSessionButton() {
  if (state.currentUser && state.currentUser.name) {
    sessionButton.textContent = state.currentUser.name;
    sessionButton.dataset.state = "session";
    return;
  }

  sessionButton.textContent = "Login";
  sessionButton.dataset.state = "login";
}

function syncAccess() {
  const admin = canManage();
  hallAccessStatus.textContent = admin ? "Admin controls enabled" : "Public view";
  hallAccessStatus.classList.toggle("is-live", admin);
  openEntryModalButton.hidden = !admin;
}

function populateCategorySelect() {
  const selectedValue = entryCategorySelect.value;
  entryCategorySelect.replaceChildren();

  CATEGORIES.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.key;
    option.textContent = category.label;
    entryCategorySelect.appendChild(option);
  });

  entryCategorySelect.value = CATEGORIES.some((category) => category.key === selectedValue)
    ? selectedValue
    : CATEGORIES[0].key;
}

function createEntryRow(entry) {
  const row = document.createElement("li");
  row.className = "hall-entry-row";

  const copy = document.createElement("div");
  copy.className = "hall-entry-copy";
  const name = document.createElement("strong");
  name.className = "hall-entry-name";
  name.textContent = entry.name;
  copy.appendChild(name);

  if (entry.note) {
    const note = document.createElement("span");
    note.className = "hall-entry-note";
    note.textContent = entry.note;
    copy.appendChild(note);
  }

  row.appendChild(copy);

  if (canManage()) {
    const button = document.createElement("button");
    button.className = "inventory-button ghost compact";
    button.type = "button";
    button.dataset.entryAction = "edit";
    button.dataset.entryId = entry.id;
    button.textContent = "Update";
    row.appendChild(button);
  }

  return row;
}

function createCategoryCard(category, entries) {
  const card = document.createElement("article");
  card.className = "hall-category-card";
  card.dataset.categoryMark = category.label.charAt(0);

  const header = document.createElement("header");
  header.className = "hall-category-header";
  const title = document.createElement("h3");
  title.textContent = category.label;
  const count = document.createElement("span");
  count.className = "hall-category-count";
  count.textContent = entries.length + " " + (entries.length === 1 ? "inductee" : "inductees");
  header.append(title, count);
  card.appendChild(header);

  if (state.loading) {
    const loading = document.createElement("p");
    loading.className = "hall-empty";
    loading.textContent = "Loading...";
    card.appendChild(loading);
    return card;
  }

  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "hall-empty";
    empty.textContent = "No inductees recorded yet.";
    card.appendChild(empty);
    return card;
  }

  const list = document.createElement("ul");
  list.className = "hall-entry-list";
  entries.forEach((entry) => list.appendChild(createEntryRow(entry)));
  card.appendChild(list);
  return card;
}

function renderBoard() {
  hallCategoryGrid.replaceChildren();

  CATEGORIES.forEach((category) => {
    const entries = state.entries.filter((entry) => entry.category === category.key);
    hallCategoryGrid.appendChild(createCategoryCard(category, entries));
  });

  if (state.loading) {
    hallBoardMeta.textContent = "Loading inductees...";
    return;
  }

  hallBoardMeta.textContent = state.entries.length
    ? state.entries.length + " " + (state.entries.length === 1 ? "inductee" : "inductees") + " across eight fields."
    : "No inductees recorded yet.";
}

function hydrateSession() {
  state.currentUser = state.session && state.session.token ? state.session.user || null : null;
  syncSessionButton();
}

async function loadHallOfFame() {
  state.loading = true;
  renderBoard();

  try {
    const request = state.session && state.session.token ? apiWithSession : api;
    const response = await request("/hall-of-fame");
    state.entries = sortEntries(response.entries || []);
    state.viewer = response.viewer || state.viewer;

    if (!state.viewer.isLoggedIn && state.session && state.session.token) {
      clearSession();
      state.session = null;
      state.currentUser = null;
      syncSessionButton();
    }
  } catch (error) {
    state.entries = [];
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    syncAccess();
    renderBoard();
  }
}

function openEntryModal(entry = null) {
  if (!canManage()) {
    showToast(state.currentUser ? "Admin access is required." : "Log in as an admin to manage the Hall of Fame.", "error");
    return;
  }

  state.editingEntryId = entry ? entry.id : null;
  entryForm.reset();
  populateCategorySelect();
  setMessage(entryFormMessage, "");
  entryModalTitle.textContent = entry ? "Update inductee" : "Induct someone";
  entrySubmitButton.textContent = entry ? "Save entry" : "Induct";
  deleteEntryButton.hidden = !entry;

  if (entry) {
    entryForm.elements.name.value = entry.name;
    entryCategorySelect.value = entry.category;
    entryForm.elements.note.value = entry.note || "";
  }

  toggleModal(entryModal, true);
  window.requestAnimationFrame(() => entryForm.elements.name.focus());
}

function openDeleteEntryModal(entry) {
  state.deletingEntryId = entry.id;
  deleteEntryName.textContent = entry.name + " - " + getCategory(entry.category).label;
  toggleModal(deleteEntryModal, true);
}

async function updateEntry(entryId, payload, successMessage) {
  const response = await apiWithSession("/hall-of-fame/entries/" + entryId, {
    method: "PATCH",
    body: payload
  });

  state.entries = sortEntries(state.entries.map((entry) => entry.id === response.entry.id ? response.entry : entry));
  renderBoard();
  showToast(successMessage, "success");
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
  await loadHallOfFame();
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
    await loadHallOfFame();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(loginSubmitButton, false, "Entering", "Enter");
  }
});

openEntryModalButton.addEventListener("click", () => openEntryModal());

hallCategoryGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-entry-action='edit']");
  if (!button || !canManage()) {
    return;
  }

  const entry = selectedEntry(button.dataset.entryId);
  if (entry) {
    openEntryModal(entry);
  }
});

entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const editing = Boolean(state.editingEntryId);
  const payload = {
    name: entryForm.elements.name.value.trim(),
    category: entryCategorySelect.value,
    note: entryForm.elements.note.value.trim()
  };

  setMessage(entryFormMessage, "");
  setLoading(entrySubmitButton, true, "Saving", editing ? "Save entry" : "Induct");

  try {
    if (editing) {
      await updateEntry(state.editingEntryId, payload, "Hall of Fame entry updated.");
    } else {
      const response = await apiWithSession("/hall-of-fame/entries", {
        method: "POST",
        body: payload
      });
      state.entries = sortEntries([...state.entries, response.entry]);
      renderBoard();
      showToast("Inductee added to the Hall of Fame.", "success");
    }

    toggleModal(entryModal, false);
  } catch (error) {
    setMessage(entryFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(entrySubmitButton, false, "Saving", editing ? "Save entry" : "Induct");
  }
});

deleteEntryButton.addEventListener("click", () => {
  const entry = selectedEntry(state.editingEntryId);
  if (entry) {
    openDeleteEntryModal(entry);
  }
});

confirmDeleteEntryButton.addEventListener("click", async () => {
  const entry = selectedEntry(state.deletingEntryId);
  if (!entry) {
    return;
  }

  setLoading(confirmDeleteEntryButton, true, "Removing", "Remove entry");

  try {
    const response = await apiWithSession("/hall-of-fame/entries/" + entry.id, {
      method: "DELETE"
    });
    state.entries = state.entries.filter((item) => item.id !== entry.id);
    state.editingEntryId = null;
    state.deletingEntryId = null;
    toggleModal(deleteEntryModal, false);
    toggleModal(entryModal, false);
    renderBoard();
    showToast(response.message, "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(confirmDeleteEntryButton, false, "Removing", "Remove entry");
  }
});

[
  ["closeLoginButton", loginModal],
  ["closeLoginBackdrop", loginModal],
  ["closeEntryButton", entryModal],
  ["closeEntryBackdrop", entryModal],
  ["closeDeleteEntryButton", deleteEntryModal],
  ["closeDeleteEntryBackdrop", deleteEntryModal],
  ["cancelDeleteEntryButton", deleteEntryModal]
].forEach(([buttonId, modal]) => {
  $("#" + buttonId).addEventListener("click", () => toggleModal(modal, false));
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  [deleteEntryModal, entryModal, loginModal].some((modal) => {
    if (!modal.classList.contains("hidden")) {
      toggleModal(modal, false);
      return true;
    }
    return false;
  });
});

initThemeToggle(themeToggleButton);
hydrateSession();
populateCategorySelect();
syncAccess();
renderBoard();
await loadHallOfFame();