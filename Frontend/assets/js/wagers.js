import { api } from "./api.js";
import { subscribeToMutations } from "./live.js";
import {
  badge,
  formatCurrency,
  formatDate,
  initProtectedPage,
  mountFormError,
  renderEmptyState,
  renderTableSkeleton,
  showToast
} from "./ui.js";

const currentUser = initProtectedPage({
  pageKey: "WAGERS",
  requiredPermission: null,
  title: "Wagers",
  subtitle: "The current night book, the payout pressure, and what the house keeps.",
  showQuickActions: false
});

const isAdmin = currentUser.role === "ADMIN";

const nightLabel = document.querySelector("#nightLabel");
const wagerTotals = document.querySelector("#wagerTotals");
const wagerTable = document.querySelector("#wagerTable");
const fightResultTable = document.querySelector("#fightResultTable");
const wagersAdminPanel = document.querySelector("#wagersAdminPanel");

const nightForm = document.querySelector("#nightForm");
const nightError = document.querySelector("#nightError");

const wagerForm = document.querySelector("#wagerForm");
const wagerFormTitle = document.querySelector("#wagerFormTitle");
const wagerError = document.querySelector("#wagerError");
const wagerIdField = document.querySelector("#wagerId");
const wagerFightSelect = document.querySelector("#wagerFightId");
const pickedFighterNameSelect = document.querySelector("#pickedFighterName");
const projectedReturnPreview = document.querySelector("#projectedReturnPreview");
const resetWagerFormButton = document.querySelector("#resetWagerForm");
const deleteWagerButton = document.querySelector("#deleteWagerButton");

const resolveFightForm = document.querySelector("#resolveFightForm");
const resolveFightFormTitle = document.querySelector("#resolveFightFormTitle");
const resolveFightError = document.querySelector("#resolveFightError");
const resolveFightIdField = document.querySelector("#resolveFightId");
const resolveFightSelect = document.querySelector("#resolveFightSelect");
const resolveWinnerNameSelect = document.querySelector("#resolveWinnerName");
const resetResolveFightFormButton = document.querySelector("#resetResolveFightForm");

let nightCache = null;
let fightsCache = [];
let wagersCache = [];

function fightLabel(fight) {
  return `${fight.fighterRedName} vs ${fight.fighterBlueName}`;
}

function fillFightOptions(selectElement, includeEmptyLabel) {
  if (!selectElement) {
    return;
  }

  const isWagerSelect = selectElement === wagerFightSelect;
  const availableFights = isWagerSelect
    ? fightsCache.filter((fight) => fight.status === "UPCOMING")
    : fightsCache;

  const options = availableFights.map((fight) => `
    <option value="${fight.id}">${fightLabel(fight)}</option>
  `).join("");

  selectElement.innerHTML = `
    ${includeEmptyLabel ? `<option value="">${includeEmptyLabel}</option>` : ""}
    ${options}
  `;
}

function fillPickedFighterOptions(selectElement, fightId, includeEmptyLabel) {
  const fight = fightsCache.find((entry) => entry.id === fightId);

  if (!fight) {
    selectElement.innerHTML = includeEmptyLabel ? `<option value="">${includeEmptyLabel}</option>` : "";
    return;
  }

  selectElement.innerHTML = `
    ${includeEmptyLabel ? `<option value="">${includeEmptyLabel}</option>` : ""}
    <option value="${fight.fighterRedName}">${fight.fighterRedName}</option>
    <option value="${fight.fighterBlueName}">${fight.fighterBlueName}</option>
  `;
}

function updateProjectedReturn() {
  const stake = Number.parseFloat(wagerForm.elements.stake.value || "0");
  const multiplier = Number.parseFloat(wagerForm.elements.payoutMultiplier.value || "0");
  const projected = Number.isFinite(stake) && Number.isFinite(multiplier)
    ? stake * multiplier
    : 0;

  projectedReturnPreview.textContent = formatCurrency(projected);
}

function resetNightForm() {
  nightForm.reset();
  mountFormError(nightError, "");
}

function resetWagerForm() {
  wagerForm.reset();
  wagerIdField.value = "";
  wagerFormTitle.textContent = "Add wager";
  deleteWagerButton.classList.add("hidden");
  mountFormError(wagerError, "");
  fillFightOptions(wagerFightSelect, "Select a fight");
  fillPickedFighterOptions(pickedFighterNameSelect, "", "Select a fighter");
  wagerForm.elements.payoutMultiplier.value = "2.00";
  updateProjectedReturn();
}

function resetResolveFightForm() {
  resolveFightForm.reset();
  resolveFightIdField.value = "";
  resolveFightFormTitle.textContent = "Resolve fight";
  mountFormError(resolveFightError, "");
  fillFightOptions(resolveFightSelect, "Select a fight");
  fillPickedFighterOptions(resolveWinnerNameSelect, "", "Select the winner");
}

function fillWagerForm(bet) {
  wagerIdField.value = bet.id;
  wagerFormTitle.textContent = `Update ${bet.bettorName}'s bet`;
  wagerForm.elements.bettorName.value = bet.bettorName;
  wagerForm.elements.fightId.value = bet.fightId || "";
  fillPickedFighterOptions(pickedFighterNameSelect, bet.fightId || "", "Select a fighter");
  wagerForm.elements.pickedFighterName.value = bet.pickedFighterName;
  wagerForm.elements.stake.value = Number(bet.stake).toFixed(2);
  wagerForm.elements.payoutMultiplier.value = Number(bet.payoutMultiplier).toFixed(2);
  wagerForm.elements.notes.value = bet.notes || "";
  deleteWagerButton.classList.remove("hidden");
  mountFormError(wagerError, "");
  updateProjectedReturn();
  wagersAdminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillResolveFightForm(fight) {
  resolveFightIdField.value = fight.id;
  resolveFightFormTitle.textContent = `Resolve ${fightLabel(fight)}`;
  resolveFightForm.elements.fightId.value = fight.id;
  fillPickedFighterOptions(resolveWinnerNameSelect, fight.id, "Select the winner");
  resolveFightForm.elements.status.value = fight.status === "CANCELLED" ? "CANCELLED" : "COMPLETED";
  if (fight.winnerName) {
    resolveFightForm.elements.winnerName.value = fight.winnerName;
  }
  mountFormError(resolveFightError, "");
  wagersAdminPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderTotals(totals) {
  wagerTotals.innerHTML = `
    <article class="metric-card accent">
      <p>Total staked</p>
      <strong>${formatCurrency(totals.totalStaked)}</strong>
      <small>Current night intake</small>
    </article>
    <article class="metric-card warn">
      <p>Projected payouts</p>
      <strong>${formatCurrency(totals.activeExposure)}</strong>
      <small>If the open book lands</small>
    </article>
    <article class="metric-card neutral">
      <p>Pending house take</p>
      <strong>${formatCurrency(totals.pendingHouseTake)}</strong>
      <small>Waiting on settlement</small>
    </article>
    <article class="metric-card ${Number(totals.overallResult) >= 0 ? "good" : "danger"}">
      <p>Night result</p>
      <strong>${formatCurrency(totals.overallResult)}</strong>
      <small>House kept minus payouts</small>
    </article>
  `;
}

function statusBadge(status, projectedReturn) {
  switch (status) {
    case "ACTIVE":
      return badge(`Open ${formatCurrency(projectedReturn)}`, "neutral");
    case "WON_PENDING":
      return badge(`Owes ${formatCurrency(projectedReturn)}`, "good");
    case "LOST_PENDING":
      return badge("House can keep", "warn");
    case "PAID_OUT":
      return badge("Paid out", "good");
    case "HOUSE_KEPT":
      return badge("Kept by house", "accent");
    case "VOIDED":
      return badge("Voided", "neutral");
    default:
      return badge(status, "neutral");
  }
}

function renderWagerTable() {
  if (!wagersCache.length) {
    wagerTable.innerHTML = renderEmptyState(
      "No wagers logged yet",
      "Once the bets start coming in for the current night, they will appear here."
    );
    return;
  }

  wagerTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Bettor</th>
            <th>Fight</th>
            <th>Picked fighter</th>
            <th>Stake</th>
            <th>Projected return</th>
            <th>Status</th>
            ${isAdmin ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${wagersCache.map((bet) => `
            <tr class="${bet.status === "WON_PENDING" ? "selected-row" : ""}">
              <td>
                <strong>${bet.bettorName}</strong>
                ${bet.notes ? `<div class="subtle-row">${bet.notes}</div>` : ""}
              </td>
              <td>${bet.fight ? fightLabel(bet.fight) : "Manual bet"}</td>
              <td>${bet.pickedFighterName}</td>
              <td>${formatCurrency(bet.stake)}</td>
              <td>${formatCurrency(bet.projectedReturn)}</td>
              <td>${statusBadge(bet.status, bet.projectedReturn)}</td>
              ${isAdmin ? `
                <td>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-edit-wager="${bet.id}">Edit</button>
                    ${bet.status === "WON_PENDING" ? `<button class="mini-action" type="button" data-settle-wager="${bet.id}" data-action="PAY_OUT">Pay out</button>` : ""}
                    ${bet.status === "LOST_PENDING" ? `<button class="mini-action" type="button" data-settle-wager="${bet.id}" data-action="KEEP_HOUSE">Keep</button>` : ""}
                    ${bet.status !== "VOIDED" && bet.status !== "PAID_OUT" && bet.status !== "HOUSE_KEPT" ? `<button class="mini-action danger-action" type="button" data-settle-wager="${bet.id}" data-action="VOID_BET">Void</button>` : ""}
                  </div>
                </td>
              ` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  if (!isAdmin) {
    return;
  }

  wagerTable.querySelectorAll("[data-edit-wager]").forEach((button) => {
    button.addEventListener("click", () => {
      const bet = wagersCache.find((entry) => entry.id === button.dataset.editWager);
      if (bet) {
        fillWagerForm(bet);
      }
    });
  });

  wagerTable.querySelectorAll("[data-settle-wager]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      const settlementNote = window.prompt("Optional settlement note", "") || "";

      try {
        await api(`/wagers/bets/${button.dataset.settleWager}/settle`, {
          method: "PATCH",
          body: {
            action,
            settlementNote
          }
        });
        showToast("Wager settled.", "success");
        await loadWagers();
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

function renderFightResultTable() {
  if (!fightsCache.length) {
    fightResultTable.innerHTML = renderEmptyState(
      "No fights loaded yet",
      "Once the card is built on the leaderboard page, the fights will show up here."
    );
    return;
  }

  fightResultTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Fight</th>
            <th>When</th>
            <th>Status</th>
            <th>Winner</th>
            ${isAdmin ? "<th></th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${fightsCache.map((fight) => `
            <tr>
              <td>
                <strong>${fightLabel(fight)}</strong>
                ${fight.venue ? `<div class="subtle-row">${fight.venue}</div>` : ""}
              </td>
              <td>${formatDate(fight.scheduledAt)}</td>
              <td>${badge(fight.status, fight.status === "COMPLETED" ? "good" : fight.status === "CANCELLED" ? "danger" : "accent")}</td>
              <td>${fight.winnerName || "Not resolved"}</td>
              ${isAdmin ? `<td><button class="mini-action" type="button" data-resolve-fight="${fight.id}">Mark done</button></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  if (!isAdmin) {
    return;
  }

  fightResultTable.querySelectorAll("[data-resolve-fight]").forEach((button) => {
    button.addEventListener("click", () => {
      const fight = fightsCache.find((entry) => entry.id === button.dataset.resolveFight);
      if (fight) {
        fillResolveFightForm(fight);
      }
    });
  });
}

async function loadWagers() {
  wagerTotals.innerHTML = "<article class='metric-card skeleton-card'></article><article class='metric-card skeleton-card'></article><article class='metric-card skeleton-card'></article><article class='metric-card skeleton-card'></article>";
  wagerTable.innerHTML = renderTableSkeleton(isAdmin ? 7 : 6, 5);
  fightResultTable.innerHTML = renderTableSkeleton(isAdmin ? 5 : 4, 4);

  try {
    const data = await api("/wagers");
    nightCache = data.night || null;
    wagersCache = nightCache?.wagers || [];
    fightsCache = data.fights || [];

    nightLabel.textContent = nightCache?.label
      ? `${nightCache.label} - ${wagersCache.length} wagers live`
      : "Current fight night";

    wagersAdminPanel.classList.toggle("hidden", !data.viewer?.isAdmin);
    renderTotals(data.totals);
    fillFightOptions(wagerFightSelect, "Select a fight");
    fillFightOptions(resolveFightSelect, "Select a fight");
    renderWagerTable();
    renderFightResultTable();
  } catch (error) {
    wagerTotals.innerHTML = renderEmptyState("Unable to load current night", error.message);
    wagerTable.innerHTML = "";
    fightResultTable.innerHTML = "";
    showToast(error.message, "error");
  }
}

nightForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(nightError, "");

  try {
    await api("/wagers/nights/start", {
      method: "POST",
      body: Object.fromEntries(new FormData(nightForm).entries())
    });
    resetNightForm();
    await loadWagers();
    showToast("New fight night started.", "success");
  } catch (error) {
    mountFormError(nightError, error.message);
    showToast(error.message, "error");
  }
});

wagerFightSelect?.addEventListener("change", () => {
  fillPickedFighterOptions(pickedFighterNameSelect, wagerFightSelect.value, "Select a fighter");
});

resolveFightSelect?.addEventListener("change", () => {
  resolveFightIdField.value = resolveFightSelect.value;
  fillPickedFighterOptions(resolveWinnerNameSelect, resolveFightSelect.value, "Select the winner");
});

wagerForm?.addEventListener("input", updateProjectedReturn);

wagerForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(wagerError, "");

  const payload = Object.fromEntries(new FormData(wagerForm).entries());

  try {
    if (wagerIdField.value) {
      await api(`/wagers/bets/${wagerIdField.value}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Wager updated.", "success");
    } else {
      await api("/wagers/bets", {
        method: "POST",
        body: payload
      });
      showToast("Wager added to the book.", "success");
    }

    resetWagerForm();
    await loadWagers();
  } catch (error) {
    mountFormError(wagerError, error.message);
    showToast(error.message, "error");
  }
});

resolveFightForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(resolveFightError, "");

  const payload = Object.fromEntries(new FormData(resolveFightForm).entries());
  const fightId = resolveFightIdField.value || payload.fightId;

  try {
    await api(`/wagers/fights/${fightId}/resolve`, {
      method: "PATCH",
      body: payload
    });
    resetResolveFightForm();
    await loadWagers();
    showToast("Fight marked done.", "success");
  } catch (error) {
    mountFormError(resolveFightError, error.message);
    showToast(error.message, "error");
  }
});

resetWagerFormButton?.addEventListener("click", resetWagerForm);
resetResolveFightFormButton?.addEventListener("click", resetResolveFightForm);

deleteWagerButton?.addEventListener("click", async () => {
  if (!wagerIdField.value || !window.confirm("Delete this wager from the book?")) {
    return;
  }

  try {
    await api(`/wagers/bets/${wagerIdField.value}`, { method: "DELETE" });
    resetWagerForm();
    await loadWagers();
    showToast("Wager deleted.", "success");
  } catch (error) {
    mountFormError(wagerError, error.message);
    showToast(error.message, "error");
  }
});

subscribeToMutations(["leaderboard", "wagers", "users"], () => {
  loadWagers();
});

resetNightForm();
resetWagerForm();
resetResolveFightForm();
loadWagers();
