export const NAV_ITEMS = [
  {
    key: "DASHBOARD",
    label: "Home",
    href: "./dashboard.html",
    description: "Launcher"
  },
  {
    key: "ANALYTICS",
    label: "Analytics",
    href: "./analytics.html",
    description: "Trends and output"
  },
  {
    key: "PRICE_LIST",
    label: "Price List",
    href: "./price-list.html",
    description: "Shared pricing",
    visibleToAllAuthenticated: true
  },
  {
    key: "FACTORY",
    label: "Factory",
    href: "./factory.html",
    description: "Time and payouts",
    visibleToAllAuthenticated: true
  },
  {
    key: "SECRETARY",
    label: "Secretary",
    href: "./secretary.html",
    description: "Meetings and records",
    visibleToAllAuthenticated: true
  },
  {
    key: "INVENTORY",
    label: "Inventory",
    href: "./inventory.html",
    description: "Stock and adjustments"
  },
  {
    key: "TAX",
    label: "Tax",
    href: "./tax.html",
    description: "Access trackers"
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
    permission: "DASHBOARD",
    label: "Open price list",
    href: "./price-list.html",
    description: "Shared pricing and calculator"
  },
  {
    permission: "DASHBOARD",
    label: "Open factory",
    href: "./factory.html",
    description: "Clock time and track payout rounds"
  },
  {
    permission: "SECRETARY",
    label: "Secretary workspace",
    href: "./secretary.html",
    description: "Meetings and records"
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
    permission: "TAX",
    label: "Open tax",
    href: "./tax.html",
    description: "Access periods"
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
  DASHBOARD: "Home",
  ANALYTICS: "Analytics",
  SECRETARY: "Secretary",
  INVENTORY: "Inventory",
  BANK: "Bank",
  TAX: "Tax",
  DISTRIBUTION: "Distribution",
  USERS: "Users"
};

export const PERMISSION_PRESETS = [
  {
    key: "SECRETARY",
    label: "Secretary",
    permissions: ["DASHBOARD", "ANALYTICS", "SECRETARY"]
  },
  {
    key: "INVENTORY_STAFF",
    label: "Inventory Staff",
    permissions: ["DASHBOARD", "ANALYTICS", "INVENTORY"]
  },
  {
    key: "FINANCE",
    label: "Finance",
    permissions: ["DASHBOARD", "ANALYTICS", "BANK", "TAX"]
  },
  {
    key: "TAX_DESK",
    label: "Tax Desk",
    permissions: ["DASHBOARD", "ANALYTICS", "TAX"]
  },
  {
    key: "DISTRIBUTOR",
    label: "Distributor",
    permissions: ["DASHBOARD", "ANALYTICS", "INVENTORY", "DISTRIBUTION"]
  },
  {
    key: "OPERATIONS",
    label: "Operations",
    permissions: ["DASHBOARD", "ANALYTICS", "INVENTORY", "BANK", "TAX", "DISTRIBUTION"]
  }
];
