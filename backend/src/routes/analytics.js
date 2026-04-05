import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { replayBankLedger } from "../services/bank.js";
import { buildRecentWeekBuckets, getSydneyDateKey, getWeekStartKey } from "../services/time.js";

const router = Router();

router.use(authenticateToken, requirePermission("ANALYTICS"));

const OPEN_STATUSES = new Set(["ACTIVE", "PARTIAL"]);

function toNumber(value) {
  return Number(value || 0);
}

function toMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

function metric(label, current, previous, format = "number") {
  return {
    label,
    current: format === "currency" ? toMoney(current) : Number(current || 0),
    previous: format === "currency" ? toMoney(previous) : Number(previous || 0),
    delta: format === "currency"
      ? toMoney(current - previous)
      : Number((current || 0) - (previous || 0)),
    format
  };
}

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [previousWeek, currentWeek] = buildRecentWeekBuckets(2);
    const earliestDate = new Date(`${previousWeek.startKey}T00:00:00Z`);

    const [
      distributions,
      collections,
      bankTransactions,
      openDistributions,
      pendingLedger
    ] = await Promise.all([
      prisma.runnerDistribution.findMany({
        where: {
          createdAt: {
            gte: earliestDate
          }
        },
        select: {
          id: true,
          itemId: true,
          quantity: true,
          createdAt: true,
          item: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }),
      prisma.distributionCollection.findMany({
        where: {
          createdAt: {
            gte: earliestDate
          }
        },
        select: {
          amount: true,
          action: true,
          createdAt: true
        }
      }),
      prisma.bankTransaction.findMany({
        orderBy: [
          { createdAt: "asc" },
          { id: "asc" }
        ],
        select: {
          id: true,
          amount: true,
          type: true,
          moneyType: true,
          sourceSystem: true,
          createdAt: true
        }
      }),
      prisma.runnerDistribution.findMany({
        where: {
          status: {
            in: [...OPEN_STATUSES]
          }
        },
        select: {
          totalOwed: true,
          amountReturned: true
        }
      }),
      prisma.distributionCollection.aggregate({
        where: {
          status: "PENDING"
        },
        _count: {
          id: true
        },
        _sum: {
          amount: true
        }
      })
    ]);

    const unitsByWeek = {
      current: 0,
      previous: 0
    };
    const collectionsByWeek = {
      current: 0,
      previous: 0
    };
    const moneyByType = {
      CLEAN: { current: 0, previous: 0 },
      DIRTY: { current: 0, previous: 0 }
    };
    const productMap = new Map();

    const resolveWeekSlot = (date) => {
      const weekKey = getWeekStartKey(getSydneyDateKey(date));

      if (weekKey === currentWeek.key) {
        return "current";
      }

      if (weekKey === previousWeek.key) {
        return "previous";
      }

      return null;
    };

    distributions.forEach((distribution) => {
      const weekSlot = resolveWeekSlot(distribution.createdAt);

      if (!weekSlot) {
        return;
      }

      const quantity = Number(distribution.quantity || 0);
      unitsByWeek[weekSlot] += quantity;

      const existing = productMap.get(distribution.itemId) || {
        label: distribution.item.name,
        current: 0,
        previous: 0
      };

      existing[weekSlot] += quantity;
      productMap.set(distribution.itemId, existing);
    });

    collections.forEach((collection) => {
      if (collection.action === "FAULTY_CLEAR") {
        return;
      }

      const weekSlot = resolveWeekSlot(collection.createdAt);

      if (!weekSlot) {
        return;
      }

      collectionsByWeek[weekSlot] += toNumber(collection.amount);
    });

    const ledgerEffects = replayBankLedger(bankTransactions).effects;

    ledgerEffects.forEach((transaction) => {
      const weekSlot = resolveWeekSlot(transaction.createdAt);

      if (!weekSlot || !moneyByType[transaction.moneyType]) {
        return;
      }

      moneyByType[transaction.moneyType][weekSlot] += toNumber(transaction.effectAmount);
    });

    const outstandingTotal = openDistributions.reduce((sum, distribution) => (
      sum + Math.max(0, toNumber(distribution.totalOwed) - toNumber(distribution.amountReturned))
    ), 0);

    const productGraph = [...productMap.values()]
      .map((entry) => ({
        ...entry,
        delta: entry.current - entry.previous
      }))
      .sort((left, right) => (
        (right.current + right.previous) - (left.current + left.previous)
        || right.current - left.current
        || left.label.localeCompare(right.label)
      ))
      .slice(0, 6);

    res.json({
      snapshot: [
        metric("Products moved", unitsByWeek.current, unitsByWeek.previous),
        metric("Clean money change", moneyByType.CLEAN.current, moneyByType.CLEAN.previous, "currency"),
        metric("Dirty money change", moneyByType.DIRTY.current, moneyByType.DIRTY.previous, "currency"),
        metric("Collections logged", collectionsByWeek.current, collectionsByWeek.previous, "currency")
      ],
      moneyGraph: [
        {
          label: "Clean money",
          current: toMoney(moneyByType.CLEAN.current),
          previous: toMoney(moneyByType.CLEAN.previous),
          delta: toMoney(moneyByType.CLEAN.current - moneyByType.CLEAN.previous)
        },
        {
          label: "Dirty money",
          current: toMoney(moneyByType.DIRTY.current),
          previous: toMoney(moneyByType.DIRTY.previous),
          delta: toMoney(moneyByType.DIRTY.current - moneyByType.DIRTY.previous)
        }
      ],
      productGraph,
      distributionOverview: {
        activeRuns: openDistributions.length,
        outstandingTotal: toMoney(outstandingTotal),
        pendingLedgerCount: pendingLedger._count.id || 0,
        pendingLedgerTotal: toMoney(pendingLedger._sum.amount)
      },
      periodLabels: {
        current: currentWeek.label,
        previous: previousWeek.label
      }
    });
  })
);

export default router;
