import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import {
  requireIdList,
  normalizeOptionalString,
  requireInt,
  requireString
} from "../validators.js";

const router = Router();

router.use(authenticateToken, requirePermission("INVENTORY"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    res.json({ items });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const quantity = req.body.quantity !== undefined && req.body.quantity !== ""
      ? requireInt(req.body.quantity, "Quantity")
      : 0;
    const reorderLevel = req.body.reorderLevel !== undefined && req.body.reorderLevel !== ""
      ? requireInt(req.body.reorderLevel, "Reorder level")
      : 0;

    if (quantity < 0 || reorderLevel < 0) {
      throw createError(400, "Quantity and reorder level cannot be negative.");
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name: requireString(req.body.name, "Name"),
        sku: normalizeOptionalString(req.body.sku),
        category: normalizeOptionalString(req.body.category),
        unit: requireString(req.body.unit || "unit", "Unit"),
        quantity,
        reorderLevel,
        notes: normalizeOptionalString(req.body.notes),
        movements: quantity > 0 ? {
          create: {
            quantityDelta: quantity,
            type: "STOCK_IN",
            reason: "Initial stock"
          }
        } : undefined
      },
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    res.status(201).json({ item });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingItem = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    if (!existingItem) {
      throw createError(404, "Inventory item not found.");
    }

    const updateData = {
      name: req.body.name !== undefined
        ? requireString(req.body.name, "Name")
        : existingItem.name,
      sku: req.body.sku !== undefined
        ? normalizeOptionalString(req.body.sku)
        : existingItem.sku,
      category: req.body.category !== undefined
        ? normalizeOptionalString(req.body.category)
        : existingItem.category,
      unit: req.body.unit !== undefined
        ? requireString(req.body.unit || "unit", "Unit")
        : existingItem.unit,
      reorderLevel: req.body.reorderLevel !== undefined && req.body.reorderLevel !== ""
        ? requireInt(req.body.reorderLevel, "Reorder level")
        : req.body.reorderLevel !== undefined
          ? 0
          : existingItem.reorderLevel,
      notes: req.body.notes !== undefined
        ? normalizeOptionalString(req.body.notes)
        : existingItem.notes
    };

    if (updateData.reorderLevel < 0) {
      throw createError(400, "Reorder level cannot be negative.");
    }

    const item = await prisma.inventoryItem.update({
      where: { id: existingItem.id },
      data: updateData,
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 5
        }
      }
    });

    res.json({ item });
  })
);

router.post(
  "/bulk-adjust",
  asyncHandler(async (req, res) => {
    const itemIds = requireIdList(req.body.itemIds, "Inventory items");
    const quantityDelta = requireInt(req.body.quantityDelta, "Adjustment quantity");

    if (quantityDelta === 0) {
      throw createError(400, "Adjustment quantity cannot be zero.");
    }

    const type = ["STOCK_IN", "STOCK_OUT", "CORRECTION"].includes(req.body.type)
      ? req.body.type
      : "CORRECTION";
    const items = await prisma.inventoryItem.findMany({
      where: {
        id: {
          in: itemIds
        }
      },
      select: {
        id: true,
        quantity: true
      }
    });

    if (items.length !== itemIds.length) {
      throw createError(404, "One or more inventory items were not found.");
    }

    items.forEach((item) => {
      if (item.quantity + quantityDelta < 0) {
        throw createError(400, "One or more selected items would move below zero stock.");
      }
    });

    await prisma.$transaction(async (transaction) => {
      for (const item of items) {
        await transaction.inventoryMovement.create({
          data: {
            itemId: item.id,
            quantityDelta,
            type,
            reason: normalizeOptionalString(req.body.reason) || "Bulk adjustment"
          }
        });

        await transaction.inventoryItem.update({
          where: { id: item.id },
          data: {
            quantity: {
              increment: quantityDelta
            }
          }
        });
      }
    });

    res.json({ updatedCount: items.length });
  })
);

router.patch(
  "/movements/:movementId",
  asyncHandler(async (req, res) => {
    const movement = await prisma.inventoryMovement.findUnique({
      where: { id: req.params.movementId }
    });

    if (!movement) {
      throw createError(404, "Inventory movement not found.");
    }

    if (!["STOCK_IN", "STOCK_OUT", "CORRECTION"].includes(movement.type)) {
      throw createError(400, "This movement must be edited from its source system.");
    }

    const nextItemId = `${req.body.itemId ?? movement.itemId}`.trim();
    const nextQuantityDelta = req.body.quantityDelta !== undefined
      ? requireInt(req.body.quantityDelta, "Adjustment quantity")
      : movement.quantityDelta;
    const nextType = req.body.type !== undefined
      ? ["STOCK_IN", "STOCK_OUT", "CORRECTION"].includes(req.body.type)
        ? req.body.type
        : null
      : movement.type;

    if (!nextItemId) {
      throw createError(400, "Item is required.");
    }

    if (!nextType) {
      throw createError(400, "A valid adjustment type is required.");
    }

    if (nextQuantityDelta === 0) {
      throw createError(400, "Adjustment quantity cannot be zero.");
    }

    const itemIds = [...new Set([movement.itemId, nextItemId])];
    const items = await prisma.inventoryItem.findMany({
      where: {
        id: {
          in: itemIds
        }
      },
      select: {
        id: true,
        quantity: true
      }
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const previousItem = itemMap.get(movement.itemId);
    const nextItem = itemMap.get(nextItemId);

    if (!previousItem || !nextItem) {
      throw createError(404, "Inventory item not found.");
    }

    if (movement.itemId === nextItemId) {
      const nextQuantity = previousItem.quantity - movement.quantityDelta + nextQuantityDelta;

      if (nextQuantity < 0) {
        throw createError(400, "This update would move stock below zero.");
      }
    } else {
      if (previousItem.quantity - movement.quantityDelta < 0) {
        throw createError(400, "This update would move the original item below zero.");
      }

      if (nextItem.quantity + nextQuantityDelta < 0) {
        throw createError(400, "This update would move the selected item below zero.");
      }
    }

    await prisma.$transaction(async (transaction) => {
      if (movement.itemId === nextItemId) {
        await transaction.inventoryItem.update({
          where: { id: movement.itemId },
          data: {
            quantity: previousItem.quantity - movement.quantityDelta + nextQuantityDelta
          }
        });
      } else {
        await transaction.inventoryItem.update({
          where: { id: movement.itemId },
          data: {
            quantity: {
              increment: movement.quantityDelta * -1
            }
          }
        });

        await transaction.inventoryItem.update({
          where: { id: nextItemId },
          data: {
            quantity: {
              increment: nextQuantityDelta
            }
          }
        });
      }

      await transaction.inventoryMovement.update({
        where: { id: movement.id },
        data: {
          itemId: nextItemId,
          quantityDelta: nextQuantityDelta,
          type: nextType,
          reason: req.body.reason !== undefined
            ? normalizeOptionalString(req.body.reason)
            : movement.reason
        }
      });
    });

    const updatedMovement = await prisma.inventoryMovement.findUnique({
      where: { id: movement.id }
    });

    res.json({ movement: updatedMovement });
  })
);

router.post(
  "/:id/adjust",
  asyncHandler(async (req, res) => {
    const quantityDelta = requireInt(req.body.quantityDelta, "Adjustment quantity");

    if (quantityDelta === 0) {
      throw createError(400, "Adjustment quantity cannot be zero.");
    }

    const type = ["STOCK_IN", "STOCK_OUT", "CORRECTION"].includes(req.body.type)
      ? req.body.type
      : "CORRECTION";

    const item = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id }
    });

    if (!item) {
      throw createError(404, "Inventory item not found.");
    }

    const newQuantity = item.quantity + quantityDelta;

    if (newQuantity < 0) {
      throw createError(400, "Adjustment would move stock below zero.");
    }

    const updatedItem = await prisma.$transaction(async (transaction) => {
      await transaction.inventoryMovement.create({
        data: {
          itemId: item.id,
          quantityDelta,
          type,
          reason: normalizeOptionalString(req.body.reason)
        }
      });

      return transaction.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: newQuantity },
        include: {
          movements: {
            orderBy: { createdAt: "desc" },
            take: 5
          }
        }
      });
    });

    res.json({ item: updatedItem });
  })
);

export default router;
