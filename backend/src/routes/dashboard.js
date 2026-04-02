import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { getBankBalances, getEntryTypeFromTransaction } from "../services/bank.js";
import { getOperationalDayKey, getSydneyDateKey, getWeekStartKey, shiftDateKey } from "../services/time.js";

const router = Router();

router.use(authenticateToken, requirePermission("DASHBOARD"));

function formatMovementType(type) {
  switch (`${type || ""}`.toUpperCase()) {
    case "STOCK_IN":
      return "Add";
    case "STOCK_OUT":
      return "Subtract";
    case "CORRECTION":
      return "Correction";
    case "DISTRIBUTED":
      return "Distributed";
    default:
      return type;
  }
}

function buildBankTransactionHref(transaction) {
  if (transaction.sourceSystem === "distribution_deposit") {
    return "./bank.html?view=dirty#transactionTable";
  }

  if (transaction.distributionId) {
    return `./bank.html?search=${encodeURIComponent(transaction.description || transaction.moneyType)}#transactionTable`;
  }

  return `./bank.html?editTransaction=${transaction.id}#transactionForm`;
}

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const metrics = [];
    const allowed = new Set(req.user.permissions);
    const canViewInventory = allowed.has("INVENTORY") || req.user.role === "ADMIN";
    const canViewAnalytics = allowed.has("ANALYTICS") || req.user.role === "ADMIN";
    const canViewDailyTasks = allowed.has("DAILY_TASKS") || req.user.role === "ADMIN";
    const canViewBank = allowed.has("BANK") || req.user.role === "ADMIN";
    const canViewDistribution = allowed.has("DISTRIBUTION") || req.user.role === "ADMIN";
    const recentActivity = [];
    let lowStockItems = [];
    let recentDistributions = [];
    let recentTransactions = [];

    if (canViewInventory) {
      const [itemCount, inventoryHighlights, quantityAggregate, recentMovements] = await Promise.all([
        prisma.inventoryItem.count(),
        prisma.inventoryItem.findMany({
          orderBy: [{ updatedAt: "desc" }, { quantity: "desc" }],
          take: 5,
          select: {
            id: true,
            name: true,
            quantity: true,
            unit: true,
            updatedAt: true,
            category: true
          }
        }),
        prisma.inventoryItem.aggregate({
          _sum: {
            quantity: true
          }
        }),
        prisma.inventoryMovement.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            item: {
              select: {
                id: true,
                name: true,
                unit: true
              }
            }
          }
        })
      ]);

      lowStockItems = inventoryHighlights;

      metrics.push(
        {
          label: "Inventory items",
          value: itemCount,
          tone: "neutral",
          note: "Open stock list",
          href: "./inventory.html#inventoryTable"
        },
        {
          label: "Units on hand",
          value: quantityAggregate._sum.quantity || 0,
          tone: "good",
          note: "Review inventory",
          href: "./inventory.html#inventoryTable"
        }
      );

      recentActivity.push(
        ...recentMovements.map((movement) => ({
          id: `movement-${movement.id}`,
          category: "Inventory",
          title: movement.item.name,
          detail: `${formatMovementType(movement.type)} ${Math.abs(movement.quantityDelta)} ${movement.item.unit}`,
          badgeLabel: formatMovementType(movement.type),
          tone: movement.quantityDelta < 0 ? "warn" : "good",
          createdAt: movement.createdAt,
          href: movement.type === "DISTRIBUTED"
            ? `./inventory.html?editItem=${movement.item.id}#inventoryForm`
            : `./inventory.html?editMovement=${movement.id}#adjustForm`
        }))
      );
    }

    if (canViewBank) {
      const [balances, bankTransactions] = await Promise.all([
        getBankBalances(),
        prisma.bankTransaction.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            distribution: {
              select: {
                id: true,
                item: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            }
          }
        })
      ]);

      recentTransactions = bankTransactions.map((transaction) => ({
        ...transaction,
        entryType: getEntryTypeFromTransaction(transaction)
      }));

      metrics.push(
        {
          label: "Clean money",
          value: balances.clean,
          tone: "good",
          currency: true,
          note: "View clean ledger",
          href: "./bank.html?view=clean#transactionTable"
        },
        {
          label: "Dirty money",
          value: balances.dirty,
          tone: "accent",
          currency: true,
          note: "View dirty ledger",
          href: "./bank.html?view=dirty#transactionTable"
        }
      );

      recentActivity.push(
        ...recentTransactions.map((transaction) => ({
          id: `transaction-${transaction.id}`,
          category: "Bank",
          title: transaction.description || `${transaction.moneyType} ${transaction.entryType}`,
          detail: `${transaction.createdBy?.name || "System"} - ${transaction.moneyType} money`,
          badgeLabel: transaction.entryType,
          tone: transaction.entryType === "SUBTRACT" ? "danger" : transaction.moneyType === "DIRTY" ? "accent" : "good",
          createdAt: transaction.createdAt,
          href: buildBankTransactionHref(transaction)
        }))
      );
    }

    if (canViewDistribution) {
      const [distributionCount, distributionItems, pendingCollections] = await Promise.all([
        prisma.runnerDistribution.count({
          where: {
            status: {
              in: ["ACTIVE", "PARTIAL"]
            }
          }
        }),
        prisma.runnerDistribution.findMany({
          orderBy: { updatedAt: "desc" },
          take: 5,
          include: {
            item: {
              select: {
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
        }),
        prisma.distributionCollection.findMany({
          where: {
            status: "PENDING"
          },
          select: {
            amount: true
          }
        })
      ]);

      recentDistributions = distributionItems;
      const pendingDirtyCash = pendingCollections.reduce((sum, entry) => sum + Number(entry.amount), 0);

      metrics.push(
        {
          label: "Active distributions",
          value: distributionCount,
          tone: "neutral",
          note: "View active runs",
          href: "./distribution.html?view=active#distributionTable"
        },
        {
          label: "Pending dirty cash",
          value: pendingDirtyCash,
          tone: "accent",
          currency: true,
          note: "Deposit from ledger",
          href: "./distribution.html?view=ledger-pending#distributionLedgerTable"
        }
      );

      recentActivity.push(
        ...distributionItems.map((distribution) => ({
          id: `distribution-${distribution.id}`,
          category: "Distribution",
          title: distribution.item.name,
          detail: `${distribution.quantity} units to ${distribution.distributor.name} for $${Number(distribution.totalOwed).toFixed(2)}`,
          badgeLabel: distribution.status,
          tone: distribution.status === "FAULTY"
            ? "danger"
            : distribution.status === "CLEARED"
              ? "good"
              : distribution.status === "PARTIAL"
                ? "warn"
                : "accent",
          createdAt: distribution.updatedAt,
          href: `./distribution.html?editDistribution=${distribution.id}#collectionForm`
        }))
      );
    }

    if (canViewAnalytics) {
      const weekStartKey = getWeekStartKey(getSydneyDateKey());
      const weekSearchStart = new Date(`${shiftDateKey(weekStartKey, -1)}T00:00:00Z`);
      const weeklyDeposits = await prisma.bankTransaction.findMany({
        where: {
          sourceSystem: "distribution_deposit",
          createdAt: {
            gte: weekSearchStart
          }
        },
        select: {
          amount: true,
          createdAt: true
        }
      });
      const weeklyDepositTotal = weeklyDeposits.reduce((sum, transaction) => (
        getWeekStartKey(getSydneyDateKey(transaction.createdAt)) === weekStartKey
          ? sum + Number(transaction.amount || 0)
          : sum
      ), 0);

      metrics.push({
        label: "Weekly deposited",
        value: Number(weeklyDepositTotal || 0),
        tone: "accent",
        currency: true,
        note: "Open analytics",
        href: "./analytics.html"
      });
    }

    if (canViewDailyTasks) {
      const taskDay = getOperationalDayKey();
      const [activeTaskCount, completedCount, pointsToday] = await Promise.all([
        prisma.dailyTask.count({
          where: { active: true }
        }),
        prisma.dailyTaskCompletion.count({
          where: {
            userId: req.user.id,
            taskDay
          }
        }),
        prisma.dailyTaskCompletion.aggregate({
          where: {
            userId: req.user.id,
            taskDay
          },
          _sum: {
            pointsAwarded: true
          }
        })
      ]);

      metrics.push(
        {
          label: "Tasks today",
          value: `${completedCount}/${activeTaskCount}`,
          tone: completedCount === activeTaskCount && activeTaskCount > 0 ? "good" : "neutral",
          note: "Open daily tasks",
          href: "./daily-tasks.html#taskChecklist"
        },
        {
          label: "Task points today",
          value: Number(pointsToday._sum.pointsAwarded || 0),
          tone: "good",
          note: "See leaderboard",
          href: "./daily-tasks.html#leaderboardPanel"
        }
      );
    }

    res.json({
      metrics,
      lowStockItems,
      recentDistributions,
      recentTransactions,
      recentActivity: recentActivity
        .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
        .slice(0, 8)
    });
  })
);

export default router;
