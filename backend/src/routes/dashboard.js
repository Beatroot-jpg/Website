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
      const [distributionCount, distributionItems] = await Promise.all([
        prisma.distribution.count(),
        prisma.distribution.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
            item: {
              select: {
                name: true
              }
            },
            assignedTo: {
              select: {
                name: true
              }
            }
          }
        })
      ]);

      recentDistributions = distributionItems;

      metrics.push({
        label: "Distributions",
        value: distributionCount,
        tone: "neutral",
        note: "View assignments",
        href: "./distribution.html?view=open#distributionTable"
      });

      recentActivity.push(
        ...distributionItems.map((distribution) => ({
          id: `distribution-${distribution.id}`,
          category: "Distribution",
          title: distribution.item.name,
          detail: `${distribution.quantity} units assigned to ${distribution.assignedTo.name}`,
          badgeLabel: distribution.status,
          tone: distribution.status === "CANCELLED"
            ? "danger"
            : distribution.status === "COMPLETED"
              ? "good"
              : distribution.status === "IN_TRANSIT"
                ? "warn"
                : "accent",
          createdAt: distribution.createdAt,
          href: `./distribution.html?editDistribution=${distribution.id}#distributionForm`
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
