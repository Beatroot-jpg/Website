import { NAV_ITEMS } from "./constants.js";
import { hasPermission } from "./session.js";
import { initThemeToggle } from "./theme.js";
import { initProtectedPage, renderEmptyState } from "./ui.js";

initProtectedPage({
  pageKey: "DASHBOARD",
  title: "The Shites",
  subtitle: "",
  showQuickActions: false,
  showWorkspaceTools: false
});

const themeToggleButton = document.querySelector("#themeToggleButton");
const homeLauncherGrid = document.querySelector("#homeLauncherGrid");

const PANEL_LOOKUP = {
  SECRETARY: {
    eyebrow: "Records",
    summary: "Meetings, notes, and shared planning documents.",
    tone: "neutral"
  },
  USERS: {
    eyebrow: "Admin",
    summary: "Accounts, access, and who can see what.",
    tone: "neutral"
  }
};

function renderLauncherPanels() {
  const visiblePanels = NAV_ITEMS
    .filter((item) => item.key !== "DASHBOARD")
    .filter((item) => item.visibleToAllAuthenticated || hasPermission(item.key));

  if (!visiblePanels.length) {
    homeLauncherGrid.innerHTML = renderEmptyState(
      "No panels available",
      "This account does not currently have access to any workspace panels."
    );
    return;
  }

  homeLauncherGrid.innerHTML = visiblePanels.map((panel, index) => {
    const look = PANEL_LOOKUP[panel.key] || {
      eyebrow: "Panel",
      summary: panel.description,
      tone: "neutral"
    };

    const itemNumber = String(index + 1).padStart(2, "0");

    return `
      <a class="home-launch-card ${look.tone}" href="${panel.href}">
        <div class="home-launch-index">${itemNumber}</div>
        <div class="home-launch-copy">
          <div class="home-launch-row">
            <p class="home-launch-eyebrow">${look.eyebrow}</p>
            <span class="home-launch-enter">Open</span>
          </div>
          <strong>${panel.label}</strong>
          <p>${look.summary}</p>
        </div>
        <div class="home-launch-meta">
          <span>${panel.description}</span>
          <span class="home-launch-arrow">↗</span>
        </div>
      </a>
    `;
  }).join("");
}

initThemeToggle(themeToggleButton);
renderLauncherPanels();
