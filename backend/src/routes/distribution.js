import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import {
  requireIdList,
  normalizeOptionalString,
  requireMoney,
  requirePositiveInt,
  requireString
} from "../validators.js";

const router = Router();

router.use(authenticateToken, requirePermission("DISTRIBUTION"));

const FINAL_STATUSES = new Set(["CLEARED", "FAULTY"]);
const OPEN_STATUSES = new Set(["ACTIVE", "PARTIAL"]);

function toMoneyNumber(value) {
  return Number(value || 0);
}

function toMoneyString(value) {
  return Number(value || 0).toFixed(2);
}

function normalizeCollectionAction(value) {
  const normalized = `${value ?? ""}`.trim().toUpperCase();

  if (!["PARTIAL_PAYMENT", "FULL_CLEAR", "FAULTY_CLEAR"].includes(normalized)) {
    throw createError(400, "A valid collection action is required.");
  }

  return normalized;
}

function calculateDistributionState(collections, totalOwedValue) {
  const totalOwed = toMoneyNumber(totalOwedValue);
  const paidAmount = collections.reduce((sum, collection) => {
    if (collection.action === "FAULTY_CLEAR") {
      return sum;
    }

    return sum + toMoneyNumber(collection.amount);
  }, 0);
  const hasFaultyClear = collections.some((collection) => collection.action === "FAULTY_CLEAR");
  const hasFullClear = collections.some((collection) => collection.action === "FULL_CLEAR");
  const faultyClearCount = collections.filter((collection) => collection.action === "FAULTY_CLEAR").length;
  const fullClearCount = collections.filter((collection) => collection.action === "FULL_CLEAR").length;

  if (faultyClearCount > 1) {
    throw createError(400, "Only one faulty clear entry is allowed.");
  }

  if (fullClearCount > 1) {
    throw createError(400, "Only one full clear entry is allowed.");
  }

  if (hasFaultyClear && hasFullClear) {
    throw createError(400, "A distribution cannot have both a full clear and a faulty clear.");
  }

  if (collections.some((collection) => collection.action === "FAULTY_CLEAR" && toMoneyNumber(collection.amount) !== 0)) {
    throw createError(400, "Faulty clear entries must use 0.00 amount.");
  }

  if (paidAmount > totalOwed + 0.0001) {
    throw createError(400, "Collections cannot exceed the total amount owed.");
  }

  let status = "ACTIVE";

  if (hasFaultyClear) {
    status = "FAULTY";
  } else if (paidAmount >= totalOwed && totalOwed > 0) {
    status = "CLEARED";
  } else if (paidAmount > 0) {
    status = "PARTIAL";
  }

  if (hasFullClear && Math.abs(paidAmount - totalOwed) > 0.0001) {
    throw createError(400, "A full clear entry must leave the distribution fully paid.");
  }

  return {
    amountReturned: toMoneyString(paidAmount),
    status
  };
}

function distributionInclude() {
  return {
    item: {
      select: {
        id: true,
        name: true,
        category: true,
        unit: true,
        quantity: true
      }
    },
    distributor: true,
    createdBy: {
      select: {
        id: true,
        name: true,
        email: true
      }
    },
    collections: {
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        bankTransaction: {
          select: {
            id: true,
            amount: true,
            createdAt: true,
            sourceSystem: true,
            moneyType: true
          }
        }
      }
    }
  };
}

function collectionInclude() {
  return {
    distribution: {
      include: {
        item: {
          select: {
            id: true,
            name: true,
            unit: true
          }
        },
        distributor: true
      }
    },
    createdBy: {
      select: {
        id: true,
        name: true,
        email: true
      }
    },
    bankTransaction: {
      select: {
        id: true,
        amount: true,
        createdAt: true,
        sourceSystem: true,
        moneyType: true
      }
    }
  };
}

function summarizeDistributionData(distributions, ledgerEntries, distributors) {
  const activeDistributions = distributions.filter((distribution) => OPEN_STATUSES.has(distribution.status));
  const outstandingTotal = activeDistributions.reduce((sum, distribution) => (
    sum + Math.max(0, toMoneyNumber(distribution.totalOwed) - toMoneyNumber(distribution.amountReturned))
  ), 0);
  const pendingLedgerEntries = ledgerEntries.filter((entry) => entry.status === "PENDING");
  const pendingLedgerTotal = pendingLedgerEntries.reduce((sum, entry) => sum + toMoneyNumber(entry.amount), 0);
  const depositedLedgerTotal = ledgerEntries
    .filter((entry) => entry.status === "DEPOSITED")
    .reduce((sum, entry) => sum + toMoneyNumber(entry.amount), 0);

  return {
    activeCount: activeDistributions.length,
    outstandingTotal: toMoneyString(outstandingTotal),
    pendingLedgerCount: pendingLedgerEntries.length,
    pendingLedgerTotal: toMoneyString(pendingLedgerTotal),
    depositedLedgerTotal: toMoneyString(depositedLedgerTotal),
    distributorCount: distributors.filter((distributor) => distributor.active).length
  };
}

async function refreshDistributionState(transaction, distributionId) {
  const distribution = await transaction.runnerDistribution.findUnique({
    where: { id: distributionId },
    include: {
      collections: true
    }
  });

  if (!distribution) {
    throw createError(404, "Distribution not found.");
  }

  const nextState = calculateDistributionState(distribution.collections, distribution.totalOwed);

  await transaction.runnerDistribution.update({
    where: { id: distribution.id },
    data: {
      amountReturned: nextState.amountReturned,
      status: nextState.status
    }
  });
}

router.get(
  "/options",
  asyncHandler(async (_req, res) => {
    const [items, distributors] = await Promise.all([
      prisma.inventoryItem.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          category: true,
          quantity: true,
          unit: true
        }
      }),
      prisma.distributor.findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          number: true,
          active: true
        }
      })
    ]);

    res.json({ items, distributors });
  })
);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [distributors, distributions, ledgerEntries] = await Promise.all([
      prisma.distributor.findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }]
      }),
      prisma.runnerDistribution.findMany({
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: distributionInclude()
      }),
      prisma.distributionCollection.findMany({
        orderBy: { createdAt: "desc" },
        include: collectionInclude()
      })
    ]);

    res.json({
      summary: summarizeDistributionData(distributions, ledgerEntries, distributors),
      distributors,
      distributions,
      ledgerEntries
    });
  })
);

router.post(
  "/distributors",
  asyncHandler(async (req, res) => {
    const distributor = await prisma.distributor.create({
      data: {
        name: requireString(req.body.name, "Runner name"),
        number: requireString(req.body.number, "Runner number"),
        active: typeof req.body.active === "boolean" ? req.body.active : true
      }
    });

    res.status(201).json({ distributor });
  })
);

router.patch(
  "/distributors/:id",
  asyncHandler(async (req, res) => {
    const existingDistributor = await prisma.distributor.findUnique({
      where: { id: req.params.id }
    });

    if (!existingDistributor) {
      throw createError(404, "Runner not found.");
    }

    const distributor = await prisma.distributor.update({
      where: { id: existingDistributor.id },
      data: {
        name: req.body.name !== undefined
          ? requireString(req.body.name, "Runner name")
          : existingDistributor.name,
        number: req.body.number !== undefined
          ? requireString(req.body.number, "Runner number")
          : existingDistributor.number,
        active: typeof req.body.active === "boolean"
          ? req.body.active
          : existingDistributor.active
      }
    });

    res.json({ distributor });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const itemId = `${req.body.itemId ?? ""}`.trim();
    const distributorId = `${req.body.distributorId ?? ""}`.trim();
    const quantity = requirePositiveInt(req.body.quantity, "Quantity");
    const unitValue = requireMoney(req.body.unitValue, "Unit value");

    if (!itemId || !distributorId) {
      throw createError(400, "Item and runner are required.");
    }

    const [item, distributor] = await Promise.all([
      prisma.inventoryItem.findUnique({ where: { id: itemId } }),
      prisma.distributor.findUnique({ where: { id: distributorId } })
    ]);

    if (!item) {
      throw createError(404, "Inventory item not found.");
    }

    if (!distributor || !distributor.active) {
      throw createError(404, "Runner not found.");
    }

    if (item.quantity < quantity) {
      throw createError(400, "Not enough stock is available for this distribution.");
    }

    const totalOwed = toMoneyString(quantity * toMoneyNumber(unitValue));

    const distribution = await prisma.$transaction(async (transaction) => {
      const createdDistribution = await transaction.runnerDistribution.create({
        data: {
          itemId,
          distributorId,
          createdById: req.user.id,
          quantity,
          unitValue,
          totalOwed,
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
          reason: `Handed to ${distributor.name} (${distributor.number})`
        }
      });

      return transaction.runnerDistribution.findUnique({
        where: { id: createdDistribution.id },
        include: distributionInclude()
      });
    });

    res.status(201).json({ distribution });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingDistribution = await prisma.runnerDistribution.findUnique({
      where: { id: req.params.id },
      include: {
        collections: true
      }
    });

    if (!existingDistribution) {
      throw createError(404, "Distribution not found.");
    }

    const hasCollectionHistory = existingDistribution.collections.length > 0;
    const hasCoreEdits = ["itemId", "distributorId", "quantity", "unitValue"].some((key) => req.body[key] !== undefined && req.body[key] !== "");

    if (hasCollectionHistory && hasCoreEdits) {
      throw createError(400, "Once collections have started, only notes can be edited on the distribution.");
    }

    const nextNotes = req.body.notes !== undefined
      ? normalizeOptionalString(req.body.notes)
      : existingDistribution.notes;

    if (!hasCoreEdits) {
      const distribution = await prisma.runnerDistribution.update({
        where: { id: existingDistribution.id },
        data: {
          notes: nextNotes
        },
        include: distributionInclude()
      });

      return res.json({ distribution });
    }

    const nextItemId = `${req.body.itemId ?? existingDistribution.itemId}`.trim();
    const nextDistributorId = `${req.body.distributorId ?? existingDistribution.distributorId}`.trim();
    const nextQuantity = req.body.quantity !== undefined && req.body.quantity !== ""
      ? requirePositiveInt(req.body.quantity, "Quantity")
      : existingDistribution.quantity;
    const nextUnitValue = req.body.unitValue !== undefined && req.body.unitValue !== ""
      ? requireMoney(req.body.unitValue, "Unit value")
      : existingDistribution.unitValue;

    const [items, distributor] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: {
          id: {
            in: [...new Set([existingDistribution.itemId, nextItemId])]
          }
        }
      }),
      prisma.distributor.findUnique({ where: { id: nextDistributorId } })
    ]);
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const previousItem = itemMap.get(existingDistribution.itemId);
    const nextItem = itemMap.get(nextItemId);

    if (!previousItem || !nextItem) {
      throw createError(404, "Inventory item not found.");
    }

    if (!distributor || (!distributor.active && distributor.id !== existingDistribution.distributorId)) {
      throw createError(404, "Runner not found.");
    }

    if (existingDistribution.itemId === nextItemId) {
      const availableQuantity = previousItem.quantity + existingDistribution.quantity;

      if (availableQuantity < nextQuantity) {
        throw createError(400, "Not enough stock is available for this update.");
      }
    } else if (nextItem.quantity < nextQuantity) {
      throw createError(400, "Not enough stock is available for the newly selected item.");
    }

    const totalOwed = toMoneyString(nextQuantity * toMoneyNumber(nextUnitValue));

    await prisma.$transaction(async (transaction) => {
      if (existingDistribution.itemId === nextItemId) {
        const quantityDelta = existingDistribution.quantity - nextQuantity;

        await transaction.inventoryItem.update({
          where: { id: nextItemId },
          data: {
            quantity: {
              increment: quantityDelta
            }
          }
        });

        if (quantityDelta !== 0) {
          await transaction.inventoryMovement.create({
            data: {
              itemId: nextItemId,
              quantityDelta,
              type: "CORRECTION",
              reason: "Runner distribution update reconciliation"
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
            reason: "Runner distribution moved to another item"
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
            reason: `Handed to ${distributor.name} (${distributor.number})`
          }
        });
      }

      await transaction.runnerDistribution.update({
        where: { id: existingDistribution.id },
        data: {
          itemId: nextItemId,
          distributorId: nextDistributorId,
          quantity: nextQuantity,
          unitValue: nextUnitValue,
          totalOwed,
          notes: nextNotes
        }
      });
    });

    const distribution = await prisma.runnerDistribution.findUnique({
      where: { id: existingDistribution.id },
      include: distributionInclude()
    });

    res.json({ distribution });
  })
);

router.post(
  "/:id/collections",
  asyncHandler(async (req, res) => {
    const distribution = await prisma.runnerDistribution.findUnique({
      where: { id: req.params.id },
      include: {
        collections: true
      }
    });

    if (!distribution) {
      throw createError(404, "Distribution not found.");
    }

    if (FINAL_STATUSES.has(distribution.status)) {
      throw createError(400, "This distribution is already closed.");
    }

    const action = normalizeCollectionAction(req.body.action);
    const amount = req.body.amount !== undefined && req.body.amount !== ""
      ? requireMoney(req.body.amount, "Amount returned")
      : "0.00";

    if (action !== "FAULTY_CLEAR" && toMoneyNumber(amount) <= 0) {
      throw createError(400, "Amount returned must be greater than zero for payment entries.");
    }

    if (action === "FAULTY_CLEAR" && toMoneyNumber(amount) !== 0) {
      throw createError(400, "Faulty clear entries must use 0.00 amount.");
    }

    calculateDistributionState([
      ...distribution.collections,
      {
        amount,
        action
      }
    ], distribution.totalOwed);

    const collection = await prisma.$transaction(async (transaction) => {
      const createdCollection = await transaction.distributionCollection.create({
        data: {
          distributionId: distribution.id,
          createdById: req.user.id,
          amount,
          action,
          note: normalizeOptionalString(req.body.note)
        }
      });

      await refreshDistributionState(transaction, distribution.id);

      return transaction.distributionCollection.findUnique({
        where: { id: createdCollection.id },
        include: collectionInclude()
      });
    });

    res.status(201).json({ collection });
  })
);

router.patch(
  "/collections/:id",
  asyncHandler(async (req, res) => {
    const existingCollection = await prisma.distributionCollection.findUnique({
      where: { id: req.params.id }
    });

    if (!existingCollection) {
      throw createError(404, "Collection entry not found.");
    }

    if (existingCollection.status === "DEPOSITED") {
      throw createError(400, "Deposited ledger entries cannot be edited.");
    }

    const distribution = await prisma.runnerDistribution.findUnique({
      where: { id: existingCollection.distributionId },
      include: {
        collections: true
      }
    });

    if (!distribution) {
      throw createError(404, "Distribution not found.");
    }

    const action = req.body.action !== undefined
      ? normalizeCollectionAction(req.body.action)
      : existingCollection.action;
    const amount = req.body.amount !== undefined
      ? req.body.amount !== ""
        ? requireMoney(req.body.amount, "Amount returned")
        : "0.00"
      : existingCollection.amount;

    if (action !== "FAULTY_CLEAR" && toMoneyNumber(amount) <= 0) {
      throw createError(400, "Amount returned must be greater than zero for payment entries.");
    }

    if (action === "FAULTY_CLEAR" && toMoneyNumber(amount) !== 0) {
      throw createError(400, "Faulty clear entries must use 0.00 amount.");
    }

    calculateDistributionState(
      distribution.collections.map((collection) => (
        collection.id === existingCollection.id
          ? {
            ...collection,
            amount,
            action
          }
          : collection
      )),
      distribution.totalOwed
    );

    const collection = await prisma.$transaction(async (transaction) => {
      const updatedCollection = await transaction.distributionCollection.update({
        where: { id: existingCollection.id },
        data: {
          amount,
          action,
          note: req.body.note !== undefined
            ? normalizeOptionalString(req.body.note)
            : existingCollection.note
        }
      });

      await refreshDistributionState(transaction, distribution.id);

      return transaction.distributionCollection.findUnique({
        where: { id: updatedCollection.id },
        include: collectionInclude()
      });
    });

    res.json({ collection });
  })
);

router.post(
  "/deposits",
  asyncHandler(async (req, res) => {
    const collectionIds = requireIdList(req.body.collectionIds, "Ledger entries");
    const collections = await prisma.distributionCollection.findMany({
      where: {
        id: {
          in: collectionIds
        }
      }
    });

    if (collections.length !== collectionIds.length) {
      throw createError(404, "One or more ledger entries were not found.");
    }

    if (collections.some((collection) => collection.status !== "PENDING")) {
      throw createError(400, "Only pending ledger entries can be deposited.");
    }

    if (collections.some((collection) => toMoneyNumber(collection.amount) <= 0)) {
      throw createError(400, "Only money-return ledger entries with value can be deposited.");
    }

    const totalAmount = collections.reduce((sum, collection) => sum + toMoneyNumber(collection.amount), 0);

    const bankTransaction = await prisma.$transaction(async (transaction) => {
      const createdTransaction = await transaction.bankTransaction.create({
        data: {
          amount: toMoneyString(totalAmount),
          type: "CREDIT",
          moneyType: "DIRTY",
          sourceSystem: "distribution_deposit",
          description: normalizeOptionalString(req.body.description) || `Distribution ledger deposit (${collections.length} entries)`,
          createdById: req.user.id
        }
      });

      await transaction.distributionCollection.updateMany({
        where: {
          id: {
            in: collectionIds
          }
        },
        data: {
          status: "DEPOSITED",
          bankTransactionId: createdTransaction.id,
          depositedAt: new Date()
        }
      });

      return createdTransaction;
    });

    res.status(201).json({
      bankTransaction,
      updatedCount: collectionIds.length
    });
  })
);

export default router;
