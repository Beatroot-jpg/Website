import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const FLASH_MESSAGE_KEY = "the-shites-flash-message";
const themeToggleButton = document.querySelector("#themeToggleButton");
const sessionButton = document.querySelector("#sessionButton");
const accessSummary = document.querySelector("#accessSummary");
const actionPanelLock = document.querySelector("#actionPanelLock");
const adminActionGrid = document.querySelector("#adminActionGrid");
const openCreateUserButton = document.querySelector("#openCreateUserButton");
const refreshUsersButton = document.querySelector("#refreshUsersButton");
const userTableLock = document.querySelector("#userTableLock");
const userTableShell = document.querySelector("#userTableShell");
const userTableBody = document.querySelector("#userTableBody");
const userTableMeta = document.querySelector("#userTableMeta");
const usersPageLabel = document.querySelector("#usersPageLabel");
const previousUsersPageButton = document.querySelector("#previousUsersPageButton");
const nextUsersPageButton = document.querySelector("#nextUsersPageButton");
const loginModal = document.querySelector("#loginModal");
const closeLoginButton = document.querySelector("#closeLoginButton");
const closeLoginBackdrop = document.querySelector("#closeLoginBackdrop");
const loginForm = document.querySelector("#loginForm");
const loginError = document.querySelector("#loginError");
const loginHint = document.querySelector("#loginHint");
const loginSubmitButton = document.querySelector("#loginSubmitButton");
const createUserModal = document.querySelector("#createUserModal");
const closeCreateButton = document.querySelector("#closeCreateButton");
const closeCreateBackdrop = document.querySelector("#closeCreateBackdrop");
const createUserForm = document.querySelector("#createUserForm");
const createUserMessage = document.querySelector("#createUserMessage");
const createUserSubmitButton = document.querySelector("#createUserSubmitButton");
const editUserModal = document.querySelector("#editUserModal");
const closeEditButton = document.querySelector("#closeEditButton");
const closeEditBackdrop = document.querySelector("#closeEditBackdrop");
const editUserForm = document.querySelector("#editUserForm");
const editUserMessage = document.querySelector("#editUserMessage");
const editUserSubmitButton = document.querySelector("#editUserSubmitButton");
const editUserRoleNote = document.querySelector("#editUserRoleNote");
const editCurrentUserNote = document.querySelector("#editCurrentUserNote");
const deleteUserModal = document.querySelector("#deleteUserModal");
const closeDeleteButton = document.querySelector("#closeDeleteButton");
const closeDeleteBackdrop = document.querySelector("#closeDeleteBackdrop");
const cancelDeleteUserButton = document.querySelector("#cancelDeleteUserButton");
const confirmDeleteUserButton = document.querySelector("#confirmDeleteUserButton");
const deleteUserName = document.querySelector("#deleteUserName");

const state = {
  session: getSession(),
  currentUser: null,
  users: [],
  usersLoading: false,
  usersPage: 1,
  usersPageSize: 6,
  pendingDeleteUserId: null
};

function redirectHomeWithLoginPrompt() {
  try {
    window.sessionStorage.setItem(FLASH_MESSAGE_KEY, "admin-login-required");
  } catch (_error) {}

  window.location.replace("./index.html");
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

function canManageAdminPanel(user = state.currentUser) {
  return Boolean(user && (user.role === "ADMIN" || user.permissions?.includes("USERS")));
}

function getAuthorizationHeaders(headers = {}) {
  const merged = new Headers(headers);

  if (state.session?.token) {
    merged.set("Authorization", `Bearer ${state.session.token}`);
  }

  return merged;
}

async function authorizedApi(path, options = {}) {
  return api(path, {
    ...options,
    headers: getAuthorizationHeaders(options.headers)
  });
}

function toggleModal(modal, visible) {
  if (!modal) {
    return;
  }

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

function openCreateUserModal() {
  createUserForm.reset();
  setMessage(createUserMessage, "");
  toggleModal(createUserModal, true);
  window.requestAnimationFrame(() => {
    createUserForm?.elements.name?.focus();
  });
}

function closeCreateUserModal() {
  toggleModal(createUserModal, false);
}

function openEditUserModal(user) {
  if (!user) {
    return;
  }

  editUserForm.reset();
  setMessage(editUserMessage, "");
  editUserForm.elements.id.value = user.id;
  editUserForm.elements.name.value = user.name || "";
  editUserForm.elements.username.value = user.username || "";
  editUserForm.elements.password.value = "";
  editUserForm.elements.active.checked = user.active !== false;
  editUserForm.elements.adminPanelAccess.checked = canManageAdminPanel(user);
  editUserForm.elements.adminPanelAccess.disabled = user.role === "ADMIN";
  editUserForm.elements.active.disabled = state.currentUser?.id === user.id;
  editUserRoleNote.classList.toggle("hidden", user.role !== "ADMIN");
  editCurrentUserNote.classList.toggle("hidden", state.currentUser?.id !== user.id);
  toggleModal(editUserModal, true);
  window.requestAnimationFrame(() => {
    editUserForm?.elements.name?.focus();
  });
}

function closeEditUserModal() {
  toggleModal(editUserModal, false);
}

function openDeleteUserModal(user) {
  if (!user) {
    return;
  }

  state.pendingDeleteUserId = user.id;
  deleteUserName.textContent = `${user.name} (@${user.username})`;
  toggleModal(deleteUserModal, true);
}

function closeDeleteUserModal() {
  state.pendingDeleteUserId = null;
  toggleModal(deleteUserModal, false);
  setButtonLoadingState(confirmDeleteUserButton, false, "Deleting", "Delete user");
}

function syncSessionButton() {
  if (state.currentUser?.name) {
    sessionButton.textContent = state.currentUser.name;
    sessionButton.dataset.state = "session";
    loginHint.textContent = canManageAdminPanel()
      ? "This account can run the admin forms on this page."
      : "This account can view the admin page, but its admin functions are locked.";
    return;
  }

  sessionButton.textContent = "Login";
  sessionButton.dataset.state = "login";
  loginHint.textContent = "Only accounts with admin-panel access can run the user-management functions.";
}

function createStatusItem(label, value, tone = "neutral") {
  const article = document.createElement("article");
  article.className = "status-card";

  const heading = document.createElement("p");
  heading.className = "status-card-label";
  heading.textContent = label;

  const strong = document.createElement("strong");
  strong.className = `status-card-value ${tone}`;
  strong.textContent = value;

  article.append(heading, strong);
  return article;
}

function renderAccessSummary() {
  accessSummary.replaceChildren(
    createStatusItem("Current user", state.currentUser?.name || "Guest"),
    createStatusItem("Leaderboard and wagers", state.currentUser ? "Manage enabled" : "Public view only", state.currentUser ? "accent" : "neutral"),
    createStatusItem("Admin panel tools", canManageAdminPanel() ? "Enabled" : state.currentUser ? "Locked" : "Login required", canManageAdminPanel() ? "accent" : "warning")
  );
}

function renderLockMessage(container, title, copy) {
  if (!container) {
    return;
  }

  container.textContent = "";

  const heading = document.createElement("strong");
  heading.textContent = title;

  const paragraph = document.createElement("p");
  paragraph.textContent = copy;

  container.append(heading, paragraph);
}

function getUsersTotalPages() {
  return Math.max(1, Math.ceil(state.users.length / state.usersPageSize));
}

function normalizeUsersPage() {
  state.usersPage = Math.min(Math.max(1, state.usersPage), getUsersTotalPages());
}

function focusUsersPageByUserId(userId) {
  const userIndex = state.users.findIndex((user) => user.id === userId);

  if (userIndex === -1) {
    normalizeUsersPage();
    return;
  }

  state.usersPage = Math.floor(userIndex / state.usersPageSize) + 1;
  normalizeUsersPage();
}

function createBadge(text, tone = "neutral") {
  const badge = document.createElement("span");
  badge.className = `status-pill ${tone}`;
  badge.textContent = text;
  return badge;
}

function createTableMessageRow(message) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 6;
  cell.className = "table-message-cell";
  cell.textContent = message;
  row.appendChild(cell);
  return row;
}

function renderUsersPagination() {
  if (!canManageAdminPanel()) {
    userTableMeta.textContent = state.currentUser ? "User management locked" : "Login required";
    usersPageLabel.textContent = "Page 1 of 1";
    previousUsersPageButton.disabled = true;
    nextUsersPageButton.disabled = true;
    return;
  }

  const totalUsers = state.users.length;
  const totalPages = getUsersTotalPages();
  const pageStart = totalUsers === 0 ? 0 : (state.usersPage - 1) * state.usersPageSize + 1;
  const pageEnd = totalUsers === 0
    ? 0
    : Math.min(state.usersPage * state.usersPageSize, totalUsers);

  userTableMeta.textContent = state.usersLoading
    ? "Loading users..."
    : `Showing ${pageStart}-${pageEnd} of ${totalUsers} users`;
  usersPageLabel.textContent = `Page ${state.usersPage} of ${totalPages}`;
  previousUsersPageButton.disabled = state.usersLoading || state.usersPage <= 1;
  nextUsersPageButton.disabled = state.usersLoading || state.usersPage >= totalPages;
}

function renderUsersTable() {
  userTableBody.textContent = "";

  if (!canManageAdminPanel()) {
    renderUsersPagination();
    return;
  }

  if (state.usersLoading) {
    userTableBody.appendChild(createTableMessageRow("Loading users..."));
    renderUsersPagination();
    return;
  }

  if (!state.users.length) {
    userTableBody.appendChild(createTableMessageRow("No user accounts found."));
    renderUsersPagination();
    return;
  }

  normalizeUsersPage();
  const pageStart = (state.usersPage - 1) * state.usersPageSize;
  const visibleUsers = state.users.slice(pageStart, pageStart + state.usersPageSize);

  visibleUsers.forEach((user) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const namePrimary = document.createElement("div");
    namePrimary.className = "table-primary";
    const nameStrong = document.createElement("strong");
    nameStrong.textContent = user.name;
    const nameSub = document.createElement("span");
    nameSub.textContent = user.role === "ADMIN" ? "Bootstrap admin account" : "Custom account";
    namePrimary.append(nameStrong, nameSub);
    nameCell.appendChild(namePrimary);

    const usernameCell = document.createElement("td");
    usernameCell.textContent = `@${user.username}`;

    const accessCell = document.createElement("td");
    accessCell.appendChild(
      createBadge(canManageAdminPanel(user) ? "Admin panel" : "Fight-night only", canManageAdminPanel(user) ? "accent" : "neutral")
    );

    const statusCell = document.createElement("td");
    statusCell.appendChild(
      createBadge(user.active ? "Active" : "Inactive", user.active ? "accent" : "warning")
    );

    const updatedCell = document.createElement("td");
    updatedCell.textContent = formatDateTime(user.updatedAt);

    const actionsCell = document.createElement("td");
    const actionsRow = document.createElement("div");
    actionsRow.className = "table-action-row";

    const editButton = document.createElement("button");
    editButton.className = "topbar-button ghost compact";
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.dataset.userId = user.id;
    editButton.textContent = "Edit";
    actionsRow.appendChild(editButton);

    if (state.currentUser?.id !== user.id) {
      const deleteButton = document.createElement("button");
      deleteButton.className = "topbar-button ghost compact";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete";
      deleteButton.dataset.userId = user.id;
      deleteButton.textContent = "Delete";
      actionsRow.appendChild(deleteButton);
    }

    actionsCell.appendChild(actionsRow);
    row.append(nameCell, usernameCell, accessCell, statusCell, updatedCell, actionsCell);
    userTableBody.appendChild(row);
  });

  renderUsersPagination();
}

function syncPanelAccess() {
  const isLoggedIn = Boolean(state.currentUser);
  const allowed = canManageAdminPanel();

  adminActionGrid.classList.toggle("hidden", !allowed);
  actionPanelLock.classList.toggle("hidden", allowed);
  userTableShell.classList.toggle("hidden", !allowed);
  userTableLock.classList.toggle("hidden", allowed);
  refreshUsersButton.disabled = !allowed;

  if (allowed) {
    return;
  }

  if (!isLoggedIn) {
    renderLockMessage(
      actionPanelLock,
      "Login required",
      "Sign in with a valid account before using any admin-panel actions."
    );
    renderLockMessage(
      userTableLock,
      "Login required",
      "Sign in to view and manage existing user accounts."
    );
    return;
  }

  renderLockMessage(
    actionPanelLock,
    "Functions are locked",
    "This account can view the admin page, but it cannot open or submit admin forms."
  );
  renderLockMessage(
    userTableLock,
    "User management is locked",
    "Ask an account with admin-panel access to edit logins or manage permissions."
  );
}

async function hydrateSession() {
  state.session = getSession();
  state.currentUser = null;

  if (!state.session?.token) {
    redirectHomeWithLoginPrompt();
    return false;
  }

  try {
    const response = await authorizedApi("/auth/me");
    state.currentUser = response.user;
    saveSession({
      ...state.session,
      user: response.user
    });
  } catch (_error) {
    clearSession();
    state.session = null;
    state.currentUser = null;
    redirectHomeWithLoginPrompt();
    return false;
  }

  syncSessionButton();
  renderAccessSummary();
  syncPanelAccess();
  return true;
}

async function loadUsers(options = {}) {
  if (!canManageAdminPanel()) {
    state.users = [];
    state.usersLoading = false;
    renderUsersTable();
    return;
  }

  state.usersLoading = true;
  renderUsersTable();

  try {
    const response = await authorizedApi("/users");
    state.users = response.users || [];

    if (options.focusUserId) {
      focusUsersPageByUserId(options.focusUserId);
    } else {
      normalizeUsersPage();
    }
  } catch (error) {
    state.users = [];
    normalizeUsersPage();
    showToast(error.message, "error");
  } finally {
    state.usersLoading = false;
    renderUsersTable();
  }
}

sessionButton?.addEventListener("click", () => {
  if (sessionButton.dataset.state === "session") {
    if (window.confirm("Log out of the current session?")) {
      clearSession();
      window.location.replace("./index.html");
    }
    return;
  }

  openLoginModal();
});

openCreateUserButton?.addEventListener("click", () => {
  if (!canManageAdminPanel()) {
    showToast("This account cannot create users.", "error");
    return;
  }

  openCreateUserModal();
});

refreshUsersButton?.addEventListener("click", async () => {
  await loadUsers();

  if (canManageAdminPanel()) {
    showToast("User table refreshed.", "info");
  }
});

previousUsersPageButton?.addEventListener("click", () => {
  if (state.usersPage <= 1) {
    return;
  }

  state.usersPage -= 1;
  renderUsersTable();
});

nextUsersPageButton?.addEventListener("click", () => {
  if (state.usersPage >= getUsersTotalPages()) {
    return;
  }

  state.usersPage += 1;
  renderUsersTable();
});

closeLoginButton?.addEventListener("click", closeLoginModal);
closeLoginBackdrop?.addEventListener("click", closeLoginModal);
closeCreateButton?.addEventListener("click", closeCreateUserModal);
closeCreateBackdrop?.addEventListener("click", closeCreateUserModal);
closeEditButton?.addEventListener("click", closeEditUserModal);
closeEditBackdrop?.addEventListener("click", closeEditUserModal);
closeDeleteButton?.addEventListener("click", closeDeleteUserModal);
closeDeleteBackdrop?.addEventListener("click", closeDeleteUserModal);
cancelDeleteUserButton?.addEventListener("click", closeDeleteUserModal);

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!deleteUserModal.classList.contains("hidden")) {
    closeDeleteUserModal();
    return;
  }

  if (!editUserModal.classList.contains("hidden")) {
    closeEditUserModal();
    return;
  }

  if (!createUserModal.classList.contains("hidden")) {
    closeCreateUserModal();
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
    state.currentUser = session.user;
    closeLoginModal();
    loginForm.reset();
    syncSessionButton();
    renderAccessSummary();
    syncPanelAccess();
    await loadUsers();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(loginSubmitButton, false, "Entering", "Enter");
  }
});

createUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!canManageAdminPanel()) {
    showToast("This account cannot create users.", "error");
    return;
  }

  setMessage(createUserMessage, "");
  setButtonLoadingState(createUserSubmitButton, true, "Creating", "Create user");
  const formData = new FormData(createUserForm);

  const payload = {
    name: `${formData.get("name") || ""}`.trim(),
    username: `${formData.get("username") || ""}`.trim(),
    password: `${formData.get("password") || ""}`.trim(),
    permissions: formData.get("adminPanelAccess") ? ["USERS"] : []
  };

  try {
    const response = await authorizedApi("/users", {
      method: "POST",
      body: payload
    });

    closeCreateUserModal();
    await loadUsers({ focusUserId: response.user.id });
    showToast("User created.", "success");
  } catch (error) {
    setMessage(createUserMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(createUserSubmitButton, false, "Creating", "Create user");
  }
});

userTableBody?.addEventListener("click", (event) => {
  const actionButton = event.target.closest("button[data-action]");

  if (!actionButton) {
    return;
  }

  const selectedUser = state.users.find((user) => user.id === actionButton.dataset.userId);

  if (!selectedUser) {
    return;
  }

  if (actionButton.dataset.action === "edit") {
    openEditUserModal(selectedUser);
    return;
  }

  if (actionButton.dataset.action === "delete") {
    openDeleteUserModal(selectedUser);
  }
});

editUserForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!canManageAdminPanel()) {
    showToast("This account cannot edit users.", "error");
    return;
  }

  setMessage(editUserMessage, "");
  setButtonLoadingState(editUserSubmitButton, true, "Saving", "Save changes");
  const formData = new FormData(editUserForm);
  const userId = `${formData.get("id") || ""}`.trim();
  const payload = {
    name: `${formData.get("name") || ""}`.trim(),
    username: `${formData.get("username") || ""}`.trim(),
    active: editUserForm.elements.active.checked,
    permissions: editUserForm.elements.adminPanelAccess.checked ? ["USERS"] : []
  };
  const password = `${formData.get("password") || ""}`.trim();

  if (password) {
    payload.password = password;
  }

  try {
    const response = await authorizedApi(`/users/${userId}`, {
      method: "PATCH",
      body: payload
    });

    state.users = state.users.map((user) => (user.id === response.user.id ? response.user : user));

    if (state.currentUser?.id === response.user.id) {
      state.currentUser = response.user;
      saveSession({
        ...state.session,
        user: response.user
      });
      syncSessionButton();
      renderAccessSummary();
      syncPanelAccess();
    }

    if (canManageAdminPanel()) {
      await loadUsers({ focusUserId: response.user.id });
    } else {
      focusUsersPageByUserId(response.user.id);
      renderUsersTable();
    }

    closeEditUserModal();
    showToast("User updated.", "success");
  } catch (error) {
    setMessage(editUserMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setButtonLoadingState(editUserSubmitButton, false, "Saving", "Save changes");
  }
});

confirmDeleteUserButton?.addEventListener("click", async () => {
  const userId = state.pendingDeleteUserId;

  if (!userId) {
    return;
  }

  setButtonLoadingState(confirmDeleteUserButton, true, "Deleting", "Delete user");

  try {
    await authorizedApi(`/users/${userId}`, {
      method: "DELETE"
    });

    state.users = state.users.filter((user) => user.id !== userId);
    normalizeUsersPage();
    renderUsersTable();
    closeDeleteUserModal();
    showToast("User deleted.", "success");
  } catch (error) {
    setButtonLoadingState(confirmDeleteUserButton, false, "Deleting", "Delete user");
    showToast(error.message, "error");
  }
});

initThemeToggle(themeToggleButton);
syncSessionButton();
renderAccessSummary();
syncPanelAccess();
renderUsersTable();

const sessionReady = await hydrateSession();

if (sessionReady) {
  await loadUsers();
}
