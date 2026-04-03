import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requireAdmin, requirePermission } from "../middleware/auth.js";
import { getOperationalDayKey, getSydneyTimeZoneLabel, shiftDateKey } from "../services/time.js";
import { normalizeOptionalString, requireString } from "../validators.js";

const router = Router();

const IMPORTANCE_POINTS = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3
};

const IMPORTANCE_ORDER = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

router.use(authenticateToken, requirePermission("DAILY_TASKS"));

function normalizeImportance(value, fallback = "MEDIUM") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!IMPORTANCE_POINTS[normalized]) {
    throw createError(400, "A valid task importance is required.");
  }

  return normalized;
}

function sortTasks(tasks = []) {
  return [...tasks].sort((left, right) => (
    (IMPORTANCE_ORDER[right.importance] || 0) - (IMPORTANCE_ORDER[left.importance] || 0)
    || left.title.localeCompare(right.title)
  ));
}

function buildStanding(rankingRows, usersById, currentUserId) {
  const leaderboard = rankingRows
    .map((row) => ({
      userId: row.userId,
      name: usersById.get(row.userId)?.name || "Unknown user",
      totalPoints: row._sum.pointsAwarded || 0,
      completedCount: row._count._all || 0,
      lastCompletedAt: row._max.completedAt
    }))
    .sort((left, right) => (
      right.totalPoints - left.totalPoints
      || right.completedCount - left.completedCount
      || left.name.localeCompare(right.name)
    ))
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      isCurrentUser: entry.userId === currentUserId
    }));

  const currentUserStanding = leaderboard.find((entry) => entry.userId === currentUserId) || {
    userId: currentUserId,
    rank: null,
    totalPoints: 0,
    completedCount: 0,
    lastCompletedAt: null,
    isCurrentUser: true
  };

  return {
    leaderboard: leaderboard.slice(0, 12),
    currentUserStanding
  };
}

function buildStreak(taskDays, currentTaskDay) {
  const orderedDays = [...new Set((taskDays || []).map((entry) => entry.taskDay))]
    .sort((left, right) => right.localeCompare(left));

  if (!orderedDays.length || orderedDays[0] !== currentTaskDay) {
    return 0;
  }

  let streak = 1;
  let expectedDay = currentTaskDay;

  for (let index = 1; index < orderedDays.length; index += 1) {
    expectedDay = shiftDateKey(expectedDay, -1);

    if (orderedDays[index] !== expectedDay) {
      break;
    }

    streak += 1;
  }

  return streak;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const currentTaskDay = getOperationalDayKey();
    const isAdmin = req.user.role === "ADMIN";

    const [
      activeTasks,
      todayCompletions,
      rankingRows,
      userTaskDays,
      adminTasks,
      todayCompletionCounts,
      allTimeCompletionCounts
    ] = await Promise.all([
      prisma.dailyTask.findMany({
        where: { active: true },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      }),
      prisma.dailyTaskCompletion.findMany({
        where: {
          userId: req.user.id,
          taskDay: currentTaskDay
        },
        select: {
          id: true,
          taskId: true,
          pointsAwarded: true,
          completedAt: true
        }
      }),
      prisma.dailyTaskCompletion.groupBy({
        by: ["userId"],
        _sum: {
          pointsAwarded: true
        },
        _count: {
          _all: true
        },
        _max: {
          completedAt: true
        }
      }),
      prisma.dailyTaskCompletion.findMany({
        where: {
          userId: req.user.id
        },
        select: {
          taskDay: true
        }
      }),
      isAdmin
        ? prisma.dailyTask.findMany({
          orderBy: [{ active: "desc" }, { updatedAt: "desc" }]
        })
        : Promise.resolve([]),
      isAdmin
        ? prisma.dailyTaskCompletion.groupBy({
          by: ["taskId"],
          where: {
            taskDay: currentTaskDay
          },
          _count: {
            _all: true
          }
        })
        : Promise.resolve([]),
      isAdmin
        ? prisma.dailyTaskCompletion.groupBy({
          by: ["taskId"],
          _count: {
            _all: true
          }
        })
        : Promise.resolve([])
    ]);

    const usersById = new Map();

    if (rankingRows.length) {
      const users = await prisma.user.findMany({
        where: {
          id: {
            in: rankingRows.map((row) => row.userId)
          }
        },
        select: {
          id: true,
          name: true
        }
      });

      users.forEach((user) => usersById.set(user.id, user));
    }

    const completionMap = new Map(todayCompletions.map((completion) => [completion.taskId, completion]));
    const standings = buildStanding(rankingRows, usersById, req.user.id);
    const tasks = sortTasks(activeTasks).map((task) => {
      const completion = completionMap.get(task.id);
      return {
        ...task,
        points: IMPORTANCE_POINTS[task.importance] || 0,
        completed: Boolean(completion),
        completionId: completion?.id || null,
        completedAt: completion?.completedAt || null
      };
    });

    const todayPoints = todayCompletions.reduce((sum, completion) => sum + Number(completion.pointsAwarded || 0), 0);
    const todayCompletionCount = todayCompletions.length;
    const taskCount = tasks.length;
    const streakDays = buildStreak(userTaskDays, currentTaskDay);
    const todayCountsByTask = new Map(todayCompletionCounts.map((entry) => [entry.taskId, entry._count._all || 0]));
    const allTimeCountsByTask = new Map(allTimeCompletionCounts.map((entry) => [entry.taskId, entry._count._all || 0]));

    res.json({
      taskDay: currentTaskDay,
      resetLabel: `Tasks reset every day at ${getSydneyTimeZoneLabel()}.`,
      summary: {
        taskCount,
        completedCount: todayCompletionCount,
        overallCompletedCount: standings.currentUserStanding.completedCount,
        completionRate: taskCount ? Math.round((todayCompletionCount / taskCount) * 100) : 0,
        todayPoints,
        totalPoints: standings.currentUserStanding.totalPoints,
        currentRank: standings.currentUserStanding.rank,
        streakDays
      },
      tasks,
      leaderboard: standings.leaderboard,
      currentUserStanding: standings.currentUserStanding,
      admin: isAdmin
        ? {
          tasks: adminTasks.map((task) => ({
            ...task,
            points: IMPORTANCE_POINTS[task.importance] || 0,
            todayCompletionCount: todayCountsByTask.get(task.id) || 0,
            allTimeCompletionCount: allTimeCountsByTask.get(task.id) || 0
          }))
        }
        : null
    });
  })
);

router.put(
  "/:id/completion",
  asyncHandler(async (req, res) => {
    if (typeof req.body.completed !== "boolean") {
      throw createError(400, "A completed state is required.");
    }

    const task = await prisma.dailyTask.findUnique({
      where: { id: req.params.id }
    });

    if (!task) {
      throw createError(404, "Daily task not found.");
    }

    const currentTaskDay = getOperationalDayKey();
    const completionWhere = {
      taskId_userId_taskDay: {
        taskId: task.id,
        userId: req.user.id,
        taskDay: currentTaskDay
      }
    };

    const existingCompletion = await prisma.dailyTaskCompletion.findUnique({
      where: completionWhere
    });

    if (!req.body.completed) {
      if (!existingCompletion) {
        return res.json({ completion: null, removed: false });
      }

      await prisma.dailyTaskCompletion.delete({
        where: completionWhere
      });

      return res.json({ completion: null, removed: true });
    }

    if (!task.active) {
      throw createError(400, "Only active tasks can be completed.");
    }

    const completion = existingCompletion
      ? existingCompletion
      : await prisma.dailyTaskCompletion.create({
        data: {
          taskId: task.id,
          userId: req.user.id,
          taskDay: currentTaskDay,
          pointsAwarded: IMPORTANCE_POINTS[task.importance] || 0
        }
      });

    res.json({ completion, removed: false });
  })
);

router.post(
  "/admin/tasks",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const task = await prisma.dailyTask.create({
      data: {
        title: requireString(req.body.title, "Task title"),
        description: normalizeOptionalString(req.body.description),
        importance: normalizeImportance(req.body.importance),
        active: typeof req.body.active === "boolean" ? req.body.active : true,
        createdById: req.user.id
      }
    });

    res.status(201).json({ task });
  })
);

router.patch(
  "/admin/tasks/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existingTask = await prisma.dailyTask.findUnique({
      where: { id: req.params.id }
    });

    if (!existingTask) {
      throw createError(404, "Daily task not found.");
    }

    const task = await prisma.dailyTask.update({
      where: { id: existingTask.id },
      data: {
        title: req.body.title !== undefined
          ? requireString(req.body.title, "Task title")
          : existingTask.title,
        description: req.body.description !== undefined
          ? normalizeOptionalString(req.body.description)
          : existingTask.description,
        importance: req.body.importance !== undefined
          ? normalizeImportance(req.body.importance)
          : existingTask.importance,
        active: typeof req.body.active === "boolean"
          ? req.body.active
          : existingTask.active
      }
    });

    res.json({ task });
  })
);

export default router;
