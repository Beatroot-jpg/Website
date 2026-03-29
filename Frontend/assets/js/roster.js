import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  formatDate,
  formatDateOnly,
  initProtectedPage,
  mountFormError,
  renderEmptyState,
  renderMetricSkeleton,
  renderTableSkeleton,
  rosterStatusBadge,
  showToast
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
  pageKey: "ROSTER",
  title: "Roster management",
  subtitle: "Keep names, ranks, statuses, and lineup order easy to edit."
});

const summaryGrid = document.querySelector("#rosterSummary");
const rosterForm = document.querySelector("#rosterForm");
const rosterError = document.querySelector("#rosterError");
const tableContainer = document.querySelector("#rosterTable");
const rosterMemberIdField = document.querySelector("#rosterMemberId");
const rosterFormTitle = document.querySelector("#rosterFormTitle");
const rosterFormSubtitle = document.querySelector("#rosterFormSubtitle");
const rosterSubmitButton = document.querySelector("#rosterSubmitButton");
const resetRosterButton = document.querySelector("#resetRosterForm");
const toolbarHost = document.createElement("div");
const initialParams = new URLSearchParams(window.location.search);
const searchQuery = (initialParams.get("search") || "").trim().toLowerCase();
const activeView = (initialParams.get("view") || "").toLowerCase();
let requestedRosterEditId = initialParams.get("editMember") || "";
const rosterDraft = bindDraftForm(rosterForm, "roster-form");

toolbarHost.className = "collection-tools";
tableContainer.before(toolbarHost);

let rosterCache = [];
let hasShownFilterMessage = false;

if (rosterDraft.restored) {
  showToast("Restored saved roster draft.", "info");
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

function toDateInputValue(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function resetRosterForm({ clearDraftState = false, clearUrl = true } = {}) {
  rosterForm.reset();
  rosterMemberIdField.value = "";
  rosterFormTitle.textContent = "Add roster member";
  rosterFormSubtitle.textContent = "Create a new entry with rank, status, join date, and lineup order.";
  rosterSubmitButton.textContent = "Save member";
  mountFormError(rosterError, "");

  if (clearDraftState) {
    rosterDraft.clearDraft();
  }

  if (clearUrl) {
    requestedRosterEditId = "";
    updateUrlParams({ editMember: "" }, ["editMember"]);
  }
}

function fillRosterForm(member) {
  rosterMemberIdField.value = member.id;
  rosterFormTitle.textContent = `Editing ${member.name}`;
  rosterFormSubtitle.textContent = "Update lineup order, rank, Discord name, or status without re-entering the whole record.";
  rosterSubmitButton.textContent = "Save changes";
  rosterForm.elements.name.value = member.name;
  rosterForm.elements.discordName.value = member.discordName;
  rosterForm.elements.rank.value = member.rank;
  rosterForm.elements.status.value = member.status;
  rosterForm.elements.dateJoined.value = toDateInputValue(member.dateJoined);
  rosterForm.elements.displayOrder.value = member.displayOrder;
}

function maybeOpenRequestedEdit() {
  if (!requestedRosterEditId) {
    return;
  }

  const member = rosterCache.find((entry) => entry.id === requestedRosterEditId);

  if (!member) {
    requestedRosterEditId = "";
    updateUrlParams({ editMember: "" }, ["editMember"]);
    showToast("That roster member could not be found.", "error");
    return;
  }

  fillRosterForm(member);
  rosterForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getVisibleMembers(members) {
  let visibleMembers = [...members];

  if (activeView === "active") {
    visibleMembers = visibleMembers.filter((member) => member.status === "ACTIVE");
  }

  if (activeView === "loa") {
    visibleMembers = visibleMembers.filter((member) => member.status === "LOA");
  }

  if (activeView === "inactive") {
    visibleMembers = visibleMembers.filter((member) => member.status === "INACTIVE");
  }

  if (searchQuery) {
    visibleMembers = visibleMembers.filter((member) => [
      member.name,
      member.discordName,
      member.rank,
      member.status
    ].some((value) => `${value || ""}`.toLowerCase().includes(searchQuery)));
  }

  return visibleMembers;
}

function currentViewLabel() {
  if (activeView === "active") {
    return searchQuery ? `Active / ${searchQuery}` : "Active";
  }

  if (activeView === "loa") {
    return searchQuery ? `LOA / ${searchQuery}` : "LOA";
  }

  if (activeView === "inactive") {
    return searchQuery ? `Inactive / ${searchQuery}` : "Inactive";
  }

  return searchQuery ? `Search / ${searchQuery}` : "All roster";
}

function renderSummary(members) {
  const total = members.length;
  const activeCount = members.filter((member) => member.status === "ACTIVE").length;
  const loaCount = members.filter((member) => member.status === "LOA").length;
  const inactiveCount = members.filter((member) => member.status === "INACTIVE").length;

  summaryGrid.innerHTML = `
    <a class="metric-link" href="${buildPageHref("./roster.html", { hash: "rosterTable" })}">
      <article class="metric-card neutral">
        <p>Total members</p>
        <strong>${total}</strong>
        <small>Full roster size</small>
      </article>
    </a>
    <a class="metric-link" href="${buildPageHref("./roster.html", { view: "active", hash: "rosterTable" })}">
      <article class="metric-card good">
        <p>Active</p>
        <strong>${activeCount}</strong>
        <small>Ready now</small>
      </article>
    </a>
    <a class="metric-link" href="${buildPageHref("./roster.html", { view: "loa", hash: "rosterTable" })}">
      <article class="metric-card warn">
        <p>LOA</p>
        <strong>${loaCount}</strong>
        <small>Leave of absence</small>
      </article>
    </a>
    <a class="metric-link" href="${buildPageHref("./roster.html", { view: "inactive", hash: "rosterTable" })}">
      <article class="metric-card neutral">
        <p>Inactive</p>
        <strong>${inactiveCount}</strong>
        <small>Not currently active</small>
      </article>
    </a>
  `;
}

function renderToolbar(members) {
  const visibleMembers = getVisibleMembers(members);
  const savedView = loadSavedView("roster");
  const filterLinks = [
    { label: "All", href: buildPageHref("./roster.html", { hash: "rosterTable" }), active: !activeView },
    { label: "Active", href: buildPageHref("./roster.html", { view: "active", hash: "rosterTable" }), active: activeView === "active" },
    { label: "LOA", href: buildPageHref("./roster.html", { view: "loa", hash: "rosterTable" }), active: activeView === "loa" },
    { label: "Inactive", href: buildPageHref("./roster.html", { view: "inactive", hash: "rosterTable" }), active: activeView === "inactive" }
  ];

  toolbarHost.innerHTML = `
    <div class="filter-chip-row">
      ${filterLinks.map((link) => `
        <a class="filter-chip ${link.active ? "active" : ""}" href="${link.href}">${link.label}</a>
      `).join("")}
      ${savedView ? `<a class="filter-chip saved" href="${savedView.href}">Saved: ${savedView.label}</a>` : ""}
    </div>
    <div class="toolbar-actions">
      <span class="toolbar-meta">${visibleMembers.length} shown</span>
      <button class="ghost-button toolbar-button" type="button" data-action="save-view">Save view</button>
      ${savedView ? `<button class="ghost-button toolbar-button" type="button" data-action="clear-view">Clear saved</button>` : ""}
      <button class="ghost-button toolbar-button" type="button" data-action="export">Export CSV</button>
    </div>
  `;

  toolbarHost.querySelector('[data-action="save-view"]')?.addEventListener("click", () => {
    saveSavedView("roster", {
      label: currentViewLabel(),
      href: buildPageHref("./roster.html", {
        view: activeView,
        search: searchQuery,
        hash: "rosterTable"
      })
    });
    showToast("Saved roster view.", "success");
    renderToolbar(members);
  });

  toolbarHost.querySelector('[data-action="clear-view"]')?.addEventListener("click", () => {
    clearSavedView("roster");
    showToast("Cleared saved roster view.", "info");
    renderToolbar(members);
  });

  toolbarHost.querySelector('[data-action="export"]')?.addEventListener("click", () => {
    downloadCsv(
      "roster-export.csv",
      [
        { label: "Order", value: (member) => member.displayOrder },
        { label: "Name", value: (member) => member.name },
        { label: "Discord", value: (member) => member.discordName },
        { label: "Rank", value: (member) => member.rank },
        { label: "Status", value: (member) => member.status },
        { label: "Date Joined", value: (member) => formatDateOnly(member.dateJoined) }
      ],
      visibleMembers
    );
    showToast("Roster CSV exported.", "success");
  });
}

function renderMembers(members) {
  const visibleMembers = getVisibleMembers(members);

  if (!visibleMembers.length) {
    tableContainer.innerHTML = renderEmptyState(
      members.length ? "No matching roster members" : "No roster entries yet",
      members.length
        ? "Try a broader search or clear the current filter."
        : "Add the first roster member from the form on this page."
    );
    return;
  }

  if (!hasShownFilterMessage && (searchQuery || activeView)) {
    const filterParts = [];

    if (activeView) {
      filterParts.push(activeView.toUpperCase());
    }

    if (searchQuery) {
      filterParts.push(`search "${searchQuery}"`);
    }

    showToast(`Showing ${filterParts.join(" + ")} roster view.`, "info");
    hasShownFilterMessage = true;
  }

  tableContainer.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Name</th>
            <th>Discord</th>
            <th>Rank</th>
            <th>Status</th>
            <th>Date joined</th>
            <th>Action</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          ${visibleMembers.map((member) => `
            <tr class="${requestedRosterEditId === member.id ? "editing-row" : ""}">
              <td><strong>${member.displayOrder}</strong></td>
              <td>${member.name}</td>
              <td>${member.discordName}</td>
              <td>${member.rank}</td>
              <td>${rosterStatusBadge(member.status)}</td>
              <td>${formatDateOnly(member.dateJoined)}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-edit-member="${member.id}">Edit</button>
                </div>
              </td>
              <td>${formatDate(member.updatedAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  tableContainer.querySelectorAll("[data-edit-member]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedRosterEditId = button.dataset.editMember;
      updateUrlParams({ editMember: requestedRosterEditId });
      const member = rosterCache.find((entry) => entry.id === requestedRosterEditId);

      if (member) {
        fillRosterForm(member);
        rosterForm.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

async function loadRoster() {
  summaryGrid.innerHTML = renderMetricSkeleton(4);
  tableContainer.innerHTML = renderTableSkeleton(8, 6);

  try {
    const { members } = await api("/roster");
    rosterCache = members || [];
    renderSummary(rosterCache);
    renderToolbar(rosterCache);
    restoreDraftForm(rosterForm, "roster-form");
    renderMembers(rosterCache);
    maybeOpenRequestedEdit();
  } catch (error) {
    summaryGrid.innerHTML = renderEmptyState("Unable to load roster", error.message);
    tableContainer.innerHTML = "";
    showToast(error.message, "error");
  }
}

rosterForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(rosterError, "");

  const editingMemberId = rosterMemberIdField.value;
  const formData = new FormData(rosterForm);
  const payload = {
    name: formData.get("name"),
    discordName: formData.get("discordName"),
    rank: formData.get("rank"),
    status: formData.get("status"),
    dateJoined: formData.get("dateJoined"),
    displayOrder: Number(formData.get("displayOrder") || 0)
  };

  try {
    if (editingMemberId) {
      await api(`/roster/${editingMemberId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Roster member updated.", "success");
    } else {
      await api("/roster", {
        method: "POST",
        body: payload
      });
      showToast("Roster member created.", "success");
    }

    resetRosterForm({ clearDraftState: true });
    await loadRoster();
    announceMutation(["roster"]);
  } catch (error) {
    mountFormError(rosterError, error.message);
    showToast(error.message, "error");
  }
});

resetRosterButton?.addEventListener("click", () => {
  resetRosterForm({ clearDraftState: true });
});

subscribeToMutations(["roster"], () => {
  showToast("Live update received for roster.", "info");
  loadRoster();
});

resetRosterForm({ clearUrl: false });
restoreDraftForm(rosterForm, "roster-form");
loadRoster();
