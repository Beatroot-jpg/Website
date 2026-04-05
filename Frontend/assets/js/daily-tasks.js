import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  badge,
  focusFormPanel,
  formatDate,
  initProtectedPage,
  mountFormError,
  renderEmptyState,
  renderMetricSkeleton,
  showToast
} from "./ui.js";
import { bindDraftForm, restoreDraftForm } from "./workflow.js";

const currentUser = initProtectedPage({
  pageKey: "DAILY_TASKS",
  title: "Daily tasks",
  subtitle: "Tick off the day, build points, and watch your position move."
});

const taskSummary = document.querySelector("#taskSummary");
const currentStanding = document.querySelector("#currentStanding");
const taskList = document.querySelector("#taskList");
const leaderboard = document.querySelector("#taskLeaderboard");
const resetLabel = document.querySelector("#taskResetLabel");
const adminPanel = document.querySelector("#adminTaskPanel");
const adminTaskForm = document.querySelector("#adminTaskForm");
const adminTaskId = document.querySelector("#adminTaskId");
const adminTaskError = document.querySelector("#adminTaskError");
const adminTaskFormTitle = document.querySelector("#adminTaskFormTitle");
const adminTaskFormSubtitle = document.querySelector("#adminTaskFormSubtitle");
const adminTaskSubmit = document.querySelector("#adminTaskSubmit");
const resetAdminTaskFormButton = document.querySelector("#resetAdminTaskForm");
const adminTaskLibrary = document.querySelector("#adminTaskLibrary");
const adminDraft = bindDraftForm(adminTaskForm, "daily-task-admin-form");
const pageParams = new URLSearchParams(window.location.search);
let requestedTaskEditId = pageParams.get("editTask") || "";

let taskCache = [];
let leaderboardCache = [];
let standingCache = null;
let adminTasksCache = [];

if (adminDraft.restored) {
  showToast("Restored saved daily task admin draft.", "info");
}

function importanceBadge(importance, points) {
  const normalized = `${importance || ""}`.toUpperCase();
  const tone = normalized === "HIGH" ? "warn" : normalized === "MEDIUM" ? "accent" : "neutral";
  const label = normalized === "HIGH" ? "High" : normalized === "MEDIUM" ? "Medium" : "Low";
  return badge(`${label} - ${points} pt${points === 1 ? "" : "s"}`, tone);
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
  adminTaskFormSubtitle.textContent = "Admins can create or edit the task library from one clean section.";
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

function fillAdminForm(task) {
  if (!adminTaskForm) {
    return;
  }

  adminTaskId.value = task.id;
  adminTaskFormTitle.textContent = `Edit ${task.title}`;
  adminTaskFormSubtitle.textContent = "Update the task details here, then review the full task library underneath.";
  adminTaskSubmit.textContent = "Save changes";
  adminTaskForm.elements.title.value = task.title;
  adminTaskForm.elements.importance.value = task.importance;
  adminTaskForm.elements.description.value = task.description || "";
  adminTaskForm.elements.active.checked = task.active;
}

function maybeOpenRequestedTask() {
  if (!requestedTaskEditId || !adminTasksCache.length) {
    return;
  }

  const task = adminTasksCache.find((entry) => entry.id === requestedTaskEditId);

  if (!task) {
    requestedTaskEditId = "";
    updateUrlParams({ editTask: "" }, ["editTask"]);
    showToast("That daily task could not be found.", "error");
    return;
  }

  fillAdminForm(task);
  focusFormPanel(adminTaskForm, '[name="title"]');
}

function renderSummary(summary) {
  taskSummary.innerHTML = `
    <article class="metric-card good">
      <p>Done today</p>
      <strong>${summary.completedCount}/${summary.taskCount}</strong>
      <small>${summary.completionRate}% complete</small>
    </article>
    <article class="metric-card accent">
      <p>Done overall</p>
      <strong>${summary.overallCompletedCount || 0}</strong>
      <small>All-time task completions</small>
    </article>
    <article class="metric-card neutral">
      <p>All-time points</p>
      <strong>${summary.totalPoints || 0}</strong>
      <small>Total points earned</small>
    </article>
    <article class="metric-card warn">
      <p>Leaderboard rank</p>
      <strong>${summary.currentRank || "-"}</strong>
      <small>${summary.currentRank ? "All-time position" : "Complete a task to place"}</small>
    </article>
  `;
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
        ${badge(`${standing.completedCount || 0} total completions`, "neutral")}
        ${badge(`${summary.todayPoints} today`, "good")}
      </div>
      <p class="muted">
        ${standing.rank
          ? `You are currently sitting at position ${standing.rank} on the all-time table.`
          : "You have not placed on the all-time table yet. Complete today's list to get on the board."}
      </p>
    </article>
  `;
}

function renderTasks(tasks) {
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
            ${importanceBadge(task.importance, task.points)}
          </div>
          <p class="muted">${task.description || "No extra explanation for this task."}</p>
          <div class="badge-group">
            ${badge(task.completed ? "Completed today" : "Still open", task.completed ? "good" : "neutral")}
            <span class="task-points">${task.points} point${task.points === 1 ? "" : "s"}</span>
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
        await loadDailyTasks(false);
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

function renderAdminPanel(admin) {
  if (!adminPanel) {
    return;
  }

  if (!admin) {
    adminPanel.classList.add("hidden");
    return;
  }

  adminPanel.classList.remove("hidden");
  adminTasksCache = admin.tasks || [];

  if (!adminTasksCache.length) {
    adminTaskLibrary.innerHTML = renderEmptyState("No admin tasks yet", "Create the first daily task from the form above.");
    return;
  }

  adminTaskLibrary.innerHTML = adminTasksCache.map((task) => `
    <article class="insight-row">
      <div class="insight-headline">
        <strong>${task.title}</strong>
        <span class="insight-value">${task.points} pt${task.points === 1 ? "" : "s"}</span>
      </div>
      <div class="badge-group">
        ${importanceBadge(task.importance, task.points)}
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

  adminTaskLibrary.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedTaskEditId = button.dataset.editTask;
      updateUrlParams({ editTask: requestedTaskEditId });
      const task = adminTasksCache.find((entry) => entry.id === requestedTaskEditId);

      if (task) {
        fillAdminForm(task);
        focusFormPanel(adminTaskForm, '[name="title"]');
      }
    });
  });

  adminTaskLibrary.querySelectorAll("[data-toggle-task]").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = adminTasksCache.find((entry) => entry.id === button.dataset.toggleTask);

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
        await loadDailyTasks(false);
        announceMutation(["daily_tasks"]);
        showToast("Daily task updated.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

async function loadDailyTasks(showLoading = true) {
  if (showLoading) {
    taskSummary.innerHTML = renderMetricSkeleton(4);
    currentStanding.innerHTML = "<div class='standing-card skeleton-card'></div>";
    taskList.innerHTML = "<div class='task-card skeleton-card'></div><div class='task-card skeleton-card'></div>";
    leaderboard.innerHTML = "<div class='leaderboard-row skeleton-card'></div><div class='leaderboard-row skeleton-card'></div>";
    if (adminTaskLibrary) {
      adminTaskLibrary.innerHTML = "<div class='insight-row skeleton-card'></div>";
    }
  }

  try {
    const data = await api("/daily-tasks");
    taskCache = data.tasks || [];
    leaderboardCache = data.leaderboard || [];
    standingCache = data.currentUserStanding || null;
    resetLabel.textContent = data.resetLabel || "Tasks reset every day at 5:00 PM Australia/Sydney.";
    renderSummary(data.summary || {});
    renderStanding(data.summary || {}, data.currentUserStanding || {});
    renderTasks(taskCache);
    renderLeaderboard(leaderboardCache, data.currentUserStanding || {});
    renderAdminPanel(data.admin);
    maybeOpenRequestedTask();
  } catch (error) {
    taskSummary.innerHTML = renderEmptyState("Unable to load daily tasks", error.message);
    currentStanding.innerHTML = "";
    taskList.innerHTML = "";
    leaderboard.innerHTML = "";
    if (adminTaskLibrary) {
      adminTaskLibrary.innerHTML = "";
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
    await loadDailyTasks(false);
    announceMutation(["daily_tasks"]);
  } catch (error) {
    mountFormError(adminTaskError, error.message);
    showToast(error.message, "error");
  }
});

resetAdminTaskFormButton?.addEventListener("click", () => {
  resetAdminForm({ clearDraftState: true });
});

subscribeToMutations(["daily_tasks"], () => {
  showToast("Daily tasks refreshed with live changes.", "info");
  loadDailyTasks(false);
});

resetAdminForm({ clearUrl: false });
restoreDraftForm(adminTaskForm, "daily-task-admin-form");
loadDailyTasks();
