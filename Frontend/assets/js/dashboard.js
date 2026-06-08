import { api } from "./api.js";
import { subscribeToMutations } from "./live.js";
import { initThemeToggle } from "./theme.js";
import {
  badge,
  formatDate,
  initProtectedPage,
  mountFormError,
  renderEmptyState,
  renderTableSkeleton,
  showToast
} from "./ui.js";

const currentUser = initProtectedPage({
  pageKey: "DASHBOARD",
  requiredPermission: null,
  title: "Fight Club Leaderboard",
  subtitle: "Live rankings, champions, and the next card on deck.",
  showQuickActions: false,
  showWorkspaceTools: false
});

const themeToggleButton = document.querySelector("#themeToggleButton");
const leaderboardTable = document.querySelector("#leaderboardTable");
const leaderboardPagination = document.querySelector("#leaderboardPagination");
const hallOfFameTable = document.querySelector("#hallOfFameTable");
const fightCardTable = document.querySelector("#fightCardTable");
const fighterSearchInput = document.querySelector("#fighterSearchInput");
const leaderboardAdminPanel = document.querySelector("#leaderboardAdminPanel");

const fighterForm = document.querySelector("#fighterForm");
const fighterFormTitle = document.querySelector("#fighterFormTitle");
const fighterError = document.querySelector("#fighterError");
const fighterIdField = document.querySelector("#fighterId");
const resetFighterFormButton = document.querySelector("#resetFighterForm");
const deleteFighterButton = document.querySelector("#deleteFighterButton");

const hallOfFameForm = document.querySelector("#hallOfFameForm");
const hallOfFameFormTitle = document.querySelector("#hallOfFameFormTitle");
const hallOfFameError = document.querySelector("#hallOfFameError");
const hallOfFameEntryIdField = document.querySelector("#hallOfFameEntryId");
const resetHallOfFameFormButton = document.querySelector("#resetHallOfFameForm");
const deleteHallOfFameButton = document.querySelector("#deleteHallOfFameButton");

const fightForm = document.querySelector("#fightForm");
const fightFormTitle = document.querySelector("#fightFormTitle");
const fightError = document.querySelector("#fightError");
const fightIdField = document.querySelector("#fightId");
const resetFightFormButton = document.querySelector("#resetFightForm");
const deleteFightButton = document.querySelector("#deleteFightButton");
const pageParams = new URLSearchParams(window.location.search);

let fightersCache = [];
let hallOfFameCache = [];
let fightCardCache = [];
let fighterSearch = (pageParams.get("search") || "").trim().toLowerCase();
let leaderboardPage = 1;
const leaderboardPageSize = 10;
const isAdmin = currentUser.role === "ADMIN";

function clampPage(page, totalPages) {
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.min(page, Math.max(1, totalPages || 1));
}

function paginate(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = clampPage(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      totalPages,
      total
    }
  };
}

function resetFighterForm() {
  fighterForm.reset();
  fighterIdField.value = "";
  fighterFormTitle.textContent = "Add fighter to leaderboard";
  fighterForm.elements.points.value = 20;
  mountFormError(fighterError, "");
  deleteFighterButton.classList.add("hidden");
}

function resetHallOfFameForm() {
  hallOfFameForm.reset();
  hallOfFameEntryIdField.value = "";
  hallOfFameFormTitle.textContent = "Add champion";
  mountFormError(hallOfFameError, "");
  deleteHallOfFameButton.classList.add("hidden");
}

function resetFightForm() {
  fightForm.reset();
  fightIdField.value = "";
  fightFormTitle.textContent = "Schedule fight";
  mountFormError(fightError, "");
  deleteFightButton.classList.add("hidden");
}

function fillFighterForm(fighter) {
  fighterIdField.value = fighter.id;
  fighterFormTitle.textContent = `Update ${fighter.name}`;
  fighterForm.elements.name.value = fighter.name;
  fighterForm.elements.points.value = fighter.points;
  fighterForm.elements.notes.value = fighter.notes || "";
  deleteFighterButton.classList.remove("hidden");
  mountFormError(fighterError, "");
  leaderboardAdminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillHallOfFameForm(entry) {
  hallOfFameEntryIdField.value = entry.id;
  hallOfFameFormTitle.textContent = `Update ${entry.fighterName}`;
  hallOfFameForm.elements.fighterName.value = entry.fighterName;
  hallOfFameForm.elements.title.value = entry.title || "";
  hallOfFameForm.elements.pointsAtTitle.value = entry.pointsAtTitle ?? "";
  hallOfFameForm.elements.wonAt.value = entry.wonAt ? new Date(new Date(entry.wonAt).getTime() - new Date(entry.wonAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
  hallOfFameForm.elements.notes.value = entry.notes || "";
  deleteHallOfFameButton.classList.remove("hidden");
  mountFormError(hallOfFameError, "");
  leaderboardAdminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillFightForm(fight) {
  fightIdField.value = fight.id;
  fightFormTitle.textContent = `Update ${fight.fighterRedName} vs ${fight.fighterBlueName}`;
  fightForm.elements.fighterRedName.value = fight.fighterRedName;
  fightForm.elements.fighterBlueName.value = fight.fighterBlueName;
  fightForm.elements.scheduledAt.value = fight.scheduledAt
    ? new Date(new Date(fight.scheduledAt).getTime() - new Date(fight.scheduledAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : "";
  fightForm.elements.venue.value = fight.venue || "";
  fightForm.elements.notes.value = fight.notes || "";
  deleteFightButton.classList.remove("hidden");
  mountFormError(fightError, "");
  leaderboardAdminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderLeaderboard() {
  const visibleFighters = fightersCache.filter((fighter) => (
    fighter.name.toLowerCase().includes(fighterSearch)
  ));

  if (!visibleFighters.length) {
    leaderboardTable.innerHTML = renderEmptyState(
      fightersCache.length ? "No fighters match that search" : "No fighters on the board yet",
      fightersCache.length
        ? "Try a broader fighter search."
        : "Once fighters are added, the live leaderboard will appear here."
    );
    leaderboardPagination.innerHTML = "";
    return;
  }

  const paged = paginate(visibleFighters, leaderboardPage, leaderboardPageSize);
  leaderboardPage = paged.pagination.page;

  leaderboardTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Fighter</th>
            <th>Total points</th>
            ${isAdmin ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${paged.items.map((fighter, index) => `
            <tr>
              <td><strong>#${(paged.pagination.page - 1) * leaderboardPageSize + index + 1}</strong></td>
              <td>${fighter.name}</td>
              <td>${badge(`${fighter.points} pts`, "accent")}</td>
              ${isAdmin ? `<td><button class="mini-action" type="button" data-edit-fighter="${fighter.id}">Edit</button></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  leaderboardPagination.innerHTML = `
    <button class="ghost-button" type="button" data-page="${paged.pagination.page - 1}" ${paged.pagination.page <= 1 ? "disabled" : ""}>Prev</button>
    <span class="toolbar-meta">Page ${paged.pagination.page} of ${paged.pagination.totalPages}</span>
    <button class="ghost-button" type="button" data-page="${paged.pagination.page + 1}" ${paged.pagination.page >= paged.pagination.totalPages ? "disabled" : ""}>Next</button>
  `;

  leaderboardPagination.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      leaderboardPage = Number.parseInt(button.dataset.page, 10);
      renderLeaderboard();
    });
  });

  if (isAdmin) {
    leaderboardTable.querySelectorAll("[data-edit-fighter]").forEach((button) => {
      button.addEventListener("click", () => {
        const fighter = fightersCache.find((entry) => entry.id === button.dataset.editFighter);
        if (fighter) {
          fillFighterForm(fighter);
        }
      });
    });
  }
}

function renderHallOfFame() {
  if (!hallOfFameCache.length) {
    hallOfFameTable.innerHTML = renderEmptyState(
      "No champions recorded yet",
      "The first title holders will start the hall of fame."
    );
    return;
  }

  hallOfFameTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Champion</th>
            <th>Title</th>
            <th>Won at</th>
            ${isAdmin ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${hallOfFameCache.map((entry) => `
            <tr>
              <td>
                <strong>${entry.fighterName}</strong>
                ${entry.pointsAtTitle !== null && entry.pointsAtTitle !== undefined ? `<div class="subtle-row">${entry.pointsAtTitle} points at title</div>` : ""}
              </td>
              <td>${entry.title || "Champion"}</td>
              <td>${formatDate(entry.wonAt)}</td>
              ${isAdmin ? `<td><button class="mini-action" type="button" data-edit-hof="${entry.id}">Edit</button></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  if (isAdmin) {
    hallOfFameTable.querySelectorAll("[data-edit-hof]").forEach((button) => {
      button.addEventListener("click", () => {
        const entry = hallOfFameCache.find((item) => item.id === button.dataset.editHof);
        if (entry) {
          fillHallOfFameForm(entry);
        }
      });
    });
  }
}

function renderFightCard() {
  if (!fightCardCache.length) {
    fightCardTable.innerHTML = renderEmptyState(
      "No upcoming fights scheduled",
      "The next fights will appear here as soon as the card is built."
    );
    return;
  }

  fightCardTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Matchup</th>
            <th>When</th>
            <th>Venue</th>
            ${isAdmin ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${fightCardCache.map((fight) => `
            <tr>
              <td>
                <strong>${fight.fighterRedName} vs ${fight.fighterBlueName}</strong>
                ${fight.notes ? `<div class="subtle-row">${fight.notes}</div>` : ""}
              </td>
              <td>${formatDate(fight.scheduledAt)}</td>
              <td>${fight.venue || "TBA"}</td>
              ${isAdmin ? `<td><button class="mini-action" type="button" data-edit-fight="${fight.id}">Edit</button></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  if (isAdmin) {
    fightCardTable.querySelectorAll("[data-edit-fight]").forEach((button) => {
      button.addEventListener("click", () => {
        const fight = fightCardCache.find((entry) => entry.id === button.dataset.editFight);
        if (fight) {
          fillFightForm(fight);
        }
      });
    });
  }
}

async function loadLeaderboard() {
  leaderboardTable.innerHTML = renderTableSkeleton(isAdmin ? 4 : 3, 6);
  hallOfFameTable.innerHTML = renderTableSkeleton(isAdmin ? 4 : 3, 4);
  fightCardTable.innerHTML = renderTableSkeleton(isAdmin ? 4 : 3, 4);

  try {
    const data = await api("/leaderboard");
    fightersCache = data.fighters || [];
    hallOfFameCache = data.hallOfFame || [];
    fightCardCache = data.fightCard || [];
    leaderboardAdminPanel.classList.toggle("hidden", !data.viewer?.isAdmin);
    renderLeaderboard();
    renderHallOfFame();
    renderFightCard();
  } catch (error) {
    leaderboardTable.innerHTML = renderEmptyState("Unable to load leaderboard", error.message);
    hallOfFameTable.innerHTML = "";
    fightCardTable.innerHTML = "";
    showToast(error.message, "error");
  }
}

fighterSearchInput?.addEventListener("input", () => {
  fighterSearch = fighterSearchInput.value.trim().toLowerCase();
  leaderboardPage = 1;
  renderLeaderboard();
});

fighterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(fighterError, "");

  const formData = new FormData(fighterForm);
  const payload = {
    name: formData.get("name"),
    points: formData.get("points"),
    notes: formData.get("notes")
  };

  try {
    if (fighterIdField.value) {
      await api(`/leaderboard/fighters/${fighterIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Fighter updated.", "success");
    } else {
      await api("/leaderboard/fighters", {
        method: "POST",
        body: payload
      });
      showToast("Fighter added to the leaderboard.", "success");
    }

    resetFighterForm();
    await loadLeaderboard();
  } catch (error) {
    mountFormError(fighterError, error.message);
    showToast(error.message, "error");
  }
});

hallOfFameForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(hallOfFameError, "");

  const formData = new FormData(hallOfFameForm);
  const payload = {
    fighterName: formData.get("fighterName"),
    title: formData.get("title"),
    pointsAtTitle: formData.get("pointsAtTitle"),
    wonAt: formData.get("wonAt"),
    notes: formData.get("notes")
  };

  try {
    if (hallOfFameEntryIdField.value) {
      await api(`/leaderboard/hall-of-fame/${hallOfFameEntryIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Hall of fame entry updated.", "success");
    } else {
      await api("/leaderboard/hall-of-fame", {
        method: "POST",
        body: payload
      });
      showToast("Champion added to the hall of fame.", "success");
    }

    resetHallOfFameForm();
    await loadLeaderboard();
  } catch (error) {
    mountFormError(hallOfFameError, error.message);
    showToast(error.message, "error");
  }
});

fightForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(fightError, "");

  const formData = new FormData(fightForm);
  const payload = {
    fighterRedName: formData.get("fighterRedName"),
    fighterBlueName: formData.get("fighterBlueName"),
    scheduledAt: formData.get("scheduledAt"),
    venue: formData.get("venue"),
    notes: formData.get("notes")
  };

  try {
    if (fightIdField.value) {
      await api(`/leaderboard/fights/${fightIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Fight card updated.", "success");
    } else {
      await api("/leaderboard/fights", {
        method: "POST",
        body: payload
      });
      showToast("Fight added to the card.", "success");
    }

    resetFightForm();
    await loadLeaderboard();
  } catch (error) {
    mountFormError(fightError, error.message);
    showToast(error.message, "error");
  }
});

resetFighterFormButton?.addEventListener("click", resetFighterForm);
resetHallOfFameFormButton?.addEventListener("click", resetHallOfFameForm);
resetFightFormButton?.addEventListener("click", resetFightForm);

deleteFighterButton?.addEventListener("click", async () => {
  if (!fighterIdField.value || !window.confirm("Delete this fighter from the leaderboard?")) {
    return;
  }

  try {
    await api(`/leaderboard/fighters/${fighterIdField.value}`, { method: "DELETE" });
    resetFighterForm();
    await loadLeaderboard();
    showToast("Fighter deleted.", "success");
  } catch (error) {
    mountFormError(fighterError, error.message);
    showToast(error.message, "error");
  }
});

deleteHallOfFameButton?.addEventListener("click", async () => {
  if (!hallOfFameEntryIdField.value || !window.confirm("Delete this hall of fame entry?")) {
    return;
  }

  try {
    await api(`/leaderboard/hall-of-fame/${hallOfFameEntryIdField.value}`, { method: "DELETE" });
    resetHallOfFameForm();
    await loadLeaderboard();
    showToast("Hall of fame entry deleted.", "success");
  } catch (error) {
    mountFormError(hallOfFameError, error.message);
    showToast(error.message, "error");
  }
});

deleteFightButton?.addEventListener("click", async () => {
  if (!fightIdField.value || !window.confirm("Delete this fight from the card?")) {
    return;
  }

  try {
    await api(`/leaderboard/fights/${fightIdField.value}`, { method: "DELETE" });
    resetFightForm();
    await loadLeaderboard();
    showToast("Fight deleted.", "success");
  } catch (error) {
    mountFormError(fightError, error.message);
    showToast(error.message, "error");
  }
});

initThemeToggle(themeToggleButton);

subscribeToMutations(["leaderboard", "wagers", "users"], () => {
  loadLeaderboard();
});

resetFighterForm();
resetHallOfFameForm();
resetFightForm();
if (fighterSearchInput) {
  fighterSearchInput.value = pageParams.get("search") || "";
}
loadLeaderboard();
