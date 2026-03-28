import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { getBankBalance } from "../services/bank.js";

const router = Router();

router.use(authenticateToken, requirePermission("DASHBOARD"));

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
      const [itemCount, itemsForAlerts, quantityAggregate, recentMovements] = await Promise.all([
        prisma.inventoryItem.count(),
        prisma.inventoryItem.findMany({
          select: {
            id: true,
            name: true,
            quantity: true,
            reorderLevel: true,
            unit: true,
            updatedAt: true
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
      lowStockItems = itemsForAlerts
        .filter((item) => item.reorderLevel > 0 && item.quantity <= item.reorderLevel)
        .sort((left, right) => left.quantity - right.quantity || right.reorderLevel - left.reorderLevel)
        .slice(0, 5);
      const lowStockCount = lowStockItems.length;

      metrics.push(
        {
          label: "Inventory items",
          value: itemCount,
          tone: "neutral",
          note: "Open stock list",
          href: "./inventory.html#inventoryTable"
        },
        {
          label: "Low stock alerts",
          value: lowStockCount,
          tone: lowStockCount > 0 ? "warn" : "good",
          note: lowStockCount > 0 ? "Open low-stock view" : "All thresholds healthy",
          href: "./inventory.html?view=low-stock#inventoryTable"
        },
        {
          label: "Units on hand",
          value: quantityAggregate._sum.quantity || 0,
          tone: "neutral",
          note: "Review inventory",
          href: "./inventory.html#inventoryTable"
        }
      );

      recentActivity.push(
        ...recentMovements.map((movement) => ({
          id: `movement-${movement.id}`,
          category: "Inventory",
          title: movement.item.name,
          detail: `${movement.type.replaceAll("_", " ")} ${Math.abs(movement.quantityDelta)} ${movement.item.unit}`,
          badgeLabel: movement.type.replaceAll("_", " "),
          tone: movement.quantityDelta < 0 ? "warn" : "good",
          createdAt: movement.createdAt,
          href: movement.type === "DISTRIBUTED"
            ? `./inventory.html?editItem=${movement.item.id}#inventoryForm`
            : `./inventory.html?editMovement=${movement.id}#adjustForm`
        }))
      );
    }

    if (canViewBank) {
      const [balance, bankTransactions] = await Promise.all([
        getBankBalance(),
        prisma.bankTransaction.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          include: {
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

      recentTransactions = bankTransactions;

      metrics.push({
        label: "Bank balance",
        value: balance,
        tone: "good",
        currency: true,
        note: "Open ledger",
        href: "./bank.html#transactionTable"
      });

      recentActivity.push(
        ...bankTransactions.map((transaction) => ({
          id: `transaction-${transaction.id}`,
          category: "Bank",
          title: transaction.description || `${transaction.type} transaction`,
          detail: `${transaction.sourceSystem} source`,
          badgeLabel: transaction.type,
          tone: transaction.type === "DEBIT" ? "danger" : "good",
          createdAt: transaction.createdAt,
          href: transaction.distributionId && canViewDistribution
            ? `./distribution.html?editDistribution=${transaction.distributionId}#distributionForm`
            : transaction.distributionId
              ? `./bank.html?search=${encodeURIComponent(transaction.description || transaction.type)}#transactionTable`
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
