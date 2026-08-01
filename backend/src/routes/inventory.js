import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import {
  authenticateToken,
  requireAdmin,
  requirePermission
} from "../middleware/auth.js";
import { normalizeOptionalString, requireString } from "../validators.js";

const router = Router();
const DIRTY_MONEY_ID = "dirty-money";
const PAGE_SIZE = 10;

function requireNonNegativeInteger(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createError(400, `${fieldName} must be a whole number that is zero or greater.`);
  }

  return parsed;
}

function requireMoneyValue(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError(400, `${fieldName} must be a number that is zero or greater.`);
  }

  return parsed.toFixed(2);
}

function normalizeUnit(value) {
  return normalizeOptionalString(value) || "unit";
}

function normalizeMoneyOperation(value) {
  const operation = `${value ?? ""}`.trim().toUpperCase();

  if (!['SET', 'ADD', 'SUBTRACT'].includes(operation)) {
    throw createError(400, "Choose set, add, or subtract.");
  }

  return operation;
}

function serializeItem(item) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    reorderLevel: item.reorderLevel,
    internalPrice: item.internalPrice.toString(),
    externalPrice: item.externalPrice.toString(),
    updatedAt: item.updatedAt,
    createdAt: item.createdAt
  };
}

function snapshotItem(item) {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    reorderLevel: item.reorderLevel,
    internalPrice: item.internalPrice.toString(),
    externalPrice: item.externalPrice.toString(),
    archived: Boolean(item.archived)
  };
}

function serializeAuditLog(entry) {
  return {
    id: entry.id,
    actorName: entry.actorName || "System",
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary,
    createdAt: entry.createdAt
  };
}

function serializeRestorePoint(point) {
  return {
    id: point.id,
    label: point.label,
    createdByName: point.createdByName || "System",
    createdAt: point.createdAt
  };
}

function canManageInventory(user) {
  return Boolean(user && (user.role === "ADMIN" || user.permissions.includes("INVENTORY")));
}

function canUseAdminTools(user) {
  return Boolean(user && user.role === "ADMIN");
}

async function findDirtyMoneyAccount(database = prisma) {
  return database.inventoryDirtyMoneyAccount.findUnique({
    where: { id: DIRTY_MONEY_ID }
  });
}

async function ensureDirtyMoneyAccount(database = prisma) {
  return database.inventoryDirtyMoneyAccount.upsert({
    where: { id: DIRTY_MONEY_ID },
    update: {},
    create: { id: DIRTY_MONEY_ID, amount: 0 }
  });
}

async function createInventoryAuditLog(database, {
  actor,
  action,
  entityType,
  entityId = null,
  summary,
  before = null,
  after = null
}) {
  return database.inventoryAuditLog.create({
    data: {
      actorId: actor?.id || null,
      actorName: actor?.name || "System",
      action,
      entityType,
      entityId,
      summary,
      before,
      after
    }
  });
}

function createRestoreSnapshot(account, items) {
  return {
    version: 1,
    capturedAt: new Date().toISOString(),
    dirtyMoney: account?.amount?.toString() || "0.00",
    items: items.map(snapshotItem)
  };
}

function getRestoreItems(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw createError(400, "This restore point is invalid.");
  }

  if (!Array.isArray(snapshot.items)) {
    throw createError(400, "This restore point has no inventory data.");
  }

  return snapshot.items.map((item) => ({
    id: requireString(item?.id, "Restore item ID"),
    name: requireString(item?.name, "Restore item name"),
    unit: normalizeUnit(item?.unit),
    quantity: requireNonNegativeInteger(item?.quantity, "Restore quantity"),
    reorderLevel: requireNonNegativeInteger(item?.reorderLevel, "Restore low point"),
    internalPrice: requireMoneyValue(item?.internalPrice, "Restore internal price"),
    externalPrice: requireMoneyValue(item?.externalPrice, "Restore external price")
  }));
}

router.get(
  "/",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const [account, items] = await Promise.all([
      findDirtyMoneyAccount(),
      prisma.inventoryItem.findMany({
        where: { archived: false },
        orderBy: [{ name: "asc" }]
      })
    ]);

    res.json({
      dirtyMoney: account?.amount?.toString() || "0.00",
      items: items.map(serializeItem),
      viewer: {
        isLoggedIn: Boolean(req.user),
        canManage: canManageInventory(req.user),
        canUseAdminTools: canUseAdminTools(req.user)
      }
    });
  })
);

router.post(
  "/dirty-money",
  authenticateToken,
  requirePermission("INVENTORY"),
  asyncHandler(async (req, res) => {
    const operation = normalizeMoneyOperation(req.body.operation);
    const value = Number(requireMoneyValue(req.body.value, "Value"));

    const account = await prisma.$transaction(async (transaction) => {
      const existingAccount = await ensureDirtyMoneyAccount(transaction);
      const beforeAmount = Number(existingAccount.amount);
      const nextAmount = operation === "SET"
        ? value
        : operation === "ADD"
          ? beforeAmount + value
          : beforeAmount - value;

      if (nextAmount < 0) {
        throw createError(400, "Dirty money cannot be reduced below $0.");
      }

      const updatedAccount = await transaction.inventoryDirtyMoneyAccount.update({
        where: { id: DIRTY_MONEY_ID },
        data: { amount: nextAmount.toFixed(2) }
      });

      const actionLabel = operation === "SET" ? "set" : operation === "ADD" ? "added" : "subtracted";
      await createInventoryAuditLog(transaction, {
        actor: req.user,
        action: `DIRTY_MONEY_${operation}`,
        entityType: "DIRTY_MONEY",
        entityId: DIRTY_MONEY_ID,
        summary: `${req.user.name} ${actionLabel} dirty money to $${updatedAccount.amount.toString()}.`,
        before: { amount: existingAccount.amount.toString() },
        after: { amount: updatedAccount.amount.toString(), operation, value: value.toFixed(2) }
      });

      return updatedAccount;
    });

    res.json({ dirtyMoney: account.amount.toString() });
  })
);

router.post(
  "/items",
  authenticateToken,
  requirePermission("INVENTORY"),
  asyncHandler(async (req, res) => {
    const name = requireString(req.body.name, "Item name");
    const duplicate = await prisma.inventoryItem.findFirst({
      where: {
        archived: false,
        name: { equals: name, mode: "insensitive" }
      }
    });

    if (duplicate) {
      throw createError(409, "An active inventory item already uses that name.");
    }

    const quantity = requireNonNegativeInteger(req.body.quantity, "Stock on hand");
    const item = await prisma.$transaction(async (transaction) => {
      const createdItem = await transaction.inventoryItem.create({
        data: {
          name,
          unit: normalizeUnit(req.body.unit),
          quantity,
          reorderLevel: requireNonNegativeInteger(req.body.reorderLevel, "Low point"),
          internalPrice: requireMoneyValue(req.body.internalPrice, "Internal sale price"),
          externalPrice: requireMoneyValue(req.body.externalPrice, "External sale price")
        }
      });

      if (quantity > 0) {
        await transaction.inventoryMovement.create({
          data: {
            itemId: createdItem.id,
            quantityDelta: quantity,
            type: "CORRECTION",
            reason: "Initial inventory listing"
          }
        });
      }

      await createInventoryAuditLog(transaction, {
        actor: req.user,
        action: "ITEM_CREATED",
        entityType: "INVENTORY_ITEM",
        entityId: createdItem.id,
        summary: `${req.user.name} added ${createdItem.name} to inventory.`,
        after: snapshotItem(createdItem)
      });

      return createdItem;
    });

    res.status(201).json({ item: serializeItem(item) });
  })
);

router.patch(
  "/items/:id",
  authenticateToken,
  requirePermission("INVENTORY"),
  asyncHandler(async (req, res) => {
    const existingItem = await prisma.inventoryItem.findFirst({
      where: { id: req.params.id, archived: false }
    });

    if (!existingItem) {
      throw createError(404, "Inventory item not found.");
    }

    const data = {};

    if (req.body.name !== undefined) {
      data.name = requireString(req.body.name, "Item name");
      const duplicate = await prisma.inventoryItem.findFirst({
        where: {
          archived: false,
          name: { equals: data.name, mode: "insensitive" },
          NOT: { id: existingItem.id }
        }
      });

      if (duplicate) {
        throw createError(409, "An active inventory item already uses that name.");
      }
    }

    if (req.body.unit !== undefined) {
      data.unit = normalizeUnit(req.body.unit);
    }

    if (req.body.quantity !== undefined) {
      data.quantity = requireNonNegativeInteger(req.body.quantity, "Stock on hand");
    }

    if (req.body.reorderLevel !== undefined) {
      data.reorderLevel = requireNonNegativeInteger(req.body.reorderLevel, "Low point");
    }

    if (req.body.internalPrice !== undefined) {
      data.internalPrice = requireMoneyValue(req.body.internalPrice, "Internal sale price");
    }

    if (req.body.externalPrice !== undefined) {
      data.externalPrice = requireMoneyValue(req.body.externalPrice, "External sale price");
    }

    if (!Object.keys(data).length) {
      throw createError(400, "Choose at least one inventory value to update.");
    }

    const item = await prisma.$transaction(async (transaction) => {
      const updatedItem = await transaction.inventoryItem.update({
        where: { id: existingItem.id },
        data
      });

      if (data.quantity !== undefined && data.quantity !== existingItem.quantity) {
        await transaction.inventoryMovement.create({
          data: {
            itemId: updatedItem.id,
            quantityDelta: data.quantity - existingItem.quantity,
            type: "CORRECTION",
            reason: "Inventory list update"
          }
        });
      }

      await createInventoryAuditLog(transaction, {
        actor: req.user,
        action: "ITEM_UPDATED",
        entityType: "INVENTORY_ITEM",
        entityId: updatedItem.id,
        summary: `${req.user.name} updated ${updatedItem.name}.`,
        before: snapshotItem(existingItem),
        after: snapshotItem(updatedItem)
      });

      return updatedItem;
    });

    res.json({ item: serializeItem(item) });
  })
);

router.get(
  "/audit",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const [total, entries] = await Promise.all([
      prisma.inventoryAuditLog.count(),
      prisma.inventoryAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE
      })
    ]);

    res.json({
      entries: entries.map(serializeAuditLog),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE))
    });
  })
);

router.get(
  "/restore-points",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const points = await prisma.inventoryRestorePoint.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    });

    res.json({ restorePoints: points.map(serializeRestorePoint) });
  })
);

router.post(
  "/restore-points",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const point = await prisma.$transaction(async (transaction) => {
      const [account, items] = await Promise.all([
        ensureDirtyMoneyAccount(transaction),
        transaction.inventoryItem.findMany({
          where: { archived: false },
          orderBy: { name: "asc" }
        })
      ]);
      const defaultLabel = `Restore point ${new Intl.DateTimeFormat("en-AU", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date())}`;
      const point = await transaction.inventoryRestorePoint.create({
        data: {
          label: normalizeOptionalString(req.body.label) || defaultLabel,
          snapshot: createRestoreSnapshot(account, items),
          createdById: req.user.id,
          createdByName: req.user.name
        }
      });

      await createInventoryAuditLog(transaction, {
        actor: req.user,
        action: "RESTORE_POINT_CREATED",
        entityType: "RESTORE_POINT",
        entityId: point.id,
        summary: `${req.user.name} created restore point \"${point.label}\".`,
        after: { label: point.label, itemCount: items.length, dirtyMoney: account.amount.toString() }
      });

      return point;
    });

    res.status(201).json({ restorePoint: serializeRestorePoint(point) });
  })
);

router.post(
  "/restore-points/:id/restore",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const restorePoint = await prisma.inventoryRestorePoint.findUnique({
      where: { id: req.params.id }
    });

    if (!restorePoint) {
      throw createError(404, "Restore point not found.");
    }

    const restoreItems = getRestoreItems(restorePoint.snapshot);
    const restoreMoney = requireMoneyValue(restorePoint.snapshot.dirtyMoney, "Restore dirty money");

    await prisma.$transaction(async (transaction) => {
      const [account, existingItems] = await Promise.all([
        ensureDirtyMoneyAccount(transaction),
        transaction.inventoryItem.findMany({ orderBy: { name: "asc" } })
      ]);
      const before = createRestoreSnapshot(account, existingItems.filter((item) => !item.archived));
      const restoreIds = restoreItems.map((item) => item.id);

      for (const item of restoreItems) {
        await transaction.inventoryItem.upsert({
          where: { id: item.id },
          update: {
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
            reorderLevel: item.reorderLevel,
            internalPrice: item.internalPrice,
            externalPrice: item.externalPrice,
            archived: false
          },
          create: {
            id: item.id,
            name: item.name,
            unit: item.unit,
            quantity: item.quantity,
            reorderLevel: item.reorderLevel,
            internalPrice: item.internalPrice,
            externalPrice: item.externalPrice,
            archived: false
          }
        });
      }

      const archiveFilter = restoreIds.length
        ? { id: { notIn: restoreIds }, archived: false }
        : { archived: false };
      await transaction.inventoryItem.updateMany({
        where: archiveFilter,
        data: { archived: true }
      });
      await transaction.inventoryDirtyMoneyAccount.update({
        where: { id: DIRTY_MONEY_ID },
        data: { amount: restoreMoney }
      });

      await createInventoryAuditLog(transaction, {
        actor: req.user,
        action: "RESTORE_POINT_REINSTATED",
        entityType: "RESTORE_POINT",
        entityId: restorePoint.id,
        summary: `${req.user.name} reinstated restore point \"${restorePoint.label}\".`,
        before,
        after: {
          restorePointId: restorePoint.id,
          restorePointLabel: restorePoint.label,
          dirtyMoney: restoreMoney,
          itemCount: restoreItems.length
        }
      });
    });

    res.json({ message: `Reinstated ${restorePoint.label}.` });
  })
);

export default router;