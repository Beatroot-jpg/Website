import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { getBankBalances } from "../services/bank.js";
import { normalizeOptionalString, requireMoney } from "../validators.js";

const router = Router();

router.use(authenticateToken, requirePermission("BANK"));

function parsePage(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeMoneyType(value, fallback = "CLEAN") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!["CLEAN", "DIRTY"].includes(normalized)) {
    throw createError(400, "A valid money type is required.");
  }

  return normalized;
}

function normalizeEntryType(value, fallback = "CORRECTION") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!["CORRECTION", "SUBTRACT"].includes(normalized)) {
    throw createError(400, "A valid ledger function is required.");
  }

  return normalized;
}

function typeFromEntryType(entryType) {
  return entryType === "SUBTRACT" ? "DEBIT" : "CREDIT";
}

function entryTypeFromTransaction(transaction) {
  return transaction.type === "DEBIT" ? "SUBTRACT" : "CORRECTION";
}

function buildTransactionWhere(query = {}) {
  const search = `${query.q ?? ""}`.trim();
  const moneyType = query.moneyType ? normalizeMoneyType(query.moneyType) : null;
  const entryType = query.entryType ? normalizeEntryType(query.entryType) : null;
  const where = {};
  const normalizedSearch = search.toUpperCase();
  const searchMoneyType = normalizedSearch.startsWith("DIR")
    ? "DIRTY"
    : normalizedSearch.startsWith("CLE")
      ? "CLEAN"
      : null;

  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { sourceSystem: { contains: search, mode: "insensitive" } },
      { createdBy: { is: { name: { contains: search, mode: "insensitive" } } } },
      { createdBy: { is: { email: { contains: search, mode: "insensitive" } } } },
      ...(searchMoneyType ? [{ moneyType: searchMoneyType }] : [])
    ];
  }

  if (moneyType) {
    where.moneyType = moneyType;
  }

  if (entryType) {
    where.type = typeFromEntryType(entryType);
  }

  return where;
}

function transactionInclude() {
  return {
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
        quantity: true,
        status: true,
        item: {
          select: {
            id: true,
            name: true
          }
        }
      }
    },
    depositedCollections: {
      select: {
        id: true,
        distributionId: true,
        amount: true,
        status: true
      }
    }
  };
}

function withEntryType(transaction) {
  return {
    ...transaction,
    entryType: entryTypeFromTransaction(transaction)
  };
}

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [balances, recentTransactions] = await Promise.all([
      getBankBalances(),
      prisma.bankTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: transactionInclude()
      })
    ]);

    res.json({
      balances,
      recentTransactions: recentTransactions.map(withEntryType)
    });
  })
);

router.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const pageSize = Math.min(parsePage(req.query.pageSize, 12), 50);
    const skip = (page - 1) * pageSize;
    const where = buildTransactionWhere(req.query);

    const [total, transactions] = await Promise.all([
      prisma.bankTransaction.count({ where }),
      prisma.bankTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: transactionInclude()
      })
    ]);

    res.json({
      transactions: transactions.map(withEntryType),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      }
    });
  })
);

router.post(
  "/transactions",
  asyncHandler(async (req, res) => {
    const entryType = normalizeEntryType(req.body.entryType ?? req.body.type ?? "CORRECTION");
    const transaction = await prisma.bankTransaction.create({
      data: {
        amount: requireMoney(req.body.amount, "Amount"),
        type: typeFromEntryType(entryType),
        moneyType: normalizeMoneyType(req.body.moneyType),
        description: normalizeOptionalString(req.body.description),
        sourceSystem: "manual",
        createdById: req.user.id
      },
      include: transactionInclude()
    });

    res.status(201).json({
      transaction: withEntryType(transaction),
      balances: await getBankBalances()
    });
  })
);

router.patch(
  "/transactions/:id",
  asyncHandler(async (req, res) => {
    const transaction = await prisma.bankTransaction.findUnique({
      where: { id: req.params.id }
    });

    if (!transaction) {
      throw createError(404, "Bank transaction not found.");
    }

    if (transaction.distributionId || transaction.sourceSystem !== "manual") {
      throw createError(400, "This transaction must be edited from its source system.");
    }

    const entryType = req.body.entryType !== undefined || req.body.type !== undefined
      ? normalizeEntryType(req.body.entryType ?? req.body.type)
      : entryTypeFromTransaction(transaction);

    const updatedTransaction = await prisma.bankTransaction.update({
      where: { id: transaction.id },
      data: {
        amount: req.body.amount !== undefined
          ? requireMoney(req.body.amount, "Amount")
          : transaction.amount,
        type: typeFromEntryType(entryType),
        moneyType: req.body.moneyType !== undefined
          ? normalizeMoneyType(req.body.moneyType)
          : transaction.moneyType,
        description: req.body.description !== undefined
          ? normalizeOptionalString(req.body.description)
          : transaction.description
      },
      include: transactionInclude()
    });

    res.json({
      transaction: withEntryType(updatedTransaction),
      balances: await getBankBalances()
    });
  })
);

router.post(
  "/transactions/:id/revert",
  asyncHandler(async (req, res) => {
    const transaction = await prisma.bankTransaction.findUnique({
      where: { id: req.params.id },
      include: {
        depositedCollections: {
          select: {
            id: true
          }
        }
      }
    });

    if (!transaction) {
      throw createError(404, "Bank transaction not found.");
    }

    if (transaction.sourceSystem === "manual" && !transaction.distributionId) {
      await prisma.bankTransaction.delete({
        where: { id: transaction.id }
      });

      return res.json({
        reverted: true,
        revertType: "manual",
        balances: await getBankBalances()
      });
    }

    if (transaction.sourceSystem === "distribution_deposit") {
      if (!transaction.depositedCollections.length) {
        throw createError(400, "No deposited ledger entries were linked to this bank transaction.");
      }

      await prisma.$transaction(async (dbTransaction) => {
        await dbTransaction.distributionCollection.updateMany({
          where: {
            bankTransactionId: transaction.id
          },
          data: {
            status: "PENDING",
            bankTransactionId: null,
            depositedAt: null
          }
        });

        await dbTransaction.bankTransaction.delete({
          where: { id: transaction.id }
        });
      });

      return res.json({
        reverted: true,
        revertType: "distribution_deposit",
        restoredEntries: transaction.depositedCollections.length,
        balances: await getBankBalances()
      });
    }

    throw createError(400, "This transaction must be changed from its source system.");
  })
);

export default router;
