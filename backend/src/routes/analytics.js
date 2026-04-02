import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { buildRecentWeekBuckets, getSydneyDateKey, getWeekStartKey, shiftDateKey } from "../services/time.js";

const router = Router();

router.use(authenticateToken, requirePermission("ANALYTICS"));

function toNumber(value) {
  return Number(value || 0);
}

function toMoney(value) {
  return Number(toNumber(value).toFixed(2));
}

function changeSummary(current, previous) {
  const delta = toMoney(current - previous);

  if (previous === 0) {
    return {
      delta,
      percent: current === 0 ? 0 : 100
    };
  }

  return {
    delta,
    percent: Number((((current - previous) / previous) * 100).toFixed(1))
  };
}

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const weeks = buildRecentWeekBuckets(8);
    const earliestWeekStartKey = weeks[0]?.startKey || getWeekStartKey(getSydneyDateKey());
    const earliestDate = new Date(`${shiftDateKey(earliestWeekStartKey, -1)}T00:00:00Z`);
    const currentWeekKey = weeks[weeks.length - 1]?.key;
    const previousWeekKey = weeks[weeks.length - 2]?.key;

    const [
      recentDistributions,
      recentCollections,
      recentDeposits,
      openDistributions,
      distributionAggregate,
      depositAggregate
    ] = await Promise.all([
      prisma.runnerDistribution.findMany({
        where: {
          createdAt: {
            gte: earliestDate
          }
        },
        orderBy: { createdAt: "desc" },
        include: {
          item: {
            select: {
              id: true,
              name: true
            }
          },
          distributor: {
            select: {
              id: true,
              name: true,
              number: true
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
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          action: true,
          createdAt: true,
          distributionId: true
        }
      }),
      prisma.bankTransaction.findMany({
        where: {
          sourceSystem: "distribution_deposit",
          createdAt: {
            gte: earliestDate
          }
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          createdAt: true
        }
      }),
      prisma.runnerDistribution.findMany({
        where: {
          status: {
            in: ["ACTIVE", "PARTIAL"]
          }
        },
        select: {
          totalOwed: true,
          amountReturned: true
        }
      }),
      prisma.runnerDistribution.aggregate({
        _count: { id: true },
        _sum: {
          quantity: true,
          totalOwed: true
        }
      }),
      prisma.bankTransaction.aggregate({
        where: {
          sourceSystem: "distribution_deposit"
        },
        _sum: {
          amount: true
        }
      })
    ]);

    const weekMap = new Map(
      weeks.map((week) => [
        week.key,
        {
          ...week,
          distributionCount: 0,
          unitsDistributed: 0,
          valueAssigned: 0,
          amountCollected: 0,
          amountDeposited: 0
        }
      ])
    );

    const topItemMap = new Map();

    recentDistributions.forEach((distribution) => {
      const weekKey = getWeekStartKey(getSydneyDateKey(distribution.createdAt));
      const week = weekMap.get(weekKey);

      if (!week) {
        return;
      }

      const quantity = Number(distribution.quantity || 0);
      const totalOwed = toNumber(distribution.totalOwed);

      week.distributionCount += 1;
      week.unitsDistributed += quantity;
      week.valueAssigned = toMoney(week.valueAssigned + totalOwed);

      if (weekKey === currentWeekKey) {
        const existing = topItemMap.get(distribution.itemId) || {
          itemId: distribution.itemId,
          name: distribution.item.name,
          quantity: 0,
          valueAssigned: 0
        };

        existing.quantity += quantity;
        existing.valueAssigned = toMoney(existing.valueAssigned + totalOwed);
        topItemMap.set(distribution.itemId, existing);
      }
    });

    recentCollections.forEach((collection) => {
      if (collection.action === "FAULTY_CLEAR") {
        return;
      }

      const weekKey = getWeekStartKey(getSydneyDateKey(collection.createdAt));
      const week = weekMap.get(weekKey);

      if (!week) {
        return;
      }

      week.amountCollected = toMoney(week.amountCollected + toNumber(collection.amount));
    });

    recentDeposits.forEach((transaction) => {
      const weekKey = getWeekStartKey(getSydneyDateKey(transaction.createdAt));
      const week = weekMap.get(weekKey);

      if (!week) {
        return;
      }

      week.amountDeposited = toMoney(week.amountDeposited + toNumber(transaction.amount));
    });

    const orderedWeeks = weeks.map((week) => weekMap.get(week.key));
    const currentWeek = weekMap.get(currentWeekKey) || {
      unitsDistributed: 0,
      valueAssigned: 0,
      amountCollected: 0,
      amountDeposited: 0
    };
    const previousWeek = weekMap.get(previousWeekKey) || {
      unitsDistributed: 0,
      valueAssigned: 0,
      amountCollected: 0,
      amountDeposited: 0
    };

    const outstandingTotal = openDistributions.reduce((sum, distribution) => (
      sum + Math.max(0, toNumber(distribution.totalOwed) - toNumber(distribution.amountReturned))
    ), 0);

    const recentRuns = recentDistributions
      .slice(0, 6)
      .map((distribution) => ({
        id: distribution.id,
        item: distribution.item,
        distributor: distribution.distributor,
        quantity: distribution.quantity,
        totalOwed: toMoney(distribution.totalOwed),
        amountReturned: toMoney(distribution.amountReturned),
        status: distribution.status,
        updatedAt: distribution.updatedAt,
        createdAt: distribution.createdAt
      }));

    const topItems = [...topItemMap.values()]
      .sort((left, right) => (
        right.quantity - left.quantity || right.valueAssigned - left.valueAssigned || left.name.localeCompare(right.name)
      ))
      .slice(0, 6);

    res.json({
      snapshot: {
        units: {
          current: currentWeek.unitsDistributed,
          previous: previousWeek.unitsDistributed,
          ...changeSummary(currentWeek.unitsDistributed, previousWeek.unitsDistributed)
        },
        assigned: {
          current: currentWeek.valueAssigned,
          previous: previousWeek.valueAssigned,
          ...changeSummary(currentWeek.valueAssigned, previousWeek.valueAssigned)
        },
        collected: {
          current: currentWeek.amountCollected,
          previous: previousWeek.amountCollected,
          ...changeSummary(currentWeek.amountCollected, previousWeek.amountCollected)
        },
        deposited: {
          current: currentWeek.amountDeposited,
          previous: previousWeek.amountDeposited,
          ...changeSummary(currentWeek.amountDeposited, previousWeek.amountDeposited)
        }
      },
      overall: {
        totalRuns: distributionAggregate._count.id || 0,
        totalUnits: distributionAggregate._sum.quantity || 0,
        totalAssigned: toMoney(distributionAggregate._sum.totalOwed),
        totalDeposited: toMoney(depositAggregate._sum.amount),
        activeRuns: openDistributions.length,
        outstandingTotal: toMoney(outstandingTotal)
      },
      weeks: orderedWeeks,
      topItems,
      recentRuns
    });
  })
);

export default router;
