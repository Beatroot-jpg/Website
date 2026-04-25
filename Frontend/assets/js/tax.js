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
  renderMetricSkeleton,
  renderTableSkeleton,
  showToast
} from "./ui.js";

initProtectedPage({
  pageKey: "TAX",
  title: "Tax tracker",
  subtitle: "Track paid access by expiry, renew it quickly, and let the system keep active versus inactive up to date automatically."
});

const summaryContainer = document.querySelector("#taxSummary");
const activeTableContainer = document.querySelector("#activeTaxTable");
const inactiveTableContainer = document.querySelector("#inactiveTaxTable");
const openTaxMemberFormButton = document.querySelector("#openTaxMemberFormButton");

const memberForm = document.querySelector("#taxMemberForm");
const memberFormHost = document.querySelector("#taxMemberFormHost");
const memberFormContent = document.querySelector("#taxMemberFormContent");
const memberFormTitle = document.querySelector("#taxMemberFormTitle");
const memberFormSubtitle = document.querySelector("#taxMemberFormSubtitle");
const memberFormError = document.querySelector("#taxMemberError");
const memberSubmitButton = document.querySelector("#taxMemberSubmitButton");
const resetMemberButton = document.querySelector("#resetTaxMemberForm");
const memberIdField = document.querySelector("#taxMemberId");
const employmentTypeField = document.querySelector("#taxEmploymentType");
const organizationField = document.querySelector("#taxOrganizationField");
const organizationInput = memberForm?.elements?.organizationName;
const initialRenewalFields = document.querySelector("#taxInitialRenewalFields");
const historyPanel = document.querySelector("#taxHistoryPanel");
const historyFeed = document.querySelector("#taxHistoryFeed");

const renewForm = document.querySelector("#taxRenewForm");
const renewFormHost = document.querySelector("#taxRenewFormHost");
const renewFormContent = document.querySelector("#taxRenewFormContent");
const renewFormTitle = document.querySelector("#taxRenewFormTitle");
const renewFormSubtitle = document.querySelector("#taxRenewFormSubtitle");
const renewMemberLabel = document.querySelector("#taxRenewMemberLabel");
const renewFormError = document.querySelector("#taxRenewError");
const renewSubmitButton = document.querySelector("#taxRenewSubmitButton");
const resetRenewButton = document.querySelector("#resetTaxRenewForm");
const renewMemberIdField = document.querySelector("#taxRenewMemberId");
const renewalIdField = document.querySelector("#taxRenewalId");

const initialParams = new URLSearchParams(window.location.search);
let requestedEditMemberId = initialParams.get("editMember") || "";
let requestedRenewMemberId = initialParams.get("renewMember") || "";
let requestedEditRenewalId = initialParams.get("editRenewal") || "";

let activeMembersCache = [];
let inactiveMembersCache = [];

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

function getAllMembers() {
  return [...activeMembersCache, ...inactiveMembersCache];
}

function findMemberById(memberId) {
  return getAllMembers().find((member) => member.id === memberId) || null;
}

function findRenewalById(renewalId) {
  for (const member of getAllMembers()) {
    const renewal = (member.history || []).find((entry) => entry.id === renewalId);

    if (renewal) {
      return { member, renewal };
    }
  }

  return null;
}

function normalizeEmploymentLabel(employmentType) {
  return `${employmentType || ""}`.charAt(0) + `${employmentType || ""}`.slice(1).toLowerCase();
}

function formatQuantity(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function employmentBadge(employmentType) {
  return badge(
    normalizeEmploymentLabel(employmentType),
    employmentType === "ORGANIZATION" ? "accent" : "neutral"
  );
}

function taxStatusBadge(member) {
  return badge(member.status === "ACTIVE" ? "Active" : "Inactive", member.status === "ACTIVE" ? "good" : "neutral");
}

function formatExpiryMeta(member) {
  if (!member.expiresAt) {
    return {
      headline: "No renewal history",
      detail: "Add a renewal to activate this tracker."
    };
  }

  if (member.active) {
    return {
      headline: formatDate(member.expiresAt),
      detail: member.daysRemaining <= 0
        ? "Expires today"
        : `${member.daysRemaining} day${member.daysRemaining === 1 ? "" : "s"} remaining`
    };
  }

  return {
    headline: formatDate(member.expiresAt),
    detail: "Access has expired"
  };
}

function setOrganizationFieldVisibility() {
  if (!organizationField || !organizationInput) {
    return;
  }

  const showOrganization = employmentTypeField?.value === "ORGANIZATION";
  organizationField.classList.toggle("hidden", !showOrganization);
  organizationInput.required = showOrganization;

  if (!showOrganization) {
    organizationInput.value = "";
  }
}

function renderSummary(summary = {}) {
  if (!summaryContainer) {
    return;
  }

  summaryContainer.innerHTML = `
    <div class="metric-grid">
      <article class="metric-card neutral">
        <p>Total tracked</p>
        <strong>${summary.tracked || 0}</strong>
        <small>Every freelancer and organization currently in the system</small>
      </article>
      <article class="metric-card good">
        <p>Active now</p>
        <strong>${summary.active || 0}</strong>
        <small>Currently covered by a live tax period</small>
      </article>
      <article class="metric-card neutral">
        <p>Inactive</p>
        <strong>${summary.inactive || 0}</strong>
        <small>Expired and ready for renewal when needed</small>
      </article>
    </div>
  `;
}

function renderHistory(member) {
  if (!historyFeed) {
    return;
  }

  if (!member?.history?.length) {
    historyFeed.innerHTML = renderEmptyState("No renewal history yet", "This tracker has not had any quantity entries recorded yet.");
    return;
  }

  historyFeed.innerHTML = member.history.map((entry) => `
    <article class="activity-card">
      <div>
        <strong>${formatQuantity(entry.quantityPaid)} units for ${entry.durationDays} day${entry.durationDays === 1 ? "" : "s"}</strong>
        <p>Expires ${formatDate(entry.expiresAt)}</p>
        <small class="subtle-row">Recorded ${formatDate(entry.createdAt)}${entry.createdByName ? ` by ${entry.createdByName}` : ""}${entry.notes ? ` - ${entry.notes}` : ""}</small>
      </div>
      <div class="activity-meta">
        ${entry.isLatest ? badge("Latest", "accent") : badge("History", "neutral")}
        <div class="inline-table-actions">
          <button class="mini-action" type="button" data-edit-renewal="${entry.id}">Edit</button>
          <button class="mini-action danger-action" type="button" data-delete-renewal="${entry.id}" data-member-id="${member.id}">Delete</button>
        </div>
      </div>
    </article>
  `).join("");

  historyFeed.querySelectorAll("[data-edit-renewal]").forEach((button) => {
    button.addEventListener("click", () => openRenewModalForRenewal(button.dataset.editRenewal));
  });

  historyFeed.querySelectorAll("[data-delete-renewal]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await deleteRenewal(button.dataset.deleteRenewal, button.dataset.memberId);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

function resetMemberForm({ clearUrl = true } = {}) {
  memberForm.reset();
  memberIdField.value = "";
  memberFormTitle.textContent = "Create tax tracker";
  memberFormSubtitle.textContent = "Add the person once, then renew their access period whenever they pay again.";
  memberSubmitButton.textContent = "Create tracker";
  initialRenewalFields?.classList.remove("hidden");
  historyPanel?.classList.add("hidden");
  historyFeed.innerHTML = "";
  mountFormError(memberFormError, "");
  memberForm.elements.durationDays.value = "7";
  employmentTypeField.value = "FREELANCER";
  setOrganizationFieldVisibility();

  if (clearUrl) {
    requestedEditMemberId = "";
    updateUrlParams({}, ["editMember"]);
  }
}

function fillMemberForm(member) {
  memberIdField.value = member.id;
  memberFormTitle.textContent = `Edit ${member.fullName}`;
  memberFormSubtitle.textContent = "Update the person details here. Renewals stay below so you can correct them without rebuilding the tracker.";
  memberSubmitButton.textContent = "Save tracker";
  initialRenewalFields?.classList.add("hidden");
  historyPanel?.classList.remove("hidden");
  mountFormError(memberFormError, "");

  memberForm.elements.fullName.value = member.fullName;
  memberForm.elements.mobileNumber.value = member.mobileNumber;
  memberForm.elements.employmentType.value = member.employmentType;
  memberForm.elements.organizationName.value = member.organizationName || "";
  memberForm.elements.notes.value = member.notes || "";

  setOrganizationFieldVisibility();
  renderHistory(member);
}

function resetRenewForm({ clearUrl = true } = {}) {
  renewForm.reset();
  renewMemberIdField.value = "";
  renewalIdField.value = "";
  renewFormTitle.textContent = "Renew access";
  renewFormSubtitle.textContent = "Add time onto this tracker. The expiry will extend automatically from the current live end date when needed.";
  renewMemberLabel.textContent = "Renewing access for";
  renewSubmitButton.textContent = "Save renewal";
  mountFormError(renewFormError, "");
  renewForm.elements.durationDays.value = "7";

  if (clearUrl) {
    requestedRenewMemberId = "";
    requestedEditRenewalId = "";
    updateUrlParams({}, ["renewMember", "editRenewal"]);
  }
}

function fillRenewForm(member, renewal = null) {
  renewMemberIdField.value = member.id;
  renewalIdField.value = renewal?.id || "";
  renewMemberLabel.textContent = `Renewing access for ${member.fullName}`;
  renewFormTitle.textContent = renewal ? `Edit renewal for ${member.fullName}` : `Renew ${member.fullName}`;
  renewFormSubtitle.textContent = renewal
    ? "Correct this renewal and the access timeline will recalculate automatically."
    : "Add a new quantity entry and the tracker will extend from the current expiry if they are still active.";
  renewSubmitButton.textContent = renewal ? "Save changes" : "Add renewal";
  mountFormError(renewFormError, "");

  renewForm.elements.quantityPaid.value = renewal ? `${renewal.quantityPaid}` : `${member.currentQuantityPaid || ""}`;
  renewForm.elements.durationDays.value = renewal ? `${renewal.durationDays}` : `${member.currentDurationDays || 7}`;
  renewForm.elements.notes.value = renewal?.notes || "";
}

function showMemberModal(opener = document.activeElement) {
  openFormModal({
    content: memberFormContent,
    host: memberFormHost,
    focusSelector: '[name="fullName"]',
    opener,
    onClose: () => {
      if (requestedEditMemberId) {
        requestedEditMemberId = "";
        updateUrlParams({}, ["editMember"]);
      }
    }
  });
}

function showRenewModal(opener = document.activeElement) {
  openFormModal({
    content: renewFormContent,
    host: renewFormHost,
    focusSelector: '[name="quantityPaid"]',
    opener,
    onClose: () => {
      if (requestedRenewMemberId || requestedEditRenewalId) {
        requestedRenewMemberId = "";
        requestedEditRenewalId = "";
        updateUrlParams({}, ["renewMember", "editRenewal"]);
      }
    }
  });
}

function openMemberEditor(memberId, opener = document.activeElement) {
  const member = findMemberById(memberId);

  if (!member) {
    showToast("That tax tracker could not be found.", "error");
    return;
  }

  requestedEditMemberId = memberId;
  requestedRenewMemberId = "";
  requestedEditRenewalId = "";
  updateUrlParams({ editMember: memberId }, ["renewMember", "editRenewal"]);
  fillMemberForm(member);
  showMemberModal(opener);
}

function openRenewModalForMember(memberId, opener = document.activeElement) {
  const member = findMemberById(memberId);

  if (!member) {
    showToast("That tax tracker could not be found.", "error");
    return;
  }

  requestedEditMemberId = "";
  requestedRenewMemberId = memberId;
  requestedEditRenewalId = "";
  updateUrlParams({ renewMember: memberId }, ["editMember", "editRenewal"]);
  resetRenewForm({ clearUrl: false });
  fillRenewForm(member);
  showRenewModal(opener);
}

function openRenewModalForRenewal(renewalId, opener = document.activeElement) {
  const result = findRenewalById(renewalId);

  if (!result) {
    showToast("That renewal could not be found.", "error");
    return;
  }

  requestedEditMemberId = "";
  requestedRenewMemberId = "";
  requestedEditRenewalId = renewalId;
  updateUrlParams({ editRenewal: renewalId }, ["editMember", "renewMember"]);
  resetRenewForm({ clearUrl: false });
  fillRenewForm(result.member, result.renewal);
  showRenewModal(opener);
}

function maybeOpenRequestedModal() {
  if (requestedEditRenewalId) {
    const result = findRenewalById(requestedEditRenewalId);

    if (result) {
      resetRenewForm({ clearUrl: false });
      fillRenewForm(result.member, result.renewal);
      showRenewModal();
    } else {
      requestedEditRenewalId = "";
      updateUrlParams({}, ["editRenewal"]);
      showToast("That renewal could not be found.", "error");
    }

    return;
  }

  if (requestedRenewMemberId) {
    const member = findMemberById(requestedRenewMemberId);

    if (member) {
      resetRenewForm({ clearUrl: false });
      fillRenewForm(member);
      showRenewModal();
    } else {
      requestedRenewMemberId = "";
      updateUrlParams({}, ["renewMember"]);
      showToast("That tax tracker could not be found.", "error");
    }

    return;
  }

  if (requestedEditMemberId) {
    const member = findMemberById(requestedEditMemberId);

    if (member) {
      fillMemberForm(member);
      showMemberModal();
    } else {
      requestedEditMemberId = "";
      updateUrlParams({}, ["editMember"]);
      showToast("That tax tracker could not be found.", "error");
    }
  }
}

function renderMembersTable(container, members, { emptyTitle, emptyMessage, emptyActionLabel } = {}) {
  if (!container) {
    return;
  }

  if (!members.length) {
    container.innerHTML = renderEmptyState(emptyTitle, emptyMessage || emptyActionLabel || "No records yet.");
    return;
  }

  container.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Contact</th>
            <th>Type</th>
            <th>Access</th>
            <th>Latest quantity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${members.map((member) => {
            const expiryMeta = formatExpiryMeta(member);
            const latestRenewal = member.history?.[0] || null;
            const rowEditing = requestedEditMemberId === member.id
              || requestedRenewMemberId === member.id
              || member.history?.some((entry) => entry.id === requestedEditRenewalId);

            return `
              <tr class="${rowEditing ? "editing-row" : ""}">
                <td>
                  <strong>${member.fullName}</strong>
                  <span class="subtle-row">${member.organizationName || (member.notes || "No extra notes")}</span>
                </td>
                <td>
                  <strong>${member.mobileNumber}</strong>
                  <span class="subtle-row">${member.active ? "Currently covered" : "Needs renewal"}</span>
                </td>
                <td>
                  <div class="badge-group">
                    ${employmentBadge(member.employmentType)}
                    ${taxStatusBadge(member)}
                  </div>
                </td>
                <td>
                  <strong>${expiryMeta.headline}</strong>
                  <span class="subtle-row">${expiryMeta.detail}</span>
                </td>
                <td>
                  ${latestRenewal
                    ? `<strong>${formatQuantity(latestRenewal.quantityPaid)} units</strong><span class="subtle-row">${latestRenewal.durationDays} day${latestRenewal.durationDays === 1 ? "" : "s"} / ${formatDate(latestRenewal.createdAt)}</span>`
                    : `<strong>No quantity recorded yet</strong><span class="subtle-row">Create the first renewal to start tracking access.</span>`}
                </td>
                <td>
                  <div class="inline-table-actions">
                    <button class="mini-action" type="button" data-renew-member="${member.id}">Renew</button>
                    <button class="mini-action" type="button" data-edit-member="${member.id}">Edit</button>
                    <button class="mini-action danger-action" type="button" data-delete-member="${member.id}">Delete</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll("[data-edit-member]").forEach((button) => {
    button.addEventListener("click", () => openMemberEditor(button.dataset.editMember, button));
  });

  container.querySelectorAll("[data-renew-member]").forEach((button) => {
    button.addEventListener("click", () => openRenewModalForMember(button.dataset.renewMember, button));
  });

  container.querySelectorAll("[data-delete-member]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await deleteMember(button.dataset.deleteMember);
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });
}

async function deleteMember(memberId) {
  const member = findMemberById(memberId);

  if (!member) {
    showToast("That tax tracker could not be found.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete ${member.fullName} and all of their tax history?`);

  if (!confirmed) {
    return;
  }

  await api(`/tax/${memberId}`, {
    method: "DELETE"
  });

  if (requestedEditMemberId === memberId || requestedRenewMemberId === memberId) {
    requestedEditMemberId = "";
    requestedRenewMemberId = "";
    requestedEditRenewalId = "";
    closeFormModal();
  }

  showToast("Tax tracker removed.", "success");
  await loadTax();
  announceMutation(["tax"]);
}

async function deleteRenewal(renewalId, memberId) {
  const result = findRenewalById(renewalId);

  if (!result) {
    showToast("That renewal could not be found.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete the ${formatQuantity(result.renewal.quantityPaid)} unit renewal for ${result.member.fullName}?`);

  if (!confirmed) {
    return;
  }

  await api(`/tax/renewals/${renewalId}`, {
    method: "DELETE"
  });

  requestedEditMemberId = memberId;
  requestedRenewMemberId = "";
  requestedEditRenewalId = "";
  closeFormModal();
  showToast("Renewal removed.", "success");
  await loadTax();
  announceMutation(["tax"]);
}

async function loadTax() {
  summaryContainer.innerHTML = renderMetricSkeleton(4);
  activeTableContainer.innerHTML = renderTableSkeleton(6, 4);
  inactiveTableContainer.innerHTML = renderTableSkeleton(6, 4);

  try {
    const data = await api("/tax");
    activeMembersCache = data.activeMembers || [];
    inactiveMembersCache = data.inactiveMembers || [];

    renderSummary(data.summary || {});
    renderMembersTable(activeTableContainer, activeMembersCache, {
      emptyTitle: "No active tax trackers",
      emptyMessage: "Create the first tracker or renew someone to make them active."
    });
    renderMembersTable(inactiveTableContainer, inactiveMembersCache, {
      emptyTitle: "No inactive tax trackers",
      emptyMessage: "Expired trackers will land here automatically when their access ends."
    });
    maybeOpenRequestedModal();
  } catch (error) {
    const fallback = renderEmptyState("Unable to load tax data", error.message);
    summaryContainer.innerHTML = fallback;
    activeTableContainer.innerHTML = fallback;
    inactiveTableContainer.innerHTML = fallback;
    showToast(error.message, "error");
  }
}

memberForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(memberFormError, "");

  const editingMemberId = memberIdField.value;
  const formData = new FormData(memberForm);
  const payload = {
    fullName: formData.get("fullName"),
    mobileNumber: formData.get("mobileNumber"),
    employmentType: formData.get("employmentType"),
    organizationName: formData.get("organizationName"),
    notes: formData.get("notes")
  };

  if (!editingMemberId) {
    payload.quantityPaid = Number(formData.get("quantityPaid") || 0);
    payload.durationDays = Number(formData.get("durationDays") || 0);
    payload.periodNotes = formData.get("periodNotes");
  }

  try {
    if (editingMemberId) {
      await api(`/tax/${editingMemberId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Tax tracker updated.", "success");
    } else {
      await api("/tax", {
        method: "POST",
        body: payload
      });
      showToast("Tax tracker created.", "success");
    }

    resetMemberForm();
    closeFormModal();
    await loadTax();
    announceMutation(["tax"]);
  } catch (error) {
    mountFormError(memberFormError, error.message);
    showToast(error.message, "error");
  }
});

renewForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(renewFormError, "");

  const memberId = renewMemberIdField.value;
  const renewalId = renewalIdField.value;
  const formData = new FormData(renewForm);
  const payload = {
    quantityPaid: Number(formData.get("quantityPaid") || 0),
    durationDays: Number(formData.get("durationDays") || 0),
    notes: formData.get("notes")
  };

  try {
    if (renewalId) {
      await api(`/tax/renewals/${renewalId}`, {
        method: "PATCH",
        body: payload
      });
      showToast("Renewal updated.", "success");
    } else {
      await api(`/tax/${memberId}/renewals`, {
        method: "POST",
        body: payload
      });
      showToast("Renewal added.", "success");
    }

    requestedEditMemberId = memberId;
    requestedRenewMemberId = "";
    requestedEditRenewalId = "";
    closeFormModal();
    await loadTax();
    announceMutation(["tax"]);
  } catch (error) {
    mountFormError(renewFormError, error.message);
    showToast(error.message, "error");
  }
});

resetMemberButton?.addEventListener("click", () => {
  resetMemberForm();
});

resetRenewButton?.addEventListener("click", () => {
  resetRenewForm();
});

employmentTypeField?.addEventListener("change", () => {
  setOrganizationFieldVisibility();
});

openTaxMemberFormButton?.addEventListener("click", () => {
  requestedEditMemberId = "";
  requestedRenewMemberId = "";
  requestedEditRenewalId = "";
  resetMemberForm({ clearUrl: false });
  updateUrlParams({}, ["editMember", "renewMember", "editRenewal"]);
  showMemberModal(openTaxMemberFormButton);
});

subscribeToMutations(["tax"], () => {
  showToast("Live update received for tax.", "info");
  loadTax();
});

resetMemberForm({ clearUrl: false });
resetRenewForm({ clearUrl: false });
loadTax();
