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

function normalizeMovementType(value, fallback = "CORRECTION") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!["STOCK_IN", "STOCK_OUT", "CORRECTION"].includes(normalized)) {
    throw createError(400, "A valid adjustment type is required.");
  }

  return normalized;
}

function requireAmount(value, type) {
  const parsed = requireInt(value, "Amount");

  if (type === "CORRECTION") {
    if (parsed < 0) {
      throw createError(400, "Correction amount cannot be negative.");
    }

    return parsed;
  }

  const amount = Math.abs(parsed);

  if (amount === 0) {
    throw createError(400, "Amount must be greater than 0.");
  }

  return amount;
}

function readPositivePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

async function resolveQuantityDelta({ rawAmount, type, currentQuantity, itemId, movementId = null, createdAt = null }) {
  const amount = requireAmount(rawAmount, type);

  if (type === "STOCK_IN") {
    return amount;
  }

  if (type === "STOCK_OUT") {
    if (currentQuantity - amount < 0) {
      throw createError(400, "Adjustment would move stock below zero.");
    }

    return amount * -1;
  }

  if (!movementId || !createdAt) {
    return amount - currentQuantity;
  }

  const laterMovementAggregate = await prisma.inventoryMovement.aggregate({
    where: {
      itemId,
      createdAt: {
        gt: createdAt
      }
    },
    _sum: {
      quantityDelta: true
    }
  });

  const laterNet = Number(laterMovementAggregate._sum.quantityDelta || 0);
  const quantityBeforeMovement = currentQuantity - laterNet;
  return amount - quantityBeforeMovement;
}

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

router.get(
  "/movements",
  asyncHandler(async (req, res) => {
    const page = readPositivePage(req.query.page, 1);
    const pageSize = Math.min(readPositivePage(req.query.pageSize, 8), 50);
    const skip = (page - 1) * pageSize;

    const [total, movements] = await Promise.all([
      prisma.inventoryMovement.count(),
      prisma.inventoryMovement.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          item: {
            select: {
              id: true,
              name: true,
              unit: true,
              quantity: true
            }
          }
        }
      })
    ]);

    const movementsWithDisplayQuantity = await Promise.all(movements.map(async (movement) => {
      if (movement.type !== "CORRECTION") {
        return {
          ...movement,
          displayQuantity: Math.abs(Number(movement.quantityDelta || 0))
        };
      }

      const laterMovementAggregate = await prisma.inventoryMovement.aggregate({
        where: {
          itemId: movement.itemId,
          createdAt: {
            gt: movement.createdAt
          }
        },
        _sum: {
          quantityDelta: true
        }
      });
      const laterNet = Number(laterMovementAggregate._sum.quantityDelta || 0);

      return {
        ...movement,
        displayQuantity: Number(movement.item?.quantity || 0) - laterNet
      };
    }));

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    res.json({
      movements: movementsWithDisplayQuantity,
      pagination: {
        page: Math.min(page, totalPages),
        pageSize,
        total,
        totalPages
      }
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const quantity = req.body.quantity !== undefined && req.body.quantity !== ""
      ? requireInt(req.body.quantity, "Quantity")
      : 0;
    const lowPoint = req.body.lowPoint !== undefined && req.body.lowPoint !== ""
      ? requireInt(req.body.lowPoint, "Low point")
      : 0;

    if (quantity < 0) {
      throw createError(400, "Quantity cannot be negative.");
    }

    if (lowPoint < 0) {
      throw createError(400, "Low point cannot be negative.");
    }

    const item = await prisma.inventoryItem.create({
      data: {
        name: requireString(req.body.name, "Name"),
        category: normalizeOptionalString(req.body.category),
        unit: requireString(req.body.unit || "unit", "Unit"),
        quantity,
        reorderLevel: lowPoint,
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
      category: req.body.category !== undefined
        ? normalizeOptionalString(req.body.category)
        : existingItem.category,
      unit: req.body.unit !== undefined
        ? requireString(req.body.unit || "unit", "Unit")
        : existingItem.unit,
      reorderLevel: req.body.lowPoint !== undefined
        ? requireInt(req.body.lowPoint, "Low point")
        : existingItem.reorderLevel,
      notes: req.body.notes !== undefined
        ? normalizeOptionalString(req.body.notes)
        : existingItem.notes
    };

    if (updateData.reorderLevel < 0) {
      throw createError(400, "Low point cannot be negative.");
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

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingItem = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        distributions: {
          select: {
            id: true
          }
        },
        runnerDistributions: {
          select: {
            id: true,
            collections: {
              select: {
                bankTransactionId: true
              }
            }
          }
        }
      }
    });

    if (!existingItem) {
      throw createError(404, "Inventory item not found.");
    }

    const legacyDistributionIds = existingItem.distributions.map((distribution) => distribution.id);
    const runnerDistributionIds = existingItem.runnerDistributions.map((distribution) => distribution.id);
    const depositedTransactionIds = [...new Set(
      existingItem.runnerDistributions
        .flatMap((distribution) => distribution.collections || [])
        .map((collection) => collection.bankTransactionId)
        .filter(Boolean)
    )];

    await prisma.$transaction(async (transaction) => {
      if (depositedTransactionIds.length) {
        await transaction.bankTransaction.deleteMany({
          where: {
            id: {
              in: depositedTransactionIds
            }
          }
        });
      }

      if (legacyDistributionIds.length) {
        await transaction.bankTransaction.deleteMany({
          where: {
            distributionId: {
              in: legacyDistributionIds
            }
          }
        });

        await transaction.distribution.deleteMany({
          where: {
            id: {
              in: legacyDistributionIds
            }
          }
        });
      }

      if (runnerDistributionIds.length) {
        await transaction.runnerDistribution.deleteMany({
          where: {
            id: {
              in: runnerDistributionIds
            }
          }
        });
      }

      await transaction.inventoryItem.delete({
        where: { id: existingItem.id }
      });
    });

    res.json({
      deletedId: existingItem.id,
      message: `${existingItem.name} deleted.`
    });
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
    const nextType = req.body.type !== undefined
      ? normalizeMovementType(req.body.type)
      : movement.type;

    if (!nextItemId) {
      throw createError(400, "Item is required.");
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

    const currentQuantityWithoutMovement = movement.itemId === nextItemId
      ? previousItem.quantity - movement.quantityDelta
      : nextItem.quantity;
    const fallbackAmount = movement.type === "CORRECTION"
      ? previousItem.quantity
      : Math.abs(movement.quantityDelta);
    const nextQuantityDelta = await resolveQuantityDelta({
      rawAmount: req.body.quantityDelta !== undefined ? req.body.quantityDelta : fallbackAmount,
      type: nextType,
      currentQuantity: currentQuantityWithoutMovement,
      itemId: nextItemId,
      movementId: movement.id,
      createdAt: movement.createdAt
    });

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
    const type = normalizeMovementType(req.body.type);

    const item = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id }
    });

    if (!item) {
      throw createError(404, "Inventory item not found.");
    }

    const quantityDelta = await resolveQuantityDelta({
      rawAmount: req.body.quantityDelta,
      type,
      currentQuantity: item.quantity,
      itemId: item.id
    });
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
