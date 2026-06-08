export const NAV_ITEMS = [
  {
    key: "DASHBOARD",
    label: "Leaderboard",
    href: "./dashboard.html",
    description: "Live rankings",
    visibleToAllAuthenticated: true
  },
  {
    key: "WAGERS",
    label: "Wagers",
    href: "./wagers.html",
    description: "Fight night bets",
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
  USERS: "Users"
};

export const PERMISSION_PRESETS = [
  {
    key: "MEMBER",
    label: "Member",
    permissions: []
  }
];
