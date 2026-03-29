import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { getBankBalances, getEntryTypeFromTransaction } from "../services/bank.js";

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

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const metrics = [];
    const allowed = new Set(req.user.permissions);
    const canViewInventory = allowed.has("INVENTORY") || req.user.role === "ADMIN";
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
          href: transaction.distributionId && canViewDistribution
            ? `./distribution.html?editDistribution=${transaction.distributionId}#distributionForm`
            : transaction.distributionId
              ? `./bank.html?search=${encodeURIComponent(transaction.description || transaction.moneyType)}#transactionTable`
              : `./bank.html?editTransaction=${transaction.id}#transactionForm`
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
