export const NAV_ITEMS = [
  {
    key: "DASHBOARD",
    label: "Dashboard",
    href: "./dashboard.html",
    description: "Overview"
  },
  {
    key: "ANALYTICS",
    label: "Analytics",
    href: "./analytics.html",
    description: "Trends and output"
  },
  {
    key: "DAILY_TASKS",
    label: "Daily tasks",
    href: "./daily-tasks.html",
    description: "Checklist and ranks"
  },
  {
    key: "INVENTORY",
    label: "Inventory",
    href: "./inventory.html",
    description: "Stock and adjustments"
  },
  {
    key: "BANK",
    label: "Bank",
    href: "./bank.html",
    description: "Cash ledger"
  },
  {
    key: "DISTRIBUTION",
    label: "Distribution",
    href: "./distribution.html",
    description: "Assignments"
  },
  {
    key: "USERS",
    label: "Users",
    href: "./users.html",
    description: "Permissions"
  }
];

export const QUICK_ACTIONS = [
  {
    permission: "ANALYTICS",
    label: "View analytics",
    href: "./analytics.html",
    description: "See weekly trends"
  },
  {
    permission: "DAILY_TASKS",
    label: "Open tasks",
    href: "./daily-tasks.html#taskChecklist",
    description: "Complete today"
  },
  {
    permission: "INVENTORY",
    label: "Add item",
    href: "./inventory.html#inventoryForm",
    description: "Create stock"
  },
  {
    permission: "INVENTORY",
    label: "Adjust stock",
    href: "./inventory.html#adjustForm",
    description: "Update quantities"
  },
  {
    permission: "BANK",
    label: "Record payment",
    href: "./bank.html#transactionForm",
    description: "Clean or dirty money"
  },
  {
    permission: "DISTRIBUTION",
    label: "New distribution",
    href: "./distribution.html#distributionForm",
    description: "Create run"
  },
  {
    permission: "USERS",
    label: "Add user",
    href: "./users.html#userForm",
    description: "Manage access"
  }
];

export const PERMISSION_LABELS = {
  DASHBOARD: "Dashboard",
  ANALYTICS: "Analytics",
  DAILY_TASKS: "Daily tasks",
  INVENTORY: "Inventory",
  BANK: "Bank",
  DISTRIBUTION: "Distribution",
  USERS: "Users"
};

export const PERMISSION_PRESETS = [
  {
    key: "INVENTORY_STAFF",
    label: "Inventory Staff",
    permissions: ["DASHBOARD", "ANALYTICS", "DAILY_TASKS", "INVENTORY"]
  },
  {
    key: "FINANCE",
    label: "Finance",
    permissions: ["DASHBOARD", "ANALYTICS", "DAILY_TASKS", "BANK"]
  },
  {
    key: "DISTRIBUTOR",
    label: "Distributor",
    permissions: ["DASHBOARD", "ANALYTICS", "DAILY_TASKS", "INVENTORY", "DISTRIBUTION"]
  },
  {
    key: "OPERATIONS",
    label: "Operations",
    permissions: ["DASHBOARD", "ANALYTICS", "DAILY_TASKS", "INVENTORY", "BANK", "DISTRIBUTION"]
  }
];
