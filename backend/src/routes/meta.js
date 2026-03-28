import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authenticateToken, listPermissionMetadata } from "../middleware/auth.js";

const router = Router();

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
    const canViewBank = allowed.has("BANK") || req.user.role === "ADMIN";
    const canViewDistribution = allowed.has("DISTRIBUTION") || req.user.role === "ADMIN";
    const canViewUsers = allowed.has("USERS") || req.user.role === "ADMIN";
    const containsFilter = { contains: query, mode: "insensitive" };

    const resultSets = await Promise.all([
      canViewInventory
        ? prisma.inventoryItem.findMany({
          where: {
            OR: [
              { name: containsFilter },
              { sku: containsFilter },
              { category: containsFilter }
            ]
          },
          orderBy: { updatedAt: "desc" },
          take: 4,
          select: {
            id: true,
            name: true,
            sku: true,
            quantity: true,
            unit: true,
            updatedAt: true
          }
        }).then((items) => items.map((item) => ({
          id: `inventory-${item.id}`,
          group: "Inventory",
          title: item.name,
          subtitle: `${item.sku || "No SKU"} - ${item.quantity} ${item.unit}`,
          href: `./inventory.html?editItem=${item.id}#inventoryForm`,
          tone: item.quantity <= 0 ? "warn" : "accent",
          sortAt: item.updatedAt
        })))
        : [],
      canViewDistribution
        ? prisma.distribution.findMany({
          where: {
            OR: [
              { item: { name: containsFilter } },
              { assignedTo: { name: containsFilter } },
              { notes: containsFilter }
            ]
          },
          orderBy: { createdAt: "desc" },
          take: 4,
          include: {
            item: {
              select: {
                id: true,
                name: true
              }
            },
            assignedTo: {
              select: {
                name: true
              }
            }
          }
        }).then((items) => items.map((item) => ({
          id: `distribution-${item.id}`,
          group: "Distribution",
          title: item.item.name,
          subtitle: `${item.quantity} units for ${item.assignedTo.name}`,
          href: `./distribution.html?editDistribution=${item.id}#distributionForm`,
          tone: item.status === "COMPLETED" ? "good" : item.status === "CANCELLED" ? "danger" : "accent",
          sortAt: item.createdAt
        })))
        : [],
      canViewBank
        ? prisma.bankTransaction.findMany({
          where: {
            OR: [
              { description: containsFilter },
              { sourceSystem: containsFilter }
            ]
          },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: {
            id: true,
            description: true,
            type: true,
            sourceSystem: true,
            amount: true,
            distributionId: true,
            createdAt: true
          }
        }).then((items) => items.map((item) => ({
          id: `bank-${item.id}`,
          group: "Bank",
          title: item.description || `${item.type} transaction`,
          subtitle: `${item.sourceSystem} - ${item.amount}`,
          href: item.distributionId && canViewDistribution
            ? `./distribution.html?editDistribution=${item.distributionId}#distributionForm`
            : item.distributionId
              ? `./bank.html?search=${encodeURIComponent(item.description || item.type)}#transactionTable`
              : `./bank.html?editTransaction=${item.id}#transactionForm`,
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
