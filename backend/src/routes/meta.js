import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authenticateToken, listPermissionMetadata } from "../middleware/auth.js";

const router = Router();

function buildBankResultHref(transaction) {
  if (transaction.sourceSystem === "distribution_deposit") {
    return "./bank.html?view=dirty#transactionTable";
  }

  if (transaction.distributionId) {
    return `./bank.html?search=${encodeURIComponent(transaction.description || transaction.moneyType)}#transactionTable`;
  }

  return `./bank.html?editTransaction=${transaction.id}#transactionForm`;
}

router.get(
  "/bootstrap-status",
  asyncHandler(async (_req, res) => {
    const userCount = await prisma.user.count();
    res.json({ needsSetup: userCount === 0 });
  })
);

router.get(
  "/search",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const query = `${req.query.q ?? ""}`.trim();

    if (query.length < 2) {
      return res.json({ results: [] });
    }

    const allowed = new Set(req.user.permissions);
    const canViewInventory = allowed.has("INVENTORY") || req.user.role === "ADMIN";
    const canViewAnalytics = allowed.has("ANALYTICS") || req.user.role === "ADMIN";
    const canViewDailyTasks = allowed.has("DAILY_TASKS") || req.user.role === "ADMIN";
    const canViewBank = allowed.has("BANK") || req.user.role === "ADMIN";
    const canViewDistribution = allowed.has("DISTRIBUTION") || req.user.role === "ADMIN";
    const canViewUsers = allowed.has("USERS") || req.user.role === "ADMIN";
    const containsFilter = { contains: query, mode: "insensitive" };
    const normalizedQuery = query.toUpperCase();
    const bankMoneyTypeFilter = normalizedQuery.startsWith("DIR")
      ? "DIRTY"
      : normalizedQuery.startsWith("CLE")
        ? "CLEAN"
        : null;

    const resultSets = await Promise.all([
      canViewInventory
        ? prisma.inventoryItem.findMany({
          where: {
            OR: [
              { name: containsFilter },
              { category: containsFilter },
              { unit: containsFilter }
            ]
          },
          orderBy: { updatedAt: "desc" },
          take: 4,
          select: {
            id: true,
            name: true,
            category: true,
            quantity: true,
            unit: true,
            updatedAt: true
          }
        }).then((items) => items.map((item) => ({
          id: `inventory-${item.id}`,
          group: "Inventory",
          title: item.name,
          subtitle: `${item.quantity} ${item.unit}${item.category ? ` - ${item.category}` : ""}`,
          href: `./inventory.html?editItem=${item.id}#inventoryForm`,
          tone: item.quantity <= 0 ? "warn" : "accent",
          sortAt: item.updatedAt
        })))
        : [],
      canViewAnalytics && /(analytics|stats|trend|weekly|sales|output|performance)/i.test(query)
        ? Promise.resolve([
          {
            id: "analytics-page",
            group: "Analytics",
            title: "Analytics page",
            subtitle: "Weekly comparisons, top movers, and output trends.",
            href: "./analytics.html",
            tone: "accent",
            sortAt: new Date().toISOString()
          }
        ])
        : Promise.resolve([]),
      canViewDistribution
        ? prisma.runnerDistribution.findMany({
          where: {
            OR: [
              { item: { name: containsFilter } },
              { distributor: { name: containsFilter } },
              { distributor: { number: containsFilter } },
              { notes: containsFilter }
            ]
          },
          orderBy: { updatedAt: "desc" },
          take: 4,
          include: {
            item: {
              select: {
                id: true,
                name: true
              }
            },
            distributor: {
              select: {
                name: true,
                number: true
              }
            }
          }
        }).then((items) => items.map((item) => ({
          id: `distribution-${item.id}`,
          group: "Distribution",
          title: item.item.name,
          subtitle: `${item.quantity} units for ${item.distributor.name} - ${item.status}`,
          href: `./distribution.html?editDistribution=${item.id}#collectionForm`,
          tone: item.status === "CLEARED" ? "good" : item.status === "FAULTY" ? "danger" : item.status === "PARTIAL" ? "warn" : "accent",
          sortAt: item.updatedAt
        })))
        : [],
      canViewDailyTasks
        ? Promise.all([
          prisma.dailyTask.findMany({
            where: {
              active: true,
              OR: [
                { title: containsFilter },
                { description: containsFilter }
              ]
            },
            orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
            take: 4,
            select: {
              id: true,
              title: true,
              description: true,
              importance: true,
              updatedAt: true
            }
          }),
          prisma.weeklyTask.findMany({
            where: {
              active: true,
              OR: [
                { title: containsFilter },
                { description: containsFilter }
              ]
            },
            orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
            take: 4,
            select: {
              id: true,
              title: true,
              description: true,
              importance: true,
              updatedAt: true
            }
          })
        ]).then(([dailyItems, weeklyItems]) => [
          ...dailyItems.map((item) => ({
            id: `daily-task-${item.id}`,
            group: "Tasks",
            title: item.title,
            subtitle: `Daily - ${item.importance.toLowerCase()} priority${item.description ? ` - ${item.description}` : ""}`,
            href: req.user.role === "ADMIN"
              ? `./daily-tasks.html?editTask=${item.id}#adminTaskPanel`
              : "./daily-tasks.html#taskChecklist",
            tone: item.importance === "HIGH" ? "warn" : item.importance === "MEDIUM" ? "accent" : "neutral",
            sortAt: item.updatedAt
          })),
          ...weeklyItems.map((item) => ({
            id: `weekly-task-${item.id}`,
            group: "Tasks",
            title: item.title,
            subtitle: `Weekly - ${item.importance.toLowerCase()} priority${item.description ? ` - ${item.description}` : ""}`,
            href: req.user.role === "ADMIN"
              ? `./daily-tasks.html?editWeeklyTask=${item.id}#adminTaskPanel`
              : "./daily-tasks.html#weeklyTaskPanel",
            tone: item.importance === "HIGH" ? "warn" : item.importance === "MEDIUM" ? "accent" : "neutral",
            sortAt: item.updatedAt
          }))
        ])
        : [],
      canViewBank
        ? prisma.bankTransaction.findMany({
          where: {
            OR: [
              { description: containsFilter },
              { sourceSystem: containsFilter },
              ...(bankMoneyTypeFilter ? [{ moneyType: bankMoneyTypeFilter }] : [])
            ]
          },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: {
            id: true,
            description: true,
            type: true,
            moneyType: true,
            sourceSystem: true,
            amount: true,
            distributionId: true,
            createdAt: true
          }
        }).then((items) => items.map((item) => ({
          id: `bank-${item.id}`,
          group: "Bank",
          title: item.description || `${item.moneyType} ${item.type === "DEBIT" ? "subtract" : "correction"}`,
          subtitle: `${item.moneyType} money - ${item.sourceSystem} - ${item.amount}`,
          href: buildBankResultHref(item),
          tone: item.type === "DEBIT" ? "danger" : "good",
          sortAt: item.createdAt
        })))
        : [],
      canViewUsers
        ? prisma.user.findMany({
          where: {
            OR: [
              { name: containsFilter },
              { email: containsFilter }
            ]
          },
          orderBy: { updatedAt: "desc" },
          take: 4,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            updatedAt: true
          }
        }).then((items) => items.map((item) => ({
          id: `user-${item.id}`,
          group: "Users",
          title: item.name,
          subtitle: `${item.email} - ${item.role}`,
          href: `./users.html?editUser=${item.id}#userForm`,
          tone: item.role === "ADMIN" ? "accent" : "neutral",
          sortAt: item.updatedAt
        })))
        : []
    ]);

    return res.json({
      results: resultSets
        .flat()
        .sort((left, right) => new Date(right.sortAt) - new Date(left.sortAt))
        .slice(0, 12)
    });
  })
);

router.get(
  "/options",
  authenticateToken,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });

    res.json({
      permissions: listPermissionMetadata(),
      users: users.map((user) => ({
        ...user,
        username: user.email
      }))
    });
  })
);

export default router;
