import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  badge,
  closeFormModal,
  formatDate,
  initProtectedPage,
  mountFormError,
  openFormModal,
  renderEmptyState,
  showToast
} from "./ui.js";
import { bindDraftForm, restoreDraftForm } from "./workflow.js";

const currentUser = initProtectedPage({
  pageKey: "DAILY_TASKS",
  title: "Tasks",
  subtitle: "Your daily checklist and the shared weekly team board, kept in one clean place."
});

const currentStanding = document.querySelector("#currentStanding");
const taskList = document.querySelector("#taskList");
const weeklyTaskList = document.querySelector("#weeklyTaskList");
const weeklyResetLabel = document.querySelector("#weeklyResetLabel");
const leaderboard = document.querySelector("#taskLeaderboard");
const adminPanel = document.querySelector("#adminTaskPanel");

const adminTaskForm = document.querySelector("#adminTaskForm");
const adminTaskId = document.querySelector("#adminTaskId");
const adminTaskError = document.querySelector("#adminTaskError");
const adminTaskFormTitle = document.querySelector("#adminTaskFormTitle");
const adminTaskFormSubtitle = document.querySelector("#adminTaskFormSubtitle");
const adminTaskSubmit = document.querySelector("#adminTaskSubmit");
const resetAdminTaskFormButton = document.querySelector("#resetAdminTaskForm");
const adminTaskLibrary = document.querySelector("#adminTaskLibrary");
const openAdminTaskFormButton = document.querySelector("#openAdminTaskFormButton");
const adminTaskFormHost = document.querySelector("#adminTaskFormHost");
const adminTaskFormContent = document.querySelector("#adminTaskFormContent");

const weeklyTaskForm = document.querySelector("#weeklyTaskForm");
const weeklyTaskId = document.querySelector("#weeklyTaskId");
const weeklyTaskError = document.querySelector("#weeklyTaskError");
const weeklyTaskFormTitle = document.querySelector("#weeklyTaskFormTitle");
const weeklyTaskFormSubtitle = document.querySelector("#weeklyTaskFormSubtitle");
const weeklyTaskSubmit = document.querySelector("#weeklyTaskSubmit");
const resetWeeklyTaskFormButton = document.querySelector("#resetWeeklyTaskForm");
const adminWeeklyTaskLibrary = document.querySelector("#adminWeeklyTaskLibrary");
const openWeeklyTaskFormButton = document.querySelector("#openWeeklyTaskFormButton");
const weeklyTaskFormHost = document.querySelector("#weeklyTaskFormHost");
const weeklyTaskFormContent = document.querySelector("#weeklyTaskFormContent");

const adminDraft = bindDraftForm(adminTaskForm, "daily-task-admin-form");
const weeklyDraft = bindDraftForm(weeklyTaskForm, "weekly-task-admin-form");
const pageParams = new URLSearchParams(window.location.search);

let requestedTaskEditId = pageParams.get("editTask") || "";
let requestedWeeklyTaskEditId = pageParams.get("editWeeklyTask") || "";
let adminDailyTasksCache = [];
let adminWeeklyTasksCache = [];

if (adminDraft.restored) {
  showToast("Restored saved daily task draft.", "info");
}

if (weeklyDraft.restored) {
  showToast("Restored saved weekly task draft.", "info");
}

function priorityBadge(importance, { points = null } = {}) {
  const normalized = `${importance || ""}`.toUpperCase();
  const tone = normalized === "HIGH" ? "warn" : normalized === "MEDIUM" ? "accent" : "neutral";
  const label = normalized === "HIGH" ? "High" : normalized === "MEDIUM" ? "Medium" : "Low";
  const suffix = Number.isFinite(points) ? ` - ${points} pt${points === 1 ? "" : "s"}` : " priority";
  return badge(`${label}${suffix}`, tone);
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

function resetAdminForm({ clearDraftState = false, clearUrl = true } = {}) {
  if (!adminTaskForm) {
    return;
  }

  adminTaskForm.reset();
  adminTaskId.value = "";
  adminTaskFormTitle.textContent = "Create daily task";
  adminTaskFormSubtitle.textContent = "Admins can create or edit the daily task library from one clean popup.";
  adminTaskSubmit.textContent = "Save task";
  adminTaskForm.elements.importance.value = "HIGH";
  adminTaskForm.elements.active.checked = true;
  mountFormError(adminTaskError, "");

  if (clearDraftState) {
    adminDraft.clearDraft();
  }

  if (clearUrl) {
    requestedTaskEditId = "";
    updateUrlParams({ editTask: "" }, ["editTask"]);
  }
}

function resetWeeklyForm({ clearDraftState = false, clearUrl = true } = {}) {
  if (!weeklyTaskForm) {
    return;
  }

  weeklyTaskForm.reset();
  weeklyTaskId.value = "";
  weeklyTaskFormTitle.textContent = "Create weekly task";
  weeklyTaskFormSubtitle.textContent = "Admins can create or edit the shared weekly team list from one focused popup.";
  weeklyTaskSubmit.textContent = "Save task";
  weeklyTaskForm.elements.importance.value = "HIGH";
  weeklyTaskForm.elements.active.checked = true;
  mountFormError(weeklyTaskError, "");

  if (clearDraftState) {
    weeklyDraft.clearDraft();
  }

  if (clearUrl) {
    requestedWeeklyTaskEditId = "";
    updateUrlParams({ editWeeklyTask: "" }, ["editWeeklyTask"]);
  }
}

function fillAdminForm(task) {
  if (!adminTaskForm) {
    return;
  }

  adminTaskId.value = task.id;
  adminTaskFormTitle.textContent = `Edit ${task.title}`;
  adminTaskFormSubtitle.textContent = "Update the daily task details here, then return to the task library underneath.";
  adminTaskSubmit.textContent = "Save changes";
  mountFormError(adminTaskError, "");
  adminTaskForm.elements.title.value = task.title;
  adminTaskForm.elements.importance.value = task.importance;
  adminTaskForm.elements.description.value = task.description || "";
  adminTaskForm.elements.active.checked = task.active;
}

function fillWeeklyForm(task) {
  if (!weeklyTaskForm) {
    return;
  }

  weeklyTaskId.value = task.id;
  weeklyTaskFormTitle.textContent = `Edit ${task.title}`;
  weeklyTaskFormSubtitle.textContent = "Update the shared weekly task details here, then return to the library underneath.";
  weeklyTaskSubmit.textContent = "Save changes";
  mountFormError(weeklyTaskError, "");
  weeklyTaskForm.elements.title.value = task.title;
  weeklyTaskForm.elements.importance.value = task.importance;
  weeklyTaskForm.elements.description.value = task.description || "";
  weeklyTaskForm.elements.active.checked = task.active;
}

function showAdminTaskModal(opener = document.activeElement) {
  if (!adminTaskFormContent || !adminTaskFormHost) {
    return;
  }

  openFormModal({
    content: adminTaskFormContent,
    host: adminTaskFormHost,
    focusSelector: '[name="title"]',
    opener,
    onClose: () => {
      if (requestedTaskEditId) {
        requestedTaskEditId = "";
        updateUrlParams({ editTask: "" }, ["editTask"]);
      }
    }
  });
}

function showWeeklyTaskModal(opener = document.activeElement) {
  if (!weeklyTaskFormContent || !weeklyTaskFormHost) {
    return;
  }

  openFormModal({
    content: weeklyTaskFormContent,
    host: weeklyTaskFormHost,
    focusSelector: '[name="title"]',
    opener,
    onClose: () => {
      if (requestedWeeklyTaskEditId) {
        requestedWeeklyTaskEditId = "";
        updateUrlParams({ editWeeklyTask: "" }, ["editWeeklyTask"]);
      }
    }
  });
}

function maybeOpenRequestedTask() {
  if (!requestedTaskEditId || !adminDailyTasksCache.length) {
    return;
  }

  const task = adminDailyTasksCache.find((entry) => entry.id === requestedTaskEditId);

  if (!task) {
    requestedTaskEditId = "";
    updateUrlParams({ editTask: "" }, ["editTask"]);
    showToast("That daily task could not be found.", "error");
    return;
  }

  fillAdminForm(task);
  showAdminTaskModal();
}

function maybeOpenRequestedWeeklyTask() {
  if (!requestedWeeklyTaskEditId || !adminWeeklyTasksCache.length) {
    return;
  }

  const task = adminWeeklyTasksCache.find((entry) => entry.id === requestedWeeklyTaskEditId);

  if (!task) {
    requestedWeeklyTaskEditId = "";
    updateUrlParams({ editWeeklyTask: "" }, ["editWeeklyTask"]);
    showToast("That weekly task could not be found.", "error");
    return;
  }

  fillWeeklyForm(task);
  showWeeklyTaskModal();
}

function renderStanding(summary, standing) {
  currentStanding.innerHTML = `
    <article class="standing-card">
      <div class="standing-value">
        <strong>${standing.rank ? `#${standing.rank}` : "Unranked"}</strong>
        <span class="muted">${currentUser.name}</span>
      </div>
      <div class="badge-group">
        ${badge(`${standing.totalPoints || 0} all-time points`, "accent")}
        ${badge(`${standing.completedCount || 0} completions`, "neutral")}
        ${badge(`${summary.streakDays || 0} day streak`, (summary.streakDays || 0) > 0 ? "good" : "neutral")}
      </div>
      <p class="muted">
        ${standing.rank
          ? `You are currently sitting at position ${standing.rank} on the all-time task board.`
          : "You have not placed on the all-time task board yet. Keep ticking the checklist to get on the board."}
      </p>
    </article>
  `;
}

function renderDailyTasks(tasks) {
  if (!tasks.length) {
    taskList.innerHTML = renderEmptyState("No tasks assigned today", "When admins add active daily tasks, they will show here automatically.");
    return;
  }

  taskList.innerHTML = tasks.map((task) => `
    <article class="task-card ${task.completed ? "completed" : ""}">
      <div class="task-toggle">
        <input type="checkbox" data-task-id="${task.id}" ${task.completed ? "checked" : ""}>
        <div class="task-copy">
          <div class="task-card-header">
            <strong class="task-title">${task.title}</strong>
            ${priorityBadge(task.importance, { points: task.points })}
          </div>
          <p class="muted">${task.description || "No extra explanation for this task."}</p>
          <div class="badge-group">
            ${badge(task.completed ? "Completed today" : "Still open", task.completed ? "good" : "neutral")}
            ${task.completedAt ? `<span class="muted">Checked at ${formatDate(task.completedAt)}</span>` : ""}
          </div>
        </div>
      </div>
    </article>
  `).join("");

  taskList.querySelectorAll("[data-task-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        input.disabled = true;
        await api(`/daily-tasks/${input.dataset.taskId}/completion`, {
          method: "PUT",
          body: {
            completed: input.checked
          }
        });
        await loadTasks(false);
        announceMutation(["daily_tasks"]);
        showToast(input.checked ? "Task completed." : "Task unchecked.", "success");
      } catch (error) {
        input.checked = !input.checked;
        showToast(error.message, "error");
      } finally {
        input.disabled = false;
      }
    });
  });
}

function renderWeeklyTasks(weekly = {}) {
  const tasks = weekly.tasks || [];
  weeklyResetLabel.textContent = weekly.resetLabel || "";

  if (!tasks.length) {
    weeklyTaskList.innerHTML = renderEmptyState("No weekly team tasks yet", "When admins add weekly tasks, the shared checklist will show up here for everyone.");
    return;
  }

  weeklyTaskList.innerHTML = tasks.map((task) => `
    <article class="task-card ${task.completed ? "completed" : ""}">
      <div class="task-toggle">
        <input
          type="checkbox"
          data-weekly-task-id="${task.id}"
          ${task.completed ? "checked" : ""}
          ${currentUser.role === "ADMIN" ? "" : "disabled"}
        >
        <div class="task-copy">
          <div class="task-card-header">
            <strong class="task-title">${task.title}</strong>
            ${priorityBadge(task.importance)}
          </div>
          <p class="muted">${task.description || "No extra explanation for this weekly task."}</p>
          <div class="badge-group">
            ${badge(task.completed ? "Completed this week" : "Still open this week", task.completed ? "good" : "neutral")}
            ${task.completedBy?.name ? badge(`Marked by ${task.completedBy.name}`, "accent") : ""}
            ${task.completedAt ? `<span class="muted">Updated at ${formatDate(task.completedAt)}</span>` : ""}
          </div>
        </div>
      </div>
    </article>
  `).join("");

  if (currentUser.role !== "ADMIN") {
    return;
  }

  weeklyTaskList.querySelectorAll("[data-weekly-task-id]").forEach((input) => {
    input.addEventListener("change", async () => {
      try {
        input.disabled = true;
        await api(`/daily-tasks/weekly/${input.dataset.weeklyTaskId}/completion`, {
          method: "PUT",
          body: {
            completed: input.checked
          }
        });
        await loadTasks(false);
        announceMutation(["daily_tasks"]);
        showToast(input.checked ? "Weekly task marked complete." : "Weekly task reopened.", "success");
      } catch (error) {
        input.checked = !input.checked;
        showToast(error.message, "error");
      } finally {
        input.disabled = false;
      }
    });
  });
}

function renderLeaderboard(entries, standing) {
  if (!entries.length) {
    leaderboard.innerHTML = renderEmptyState("No leaderboard yet", "The board will build as soon as people start completing tasks.");
    return;
  }

  leaderboard.innerHTML = entries.map((entry) => `
    <article class="leaderboard-row ${entry.userId === currentUser.id ? "is-current-user" : ""}">
      <span class="leaderboard-rank">${entry.rank}</span>
      <div class="task-copy">
        <strong>${entry.name}</strong>
        <span class="muted">${entry.completedCount} completions all time</span>
      </div>
      <div class="task-copy" style="justify-items:end;">
        <span class="leaderboard-points">${entry.totalPoints}</span>
        <span class="muted">${entry.userId === currentUser.id ? "You" : "points"}</span>
      </div>
    </article>
  `).join("");

  if (standing.rank && !entries.some((entry) => entry.userId === currentUser.id)) {
    leaderboard.insertAdjacentHTML("beforeend", `
      <article class="leaderboard-row is-current-user">
        <span class="leaderboard-rank">${standing.rank}</span>
        <div class="task-copy">
          <strong>${currentUser.name}</strong>
          <span class="muted">${standing.completedCount} completions all time</span>
        </div>
        <div class="task-copy" style="justify-items:end;">
          <span class="leaderboard-points">${standing.totalPoints}</span>
          <span class="muted">You</span>
        </div>
      </article>
    `);
  }
}

function attachAdminDailyLibraryActions() {
  adminTaskLibrary.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedTaskEditId = button.dataset.editTask;
      updateUrlParams({ editTask: requestedTaskEditId });
      const task = adminDailyTasksCache.find((entry) => entry.id === requestedTaskEditId);

      if (task) {
        fillAdminForm(task);
        showAdminTaskModal(button);
      }
    });
  });

  adminTaskLibrary.querySelectorAll("[data-toggle-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = adminDailyTasksCache.find((entry) => entry.id === button.dataset.toggleTask);

      if (!task) {
        return;
      }

      try {
        await api(`/daily-tasks/admin/tasks/${task.id}`, {
          method: "PATCH",
          body: {
            active: !task.active
          }
        });
        await loadTasks(false);
        announceMutation(["daily_tasks"]);
        showToast("Daily task updated.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

function attachAdminWeeklyLibraryActions() {
  adminWeeklyTaskLibrary.querySelectorAll("[data-edit-weekly-task]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedWeeklyTaskEditId = button.dataset.editWeeklyTask;
      updateUrlParams({ editWeeklyTask: requestedWeeklyTaskEditId });
      const task = adminWeeklyTasksCache.find((entry) => entry.id === requestedWeeklyTaskEditId);

      if (task) {
        fillWeeklyForm(task);
        showWeeklyTaskModal(button);
      }
    });
  });

  adminWeeklyTaskLibrary.querySelectorAll("[data-toggle-weekly-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = adminWeeklyTasksCache.find((entry) => entry.id === button.dataset.toggleWeeklyTask);

      if (!task) {
        return;
      }

      try {
        await api(`/daily-tasks/admin/weekly-tasks/${task.id}`, {
          method: "PATCH",
          body: {
            active: !task.active
          }
        });
        await loadTasks(false);
        announceMutation(["daily_tasks"]);
        showToast("Weekly task updated.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

function renderAdminPanel(admin) {
  if (!adminPanel) {
    return;
  }

  if (!admin) {
    adminPanel.classList.add("hidden");
    return;
  }

  adminPanel.classList.remove("hidden");
  adminDailyTasksCache = admin.dailyTasks || [];
  adminWeeklyTasksCache = admin.weeklyTasks || [];

  if (!adminDailyTasksCache.length) {
    adminTaskLibrary.innerHTML = renderEmptyState("No daily tasks yet", "Use the create daily task button above to add the first task.");
  } else {
    adminTaskLibrary.innerHTML = adminDailyTasksCache.map((task) => `
      <article class="insight-row">
        <div class="insight-headline">
          <strong>${task.title}</strong>
          <span class="insight-value">${task.points} pt${task.points === 1 ? "" : "s"}</span>
        </div>
        <div class="badge-group">
          ${priorityBadge(task.importance, { points: task.points })}
          ${badge(task.active ? "Active" : "Paused", task.active ? "good" : "neutral")}
          ${badge(`${task.todayCompletionCount} done today`, "accent")}
          ${badge(`${task.allTimeCompletionCount} all time`, "neutral")}
        </div>
        <p class="muted">${task.description || "No description saved for this task."}</p>
        <div class="inline-actions">
          <button class="mini-action" type="button" data-edit-task="${task.id}">Edit</button>
          <button class="mini-action" type="button" data-toggle-task="${task.id}">${task.active ? "Pause" : "Activate"}</button>
        </div>
      </article>
    `).join("");

    attachAdminDailyLibraryActions();
  }

  if (!adminWeeklyTasksCache.length) {
    adminWeeklyTaskLibrary.innerHTML = renderEmptyState("No weekly tasks yet", "Use the create weekly task button above to add the first shared team task.");
  } else {
    adminWeeklyTaskLibrary.innerHTML = adminWeeklyTasksCache.map((task) => `
      <article class="insight-row">
        <div class="insight-headline">
          <strong>${task.title}</strong>
          <span class="insight-value">${task.currentWeekCompletionCount ? "Done" : "Open"}</span>
        </div>
        <div class="badge-group">
          ${priorityBadge(task.importance)}
          ${badge(task.active ? "Active" : "Paused", task.active ? "good" : "neutral")}
          ${badge(task.currentWeekCompletionCount ? "Completed this week" : "Open this week", task.currentWeekCompletionCount ? "good" : "accent")}
          ${badge(`${task.allTimeCompletionCount} completed weeks`, "neutral")}
        </div>
        <p class="muted">${task.description || "No description saved for this task."}</p>
        <div class="inline-actions">
          <button class="mini-action" type="button" data-edit-weekly-task="${task.id}">Edit</button>
          <button class="mini-action" type="button" data-toggle-weekly-task="${task.id}">${task.active ? "Pause" : "Activate"}</button>
        </div>
      </article>
    `).join("");

    attachAdminWeeklyLibraryActions();
  }
}

async function loadTasks(showLoading = true) {
  if (showLoading) {
    currentStanding.innerHTML = "<div class='standing-card skeleton-card'></div>";
    taskList.innerHTML = "<div class='task-card skeleton-card'></div><div class='task-card skeleton-card'></div>";
    weeklyTaskList.innerHTML = "<div class='task-card skeleton-card'></div><div class='task-card skeleton-card'></div>";
    leaderboard.innerHTML = "<div class='leaderboard-row skeleton-card'></div><div class='leaderboard-row skeleton-card'></div>";

    if (adminTaskLibrary) {
      adminTaskLibrary.innerHTML = "<div class='insight-row skeleton-card'></div>";
    }

    if (adminWeeklyTaskLibrary) {
      adminWeeklyTaskLibrary.innerHTML = "<div class='insight-row skeleton-card'></div>";
    }
  }

  try {
    const data = await api("/daily-tasks");
    renderStanding(data.summary || {}, data.currentUserStanding || {});
    renderDailyTasks(data.tasks || []);
    renderWeeklyTasks(data.weekly || {});
    renderLeaderboard(data.leaderboard || [], data.currentUserStanding || {});
    renderAdminPanel(data.admin);
    maybeOpenRequestedTask();
    maybeOpenRequestedWeeklyTask();
  } catch (error) {
    currentStanding.innerHTML = renderEmptyState("Unable to load tasks", error.message);
    taskList.innerHTML = "";
    weeklyTaskList.innerHTML = "";
    weeklyResetLabel.textContent = "";
    leaderboard.innerHTML = "";

    if (adminTaskLibrary) {
      adminTaskLibrary.innerHTML = "";
    }

    if (adminWeeklyTaskLibrary) {
      adminWeeklyTaskLibrary.innerHTML = "";
    }

    showToast(error.message, "error");
  }
}

adminTaskForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(adminTaskError, "");

  const formData = new FormData(adminTaskForm);
  const payload = {
    title: formData.get("title"),
    importance: formData.get("importance"),
    description: formData.get("description"),
    active: formData.get("active") === "on"
  };

  try {
    if (adminTaskId.value) {
      await api(`/daily-tasks/admin/tasks/${adminTaskId.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Daily task updated.", "success");
    } else {
      await api("/daily-tasks/admin/tasks", {
        method: "POST",
        body: payload
      });
      showToast("Daily task created.", "success");
    }

    resetAdminForm({ clearDraftState: true });
    closeFormModal();
    await loadTasks(false);
    announceMutation(["daily_tasks"]);
  } catch (error) {
    mountFormError(adminTaskError, error.message);
    showToast(error.message, "error");
  }
});

weeklyTaskForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(weeklyTaskError, "");

  const formData = new FormData(weeklyTaskForm);
  const payload = {
    title: formData.get("title"),
    importance: formData.get("importance"),
    description: formData.get("description"),
    active: formData.get("active") === "on"
  };

  try {
    if (weeklyTaskId.value) {
      await api(`/daily-tasks/admin/weekly-tasks/${weeklyTaskId.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Weekly task updated.", "success");
    } else {
      await api("/daily-tasks/admin/weekly-tasks", {
        method: "POST",
        body: payload
      });
      showToast("Weekly task created.", "success");
    }

    resetWeeklyForm({ clearDraftState: true });
    closeFormModal();
    await loadTasks(false);
    announceMutation(["daily_tasks"]);
  } catch (error) {
    mountFormError(weeklyTaskError, error.message);
    showToast(error.message, "error");
  }
});

resetAdminTaskFormButton?.addEventListener("click", () => {
  resetAdminForm({ clearDraftState: true });
});

resetWeeklyTaskFormButton?.addEventListener("click", () => {
  resetWeeklyForm({ clearDraftState: true });
});

openAdminTaskFormButton?.addEventListener("click", () => {
  resetAdminForm();
  showAdminTaskModal(openAdminTaskFormButton);
});

openWeeklyTaskFormButton?.addEventListener("click", () => {
  resetWeeklyForm();
  showWeeklyTaskModal(openWeeklyTaskFormButton);
});

subscribeToMutations(["daily_tasks"], () => {
  showToast("Tasks refreshed with live changes.", "info");
  loadTasks(false);
});

resetAdminForm({ clearUrl: false });
resetWeeklyForm({ clearUrl: false });
restoreDraftForm(adminTaskForm, "daily-task-admin-form");
restoreDraftForm(weeklyTaskForm, "weekly-task-admin-form");
loadTasks();
