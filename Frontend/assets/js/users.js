import { api } from "./api.js";
import { PERMISSION_PRESETS } from "./constants.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  activeStateBadge,
  initProtectedPage,
  mountFormError,
  permissionBadges,
  renderEmptyState,
  renderTableSkeleton,
  roleBadge,
  showToast,
  toggleCheckboxGroup
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
  pageKey: "USERS",
  title: "Users and permissions",
  subtitle: "Create staff accounts and assign page-by-page access."
});

const userForm = document.querySelector("#userForm");
const userError = document.querySelector("#userError");
const permissionsContainer = document.querySelector("#permissionList");
const tableContainer = document.querySelector("#userTable");
const formTitle = document.querySelector("#userFormTitle");
const resetButton = document.querySelector("#resetUserForm");
const roleSelect = document.querySelector("#userRole");
const presetSelect = document.querySelector("#permissionPreset");
const userIdField = document.querySelector("#userId");
const generatePasswordButton = document.querySelector("#generatePassword");
const toolbarHost = document.createElement("div");
const pageParams = new URLSearchParams(window.location.search);
const searchQuery = (pageParams.get("search") || "").trim().toLowerCase();
const activeView = pageParams.get("view") || "";
let requestedUserEditId = pageParams.get("editUser") || "";
const userDraft = bindDraftForm(userForm, "users-form");

toolbarHost.className = "collection-tools";
tableContainer.before(toolbarHost);

let permissionOptions = [];
let usersCache = [];
let hasShownFilterMessage = false;
let selectedUserIds = new Set();

if (userDraft.restored) {
  showToast("Restored saved user form draft.", "info");
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

function renderPermissionOptions() {
  permissionsContainer.innerHTML = permissionOptions.map((permission) => `
    <label class="permission-option">
      <input type="checkbox" name="permissions" value="${permission.key}">
      <span>${permission.label}</span>
    </label>
  `).join("");
}

function renderPermissionPresets() {
  if (!presetSelect) {
    return;
  }

  presetSelect.innerHTML = `
    <option value="">Custom access</option>
    ${PERMISSION_PRESETS.map((preset) => `
      <option value="${preset.key}">${preset.label}</option>
    `).join("")}
  `;
}

function detectPreset(permissionKeys = [], role = "USER") {
  if (role === "ADMIN") {
    return "";
  }

  const normalized = [...new Set(permissionKeys)].sort().join("|");
  const matchedPreset = PERMISSION_PRESETS.find((preset) => (
    [...preset.permissions].sort().join("|") === normalized
  ));

  return matchedPreset?.key || "";
}

function setPermissionInputs(permissionKeys = []) {
  const granted = new Set(permissionKeys);

  [...document.querySelectorAll('input[name="permissions"]')].forEach((input) => {
    input.checked = granted.has(input.value);
  });
}

function applyPreset(presetKey) {
  const preset = PERMISSION_PRESETS.find((entry) => entry.key === presetKey);

  if (!preset || roleSelect.value === "ADMIN") {
    return;
  }

  setPermissionInputs(preset.permissions);
}

function generateTemporaryPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buffer = new Uint32Array(length);
  window.crypto.getRandomValues(buffer);

  return [...buffer].map((value) => alphabet[value % alphabet.length]).join("");
}

function syncPermissionState() {
  const isAdmin = roleSelect.value === "ADMIN";
  const inputs = [...document.querySelectorAll('input[name="permissions"]')];

  toggleCheckboxGroup(isAdmin);

  if (isAdmin) {
    inputs.forEach((input) => {
      input.checked = true;
    });
    if (presetSelect) {
      presetSelect.value = "";
    }
  }
}

function resetForm() {
  userForm.reset();
  userIdField.value = "";
  formTitle.textContent = "Create a user";
  document.querySelector("#passwordHint").textContent = "Password is required for new users.";
  if (presetSelect) {
    presetSelect.value = "";
  }
  requestedUserEditId = "";
  updateUrlParams({ editUser: "" }, ["editUser"]);
  syncPermissionState();
}

function fillForm(user) {
  userIdField.value = user.id;
  formTitle.textContent = `Editing ${user.name}`;
  userForm.elements.name.value = user.name;
  userForm.elements.email.value = user.email;
  userForm.elements.role.value = user.role;
  userForm.elements.active.checked = user.active;
  userForm.elements.password.value = "";
  document.querySelector("#passwordHint").textContent = "Leave password blank to keep the current password.";

  setPermissionInputs(user.permissions);

  if (presetSelect) {
    presetSelect.value = detectPreset(user.permissions, user.role);
  }

  syncPermissionState();
}

function maybeOpenRequestedEdit() {
  if (!requestedUserEditId) {
    return;
  }

  const user = usersCache.find((entry) => entry.id === requestedUserEditId);

  if (!user) {
    requestedUserEditId = "";
    updateUrlParams({ editUser: "" }, ["editUser"]);
    showToast("That user could not be found.", "error");
    return;
  }

  fillForm(user);
  userForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getVisibleUsers(users) {
  let visibleUsers = [...users];

  if (activeView === "admins") {
    visibleUsers = visibleUsers.filter((user) => user.role === "ADMIN");
  }

  if (activeView === "inactive") {
    visibleUsers = visibleUsers.filter((user) => !user.active);
  }

  if (searchQuery) {
    visibleUsers = visibleUsers.filter((user) => [
      user.name,
      user.email,
      user.role
    ].some((value) => `${value || ""}`.toLowerCase().includes(searchQuery)));
  }

  return visibleUsers;
}

function currentViewLabel() {
  if (activeView === "admins") {
    return searchQuery ? `Admins / ${searchQuery}` : "Admins";
  }

  if (activeView === "inactive") {
    return searchQuery ? `Inactive / ${searchQuery}` : "Inactive users";
  }

  return searchQuery ? `Search / ${searchQuery}` : "All users";
}

function getSelectedUsers(users = usersCache) {
  const availableIds = new Set(users.map((user) => user.id));
  selectedUserIds = new Set([...selectedUserIds].filter((id) => availableIds.has(id)));
  return users.filter((user) => selectedUserIds.has(user.id));
}

function rerenderUserViews() {
  renderToolbar(usersCache);
  renderUsers(usersCache);
}

function renderToolbar(users) {
  const visibleUsers = getVisibleUsers(users);
  const selectedUsers = getSelectedUsers(users);
  const savedView = loadSavedView("users");
  const filterLinks = [
    { label: "All", href: buildPageHref("./users.html", { hash: "userTable" }), active: !activeView },
    { label: "Admins", href: buildPageHref("./users.html", { view: "admins", hash: "userTable" }), active: activeView === "admins" },
    { label: "Inactive", href: buildPageHref("./users.html", { view: "inactive", hash: "userTable" }), active: activeView === "inactive" }
  ];

  toolbarHost.innerHTML = `
    <div class="filter-chip-row">
      ${filterLinks.map((link) => `
        <a class="filter-chip ${link.active ? "active" : ""}" href="${link.href}">${link.label}</a>
      `).join("")}
      ${savedView ? `<a class="filter-chip saved" href="${savedView.href}">Saved: ${savedView.label}</a>` : ""}
    </div>
    <div class="toolbar-actions">
      <span class="toolbar-meta">${visibleUsers.length} shown</span>
      <button class="ghost-button toolbar-button" type="button" data-action="save-view">Save view</button>
      ${savedView ? `<button class="ghost-button toolbar-button" type="button" data-action="clear-view">Clear saved</button>` : ""}
      <button class="ghost-button toolbar-button" type="button" data-action="export">Export CSV</button>
    </div>
    ${selectedUsers.length ? `
      <div class="bulk-strip">
        <span class="toolbar-meta">${selectedUsers.length} selected</span>
        <button class="ghost-button toolbar-button" type="button" data-bulk-active="true">Activate</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-active="false">Suspend</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-export>Export selected</button>
        <button class="ghost-button toolbar-button" type="button" data-bulk-clear>Clear</button>
      </div>
    ` : ""}
  `;

  toolbarHost.querySelector('[data-action="save-view"]')?.addEventListener("click", () => {
    saveSavedView("users", {
      label: currentViewLabel(),
      href: buildPageHref("./users.html", {
        view: activeView,
        search: searchQuery,
        hash: "userTable"
      })
    });
    showToast("Saved user view.", "success");
    renderToolbar(users);
  });

  toolbarHost.querySelector('[data-action="clear-view"]')?.addEventListener("click", () => {
    clearSavedView("users");
    showToast("Cleared saved user view.", "info");
    renderToolbar(users);
  });

  toolbarHost.querySelector('[data-action="export"]')?.addEventListener("click", () => {
    downloadCsv(
      "users-export.csv",
      [
        { label: "Name", value: (user) => user.name },
        { label: "Email", value: (user) => user.email },
        { label: "Role", value: (user) => user.role },
        { label: "Active", value: (user) => user.active }
      ],
      visibleUsers
    );
    showToast("Users CSV exported.", "success");
  });

  toolbarHost.querySelectorAll("[data-bulk-active]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await updateUsersBulkStatus(
          selectedUsers.map((user) => user.id),
          button.dataset.bulkActive === "true"
        );
        selectedUserIds = new Set();
        await loadUsers();
        announceMutation(["users"]);
        showToast("Bulk user update completed.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  toolbarHost.querySelector("[data-bulk-export]")?.addEventListener("click", () => {
    downloadCsv(
      "users-selected.csv",
      [
        { label: "Name", value: (user) => user.name },
        { label: "Email", value: (user) => user.email },
        { label: "Role", value: (user) => user.role },
        { label: "Active", value: (user) => user.active }
      ],
      selectedUsers
    );
    showToast("Selected users exported.", "success");
  });

  toolbarHost.querySelector("[data-bulk-clear]")?.addEventListener("click", () => {
    selectedUserIds = new Set();
    rerenderUserViews();
  });
}

async function toggleUserActive(user) {
  await api(`/users/${user.id}`, {
    method: "PATCH",
    body: {
      active: !user.active
    }
  });
}

async function updateUsersBulkStatus(userIds, active) {
  await api("/users/bulk", {
    method: "PATCH",
    body: {
      userIds,
      active
    }
  });
}

function renderUsers(users) {
  const visibleUsers = getVisibleUsers(users);
  const allVisibleSelected = visibleUsers.length && visibleUsers.every((user) => selectedUserIds.has(user.id));

  if (!visibleUsers.length) {
    tableContainer.innerHTML = renderEmptyState(
      users.length ? "No matching users" : "No users found",
      users.length
        ? "Try a broader search from the header or dashboard."
        : "Create the first user from the form on this page."
    );
    return;
  }

  if (!hasShownFilterMessage && (searchQuery || activeView)) {
    const filterParts = [];

    if (activeView) {
      filterParts.push(activeView);
    }

    if (searchQuery) {
      filterParts.push(`search "${searchQuery}"`);
    }

    showToast(`Showing ${filterParts.join(" + ")} user view.`, "info");
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
            <th>Name</th>
            <th>Role</th>
            <th>Access</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${visibleUsers.map((user) => `
            <tr class="${selectedUserIds.has(user.id) ? "selected-row" : ""} ${requestedUserEditId === user.id ? "editing-row" : ""}">
              <td class="table-select-cell">
                <input class="table-check" type="checkbox" data-select-user="${user.id}" ${selectedUserIds.has(user.id) ? "checked" : ""}>
              </td>
              <td>
                <strong>${user.name}</strong>
                <div class="subtle-row">${user.email}</div>
              </td>
              <td>${roleBadge(user.role)}</td>
              <td><div class="badge-group">${permissionBadges(user.permissions)}</div></td>
              <td>${activeStateBadge(user.active)}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-toggle-user="${user.id}">${user.active ? "Suspend" : "Activate"}</button>
                  <button class="mini-action" type="button" data-edit-user="${user.id}">Edit</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  tableContainer.querySelectorAll("[data-edit-user]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedUserEditId = button.dataset.editUser;
      updateUrlParams({ editUser: requestedUserEditId });
      const user = usersCache.find((entry) => entry.id === button.dataset.editUser);
      if (user) {
        fillForm(user);
        userForm.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  tableContainer.querySelectorAll("[data-toggle-user]").forEach((button) => {
    button.addEventListener("click", async () => {
      const user = usersCache.find((entry) => entry.id === button.dataset.toggleUser);

      if (!user) {
        return;
      }

      try {
        await toggleUserActive(user);
        await loadUsers();
        announceMutation(["users"]);
        showToast("User updated inline.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  tableContainer.querySelector("[data-select-all]")?.addEventListener("change", (event) => {
    if (event.target.checked) {
      visibleUsers.forEach((user) => selectedUserIds.add(user.id));
    } else {
      visibleUsers.forEach((user) => selectedUserIds.delete(user.id));
    }

    rerenderUserViews();
  });

  tableContainer.querySelectorAll("[data-select-user]").forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.target.checked) {
        selectedUserIds.add(input.dataset.selectUser);
      } else {
        selectedUserIds.delete(input.dataset.selectUser);
      }

      rerenderUserViews();
    });
  });
}

async function loadUsers() {
  tableContainer.innerHTML = renderTableSkeleton(6, 6);

  try {
    const [meta, userResponse] = await Promise.all([
      api("/meta/options"),
      api("/users")
    ]);

    permissionOptions = meta.permissions || [];
    usersCache = userResponse.users || [];
    getSelectedUsers(usersCache);
    renderPermissionOptions();
    renderPermissionPresets();
    restoreDraftForm(userForm, "users-form");
    syncPermissionState();
    rerenderUserViews();
    maybeOpenRequestedEdit();
  } catch (error) {
    tableContainer.innerHTML = renderEmptyState("Unable to load users", error.message);
    showToast(error.message, "error");
  }
}

roleSelect?.addEventListener("change", () => {
  syncPermissionState();

  if (roleSelect.value !== "ADMIN" && presetSelect?.value) {
    applyPreset(presetSelect.value);
  }
});

presetSelect?.addEventListener("change", () => {
  applyPreset(presetSelect.value);
});

generatePasswordButton?.addEventListener("click", () => {
  const temporaryPassword = generateTemporaryPassword();
  userForm.elements.password.value = temporaryPassword;
  showToast(`Temporary password ready: ${temporaryPassword}`, "info");
});

resetButton?.addEventListener("click", resetForm);

userForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(userError, "");

  const formData = new FormData(userForm);
  const permissions = formData.getAll("permissions");
  const payload = {
    name: formData.get("name"),
    email: formData.get("email"),
    role: formData.get("role"),
    active: formData.get("active") === "on",
    permissions
  };

  const password = formData.get("password");
  if (password) {
    payload.password = password;
  }

  const editingUserId = userIdField.value;

  try {
    if (editingUserId) {
      await api(`/users/${editingUserId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("User updated.", "success");
    } else {
      if (!password) {
        throw new Error("Password is required for new users.");
      }

      await api("/users", {
        method: "POST",
        body: payload
      });
      showToast("User created.", "success");
    }

    resetForm();
    userDraft.clearDraft();
    await loadUsers();
    announceMutation(["users"]);
  } catch (error) {
    mountFormError(userError, error.message);
    showToast(error.message, "error");
  }
});

subscribeToMutations(["users"], () => {
  showToast("Live update received for users.", "info");
  loadUsers();
});

loadUsers();
