import { api } from "./api.js";
import { clearSession, getSession, saveSession } from "./session.js";
import { initThemeToggle } from "./theme.js";

const $ = (selector) => document.querySelector(selector);

const themeToggleButton = $("#themeToggleButton");
const sessionButton = $("#sessionButton");
const quotaAccessStatus = $("#quotaAccessStatus");
const quotaSummaryValue = $("#quotaSummaryValue");
const quotaTableHint = $("#quotaTableHint");
const quotaTableBody = $("#quotaTableBody");
const quotaTableMeta = $("#quotaTableMeta");
const quotaAdminColumn = $(".quota-admin-column");
const openMemberModalButton = $("#openMemberModalButton");
const loginModal = $("#loginModal");
const loginForm = $("#loginForm");
const loginError = $("#loginError");
const loginSubmitButton = $("#loginSubmitButton");
const memberModal = $("#memberModal");
const memberModalTitle = $("#memberModalTitle");
const memberForm = $("#memberForm");
const memberFormMessage = $("#memberFormMessage");
const memberSubmitButton = $("#memberSubmitButton");
const deleteMemberFromFormButton = $("#deleteMemberFromFormButton");
const deleteMemberModal = $("#deleteMemberModal");
const deleteMemberName = $("#deleteMemberName");
const confirmDeleteMemberButton = $("#confirmDeleteMemberButton");

const state = {
  session: getSession(),
  currentUser: null,
  viewer: { isLoggedIn: false, canManage: false },
  members: [],
  loading: true,
  editingMemberId: null,
  deletingMemberId: null
};

function showToast(message, tone = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
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
  if (state.session?.token) headers.set("Authorization", `Bearer ${state.session.token}`);
  return api(path, { ...options, headers });
}

function canManage() {
  return Boolean(state.viewer.canManage);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Melbourne"
  }).format(date);
}

function createCell(value, className = "") {
  const cell = document.createElement("td");
  cell.className = className;
  cell.textContent = value;
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
  quotaAccessStatus.textContent = admin ? "Admin controls enabled" : "Public view";
  quotaAccessStatus.classList.toggle("is-live", admin);
  quotaTableHint.textContent = admin
    ? "Double-click a member name or status to edit it inline. The checkbox is the fastest completion update."
    : "View each member's current quota status.";
  quotaAdminColumn.hidden = !admin;
  openMemberModalButton.hidden = !admin;
}

function createEditableCell(member, field, value, displayValue, className = "") {
  const cell = createCell(displayValue, className);
  cell.dataset.editField = field;
  cell.dataset.memberId = member.id;
  cell.dataset.rawValue = String(value ?? "");
  cell.title = canManage() ? "Double-click to edit" : "Read-only register";
  return cell;
}

function createStatusCell(member) {
  const cell = document.createElement("td");
  cell.dataset.editField = "quotaCompleted";
  cell.dataset.memberId = member.id;
  cell.dataset.rawValue = String(member.quotaCompleted);
  cell.title = canManage() ? "Double-click to edit" : "Read-only register";

  const statusLabel = document.createElement("span");
  statusLabel.className = "quota-status " + (member.quotaCompleted ? "is-complete" : "is-pending");
  statusLabel.textContent = member.quotaCompleted ? "Completed" : "Not completed";
  cell.appendChild(statusLabel);
  return cell;
}

function createManageCell(member) {
  const cell = document.createElement("td");
  cell.className = "quota-manage-cell";
  const button = document.createElement("button");
  button.className = "inventory-button ghost compact";
  button.type = "button";
  button.dataset.memberAction = "manage";
  button.dataset.memberId = member.id;
  button.textContent = "Update member";
  cell.appendChild(button);
  return cell;
}

function renderQuotaTable() {
  quotaTableBody.replaceChildren();
  const completedCount = state.members.filter((member) => member.quotaCompleted).length;
  quotaSummaryValue.textContent = completedCount + " / " + state.members.length;
  const columnCount = canManage() ? 5 : 4;

  if (state.loading) {
    quotaTableBody.appendChild(createMessageRow("Loading quota members...", columnCount));
    quotaTableMeta.textContent = "Loading members...";
    return;
  }

  if (!state.members.length) {
    quotaTableBody.appendChild(createMessageRow("No quota members yet.", columnCount));
    quotaTableMeta.textContent = canManage() ? "Use Add member to create the first person." : "0 members";
    return;
  }

  state.members.forEach((member) => {
    const row = document.createElement("tr");
    row.append(
      createEditableCell(member, "name", member.name, member.name, "quota-member-name"),
      createStatusCell(member),
      createCell(formatDate(member.updatedAt), "quota-updated-cell")
    );

    if (canManage()) {
      row.appendChild(createManageCell(member));
    }

    const completed = document.createElement("td");
    completed.className = "quota-completion-cell";
    const label = document.createElement("label");
    label.className = "inventory-check-field";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = member.quotaCompleted;
    checkbox.disabled = !canManage();
    checkbox.dataset.memberId = member.id;
    checkbox.setAttribute("aria-label", "Mark " + member.name + "'s quota as completed");
    const helper = document.createElement("span");
    helper.className = "sr-only";
    helper.textContent = member.quotaCompleted ? "Completed" : "Not completed";
    label.append(checkbox, helper);
    completed.appendChild(label);
    row.appendChild(completed);
    quotaTableBody.appendChild(row);
  });

  quotaTableMeta.textContent = state.members.length + " " + (state.members.length === 1 ? "member" : "members") + " in the current quota checklist.";
}

function sortMembers(members) {
  return [...members].sort((left, right) => {
    if (left.quotaCompleted !== right.quotaCompleted) return Number(left.quotaCompleted) - Number(right.quotaCompleted);
    return left.name.localeCompare(right.name);
  });
}

function hydrateSession() {
  state.currentUser = state.session?.token ? state.session.user || null : null;
  syncSessionButton();
}

async function loadQuota() {
  state.loading = true;
  renderQuotaTable();

  try {
    const request = state.session?.token ? apiWithSession : api;
    const response = await request("/quota");
    state.members = response.members || [];
    state.viewer = response.viewer || state.viewer;
    if (!state.viewer.isLoggedIn && state.session?.token) {
      clearSession();
      state.session = null;
      state.currentUser = null;
      syncSessionButton();
    }
  } catch (error) {
    state.members = [];
    showToast(error.message, "error");
  } finally {
    state.loading = false;
    syncAccess();
    renderQuotaTable();
  }
}

function selectedMember(id) {
  return state.members.find((member) => member.id === id) || null;
}

function normalizeInlineValue(field, value) {
  if (field === "name") {
    const name = String(value ?? "").trim();
    if (!name) {
      throw new Error("Member name cannot be empty.");
    }
    return name;
  }

  if (field === "quotaCompleted") {
    if (value !== "true" && value !== "false") {
      throw new Error("Choose a quota status.");
    }
    return value === "true";
  }

  throw new Error("This value cannot be edited here.");
}

function openInlineEditor(cell) {
  if (!canManage() || cell.querySelector("input, select")) {
    return;
  }

  const member = selectedMember(cell.dataset.memberId);
  const field = cell.dataset.editField;
  if (!member || !field) {
    return;
  }

  const originalValue = cell.dataset.rawValue;
  const editor = document.createElement(field === "quotaCompleted" ? "select" : "input");
  editor.className = "inventory-inline-editor";

  if (field === "quotaCompleted") {
    const pending = document.createElement("option");
    pending.value = "false";
    pending.textContent = "Not completed";
    const complete = document.createElement("option");
    complete.value = "true";
    complete.textContent = "Completed";
    editor.append(pending, complete);
  } else {
    editor.type = "text";
  }

  editor.value = originalValue;
  let completed = false;

  const restore = () => {
    if (completed) {
      return;
    }
    completed = true;
    renderQuotaTable();
  };

  const save = async () => {
    if (completed) {
      return;
    }

    let nextValue;
    try {
      nextValue = normalizeInlineValue(field, editor.value);
    } catch (error) {
      showToast(error.message, "error");
      editor.focus();
      return;
    }

    if (String(nextValue) === String(originalValue)) {
      restore();
      return;
    }

    completed = true;
    editor.disabled = true;

    try {
      const successMessage = field === "name"
        ? "Member name updated."
        : nextValue ? "Quota marked complete." : "Quota marked incomplete.";
      await updateMember(member.id, { [field]: nextValue }, successMessage);
    } catch (error) {
      renderQuotaTable();
      showToast(error.message, "error");
    }
  };

  editor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      restore();
    }
  });
  editor.addEventListener("change", () => {
    if (field === "quotaCompleted") {
      save();
    }
  });
  editor.addEventListener("blur", save, { once: true });

  cell.replaceChildren(editor);
  editor.focus();
  if (field === "name") {
    editor.select();
  }
}

function openMemberModal(member = null) {
  state.editingMemberId = member?.id || null;
  memberForm.reset();
  setMessage(memberFormMessage, "");
  memberModalTitle.textContent = member ? "Update member" : "Add member";
  memberSubmitButton.textContent = member ? "Save member" : "Add member";
  deleteMemberFromFormButton.hidden = !member;
  if (member) {
    memberForm.elements.name.value = member.name;
    memberForm.elements.quotaCompleted.value = String(member.quotaCompleted);
  }
  toggleModal(memberModal, true);
}

function openDeleteModal(member) {
  state.deletingMemberId = member.id;
  deleteMemberName.textContent = member.name;
  toggleModal(deleteMemberModal, true);
}

async function updateMember(memberId, payload, successMessage) {
  const response = await apiWithSession(`/quota/members/${memberId}`, {
    method: "PATCH",
    body: payload
  });
  state.members = sortMembers(state.members.map((member) => member.id === response.member.id ? response.member : member));
  renderQuotaTable();
  showToast(successMessage, "success");
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
  state.viewer = { isLoggedIn: false, canManage: false };
  syncSessionButton();
  await loadQuota();
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
    toggleModal(loginModal, false);
    loginForm.reset();
    syncSessionButton();
    await loadQuota();
    showToast("Logged in successfully.", "success");
  } catch (error) {
    setMessage(loginError, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(loginSubmitButton, false, "Entering", "Enter");
  }
});

openMemberModalButton.addEventListener("click", () => openMemberModal());

memberForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(memberFormMessage, "");
  const editing = Boolean(state.editingMemberId);
  setLoading(memberSubmitButton, true, "Saving", editing ? "Save member" : "Add member");
  try {
    const body = {
      name: `${memberForm.elements.name.value || ""}`.trim(),
      quotaCompleted: memberForm.elements.quotaCompleted.value
    };
    if (editing) {
      await updateMember(state.editingMemberId, body, "Quota member updated.");
    } else {
      const response = await apiWithSession("/quota/members", { method: "POST", body });
      state.members = sortMembers([...state.members, response.member]);
      renderQuotaTable();
      showToast("Quota member added.", "success");
    }
    toggleModal(memberModal, false);
  } catch (error) {
    setMessage(memberFormMessage, error.message);
    showToast(error.message, "error");
  } finally {
    setLoading(memberSubmitButton, false, "Saving", editing ? "Save member" : "Add member");
  }
});

deleteMemberFromFormButton.addEventListener("click", () => {
  const member = selectedMember(state.editingMemberId);
  if (member) openDeleteModal(member);
});

quotaTableBody.addEventListener("dblclick", (event) => {
  const cell = event.target.closest("td[data-edit-field]");
  if (cell) {
    openInlineEditor(cell);
  }
});

quotaTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-member-action='manage']");
  if (!button || !canManage()) {
    return;
  }

  const member = selectedMember(button.dataset.memberId);
  if (member) {
    openMemberModal(member);
  }
});

quotaTableBody.addEventListener("change", async (event) => {
  const checkbox = event.target.closest("input[data-member-id]");
  if (!checkbox || !canManage()) return;
  const member = selectedMember(checkbox.dataset.memberId);
  if (!member) return;
  try {
    await updateMember(member.id, { quotaCompleted: checkbox.checked }, checkbox.checked ? "Quota marked complete." : "Quota marked incomplete.");
  } catch (error) {
    checkbox.checked = member.quotaCompleted;
    showToast(error.message, "error");
  }
});

confirmDeleteMemberButton.addEventListener("click", async () => {
  const member = selectedMember(state.deletingMemberId);
  if (!member) return;
  setLoading(confirmDeleteMemberButton, true, "Removing", "Remove member");
  try {
    const response = await apiWithSession(`/quota/members/${member.id}`, { method: "DELETE" });
    state.members = state.members.filter((entry) => entry.id !== member.id);
    state.deletingMemberId = null;
    state.editingMemberId = null;
    renderQuotaTable();
    toggleModal(deleteMemberModal, false);
    toggleModal(memberModal, false);
    showToast(response.message, "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setLoading(confirmDeleteMemberButton, false, "Removing", "Remove member");
  }
});

[["closeLoginButton", loginModal], ["closeLoginBackdrop", loginModal], ["closeMemberButton", memberModal], ["closeMemberBackdrop", memberModal], ["closeDeleteMemberButton", deleteMemberModal], ["closeDeleteMemberBackdrop", deleteMemberModal], ["cancelDeleteMemberButton", deleteMemberModal]].forEach(([buttonId, modal]) => {
  $(`#${buttonId}`).addEventListener("click", () => toggleModal(modal, false));
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  [deleteMemberModal, memberModal, loginModal].some((modal) => {
    if (!modal.classList.contains("hidden")) {
      toggleModal(modal, false);
      return true;
    }
    return false;
  });
});

initThemeToggle(themeToggleButton);
hydrateSession();
syncAccess();
renderQuotaTable();
await loadQuota();