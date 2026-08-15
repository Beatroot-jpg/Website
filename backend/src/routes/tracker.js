import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import {
  authenticateToken,
  authenticateTokenOptional,
  requireAdmin
} from "../middleware/auth.js";
import { normalizeOptionalString, requireMoney, requirePositiveInt, requireString } from "../validators.js";

const router = Router();

const MONEY_ACTIVITY_TYPES = new Set(["EARN", "SPEND", "PURCHASE", "BALANCE_CORRECTION"]);
const ITEM_ACTIVITY_TYPES = new Set(["PURCHASE", "ITEM_ADDED", "ITEM_REMOVED", "ITEM_CORRECTION"]);

function toNumber(value) {
  return Number(value || 0);
}

function serializeActivity(activity) {
  return {
    id: activity.id,
    sessionId: activity.sessionId,
    sessionLabel: activity.session?.label || null,
    type: activity.type,
    moneyDelta: toNumber(activity.moneyDelta),
    itemName: activity.itemName,
    itemQuantityDelta: activity.itemQuantityDelta,
    description: activity.description,
    createdByName: activity.createdByName,
    revertedAt: activity.revertedAt,
    revertedByName: activity.revertedByName,
    createdAt: activity.createdAt
  };
}

function serializeSession(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    label: session.label,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    createdByName: session.createdByName
  };
}

function currentItemQuantities(activities) {
  const quantities = new Map();

  activities.forEach((activity) => {
    if (!activity.itemName) {
      return;
    }

    quantities.set(
      activity.itemName,
      (quantities.get(activity.itemName) || 0) + Number(activity.itemQuantityDelta || 0)
    );
  });

  return quantities;
}

function buildSummary(activities, activeSession) {
  const currentBalance = activities.reduce((total, activity) => total + toNumber(activity.moneyDelta), 0);
  const activeSessionActivities = activeSession
    ? activities.filter((activity) => activity.sessionId === activeSession.id)
    : [];

  const metricFor = (entries) => ({
    earned: entries
      .filter((activity) => activity.type === "EARN")
      .reduce((total, activity) => total + Math.max(0, toNumber(activity.moneyDelta)), 0),
    spent: entries
      .filter((activity) => activity.type === "SPEND" || activity.type === "PURCHASE")
      .reduce((total, activity) => total + Math.abs(Math.min(0, toNumber(activity.moneyDelta))), 0),
    net: entries.reduce((total, activity) => total + toNumber(activity.moneyDelta), 0)
  });

  const holdings = [...currentItemQuantities(activities).entries()]
    .filter(([, quantity]) => quantity !== 0)
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    currentBalance,
    allTime: metricFor(activities),
    currentSession: {
      ...metricFor(activeSessionActivities),
      activityCount: activeSessionActivities.length
    },
    holdings
  };
}

async function getActiveSession(database = prisma) {
  return database.trackerSession.findFirst({
    where: { endedAt: null },
    orderBy: { startedAt: "desc" }
  });
}

async function getActiveActivities(database = prisma) {
  return database.trackerActivity.findMany({
    where: { revertedAt: null },
    select: {
      id: true,
      sessionId: true,
      type: true,
      moneyDelta: true,
      itemName: true,
      itemQuantityDelta: true
    }
  });
}

function safePage(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function requireActivityType(value) {
  const type = requireString(value, "Activity type").toUpperCase();
  const validTypes = [
    "EARN",
    "SPEND",
    "PURCHASE",
    "ITEM_ADDED",
    "ITEM_REMOVED",
    "BALANCE_CORRECTION",
    "ITEM_CORRECTION"
  ];

  if (!validTypes.includes(type)) {
    throw createError(400, "Choose a valid activity type.");
  }

  return type;
}

function requireTargetQuantity(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createError(400, fieldName + " must be a whole number that is zero or greater.");
  }

  return parsed;
}

function requireOptionalPositiveQuantity(value, fieldName) {
  if (value === undefined || value === null || `${value}`.trim() === "") {
    return null;
  }

  return requirePositiveInt(value, fieldName);
}

function normalizeActivityPayload(body, activeActivities) {
  const type = requireActivityType(body.type);
  const description = normalizeOptionalString(body.description);
  const itemName = ITEM_ACTIVITY_TYPES.has(type) && body.itemName !== undefined && `${body.itemName}`.trim()
    ? requireString(body.itemName, "Item name")
    : null;
  const activeBalance = activeActivities.reduce((total, activity) => total + toNumber(activity.moneyDelta), 0);
  const holdings = currentItemQuantities(activeActivities);
  let moneyDelta = 0;
  let itemQuantityDelta = 0;

  if (type === "EARN") {
    moneyDelta = Number(requireMoney(body.amount, "Amount"));
    if (moneyDelta <= 0) {
      throw createError(400, "Amount must be greater than zero.");
    }
  }

  if (type === "SPEND") {
    moneyDelta = -Number(requireMoney(body.amount, "Amount"));
    if (moneyDelta === 0) {
      throw createError(400, "Amount must be greater than zero.");
    }
  }

  if (type === "PURCHASE") {
    moneyDelta = -Number(requireMoney(body.amount, "Purchase cost"));
    if (moneyDelta === 0) {
      throw createError(400, "Purchase cost must be greater than zero.");
    }

    if (itemName) {
      itemQuantityDelta = requireOptionalPositiveQuantity(body.quantity, "Item quantity");
      if (!itemQuantityDelta) {
        throw createError(400, "Item quantity is required when a purchase adds an item.");
      }
    }
  }

  if (type === "ITEM_ADDED") {
    if (!itemName) {
      throw createError(400, "Item name is required.");
    }
    itemQuantityDelta = requirePositiveInt(body.quantity, "Item quantity");
  }

  if (type === "ITEM_REMOVED") {
    if (!itemName) {
      throw createError(400, "Item name is required.");
    }
    itemQuantityDelta = -requirePositiveInt(body.quantity, "Item quantity");
  }

  if (type === "BALANCE_CORRECTION") {
    const targetBalance = Number(requireMoney(body.targetBalance, "Target balance"));
    moneyDelta = targetBalance - activeBalance;
  }

  if (type === "ITEM_CORRECTION") {
    if (!itemName) {
      throw createError(400, "Item name is required.");
    }
    itemQuantityDelta = requireTargetQuantity(body.targetQuantity, "Target quantity") - (holdings.get(itemName) || 0);
  }

  if (activeBalance + moneyDelta < -0.004) {
    throw createError(400, "This would take your balance below zero.");
  }

  if (itemName && (holdings.get(itemName) || 0) + itemQuantityDelta < 0) {
    throw createError(400, "This would take the item quantity below zero.");
  }

  return {
    type,
    moneyDelta: moneyDelta.toFixed(2),
    itemName,
    itemQuantityDelta,
    description
  };
}

router.get(
  "/",
  authenticateTokenOptional,
  asyncHandler(async (req, res) => {
    const page = safePage(req.query.page);
    const limit = 10;
    const [activeSession, activeActivities, activityCount, activities] = await Promise.all([
      getActiveSession(),
      getActiveActivities(),
      prisma.trackerActivity.count(),
      prisma.trackerActivity.findMany({
        include: { session: true },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      })
    ]);

    res.json({
      activeSession: serializeSession(activeSession),
      summary: buildSummary(activeActivities, activeSession),
      activities: activities.map(serializeActivity),
      pagination: {
        page,
        pageSize: limit,
        total: activityCount,
        totalPages: Math.max(1, Math.ceil(activityCount / limit))
      },
      viewer: {
        isLoggedIn: Boolean(req.user),
        canManage: req.user?.role === "ADMIN"
      }
    });
  })
);

router.post(
  "/sessions",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const label = normalizeOptionalString(req.body.label);
    const session = await prisma.$transaction(async (database) => {
      const activeSession = await getActiveSession(database);
      if (activeSession) {
        throw createError(409, "End the current session before starting another one.");
      }

      return database.trackerSession.create({
        data: {
          label,
          createdById: req.user.id,
          createdByName: req.user.name
        }
      });
    });

    res.status(201).json({ session: serializeSession(session) });
  })
);

router.post(
  "/sessions/:id/end",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const session = await prisma.trackerSession.findUnique({ where: { id: req.params.id } });
    if (!session) {
      throw createError(404, "Session not found.");
    }
    if (session.endedAt) {
      throw createError(409, "This session has already ended.");
    }

    const endedSession = await prisma.trackerSession.update({
      where: { id: session.id },
      data: { endedAt: new Date() }
    });

    res.json({ session: serializeSession(endedSession) });
  })
);

router.post(
  "/activities",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const activity = await prisma.$transaction(async (database) => {
      const [activeSession, activeActivities] = await Promise.all([
        getActiveSession(database),
        getActiveActivities(database)
      ]);
      const payload = normalizeActivityPayload(req.body, activeActivities);

      return database.trackerActivity.create({
        data: {
          ...payload,
          sessionId: activeSession?.id || null,
          createdById: req.user.id,
          createdByName: req.user.name
        },
        include: { session: true }
      });
    });

    res.status(201).json({ activity: serializeActivity(activity) });
  })
);

router.post(
  "/activities/:id/revert",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const activity = await prisma.$transaction(async (database) => {
      const entry = await database.trackerActivity.findUnique({ where: { id: req.params.id } });
      if (!entry) {
        throw createError(404, "Activity not found.");
      }
      if (entry.revertedAt) {
        throw createError(409, "This activity has already been reverted.");
      }

      const activeActivities = await getActiveActivities(database);
      const currentBalance = activeActivities.reduce((total, item) => total + toNumber(item.moneyDelta), 0);
      const holdings = currentItemQuantities(activeActivities);

      if (currentBalance - toNumber(entry.moneyDelta) < -0.004) {
        throw createError(400, "This activity cannot be reverted because it would take the balance below zero.");
      }
      if (entry.itemName && (holdings.get(entry.itemName) || 0) - entry.itemQuantityDelta < 0) {
        throw createError(400, "This activity cannot be reverted because it would take the item quantity below zero.");
      }

      return database.trackerActivity.update({
        where: { id: entry.id },
        data: {
          revertedAt: new Date(),
          revertedById: req.user.id,
          revertedByName: req.user.name
        },
        include: { session: true }
      });
    });

    res.json({ activity: serializeActivity(activity) });
  })
);

export default router;
