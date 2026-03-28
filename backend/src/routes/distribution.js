import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import {
  requireIdList,
  normalizeOptionalString,
  requireMoney,
  requirePositiveInt
} from "../validators.js";

const router = Router();

router.use(authenticateToken, requirePermission("DISTRIBUTION"));

router.get(
  "/options",
  asyncHandler(async (_req, res) => {
    const [items, users] = await Promise.all([
      prisma.inventoryItem.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          quantity: true,
          unit: true
        }
      }),
      prisma.user.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          active: true
        }
      })
    ]);

    res.json({ items, users });
  })
);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const distributions = await prisma.distribution.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        item: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        bankTransaction: true
      }
    });

    res.json({ distributions });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const itemId = `${req.body.itemId ?? ""}`.trim();
    const assignedToId = `${req.body.assignedToId ?? ""}`.trim();
    const quantity = requirePositiveInt(req.body.quantity, "Quantity");

    if (!itemId || !assignedToId) {
      throw createError(400, "Item and assignee are required.");
    }

    const [item, assignee] = await Promise.all([
      prisma.inventoryItem.findUnique({ where: { id: itemId } }),
      prisma.user.findUnique({ where: { id: assignedToId } })
    ]);

    if (!item) {
      throw createError(404, "Inventory item not found.");
    }

    if (!assignee || !assignee.active) {
      throw createError(404, "Assigned user not found.");
    }

    if (item.quantity < quantity) {
      throw createError(400, "Not enough stock is available for this distribution.");
    }

    const status = ["ASSIGNED", "IN_TRANSIT", "COMPLETED", "CANCELLED"].includes(req.body.status)
      ? req.body.status
      : "ASSIGNED";
    const amountCollected = req.body.amountCollected !== undefined && req.body.amountCollected !== ""
      ? requireMoney(req.body.amountCollected, "Amount collected")
      : null;
    const unitPrice = req.body.unitPrice !== undefined && req.body.unitPrice !== ""
      ? requireMoney(req.body.unitPrice, "Unit price")
      : null;

    const distribution = await prisma.$transaction(async (transaction) => {
      const createdDistribution = await transaction.distribution.create({
        data: {
          itemId,
          assignedToId,
          createdById: req.user.id,
          quantity,
          unitPrice,
          amountCollected,
          status,
          notes: normalizeOptionalString(req.body.notes)
        }
      });

      await transaction.inventoryItem.update({
        where: { id: itemId },
        data: {
          quantity: {
            decrement: quantity
          }
        }
      });

      await transaction.inventoryMovement.create({
        data: {
          itemId,
          quantityDelta: quantity * -1,
          type: "DISTRIBUTED",
          reason: `Assigned to ${assignee.name}`
        }
      });

      if (amountCollected) {
        await transaction.bankTransaction.create({
          data: {
            amount: amountCollected,
            type: "CREDIT",
            sourceSystem: "distribution",
            description: `Collection recorded for ${item.name}`,
            distributionId: createdDistribution.id,
            createdById: req.user.id
          }
        });
      }

      return transaction.distribution.findUnique({
        where: { id: createdDistribution.id },
        include: {
          item: true,
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          bankTransaction: true
        }
      });
    });

    res.status(201).json({ distribution });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingDistribution = await prisma.distribution.findUnique({
      where: { id: req.params.id },
      include: {
        bankTransaction: true
      }
    });

    if (!existingDistribution) {
      throw createError(404, "Distribution not found.");
    }

    const nextItemId = `${req.body.itemId ?? existingDistribution.itemId}`.trim();
    const nextAssignedToId = `${req.body.assignedToId ?? existingDistribution.assignedToId}`.trim();
    const nextQuantity = req.body.quantity !== undefined && req.body.quantity !== ""
      ? requirePositiveInt(req.body.quantity, "Quantity")
      : existingDistribution.quantity;
    const nextStatus = req.body.status !== undefined
      ? ["ASSIGNED", "IN_TRANSIT", "COMPLETED", "CANCELLED"].includes(req.body.status)
        ? req.body.status
        : null
      : existingDistribution.status;

    if (!nextItemId || !nextAssignedToId) {
      throw createError(400, "Item and assignee are required.");
    }

    if (!nextStatus) {
      throw createError(400, "A valid distribution status is required.");
    }

    const nextUnitPrice = req.body.unitPrice !== undefined
      ? req.body.unitPrice !== ""
        ? requireMoney(req.body.unitPrice, "Unit price")
        : null
      : existingDistribution.unitPrice;
    const nextAmountCollected = req.body.amountCollected !== undefined
      ? req.body.amountCollected !== ""
        ? requireMoney(req.body.amountCollected, "Amount collected")
        : null
      : existingDistribution.amountCollected;
    const nextNotes = req.body.notes !== undefined
      ? normalizeOptionalString(req.body.notes)
      : existingDistribution.notes;

    const [items, assignee] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: {
          id: {
            in: [...new Set([existingDistribution.itemId, nextItemId])]
          }
        }
      }),
      prisma.user.findUnique({ where: { id: nextAssignedToId } })
    ]);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const previousItem = itemMap.get(existingDistribution.itemId);
    const nextItem = itemMap.get(nextItemId);

    if (!previousItem || !nextItem) {
      throw createError(404, "Inventory item not found.");
    }

    if (!assignee || (!assignee.active && assignee.id !== existingDistribution.assignedToId)) {
      throw createError(404, "Assigned user not found.");
    }

    if (existingDistribution.itemId === nextItemId) {
      const availableQuantity = previousItem.quantity + existingDistribution.quantity;

      if (availableQuantity < nextQuantity) {
        throw createError(400, "Not enough stock is available for this update.");
      }
    } else if (nextItem.quantity < nextQuantity) {
      throw createError(400, "Not enough stock is available for the newly selected item.");
    }

    await prisma.$transaction(async (transaction) => {
      if (existingDistribution.itemId === nextItemId) {
        await transaction.inventoryItem.update({
          where: { id: nextItemId },
          data: {
            quantity: {
              increment: existingDistribution.quantity - nextQuantity
            }
          }
        });

        if (existingDistribution.quantity !== nextQuantity) {
          await transaction.inventoryMovement.create({
            data: {
              itemId: nextItemId,
              quantityDelta: existingDistribution.quantity - nextQuantity,
              type: "CORRECTION",
              reason: "Distribution update reconciliation"
            }
          });
        }
      } else {
        await transaction.inventoryItem.update({
          where: { id: existingDistribution.itemId },
          data: {
            quantity: {
              increment: existingDistribution.quantity
            }
          }
        });

        await transaction.inventoryMovement.create({
          data: {
            itemId: existingDistribution.itemId,
            quantityDelta: existingDistribution.quantity,
            type: "CORRECTION",
            reason: "Distribution moved to another item"
          }
        });

        await transaction.inventoryItem.update({
          where: { id: nextItemId },
          data: {
            quantity: {
              decrement: nextQuantity
            }
          }
        });

        await transaction.inventoryMovement.create({
          data: {
            itemId: nextItemId,
            quantityDelta: nextQuantity * -1,
            type: "DISTRIBUTED",
            reason: `Reassigned to ${assignee.name}`
          }
        });
      }

      await transaction.distribution.update({
        where: { id: existingDistribution.id },
        data: {
          itemId: nextItemId,
          assignedToId: nextAssignedToId,
          quantity: nextQuantity,
          unitPrice: nextUnitPrice,
          amountCollected: nextAmountCollected,
          status: nextStatus,
          notes: nextNotes
        }
      });

      if (nextAmountCollected) {
        if (existingDistribution.bankTransaction) {
          await transaction.bankTransaction.update({
            where: { id: existingDistribution.bankTransaction.id },
            data: {
              amount: nextAmountCollected,
              type: "CREDIT",
              sourceSystem: "distribution",
              description: `Collection recorded for ${nextItem.name}`,
              createdById: req.user.id
            }
          });
        } else {
          await transaction.bankTransaction.create({
            data: {
              amount: nextAmountCollected,
              type: "CREDIT",
              sourceSystem: "distribution",
              description: `Collection recorded for ${nextItem.name}`,
              distributionId: existingDistribution.id,
              createdById: req.user.id
            }
          });
        }
      } else if (existingDistribution.bankTransaction) {
        await transaction.bankTransaction.delete({
          where: { id: existingDistribution.bankTransaction.id }
        });
      }
    });

    const distribution = await prisma.distribution.findUnique({
      where: { id: existingDistribution.id },
      include: {
        item: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        bankTransaction: true
      }
    });

    res.json({ distribution });
  })
);

router.patch(
  "/bulk-status",
  asyncHandler(async (req, res) => {
    const distributionIds = requireIdList(req.body.ids, "Distributions");
    const status = ["ASSIGNED", "IN_TRANSIT", "COMPLETED", "CANCELLED"].includes(req.body.status)
      ? req.body.status
      : null;

    if (!status) {
      throw createError(400, "A valid distribution status is required.");
    }

    const count = await prisma.distribution.count({
      where: {
        id: {
          in: distributionIds
        }
      }
    });

    if (count !== distributionIds.length) {
      throw createError(404, "One or more distributions were not found.");
    }

    const result = await prisma.distribution.updateMany({
      where: {
        id: {
          in: distributionIds
        }
      },
      data: {
        status,
        ...(req.body.notes !== undefined ? { notes: normalizeOptionalString(req.body.notes) } : {})
      }
    });

    res.json({ updatedCount: result.count });
  })
);

router.patch(
  "/:id/status",
  asyncHandler(async (req, res) => {
    const status = ["ASSIGNED", "IN_TRANSIT", "COMPLETED", "CANCELLED"].includes(req.body.status)
      ? req.body.status
      : null;

    if (!status) {
      throw createError(400, "A valid distribution status is required.");
    }

    const existingDistribution = await prisma.distribution.findUnique({
      where: { id: req.params.id }
    });

    if (!existingDistribution) {
      throw createError(404, "Distribution not found.");
    }

    const distribution = await prisma.distribution.update({
      where: { id: existingDistribution.id },
      data: {
        status,
        notes: normalizeOptionalString(req.body.notes) ?? existingDistribution.notes
      },
      include: {
        item: true,
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        bankTransaction: true
      }
    });

    res.json({ distribution });
  })
);

export default router;
