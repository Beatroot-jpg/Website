export const NAV_ITEMS = [
  {
    key: "DASHBOARD",
    label: "Dashboard",
    href: "./dashboard.html",
    description: "Overview"
  },
  {
    key: "ROSTER",
    label: "Roster",
    href: "./roster.html",
    description: "Team lineup"
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
    permission: "ROSTER",
    label: "Add member",
    href: "./roster.html#rosterForm",
    description: "Update lineup"
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
    description: "Assign stock"
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
  ROSTER: "Roster",
  INVENTORY: "Inventory",
  BANK: "Bank",
  DISTRIBUTION: "Distribution",
  USERS: "Users"
};

export const PERMISSION_PRESETS = [
  {
    key: "INVENTORY_STAFF",
    label: "Inventory Staff",
    permissions: ["DASHBOARD", "ROSTER", "INVENTORY"]
  },
  {
    key: "FINANCE",
    label: "Finance",
    permissions: ["DASHBOARD", "ROSTER", "BANK"]
  },
  {
    key: "DISTRIBUTOR",
    label: "Distributor",
    permissions: ["DASHBOARD", "ROSTER", "INVENTORY", "DISTRIBUTION"]
  },
  {
    key: "OPERATIONS",
    label: "Operations",
    permissions: ["DASHBOARD", "ROSTER", "INVENTORY", "BANK", "DISTRIBUTION"]
  }
];
