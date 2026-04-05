import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requireAdmin, requirePermission } from "../middleware/auth.js";
import {
  getOperationalDayKey,
  getSydneyTimeZoneLabel,
  getWeeklyResetLabel,
  getWeeklyTaskKey,
  shiftDateKey
} from "../services/time.js";
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

function chooseLatestDate(left, right) {
  if (!left) {
    return right || null;
  }

  if (!right) {
    return left;
  }

  return new Date(left) > new Date(right) ? left : right;
}

function buildStanding(dailyRows, weeklyRows, usersById, currentUserId) {
  const totalsByUser = new Map();

  dailyRows.forEach((row) => {
    const existing = totalsByUser.get(row.userId) || {
      userId: row.userId,
      totalPoints: 0,
      completedCount: 0,
      lastCompletedAt: null
    };

    existing.totalPoints += row._sum.pointsAwarded || 0;
    existing.completedCount += row._count._all || 0;
    existing.lastCompletedAt = chooseLatestDate(existing.lastCompletedAt, row._max.completedAt);
    totalsByUser.set(row.userId, existing);
  });

  weeklyRows.forEach((row) => {
    const existing = totalsByUser.get(row.userId) || {
      userId: row.userId,
      totalPoints: 0,
      completedCount: 0,
      lastCompletedAt: null
    };

    existing.totalPoints += row._sum.pointsAwarded || 0;
    existing.completedCount += row._count._all || 0;
    existing.lastCompletedAt = chooseLatestDate(existing.lastCompletedAt, row._max.createdAt);
    totalsByUser.set(row.userId, existing);
  });

  const leaderboard = [...totalsByUser.values()]
    .map((entry) => ({
      userId: entry.userId,
      name: usersById.get(entry.userId)?.name || "Unknown user",
      totalPoints: entry.totalPoints,
      completedCount: entry.completedCount,
      lastCompletedAt: entry.lastCompletedAt
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

function mapAdminDailyTasks(tasks, todayCountsByTask, allTimeCountsByTask) {
  return tasks.map((task) => ({
    ...task,
    points: IMPORTANCE_POINTS[task.importance] || 0,
    todayCompletionCount: todayCountsByTask.get(task.id) || 0,
    allTimeCompletionCount: allTimeCountsByTask.get(task.id) || 0
  }));
}

function mapAdminWeeklyTasks(tasks, currentWeekCompletionMap, allTimeCountsByTask) {
  return tasks.map((task) => {
    const completion = currentWeekCompletionMap.get(task.id);
    const attendeeCount = completion?.awards?.length || 0;

    return {
      ...task,
      currentWeekCompletionCount: completion ? 1 : 0,
      currentWeekAttendeeCount: attendeeCount,
      currentWeekPointsAwarded: completion?.awards?.[0]?.pointsAwarded ?? (IMPORTANCE_POINTS[task.importance] || 0),
      allTimeCompletionCount: allTimeCountsByTask.get(task.id) || 0
    };
  });
}

function serializeWeeklyCompletion(task, completion) {
  const awards = (completion?.awards || [])
    .map((award) => ({
      id: award.id,
      userId: award.userId,
      name: award.user?.name || "Unknown user",
      pointsAwarded: Number(award.pointsAwarded || 0)
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    ...task,
    completed: Boolean(completion),
    completedAt: completion?.completedAt || null,
    completedBy: completion?.completedBy || null,
    pointsAwarded: awards[0]?.pointsAwarded ?? (IMPORTANCE_POINTS[task.importance] || 0),
    attendeeCount: awards.length,
    attendees: awards
  };
}

function normalizeAttendeeIds(value) {
  if (!Array.isArray(value)) {
    throw createError(400, "Select at least one team member.");
  }

  const attendeeIds = [...new Set(value.map((entry) => `${entry}`.trim()).filter(Boolean))];

  if (!attendeeIds.length) {
    throw createError(400, "Select at least one team member.");
  }

  return attendeeIds;
}

function normalizePointsAwarded(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw createError(400, "Points must be a whole number equal to or above zero.");
  }

  return parsed;
}

async function validateTaskTeamMembers(attendeeIds = []) {
  const members = await prisma.user.findMany({
    where: {
      id: {
        in: attendeeIds
      },
      active: true,
      OR: [
        {
          role: "ADMIN"
        },
        {
          permissions: {
            some: {
              key: "DAILY_TASKS"
            }
          }
        }
      ]
    },
    select: {
      id: true,
      name: true,
      role: true
    }
  });

  if (members.length !== attendeeIds.length) {
    throw createError(400, "One or more selected users can no longer receive task credit.");
  }

  return members.sort((left, right) => left.name.localeCompare(right.name));
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const currentTaskDay = getOperationalDayKey();
    const currentWeekKey = getWeeklyTaskKey();
    const isAdmin = req.user.role === "ADMIN";

    const [
      activeTasks,
      todayCompletions,
      dailyRankingRows,
      weeklyRankingRows,
      userTaskDays,
      adminDailyTasks,
      todayCompletionCounts,
      allTimeCompletionCounts,
      activeWeeklyTasks,
      weeklyCompletions,
      adminWeeklyTasks,
      allTimeWeeklyCompletionCounts,
      adminTeamMembers
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
      prisma.weeklyTaskAward.groupBy({
        by: ["userId"],
        _sum: {
          pointsAwarded: true
        },
        _count: {
          _all: true
        },
        _max: {
          createdAt: true
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
        : Promise.resolve([]),
      prisma.weeklyTask.findMany({
        where: { active: true },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      }),
      prisma.weeklyTaskCompletion.findMany({
        where: {
          weekKey: currentWeekKey
        },
        include: {
          completedBy: {
            select: {
              id: true,
              name: true
            }
          },
          awards: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      }),
      isAdmin
        ? prisma.weeklyTask.findMany({
          orderBy: [{ active: "desc" }, { updatedAt: "desc" }]
        })
        : Promise.resolve([]),
      isAdmin
        ? prisma.weeklyTaskCompletion.groupBy({
          by: ["taskId"],
          _count: {
            _all: true
          }
        })
        : Promise.resolve([]),
      isAdmin
        ? prisma.user.findMany({
          where: {
            active: true,
            OR: [
              {
                role: "ADMIN"
              },
              {
                permissions: {
                  some: {
                    key: "DAILY_TASKS"
                  }
                }
              }
            ]
          },
          orderBy: {
            name: "asc"
          },
          select: {
            id: true,
            name: true,
            role: true
          }
        })
        : Promise.resolve([])
    ]);

    const usersById = new Map();
    const standingUserIds = [...new Set([
      ...dailyRankingRows.map((row) => row.userId),
      ...weeklyRankingRows.map((row) => row.userId)
    ])];

    if (standingUserIds.length) {
      const users = await prisma.user.findMany({
        where: {
          id: {
            in: standingUserIds
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
    const weeklyCompletionMap = new Map(weeklyCompletions.map((completion) => [completion.taskId, completion]));
    const standings = buildStanding(dailyRankingRows, weeklyRankingRows, usersById, req.user.id);
    const todayCountsByTask = new Map(todayCompletionCounts.map((entry) => [entry.taskId, entry._count._all || 0]));
    const allTimeCountsByTask = new Map(allTimeCompletionCounts.map((entry) => [entry.taskId, entry._count._all || 0]));
    const allTimeWeeklyCountsByTask = new Map(
      allTimeWeeklyCompletionCounts.map((entry) => [entry.taskId, entry._count._all || 0])
    );

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

    const weeklyTasks = sortTasks(activeWeeklyTasks).map((task) => (
      serializeWeeklyCompletion(task, weeklyCompletionMap.get(task.id))
    ));

    const todayPoints = todayCompletions.reduce((sum, completion) => sum + Number(completion.pointsAwarded || 0), 0);
    const todayCompletionCount = todayCompletions.length;
    const taskCount = tasks.length;
    const streakDays = buildStreak(userTaskDays, currentTaskDay);

    res.json({
      taskDay: currentTaskDay,
      weekKey: currentWeekKey,
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
      weekly: {
        weekKey: currentWeekKey,
        resetLabel: getWeeklyResetLabel(),
        tasks: weeklyTasks
      },
      leaderboard: standings.leaderboard,
      currentUserStanding: standings.currentUserStanding,
      admin: isAdmin
        ? {
          dailyTasks: mapAdminDailyTasks(adminDailyTasks, todayCountsByTask, allTimeCountsByTask),
          weeklyTasks: mapAdminWeeklyTasks(adminWeeklyTasks, weeklyCompletionMap, allTimeWeeklyCountsByTask),
          teamMembers: adminTeamMembers
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

router.put(
  "/weekly/:id/completion",
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (typeof req.body.completed !== "boolean") {
      throw createError(400, "A completed state is required.");
    }

    const task = await prisma.weeklyTask.findUnique({
      where: { id: req.params.id }
    });

    if (!task) {
      throw createError(404, "Weekly task not found.");
    }

    const currentWeekKey = getWeeklyTaskKey();
    const completionWhere = {
      taskId_weekKey: {
        taskId: task.id,
        weekKey: currentWeekKey
      }
    };

    const existingCompletion = await prisma.weeklyTaskCompletion.findUnique({
      where: completionWhere
    });

    if (!req.body.completed) {
      if (!existingCompletion) {
        return res.json({ completion: null, removed: false });
      }

      await prisma.weeklyTaskCompletion.delete({
        where: completionWhere
      });

      return res.json({ completion: null, removed: true });
    }

    if (!task.active) {
      throw createError(400, "Only active weekly tasks can be completed.");
    }

    const attendeeIds = normalizeAttendeeIds(req.body.attendeeIds);
    const pointsAwarded = normalizePointsAwarded(req.body.pointsAwarded, IMPORTANCE_POINTS[task.importance] || 0);
    await validateTaskTeamMembers(attendeeIds);

    const completion = await prisma.$transaction(async (transaction) => {
      const savedCompletion = await transaction.weeklyTaskCompletion.upsert({
        where: completionWhere,
        create: {
          taskId: task.id,
          weekKey: currentWeekKey,
          completedById: req.user.id
        },
        update: {
          completedAt: new Date(),
          completedById: req.user.id
        }
      });

      await transaction.weeklyTaskAward.deleteMany({
        where: {
          completionId: savedCompletion.id
        }
      });

      await transaction.weeklyTaskAward.createMany({
        data: attendeeIds.map((userId) => ({
          completionId: savedCompletion.id,
          userId,
          weekKey: currentWeekKey,
          pointsAwarded
        }))
      });

      return transaction.weeklyTaskCompletion.findUnique({
        where: {
          id: savedCompletion.id
        },
        include: {
          completedBy: {
            select: {
              id: true,
              name: true
            }
          },
          awards: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });
    });

    res.json({
      completion: serializeWeeklyCompletion(task, completion),
      removed: false
    });
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

router.post(
  "/admin/weekly-tasks",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const task = await prisma.weeklyTask.create({
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
  "/admin/weekly-tasks/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existingTask = await prisma.weeklyTask.findUnique({
      where: { id: req.params.id }
    });

    if (!existingTask) {
      throw createError(404, "Weekly task not found.");
    }

    const task = await prisma.weeklyTask.update({
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
