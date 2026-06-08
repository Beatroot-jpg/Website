export const NAV_ITEMS = [
  {
    key: "DASHBOARD",
    label: "Home",
    href: "./dashboard.html",
    description: "Launcher"
  },
  {
    key: "SECRETARY",
    label: "Secretary",
    href: "./secretary.html",
    description: "Meetings and notes",
    visibleToAllAuthenticated: true
  },
  {
    key: "USERS",
    label: "Users",
    href: "./users.html",
    description: "Permissions"
  }
];

export const QUICK_ACTIONS = [];

export const PERMISSION_LABELS = {
  DASHBOARD: "Home",
  SECRETARY: "Secretary",
  USERS: "Users"
};

export const PERMISSION_PRESETS = [
  {
    key: "SECRETARY_EDITOR",
    label: "Secretary editor",
    permissions: ["DASHBOARD", "SECRETARY"]
  },
  {
    key: "VIEWER",
    label: "Viewer",
    permissions: ["DASHBOARD"]
  }
];
