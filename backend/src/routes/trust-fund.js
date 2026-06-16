import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, authenticateTokenOptional } from "../middleware/auth.js";
import { normalizeOptionalString, requireMoney, requireString } from "../validators.js";

const router = Router();

function canManageTrustFund(user) {
  return Boolean(user?.role === "ADMIN");
}

function requireTrustFundManager(req, _res, next) {
  if (!canManageTrustFund(req.user)) {
    throw createError(403, "Admin access is required to manage the trust fund.");
  }

  return next();
}

function serializeDateValue(value) {
  return value ? new Date(value).toISOString() : null;
}

function toMoneyNumber(value) {
  return Number.parseFloat(value || 0);
}

function toMoneyString(value) {
  return toMoneyNumber(value).toFixed(2);
}

function requirePositiveMoney(value, fieldName) {
  const parsed = toMoneyNumber(requireMoney(value, fieldName));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createError(400, `${fieldName} must be greater than zero.`);
  }

  return parsed;
}

function normalizeTransactionType(value) {
  const normalized = requireString(value, "Transaction type").toUpperCase();

  if (!["PROFIT", "EXPENSE", "PURCHASE"].includes(normalized)) {
    throw createError(400, "Transaction type must be profit, expense, or purchase.");
  }

  return normalized;
}

function requireOptionalDateTime(value, fieldName) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createError(400, `${fieldName} must be a valid date and time.`);
  }

  return date;
}

function getTransactionDelta(transaction) {
  const amount = toMoneyNumber(transaction.amount);
  return transaction.transactionType === "PROFIT" ? amount : -amount;
}

function getTransactionTypeLabel(type) {
  return `${type || ""}`
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function buildTransactionSnapshot(transaction) {
  if (!transaction) {
    return null;
  }

  return {
    id: transaction.id,
    transactionType: transaction.transactionType,
    amount: toMoneyString(transaction.amount),
    description: transaction.description || null,
    loggedAt: serializeDateValue(transaction.loggedAt),
    createdById: transaction.createdById || null,
    createdAt: serializeDateValue(transaction.createdAt),
    updatedAt: serializeDateValue(transaction.updatedAt)
  };
}

function serializeTransaction(transaction) {
  const snapshot = buildTransactionSnapshot(transaction);

  return {
    ...snapshot,
    delta: toMoneyString(getTransactionDelta(transaction))
  };
}

function serializeAuditLog(entry) {
  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary,
    createdAt: serializeDateValue(entry.createdAt),
    actorName: entry.actor?.name || "Unknown",
    revertedAt: serializeDateValue(entry.revertedAt),
    revertedByName: entry.revertedBy?.name || null,
    canRevert: entry.action === "TRUST_TRANSACTION_CREATED" && !entry.revertedAt
  };
}

function buildTotals(transactions = []) {
  const totals = transactions.reduce((current, transaction) => {
    const amount = toMoneyNumber(transaction.amount);

    if (transaction.transactionType === "PROFIT") {
      current.totalMade += amount;
      current.currentTotal += amount;
      return current;
    }

    current.totalSpent += amount;
    current.currentTotal -= amount;
    return current;
  }, {
    currentTotal: 0,
    totalMade: 0,
    totalSpent: 0
  });

  return {
    currentTotal: toMoneyString(totals.currentTotal),
    totalMade: toMoneyString(totals.totalMade),
    totalSpent: toMoneyString(totals.totalSpent)
  };
}

function getUtcWeekStart(date = new Date()) {
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - day + 1);
  return weekStart;
}

function buildWeekSummary(transactions = [], label, startDate, endDate) {
  const totals = transactions.reduce((current, transaction) => {
    const amount = toMoneyNumber(transaction.amount);

    if (transaction.transactionType === "PROFIT") {
      current.made += amount;
      current.net += amount;
      return current;
    }

    current.spent += amount;
    current.net -= amount;
    return current;
  }, {
    made: 0,
    spent: 0,
    net: 0
  });

  return {
    label,
    startAt: serializeDateValue(startDate),
    endAt: serializeDateValue(endDate),
    made: toMoneyString(totals.made),
    spent: toMoneyString(totals.spent),
    net: toMoneyString(totals.net)
  };
}

function buildWeekComparison(transactions = []) {
  const currentWeekStart = getUtcWeekStart();
  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setUTCDate(nextWeekStart.getUTCDate() + 7);

  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

  const previousWeekTransactions = [];
  const currentWeekTransactions = [];

  transactions.forEach((transaction) => {
    const loggedAt = new Date(transaction.loggedAt);

    if (loggedAt >= currentWeekStart && loggedAt < nextWeekStart) {
      currentWeekTransactions.push(transaction);
      return;
    }

    if (loggedAt >= previousWeekStart && loggedAt < currentWeekStart) {
      previousWeekTransactions.push(transaction);
    }
  });

  return {
    current: buildWeekSummary(currentWeekTransactions, "This week", currentWeekStart, nextWeekStart),
    previous: buildWeekSummary(previousWeekTransactions, "Last week", previousWeekStart, currentWeekStart)
  };
}

async function createTrustFundAuditLog(client, {
  actorId,
  action,
  entityType,
  entityId,
  summary,
  before = null,
  after = null,
  metadata = null
}) {
  return client.trustFundAuditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      summary,
      before,
      after,
      metadata
    }
  });
}

async function buildTrustFundPayload(reqUser) {
  const canManage = canManageTrustFund(reqUser);
  const [transactions, recentTransactions, auditLog] = await Promise.all([
    prisma.trustFundTransaction.findMany({
      orderBy: [{ loggedAt: "desc" }, { createdAt: "desc" }]
    }),
    prisma.trustFundTransaction.findMany({
      orderBy: [{ loggedAt: "desc" }, { createdAt: "desc" }],
      take: 10
    }),
    canManage
      ? prisma.trustFundAuditLog.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 10,
        include: {
          actor: {
            select: {
              id: true,
              name: true
            }
          },
          revertedBy: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
      : []
  ]);

  return {
    totals: buildTotals(transactions),
    weekComparison: buildWeekComparison(transactions),
    recentTransactions: recentTransactions.map(serializeTransaction),
    auditLog: canManage ? auditLog.map(serializeAuditLog) : [],
    viewer: {
      isLoggedIn: Boolean(reqUser),
      isAdmin: canManage,
      canManage
    }
  };
}

router.get(
  "/",
  authenticateTokenOptional,
  asyncHandler(async (req, res) => {
    res.json(await buildTrustFundPayload(req.user));
  })
);

router.use(authenticateToken);
router.use(requireTrustFundManager);

router.post(
  "/transactions",
  asyncHandler(async (req, res) => {
    const transactionType = normalizeTransactionType(req.body.transactionType);
    const amount = requirePositiveMoney(req.body.amount, "Amount");
    const loggedAt = requireOptionalDateTime(req.body.loggedAt, "Logged at") || new Date();

    const transaction = await prisma.$transaction(async (client) => {
      const createdTransaction = await client.trustFundTransaction.create({
        data: {
          transactionType,
          amount: toMoneyString(amount),
          description: normalizeOptionalString(req.body.description),
          loggedAt,
          createdById: req.user.id
        }
      });

      await createTrustFundAuditLog(client, {
        actorId: req.user.id,
        action: "TRUST_TRANSACTION_CREATED",
        entityType: "TRUST_FUND_TRANSACTION",
        entityId: createdTransaction.id,
        summary: `${req.user.name} logged ${getTransactionTypeLabel(transactionType)} ${toMoneyString(amount)}.`,
        after: buildTransactionSnapshot(createdTransaction)
      });

      return createdTransaction;
    });

    res.status(201).json({ transaction: serializeTransaction(transaction) });
  })
);

router.post(
  "/audit/:id/revert",
  asyncHandler(async (req, res) => {
    const result = await prisma.$transaction(async (client) => {
      const auditLog = await client.trustFundAuditLog.findUnique({
        where: { id: req.params.id }
      });

      if (!auditLog) {
        throw createError(404, "Audit log not found.");
      }

      if (auditLog.revertedAt) {
        throw createError(400, "This audit log has already been reverted.");
      }

      if (auditLog.action !== "TRUST_TRANSACTION_CREATED" || !auditLog.after?.id) {
        throw createError(400, "This audit action cannot be reverted safely.");
      }

      const existingTransaction = await client.trustFundTransaction.findUnique({
        where: { id: auditLog.after.id }
      });

      if (!existingTransaction) {
        throw createError(404, "Transaction already missing.");
      }

      await client.trustFundTransaction.delete({
        where: { id: existingTransaction.id }
      });

      const revertedAt = new Date();
      await client.trustFundAuditLog.update({
        where: { id: auditLog.id },
        data: {
          revertedAt,
          revertedById: req.user.id
        }
      });

      await createTrustFundAuditLog(client, {
        actorId: req.user.id,
        action: "TRUST_AUDIT_REVERTED",
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        summary: `${req.user.name} reverted trust fund transaction ${existingTransaction.id}.`,
        before: buildTransactionSnapshot(existingTransaction),
        metadata: {
          revertedAuditLogId: auditLog.id,
          revertedAction: auditLog.action
        }
      });

      return { message: "Audit action reverted." };
    });

    res.json(result);
  })
);

export default router;
