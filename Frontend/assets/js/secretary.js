import { api } from "./api.js";
import { announceMutation, subscribeToMutations } from "./live.js";
import {
  badge,
  closeFormModal,
  formatDate,
  formatDateOnly,
  initProtectedPage,
  mountFormError,
  openFormModal,
  renderEmptyState,
  renderMetricSkeleton,
  renderTableSkeleton,
  showToast
} from "./ui.js";
import { hasPermission } from "./session.js";
import { bindDraftForm, restoreDraftForm } from "./workflow.js";

initProtectedPage({
  pageKey: "SECRETARY",
  requiredPermission: null,
  title: "Secretary workspace",
  subtitle: "Organize meetings, write records, and keep the organization aligned from one simple panel."
});

const summaryGrid = document.querySelector("#secretarySummary");
const meetingTable = document.querySelector("#meetingTable");
const meetingPaginationContainer = document.querySelector("#meetingPagination");
const recordTable = document.querySelector("#recordTable");
const recordPaginationContainer = document.querySelector("#recordPagination");
const calendarToolbar = document.querySelector("#calendarToolbar");
const calendarGrid = document.querySelector("#calendarGrid");

const meetingForm = document.querySelector("#meetingForm");
const meetingError = document.querySelector("#meetingError");
const meetingIdField = document.querySelector("#meetingId");
const meetingAudienceSelect = document.querySelector("#meetingAudience");
const meetingFormTitle = document.querySelector("#meetingFormTitle");
const meetingFormSubtitle = document.querySelector("#meetingFormSubtitle");
const meetingSubmitButton = document.querySelector("#meetingSubmitButton");
const resetMeetingButton = document.querySelector("#resetMeetingForm");
const openMeetingFormButton = document.querySelector("#openMeetingFormButton");
const meetingCreateCard = document.querySelector("#meetingCreateCard");
const meetingFormHost = document.querySelector("#meetingFormHost");
const meetingFormContent = document.querySelector("#meetingFormContent");

const recordForm = document.querySelector("#recordForm");
const recordError = document.querySelector("#recordError");
const recordIdField = document.querySelector("#recordId");
const recordMeetingSelect = document.querySelector("#recordMeetingId");
const recordAudienceSelect = document.querySelector("#recordAudience");
const recordFormTitle = document.querySelector("#recordFormTitle");
const recordFormSubtitle = document.querySelector("#recordFormSubtitle");
const recordSubmitButton = document.querySelector("#recordSubmitButton");
const resetRecordButton = document.querySelector("#resetRecordForm");
const openRecordFormButton = document.querySelector("#openRecordFormButton");
const recordCreateCard = document.querySelector("#recordCreateCard");
const recordFormHost = document.querySelector("#recordFormHost");
const recordFormContent = document.querySelector("#recordFormContent");
const detailHost = document.querySelector("#secretaryDetailHost");
const detailContent = document.querySelector("#secretaryDetailContent");

const params = new URLSearchParams(window.location.search);
let currentMeetingPage = Number.parseInt(params.get("meetingPage") || "1", 10);
let currentRecordPage = Number.parseInt(params.get("recordPage") || "1", 10);
let requestedMeetingEditId = params.get("editMeeting") || "";
let requestedRecordEditId = params.get("editRecord") || "";
let requestedMeetingViewId = params.get("viewMeeting") || "";
let requestedRecordViewId = params.get("viewRecord") || "";
let meetingsCache = [];
let recordsCache = [];
let audienceOptions = [];
let currentCalendarMonth = new Date();
const meetingPageSize = 8;
const recordPageSize = 8;
let viewerState = {
  canEdit: hasPermission("SECRETARY"),
  discordScheduledEventsEnabled: false
};

const meetingDraft = bindDraftForm(meetingForm, "secretary-meeting-form-v1");
const recordDraft = bindDraftForm(recordForm, "secretary-record-form-v1");

if (meetingDraft.restored || recordDraft.restored) {
  showToast("Restored saved secretary drafts.", "info");
}

if (!Number.isFinite(currentMeetingPage) || currentMeetingPage < 1) {
  currentMeetingPage = 1;
}

if (!Number.isFinite(currentRecordPage) || currentRecordPage < 1) {
  currentRecordPage = 1;
}

function updateUrlParams(updates = {}, removeKeys = []) {
  const nextParams = new URLSearchParams(window.location.search);

  Object.entries(updates).forEach(([key, value]) => {
    if (value) {
      nextParams.set(key, value);
    } else {
      nextParams.delete(key);
    }
  });

  removeKeys.forEach((key) => nextParams.delete(key));
  const query = nextParams.toString();
  window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

function monthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function clampPage(page, totalPages) {
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.min(page, Math.max(1, totalPages || 1));
}

function paginateArray(items, page, pageSize) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = clampPage(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages
    }
  };
}

function toInputDateTimeValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function meetingStatusBadge(status) {
  const normalized = `${status || ""}`.toUpperCase();
  const tone = normalized === "COMPLETED"
    ? "good"
    : normalized === "CANCELLED"
      ? "danger"
      : "accent";

  return badge(normalized.replaceAll("_", " "), tone);
}

function recordTypeBadge(type) {
  const normalized = `${type || ""}`.toUpperCase();
  const label = normalized === "MEETING_MINUTES"
    ? "Meeting minutes"
    : normalized === "JOURNAL_ENTRY"
      ? "Journal entry"
      : "Notice";
  const tone = normalized === "NOTICE" ? "accent" : normalized === "JOURNAL_ENTRY" ? "neutral" : "good";

  return badge(label, tone);
}

function audienceLabel(value) {
  if (!value) {
    return "No ping";
  }

  return audienceOptions.find((entry) => entry.key === value)?.label || value;
}

function applyAccessState() {
  meetingCreateCard?.classList.toggle("hidden", !viewerState.canEdit);
  recordCreateCard?.classList.toggle("hidden", !viewerState.canEdit);

  if (!viewerState.canEdit) {
    meetingFormHost?.classList.add("hidden");
    recordFormHost?.classList.add("hidden");
  } else {
    meetingFormHost?.classList.remove("hidden");
    recordFormHost?.classList.remove("hidden");
  }
}

function summarizeMeetingTime(meeting) {
  const start = formatDate(meeting.startsAt);
  const end = meeting.endsAt ? formatDate(meeting.endsAt) : "";
  return end ? `${start} to ${end}` : start;
}

function meetingDiscordBadge(meeting) {
  if (!meeting.syncToDiscordEvents) {
    return "";
  }

  return meeting.discordEventId
    ? badge("Discord RSVP event synced", "accent")
    : badge("Discord RSVP event pending", "warn");
}

function fillMeetingDetail(meeting) {
  detailContent.innerHTML = `
    <div class="panel-header">
      <h2>${meeting.title}</h2>
      <p>Read the meeting details here without opening the edit workflow.</p>
    </div>
    <div class="stack-list">
      <article class="activity-card">
        <div>
          <strong>When</strong>
          <p>${summarizeMeetingTime(meeting)}</p>
        </div>
        <div class="activity-meta">
          ${meetingStatusBadge(meeting.status)}
        </div>
      </article>
      <article class="activity-card">
        <div>
          <strong>Location</strong>
          <p>${meeting.location || "Location not set"}</p>
        </div>
      </article>
      <article class="activity-card">
        <div>
          <strong>Audience</strong>
          <p>${audienceLabel(meeting.audience)}</p>
        </div>
      </article>
      <article class="activity-card">
        <div>
          <strong>Agenda / details</strong>
          <p>${meeting.details || "No agenda saved yet."}</p>
        </div>
      </article>
      <article class="activity-card">
        <div>
          <strong>Discord RSVP event</strong>
          <p>${meeting.syncToDiscordEvents ? "Enabled for this meeting." : "Not enabled for this meeting."}</p>
        </div>
        <div class="activity-meta">
          ${meetingDiscordBadge(meeting) || badge("Not enabled", "neutral")}
        </div>
      </article>
    </div>
  `;
}

function fillRecordDetail(record) {
  detailContent.innerHTML = `
    <div class="panel-header">
      <h2>${record.title}</h2>
      <p>Read the full archive entry here without opening the edit workflow.</p>
    </div>
    <div class="stack-list">
      <article class="activity-card">
        <div>
          <strong>Type</strong>
          <p>${record.type.replaceAll("_", " ")}</p>
        </div>
        <div class="activity-meta">
          ${recordTypeBadge(record.type)}
        </div>
      </article>
      <article class="activity-card">
        <div>
          <strong>Linked meeting</strong>
          <p>${record.meeting ? `${record.meeting.title} - ${formatDate(record.meeting.startsAt)}` : "No linked meeting"}</p>
        </div>
      </article>
      <article class="activity-card">
        <div>
          <strong>Audience</strong>
          <p>${audienceLabel(record.audience)}</p>
        </div>
      </article>
      <article class="activity-card">
        <div>
          <strong>Summary</strong>
          <p>${record.summary || "No short summary saved."}</p>
        </div>
      </article>
      <article class="activity-card">
        <div>
          <strong>Full content</strong>
          <p>${record.content}</p>
        </div>
      </article>
    </div>
  `;
}

function toIsoFromLocalInput(value) {
  return value ? new Date(value).toISOString() : "";
}

function renderSummary(summary = {}) {
  summaryGrid.innerHTML = `
    <article class="metric-card neutral">
      <p>Upcoming meetings</p>
      <strong>${summary.upcomingMeetings || 0}</strong>
      <small>Still scheduled ahead</small>
    </article>
    <article class="metric-card accent">
      <p>Meetings this week</p>
      <strong>${summary.thisWeekMeetings || 0}</strong>
      <small>Inside the current week</small>
    </article>
    <article class="metric-card good">
      <p>Archive records</p>
      <strong>${summary.recordCount || 0}</strong>
      <small>Minutes, notices, and journals</small>
    </article>
    <article class="metric-card warn">
      <p>Meeting minutes</p>
      <strong>${summary.minutesCount || 0}</strong>
      <small>Saved to the organization archive</small>
    </article>
  `;
}

function visibleMeetings() {
  const today = new Date();
  const floor = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  return meetingsCache
    .filter((meeting) => new Date(meeting.startsAt) >= floor || meeting.status === "SCHEDULED")
    .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));
}

function populateRecordMeetingOptions(selectedMeeting = null) {
  const options = [...meetingsCache];

  if (selectedMeeting && !options.some((meeting) => meeting.id === selectedMeeting.id)) {
    options.push(selectedMeeting);
  }

  options.sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt));

  recordMeetingSelect.innerHTML = `
    <option value="">No linked meeting</option>
    ${options.map((meeting) => `
      <option value="${meeting.id}">
        ${meeting.title} - ${formatDate(meeting.startsAt)}
      </option>
    `).join("")}
  `;
}

function populateAudienceOptions() {
  const optionsMarkup = (audienceOptions.length ? audienceOptions : [{ key: "NONE", label: "No ping" }]).map((option) => `
    <option value="${option.key}">${option.label}</option>
  `).join("");

  meetingAudienceSelect.innerHTML = optionsMarkup;
  recordAudienceSelect.innerHTML = optionsMarkup;
}

function resetMeetingForm({ clearDraftState = false, clearUrl = true } = {}) {
  meetingForm.reset();
  meetingIdField.value = "";
  meetingFormTitle.textContent = "Create meeting";
  meetingFormSubtitle.textContent = "Add the core meeting details here, then save to push it into the schedule and calendar.";
  meetingSubmitButton.textContent = "Save meeting";
  meetingForm.elements.status.value = "SCHEDULED";
  meetingForm.elements.broadcastToDiscord.checked = false;
  meetingForm.elements.syncDiscordEvent.checked = false;
  populateAudienceOptions();
  meetingForm.elements.audience.value = "NONE";
  mountFormError(meetingError, "");

  if (clearDraftState) {
    meetingDraft.clearDraft();
  }

  if (clearUrl) {
    requestedMeetingEditId = "";
    updateUrlParams({ editMeeting: "" }, ["editMeeting"]);
  }
}

function resetRecordForm({ clearDraftState = false, clearUrl = true } = {}) {
  recordForm.reset();
  recordIdField.value = "";
  recordFormTitle.textContent = "Create record";
  recordFormSubtitle.textContent = "Choose the record type first, then write the summary and full content in one place.";
  recordSubmitButton.textContent = "Save record";
  recordForm.elements.type.value = "MEETING_MINUTES";
  populateRecordMeetingOptions();
  populateAudienceOptions();
  recordForm.elements.audience.value = "NONE";
  recordForm.elements.broadcastToDiscord.checked = false;
  mountFormError(recordError, "");

  if (clearDraftState) {
    recordDraft.clearDraft();
  }

  if (clearUrl) {
    requestedRecordEditId = "";
    updateUrlParams({ editRecord: "" }, ["editRecord"]);
  }
}

function fillMeetingForm(meeting) {
  meetingIdField.value = meeting.id;
  meetingFormTitle.textContent = `Edit ${meeting.title}`;
  meetingFormSubtitle.textContent = "Update the meeting details here. This same record can later power Discord announcements.";
  meetingSubmitButton.textContent = "Save changes";
  mountFormError(meetingError, "");
  meetingForm.elements.title.value = meeting.title;
  meetingForm.elements.startsAt.value = toInputDateTimeValue(meeting.startsAt);
  meetingForm.elements.endsAt.value = toInputDateTimeValue(meeting.endsAt);
  meetingForm.elements.location.value = meeting.location || "";
  populateAudienceOptions();
  meetingForm.elements.audience.value = meeting.audience || "NONE";
  meetingForm.elements.details.value = meeting.details || "";
  meetingForm.elements.status.value = meeting.status;
  meetingForm.elements.broadcastToDiscord.checked = false;
  meetingForm.elements.syncDiscordEvent.checked = Boolean(meeting.syncToDiscordEvents);
}

function fillRecordForm(record) {
  recordIdField.value = record.id;
  recordFormTitle.textContent = `Edit ${record.title}`;
  recordFormSubtitle.textContent = "Update the organization record here so the archive stays accurate and easy to trust.";
  recordSubmitButton.textContent = "Save changes";
  populateRecordMeetingOptions(record.meeting);
  populateAudienceOptions();
  mountFormError(recordError, "");
  recordForm.elements.type.value = record.type;
  recordForm.elements.title.value = record.title;
  recordForm.elements.meetingId.value = record.meetingId || "";
  recordForm.elements.audience.value = record.audience || "NONE";
  recordForm.elements.summary.value = record.summary || "";
  recordForm.elements.content.value = record.content || "";
  recordForm.elements.broadcastToDiscord.checked = false;
}

function showMeetingModal(opener = document.activeElement) {
  openFormModal({
    content: meetingFormContent,
    host: meetingFormHost,
    focusSelector: '[name="title"]',
    opener,
    onClose: () => {
      if (requestedMeetingEditId) {
        requestedMeetingEditId = "";
        updateUrlParams({ editMeeting: "" }, ["editMeeting"]);
      }
    }
  });
}

function showRecordModal(opener = document.activeElement) {
  openFormModal({
    content: recordFormContent,
    host: recordFormHost,
    focusSelector: '[name="title"]',
    opener,
    onClose: () => {
      if (requestedRecordEditId) {
        requestedRecordEditId = "";
        updateUrlParams({ editRecord: "" }, ["editRecord"]);
      }
    }
  });
}

function showDetailModal(opener = document.activeElement, clearKeys = []) {
  openFormModal({
    content: detailContent,
    host: detailHost,
    focusSelector: ".form-modal-close",
    opener,
    onClose: () => {
      const updates = {};
      clearKeys.forEach((key) => {
        updates[key] = "";
      });
      updateUrlParams(updates, clearKeys);
      if (clearKeys.includes("viewMeeting")) {
        requestedMeetingViewId = "";
      }
      if (clearKeys.includes("viewRecord")) {
        requestedRecordViewId = "";
      }
    }
  });
}

function maybeOpenRequestedEdit() {
  if (!viewerState.canEdit && requestedMeetingEditId) {
    requestedMeetingViewId = requestedMeetingEditId;
    requestedMeetingEditId = "";
    updateUrlParams({ editMeeting: "", viewMeeting: requestedMeetingViewId }, ["editMeeting"]);
  }

  if (!viewerState.canEdit && requestedRecordEditId) {
    requestedRecordViewId = requestedRecordEditId;
    requestedRecordEditId = "";
    updateUrlParams({ editRecord: "", viewRecord: requestedRecordViewId }, ["editRecord"]);
  }

  if (requestedMeetingViewId) {
    const meeting = meetingsCache.find((entry) => entry.id === requestedMeetingViewId);

    if (meeting) {
      fillMeetingDetail(meeting);
      showDetailModal(undefined, ["viewMeeting"]);
      return;
    }

    requestedMeetingViewId = "";
    updateUrlParams({ viewMeeting: "" }, ["viewMeeting"]);
    showToast("That meeting could not be found.", "error");
  }

  if (requestedRecordViewId) {
    const record = recordsCache.find((entry) => entry.id === requestedRecordViewId);

    if (record) {
      fillRecordDetail(record);
      showDetailModal(undefined, ["viewRecord"]);
      return;
    }

    requestedRecordViewId = "";
    updateUrlParams({ viewRecord: "" }, ["viewRecord"]);
    showToast("That record could not be found.", "error");
  }

  if (requestedMeetingEditId) {
    const meeting = meetingsCache.find((entry) => entry.id === requestedMeetingEditId);

    if (meeting) {
      fillMeetingForm(meeting);
      showMeetingModal();
      return;
    }

    requestedMeetingEditId = "";
    updateUrlParams({ editMeeting: "" }, ["editMeeting"]);
    showToast("That meeting could not be found.", "error");
  }

  if (requestedRecordEditId) {
    const record = recordsCache.find((entry) => entry.id === requestedRecordEditId);

    if (record) {
      fillRecordForm(record);
      showRecordModal();
      return;
    }

    requestedRecordEditId = "";
    updateUrlParams({ editRecord: "" }, ["editRecord"]);
    showToast("That record could not be found.", "error");
  }
}

function renderMeetings() {
  const allMeetings = visibleMeetings();
  const previousPage = currentMeetingPage;
  const { items: meetings, pagination } = paginateArray(allMeetings, currentMeetingPage, meetingPageSize);
  currentMeetingPage = pagination.page;

  if (currentMeetingPage !== previousPage) {
    updateUrlParams({ meetingPage: `${currentMeetingPage}` });
  }

  if (!meetings.length) {
    meetingTable.innerHTML = renderEmptyState("No meetings scheduled", "Use the create meeting button above to add the first meeting slot.");
    renderMeetingPagination(pagination);
    return;
  }

  meetingTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Meeting</th>
            <th>When</th>
            <th>Audience</th>
            <th>Status</th>
            <th>Records</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${meetings.map((meeting) => `
            <tr class="${requestedMeetingEditId === meeting.id ? "editing-row" : ""}">
              <td>
                <strong>${meeting.title}</strong>
                <span class="subtle-row">${meeting.location || "Location not set"}</span>
                ${meeting.syncToDiscordEvents ? `<div class="badge-group">${meetingDiscordBadge(meeting)}</div>` : ""}
              </td>
              <td>${summarizeMeetingTime(meeting)}</td>
              <td>${audienceLabel(meeting.audience)}</td>
              <td>${meetingStatusBadge(meeting.status)}</td>
              <td>${meeting._count?.records || 0}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-view-meeting="${meeting.id}">View</button>
                  ${viewerState.canEdit ? `<button class="mini-action" type="button" data-broadcast-meeting="${meeting.id}">Broadcast</button>` : ""}
                  ${viewerState.canEdit ? `<button class="mini-action" type="button" data-edit-meeting="${meeting.id}">Edit</button>` : ""}
                  ${viewerState.canEdit ? `<button class="mini-action danger-action" type="button" data-delete-meeting="${meeting.id}">Delete</button>` : ""}
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  meetingTable.querySelectorAll("[data-edit-meeting]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedMeetingEditId = button.dataset.editMeeting;
      updateUrlParams({ editMeeting: requestedMeetingEditId });
      const meeting = meetingsCache.find((entry) => entry.id === requestedMeetingEditId);

      if (meeting) {
        fillMeetingForm(meeting);
        showMeetingModal(button);
      }
    });
  });

  meetingTable.querySelectorAll("[data-view-meeting]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedMeetingViewId = button.dataset.viewMeeting;
      updateUrlParams({ viewMeeting: requestedMeetingViewId }, ["editMeeting"]);
      const meeting = meetingsCache.find((entry) => entry.id === requestedMeetingViewId);

      if (meeting) {
        fillMeetingDetail(meeting);
        showDetailModal(button, ["viewMeeting"]);
      }
    });
  });

  meetingTable.querySelectorAll("[data-broadcast-meeting]").forEach((button) => {
    button.addEventListener("click", async () => {
      const meeting = meetingsCache.find((entry) => entry.id === button.dataset.broadcastMeeting);

      if (!meeting) {
        return;
      }

      try {
        const response = await api(`/secretary/meetings/${meeting.id}/broadcast`, {
          method: "POST"
        });

        if (response.discord?.posted && response.discordEvent?.synced) {
          showToast("Meeting posted to Discord and synced to Discord Events.", "success");
        } else if (response.discord?.posted) {
          showToast("Meeting posted to Discord.", "success");
          if (response.discordEvent?.message && meeting.syncToDiscordEvents) {
            showToast(response.discordEvent.message, "warn");
          }
        } else if (response.discord?.message) {
          showToast(response.discord.message, "warn");
        } else {
          showToast("Discord broadcast did not complete.", "warn");
        }
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  meetingTable.querySelectorAll("[data-delete-meeting]").forEach((button) => {
    button.addEventListener("click", async () => {
      const meeting = meetingsCache.find((entry) => entry.id === button.dataset.deleteMeeting);

      if (!meeting) {
        return;
      }

      const confirmed = window.confirm(`Delete "${meeting.title}" from the schedule? Linked records will stay in the archive and simply unlink from this meeting.`);

      if (!confirmed) {
        return;
      }

      try {
        await api(`/secretary/meetings/${meeting.id}`, { method: "DELETE" });

        if (meetingIdField.value === meeting.id) {
          resetMeetingForm({ clearDraftState: true });
          closeFormModal();
        }

        await loadPage();
        announceMutation(["secretary"]);
        showToast("Meeting deleted.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  renderMeetingPagination(pagination);
}

function renderCalendarToolbar() {
  const title = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric"
  }).format(currentCalendarMonth);

  calendarToolbar.innerHTML = `
    <div class="calendar-toolbar">
      <div class="inline-actions">
        <button class="ghost-button toolbar-button" type="button" data-calendar-shift="-1">Previous month</button>
        <button class="ghost-button toolbar-button" type="button" data-calendar-reset>Current month</button>
        <button class="ghost-button toolbar-button" type="button" data-calendar-shift="1">Next month</button>
      </div>
      <span class="toolbar-meta">${title}</span>
    </div>
  `;

  calendarToolbar.querySelectorAll("[data-calendar-shift]").forEach((button) => {
    button.addEventListener("click", () => {
      currentCalendarMonth = shiftMonth(currentCalendarMonth, Number(button.dataset.calendarShift || 0));
      renderCalendarToolbar();
      renderCalendar();
    });
  });

  calendarToolbar.querySelector("[data-calendar-reset]")?.addEventListener("click", () => {
    currentCalendarMonth = monthStart(new Date());
    renderCalendarToolbar();
    renderCalendar();
  });
}

function renderCalendar() {
  const month = currentCalendarMonth.getMonth();
  const year = currentCalendarMonth.getFullYear();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstWeekday);
  const dayCells = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(gridStart);
    day.setDate(gridStart.getDate() + index);
    return day;
  });
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  calendarGrid.innerHTML = `
    <div class="calendar-shell">
      ${weekdayLabels.map((label) => `<div class="calendar-weekday">${label}</div>`).join("")}
      ${dayCells.map((day) => {
        const meetings = meetingsCache.filter((meeting) => {
          const date = new Date(meeting.startsAt);
          return date.getFullYear() === day.getFullYear()
            && date.getMonth() === day.getMonth()
            && date.getDate() === day.getDate();
        });
        const inMonth = day.getMonth() === month;
        const isToday = day.toDateString() === new Date().toDateString();

        return `
          <div class="calendar-day ${inMonth ? "" : "outside-month"} ${isToday ? "today" : ""}">
            <div class="calendar-day-number">${day.getDate()}</div>
            <div class="calendar-day-events">
              ${meetings.length
                ? meetings.map((meeting) => `
                  <button class="calendar-event-chip ${meeting.status.toLowerCase()}" type="button" data-calendar-meeting="${meeting.id}">
                    <strong>${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(meeting.startsAt))}</strong>
                    <span>${meeting.title}</span>
                  </button>
                `).join("")
                : "<span class='calendar-empty'>No meetings</span>"}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  calendarGrid.querySelectorAll("[data-calendar-meeting]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedMeetingViewId = button.dataset.calendarMeeting;
      updateUrlParams({ viewMeeting: requestedMeetingViewId }, ["editMeeting"]);
      const meeting = meetingsCache.find((entry) => entry.id === requestedMeetingViewId);

      if (meeting) {
        fillMeetingDetail(meeting);
        showDetailModal(button, ["viewMeeting"]);
      }
    });
  });
}

function renderRecords() {
  const previousPage = currentRecordPage;
  const { items: records, pagination } = paginateArray(recordsCache, currentRecordPage, recordPageSize);
  currentRecordPage = pagination.page;

  if (currentRecordPage !== previousPage) {
    updateUrlParams({ recordPage: `${currentRecordPage}` });
  }

  if (!records.length) {
    recordTable.innerHTML = renderEmptyState("No records yet", "Create meeting minutes, journal entries, or notices to begin the organization archive.");
    renderRecordPagination(pagination);
    return;
  }

  recordTable.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Title</th>
            <th>Linked meeting</th>
            <th>Audience</th>
            <th>Updated</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${records.map((record) => `
            <tr class="${requestedRecordEditId === record.id ? "editing-row" : ""}">
              <td>${recordTypeBadge(record.type)}</td>
              <td>
                <strong>${record.title}</strong>
                <span class="subtle-row">${record.summary || `${record.content.slice(0, 120)}${record.content.length > 120 ? "..." : ""}`}</span>
              </td>
              <td>${record.meeting ? `<strong>${record.meeting.title}</strong><span class="subtle-row">${formatDate(record.meeting.startsAt)}</span>` : "No linked meeting"}</td>
              <td>${audienceLabel(record.audience)}</td>
              <td>${formatDate(record.updatedAt)}</td>
              <td>
                <div class="inline-table-actions">
                  <button class="mini-action" type="button" data-view-record="${record.id}">View</button>
                  ${viewerState.canEdit ? `<button class="mini-action" type="button" data-broadcast-record="${record.id}">Broadcast</button>` : ""}
                  ${viewerState.canEdit ? `<button class="mini-action" type="button" data-edit-record="${record.id}">Edit</button>` : ""}
                  ${viewerState.canEdit ? `<button class="mini-action danger-action" type="button" data-delete-record="${record.id}">Delete</button>` : ""}
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  recordTable.querySelectorAll("[data-edit-record]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedRecordEditId = button.dataset.editRecord;
      updateUrlParams({ editRecord: requestedRecordEditId });
      const record = recordsCache.find((entry) => entry.id === requestedRecordEditId);

      if (record) {
        fillRecordForm(record);
        showRecordModal(button);
      }
    });
  });

  recordTable.querySelectorAll("[data-view-record]").forEach((button) => {
    button.addEventListener("click", () => {
      requestedRecordViewId = button.dataset.viewRecord;
      updateUrlParams({ viewRecord: requestedRecordViewId }, ["editRecord"]);
      const record = recordsCache.find((entry) => entry.id === requestedRecordViewId);

      if (record) {
        fillRecordDetail(record);
        showDetailModal(button, ["viewRecord"]);
      }
    });
  });

  recordTable.querySelectorAll("[data-broadcast-record]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = recordsCache.find((entry) => entry.id === button.dataset.broadcastRecord);

      if (!record) {
        return;
      }

      try {
        const response = await api(`/secretary/records/${record.id}/broadcast`, {
          method: "POST"
        });

        if (response.discord?.posted) {
          showToast("Record posted to Discord.", "success");
        } else {
          showToast(response.discord?.message || "Record saved, but Discord could not be reached.", "warn");
        }
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  recordTable.querySelectorAll("[data-delete-record]").forEach((button) => {
    button.addEventListener("click", async () => {
      const record = recordsCache.find((entry) => entry.id === button.dataset.deleteRecord);

      if (!record) {
        return;
      }

      const confirmed = window.confirm(`Delete "${record.title}" from the organization archive?`);

      if (!confirmed) {
        return;
      }

      try {
        await api(`/secretary/records/${record.id}`, { method: "DELETE" });

        if (recordIdField.value === record.id) {
          resetRecordForm({ clearDraftState: true });
          closeFormModal();
        }

        await loadPage();
        announceMutation(["secretary"]);
        showToast("Record deleted.", "success");
      } catch (error) {
        showToast(error.message, "error");
      }
    });
  });

  renderRecordPagination(pagination);
}

function renderMeetingPagination(pagination) {
  if (!meetingPaginationContainer) {
    return;
  }

  if (pagination.totalPages <= 1) {
    meetingPaginationContainer.innerHTML = pagination.total
      ? `<span class="pager-label">${pagination.total} total meetings</span>`
      : "";
    return;
  }

  meetingPaginationContainer.innerHTML = `
    <span class="pager-label">Page ${pagination.page} of ${pagination.totalPages}</span>
    <button class="ghost-button pager-button" type="button" data-meeting-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Prev</button>
    <button class="ghost-button pager-button" type="button" data-meeting-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
  `;

  meetingPaginationContainer.querySelectorAll("[data-meeting-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.meetingPage);

      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > pagination.totalPages) {
        return;
      }

      currentMeetingPage = nextPage;
      updateUrlParams({ meetingPage: `${currentMeetingPage}` });
      renderMeetings();
    });
  });
}

function renderRecordPagination(pagination) {
  if (!recordPaginationContainer) {
    return;
  }

  if (pagination.totalPages <= 1) {
    recordPaginationContainer.innerHTML = pagination.total
      ? `<span class="pager-label">${pagination.total} total records</span>`
      : "";
    return;
  }

  recordPaginationContainer.innerHTML = `
    <span class="pager-label">Page ${pagination.page} of ${pagination.totalPages}</span>
    <button class="ghost-button pager-button" type="button" data-record-page="${pagination.page - 1}" ${pagination.page <= 1 ? "disabled" : ""}>Prev</button>
    <button class="ghost-button pager-button" type="button" data-record-page="${pagination.page + 1}" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button>
  `;

  recordPaginationContainer.querySelectorAll("[data-record-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextPage = Number(button.dataset.recordPage);

      if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > pagination.totalPages) {
        return;
      }

      currentRecordPage = nextPage;
      updateUrlParams({ recordPage: `${currentRecordPage}` });
      renderRecords();
    });
  });
}

async function loadPage() {
  summaryGrid.innerHTML = renderMetricSkeleton(4);
  meetingTable.innerHTML = renderTableSkeleton(6, 5);
  if (meetingPaginationContainer) {
    meetingPaginationContainer.innerHTML = "";
  }
  recordTable.innerHTML = renderTableSkeleton(6, 5);
  if (recordPaginationContainer) {
    recordPaginationContainer.innerHTML = "";
  }
  calendarToolbar.innerHTML = "";
  calendarGrid.innerHTML = "<div class='calendar-loading'>Loading calendar...</div>";

  try {
    const data = await api("/secretary");

    meetingsCache = data.meetings || [];
    recordsCache = data.records || [];
    audienceOptions = data.options?.audiences || [];
    viewerState = {
      canEdit: Boolean(data.viewer?.canEdit ?? viewerState.canEdit),
      discordScheduledEventsEnabled: Boolean(data.viewer?.discordScheduledEventsEnabled)
    };
    currentCalendarMonth = monthStart(new Date());
    renderSummary(data.summary || {});
    applyAccessState();
    populateAudienceOptions();
    populateRecordMeetingOptions();
    if (viewerState.canEdit) {
      restoreDraftForm(meetingForm, "secretary-meeting-form-v1");
      restoreDraftForm(recordForm, "secretary-record-form-v1");
    }
    renderMeetings();
    renderCalendarToolbar();
    renderCalendar();
    renderRecords();
    maybeOpenRequestedEdit();
  } catch (error) {
    summaryGrid.innerHTML = renderEmptyState("Unable to load secretary workspace", error.message);
    meetingTable.innerHTML = "";
    recordTable.innerHTML = "";
    calendarToolbar.innerHTML = "";
    calendarGrid.innerHTML = "";
    showToast(error.message, "error");
  }
}

meetingForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(meetingError, "");

  if (!viewerState.canEdit) {
    showToast("You can view this page, but only secretary-enabled users can change meetings.", "warn");
    return;
  }

  const payload = {
    title: meetingForm.elements.title.value,
    startsAt: toIsoFromLocalInput(meetingForm.elements.startsAt.value),
    endsAt: toIsoFromLocalInput(meetingForm.elements.endsAt.value),
    location: meetingForm.elements.location.value,
    audience: meetingForm.elements.audience.value,
    details: meetingForm.elements.details.value,
    status: meetingForm.elements.status.value,
    broadcastToDiscord: meetingForm.elements.broadcastToDiscord.checked,
    syncDiscordEvent: meetingForm.elements.syncDiscordEvent.checked
  };

  try {
    let response;

    if (meetingIdField.value) {
      response = await api(`/secretary/meetings/${meetingIdField.value}`, {
        method: "PATCH",
        body: payload
      });
    } else {
      response = await api("/secretary/meetings", {
        method: "POST",
        body: payload
      });
    }

    if (payload.broadcastToDiscord && response.discord?.posted && response.discordEvent?.synced) {
      showToast("Meeting saved, posted to Discord, and synced to Discord Events.", "success");
    } else if (payload.broadcastToDiscord && response.discord?.posted) {
      showToast("Meeting saved and posted to Discord.", "success");
      if (payload.syncDiscordEvent && response.discordEvent?.message) {
        showToast(response.discordEvent.message, "warn");
      }
    } else if (payload.syncDiscordEvent && response.discordEvent?.synced) {
      showToast("Meeting saved and Discord RSVP event synced.", "success");
    } else if (payload.broadcastToDiscord && !response.discord?.posted) {
      showToast(response.discord?.message || "Meeting saved, but Discord could not be reached.", "warn");
      if (payload.syncDiscordEvent && response.discordEvent?.message) {
        showToast(response.discordEvent.message, "warn");
      }
    } else if (payload.syncDiscordEvent && response.discordEvent?.message) {
      showToast(response.discordEvent.message, "warn");
      showToast(meetingIdField.value ? "Meeting updated." : "Meeting created.", "success");
    } else {
      showToast(meetingIdField.value ? "Meeting updated." : "Meeting created.", "success");
    }

    resetMeetingForm({ clearDraftState: true });
    closeFormModal();
    await loadPage();
    announceMutation(["secretary"]);
  } catch (error) {
    mountFormError(meetingError, error.message);
    showToast(error.message, "error");
  }
});

recordForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  mountFormError(recordError, "");

  if (!viewerState.canEdit) {
    showToast("You can view this page, but only secretary-enabled users can change records.", "warn");
    return;
  }

  const payload = {
    type: recordForm.elements.type.value,
    title: recordForm.elements.title.value,
    meetingId: recordForm.elements.meetingId.value,
    audience: recordForm.elements.audience.value,
    summary: recordForm.elements.summary.value,
    content: recordForm.elements.content.value,
    broadcastToDiscord: recordForm.elements.broadcastToDiscord.checked
  };

  try {
    let response;

    if (recordIdField.value) {
      response = await api(`/secretary/records/${recordIdField.value}`, {
        method: "PATCH",
        body: payload
      });
    } else {
      response = await api("/secretary/records", {
        method: "POST",
        body: payload
      });
    }

    if (payload.broadcastToDiscord && !response.discord?.posted) {
      showToast(response.discord?.message || "Record saved, but Discord could not be reached.", "warn");
    } else if (payload.broadcastToDiscord) {
      showToast("Record saved and posted to Discord.", "success");
    } else {
      showToast(recordIdField.value ? "Record updated." : "Record created.", "success");
    }

    resetRecordForm({ clearDraftState: true });
    closeFormModal();
    await loadPage();
    announceMutation(["secretary"]);
  } catch (error) {
    mountFormError(recordError, error.message);
    showToast(error.message, "error");
  }
});

openMeetingFormButton?.addEventListener("click", () => {
  if (!viewerState.canEdit) {
    return;
  }
  resetMeetingForm();
  showMeetingModal(openMeetingFormButton);
});

openRecordFormButton?.addEventListener("click", () => {
  if (!viewerState.canEdit) {
    return;
  }
  resetRecordForm();
  showRecordModal(openRecordFormButton);
});

resetMeetingButton?.addEventListener("click", () => resetMeetingForm({ clearDraftState: true }));
resetRecordButton?.addEventListener("click", () => resetRecordForm({ clearDraftState: true }));

subscribeToMutations(["secretary"], () => {
  showToast("Secretary workspace refreshed with live changes.", "info");
  loadPage();
});

resetMeetingForm({ clearUrl: false });
resetRecordForm({ clearUrl: false });
applyAccessState();
loadPage();
