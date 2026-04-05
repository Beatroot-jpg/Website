import { api } from "./api.js";
import { NAV_ITEMS, PERMISSION_LABELS, QUICK_ACTIONS } from "./constants.js";
import { clearSession, hasPermission, requireAuth } from "./session.js";

export function initProtectedPage({ pageKey, title, subtitle, showQuickActions = pageKey === "DASHBOARD" }) {
  const user = requireAuth(pageKey);

  const titleElement = document.querySelector("#pageTitle");
  const subtitleElement = document.querySelector("#pageSubtitle");
  const navElement = document.querySelector("#sidebarNav");
  const userPill = document.querySelector("#userPill");
  const logoutButton = document.querySelector("#logoutButton");

  if (titleElement) {
    titleElement.textContent = title;
  }

  if (subtitleElement) {
    subtitleElement.textContent = subtitle;
  }

  if (navElement) {
    navElement.innerHTML = NAV_ITEMS
      .filter((item) => hasPermission(item.key))
      .map((item) => `
        <a class="nav-link ${item.key === pageKey ? "active" : ""}" href="${item.href}">
          <span>${item.label}</span>
          <small>${item.description}</small>
        </a>
      `)
      .join("");
  }

  if (userPill) {
    userPill.textContent = `${user.name} - ${user.role}`;
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      clearSession();
      window.location.href = "./index.html";
    });
  }

  mountWorkspaceTools({ showQuickActions });

  return user;
}

function mountWorkspaceTools({ showQuickActions = false } = {}) {
  const header = document.querySelector(".workspace-header");
  const workspace = document.querySelector(".workspace");

  if (!header || !workspace || document.querySelector("#workspaceTools")) {
    return;
  }

  const tools = document.createElement("section");
  tools.className = "workspace-tools";
  tools.id = "workspaceTools";

  const actions = showQuickActions
    ? QUICK_ACTIONS.filter((action) => hasPermission(action.permission))
    : [];

  tools.innerHTML = `
    <div class="global-search-panel">
      <label class="tool-label" for="globalSearchInput">Global search</label>
      <div class="global-search-field">
        <input
          type="search"
          id="globalSearchInput"
          placeholder="Search inventory, distributions, bank records, users, or daily tasks"
          autocomplete="off"
        >
      </div>
      <div class="search-results hidden" id="searchResults"></div>
    </div>
    ${showQuickActions ? `
      <div class="quick-actions-panel">
        <p class="tool-label">Quick actions</p>
        <div class="quick-actions-list">
          ${actions.length
            ? actions.map((action) => `
              <a class="quick-action" href="${action.href}">
                <strong>${action.label}</strong>
                <small>${action.description}</small>
              </a>
            `).join("")
            : "<div class='search-empty'>No actions available for this user.</div>"}
        </div>
      </div>
    ` : ""}
  `;

  header.insertAdjacentElement("afterend", tools);

  const searchInput = tools.querySelector("#globalSearchInput");
  const searchResults = tools.querySelector("#searchResults");
  let searchTimer = null;

  function closeResults() {
    searchResults.classList.add("hidden");
    searchResults.innerHTML = "";
  }

  function renderSearchResults(results) {
    if (!results.length) {
      searchResults.innerHTML = "<div class='search-empty'>No matches found.</div>";
      searchResults.classList.remove("hidden");
      return;
    }

    searchResults.innerHTML = results.map((result) => `
      <a class="search-result" href="${result.href}">
        <div class="search-result-copy">
          <strong>${result.title}</strong>
          <p>${result.subtitle}</p>
        </div>
        <div class="search-result-meta">
          ${badge(result.group, result.tone || "accent")}
        </div>
      </a>
    `).join("");
    searchResults.classList.remove("hidden");
  }

  async function runSearch() {
    const query = searchInput.value.trim();

    if (query.length < 2) {
      closeResults();
      return;
    }

    searchResults.innerHTML = "<div class='search-empty'>Searching...</div>";
    searchResults.classList.remove("hidden");

    try {
      const data = await api(`/meta/search?q=${encodeURIComponent(query)}`);
      renderSearchResults(data.results || []);
    } catch (error) {
      searchResults.innerHTML = `<div class="search-empty">${error.message}</div>`;
      searchResults.classList.remove("hidden");
    }
  }

  searchInput?.addEventListener("input", () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(runSearch, 180);
  });

  searchInput?.addEventListener("focus", () => {
    if (searchResults.innerHTML.trim()) {
      searchResults.classList.remove("hidden");
    }
  });

  document.addEventListener("click", (event) => {
    if (!tools.contains(event.target)) {
      closeResults();
    }
  });
}

export function showToast(message, tone = "info") {
  const stack = document.querySelector("#toastStack");

  if (!stack) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;

  stack.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("leaving");
    window.setTimeout(() => toast.remove(), 250);
  }, 3000);
}

export function renderMetricSkeleton(count = 4) {
  return Array.from({ length: count }, () => `
    <article class="metric-card skeleton-card">
      <div class="skeleton-line short"></div>
      <div class="skeleton-line large"></div>
      <div class="skeleton-line medium"></div>
    </article>
  `).join("");
}

export function renderTableSkeleton(columnCount = 5, rowCount = 5) {
  const header = Array.from({ length: columnCount }, () => `<th><div class="skeleton-line medium"></div></th>`).join("");
  const rows = Array.from({ length: rowCount }, () => `
    <tr>
      ${Array.from({ length: columnCount }, () => `<td><div class="skeleton-line medium"></div></td>`).join("")}
    </tr>
  `).join("");

  return `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>${header}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function renderEmptyState(title, message) {
  return `
    <div class="empty-state">
      <h3>${title}</h3>
      <p>${message}</p>
    </div>
  `;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "AUD"
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDateOnly(value) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium"
  }).format(new Date(value));
}

export function badge(label, tone = "neutral") {
  return `<span class="badge ${tone}">${label}</span>`;
}

function humanizeStatus(status) {
  return `${status || ""}`.replaceAll("_", " ");
}

export function distributionStatusBadge(status) {
  const normalized = `${status || ""}`.toUpperCase();
  const tone = normalized === "COMPLETED" || normalized === "CLEARED"
    ? "good"
    : normalized === "CANCELLED" || normalized === "FAULTY"
      ? "danger"
      : normalized === "IN_TRANSIT" || normalized === "PARTIAL"
        ? "warn"
        : "accent";

  return badge(humanizeStatus(normalized), tone);
}

export function rosterStatusBadge(status) {
  const normalized = `${status || ""}`.toUpperCase();
  const tone = normalized === "ACTIVE"
    ? "good"
    : normalized === "LOA"
      ? "warn"
      : "neutral";

  return badge(humanizeStatus(normalized), tone);
}

export function bankTransactionBadge(type, label = type) {
  const normalized = `${type || ""}`.toUpperCase();
  const tone = normalized === "DEBIT" || normalized === "SUBTRACT" ? "danger" : "good";
  const text = label === type
    ? normalized === "DEBIT"
      ? "Subtract"
      : normalized === "CREDIT"
        ? "Correction"
        : label
    : label;

  return badge(text, tone);
}

export function bankMoneyBadge(moneyType) {
  const normalized = `${moneyType || ""}`.toUpperCase();
  return badge(normalized === "DIRTY" ? "Dirty Money" : "Clean Money", normalized === "DIRTY" ? "accent" : "neutral");
}

export function roleBadge(role) {
  return badge(role, role === "ADMIN" ? "accent" : "neutral");
}

export function activeStateBadge(active) {
  return badge(active ? "Active" : "Inactive", active ? "good" : "danger");
}

export function permissionBadges(permissionKeys) {
  return (permissionKeys || [])
    .map((key) => badge(PERMISSION_LABELS[key] || key))
    .join("");
}

export function mountFormError(target, message = "") {
  if (!target) {
    return;
  }

  target.textContent = message;
  target.classList.toggle("hidden", !message);
}

export function toFormObject(formElement) {
  const formData = new FormData(formElement);
  return Object.fromEntries(formData.entries());
}

export function toggleCheckboxGroup(disabled) {
  document.querySelectorAll('input[name="permissions"]').forEach((input) => {
    input.disabled = disabled;
  });
}

export function focusFormPanel(formElement, focusSelector) {
  if (!formElement) {
    return;
  }

  const focusTarget = focusSelector
    ? formElement.querySelector(focusSelector)
    : formElement.querySelector("input, select, textarea, button");
  const panel = formElement.closest(".panel") || formElement;

  document.querySelectorAll(".panel.editing-focus").forEach((element) => {
    if (element !== panel) {
      element.classList.remove("editing-focus");
    }
  });

  if (panel) {
    panel.classList.remove("editing-focus");
    void panel.offsetWidth;
    panel.classList.add("editing-focus");
    window.clearTimeout(panel.__editingFocusTimer);
    panel.__editingFocusTimer = window.setTimeout(() => {
      panel.classList.remove("editing-focus");
    }, 2600);
  }

  panel.scrollIntoView({
    behavior: "smooth",
    block: "center"
  });

  window.requestAnimationFrame(() => {
    if (!focusTarget) {
      return;
    }

    focusTarget.focus({ preventScroll: true });

    if (typeof focusTarget.select === "function" && ["INPUT", "TEXTAREA"].includes(focusTarget.tagName)) {
      focusTarget.select();
    }
  });
}
