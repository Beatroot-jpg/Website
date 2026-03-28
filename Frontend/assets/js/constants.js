export const NAV_ITEMS = [
  {
    key: "DASHBOARD",
    label: "Dashboard",
    href: "./dashboard.html",
    description: "Overview"
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
    description: "Credit or debit"
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
  INVENTORY: "Inventory",
  BANK: "Bank",
  DISTRIBUTION: "Distribution",
  USERS: "Users"
};

export const PERMISSION_PRESETS = [
  {
    key: "INVENTORY_STAFF",
    label: "Inventory Staff",
    permissions: ["DASHBOARD", "INVENTORY"]
  },
  {
    key: "FINANCE",
    label: "Finance",
    permissions: ["DASHBOARD", "BANK"]
  },
  {
    key: "DISTRIBUTOR",
    label: "Distributor",
    permissions: ["DASHBOARD", "INVENTORY", "DISTRIBUTION"]
  },
  {
    key: "OPERATIONS",
    label: "Operations",
    permissions: ["DASHBOARD", "INVENTORY", "BANK", "DISTRIBUTION"]
  }
];
