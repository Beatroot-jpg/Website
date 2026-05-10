import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import {
  buildFactoryCategoryView,
  buildFactoryShareRows,
  computeSessionMilliseconds,
  ensureFactoryBootstrap,
  factorySectionLabel,
  getNextFactoryRoundNumber
} from "../services/factory.js";
import { normalizeOptionalString, requireMoney, requireString } from "../validators.js";

const router = Router();

const SALES_PAGE_SIZE = 8;
const ARCHIVE_PAGE_SIZE = 8;
const SESSION_PAGE_SIZE = 10;

router.use(authenticateToken);

function parsePage(value, fallback = 1) {
  const parsed = Number.parseInt(`${value ?? fallback}`, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function buildPagination(total, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);

  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    skip: (safePage - 1) * pageSize
  };
}

function requireDateTime(value, fieldName) {
  const normalized = requireString(value, fieldName);
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, `${fieldName} must be a valid date and time.`);
  }

  return parsed;
}

function parseSessionEnd(value, fieldName) {
  if (value === null || value === undefined || `${value}`.trim() === "") {
    return null;
  }

  return requireDateTime(value, fieldName);
}

function rangesOverlap(startA, endA, startB, endB) {
  const leftStart = new Date(startA).getTime();
  const leftEnd = endA ? new Date(endA).getTime() : Number.POSITIVE_INFINITY;
  const rightStart = new Date(startB).getTime();
  const rightEnd = endB ? new Date(endB).getTime() : Number.POSITIVE_INFINITY;

  return leftStart < rightEnd && rightStart < leftEnd;
}

async function assertNoSessionOverlap({ sessionId = "", userId, roundId, startedAt, endedAt }) {
  const existingSessions = await prisma.factorySession.findMany({
    where: {
      userId,
      roundId,
      ...(sessionId
        ? {
          NOT: {
            id: sessionId
          }
        }
        : {})
    },
    select: {
      id: true,
      startedAt: true,
      endedAt: true
    }
  });

  const hasOverlap = existingSessions.some((session) => rangesOverlap(
    startedAt,
    endedAt,
    session.startedAt,
    session.endedAt
  ));

  if (hasOverlap) {
    throw createError(400, "This session overlaps with another clocked block for that worker.");
  }
}

function serializeSaleEntry(entry) {
  return {
    id: entry.id,
    roundId: entry.roundId,
    amount: Number(entry.amount || 0),
    note: entry.note,
    createdById: entry.createdById,
    createdByName: entry.createdBy?.name || "Unknown user",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

function serializeSession(session, now = new Date()) {
  const durationMilliseconds = computeSessionMilliseconds(session, now);

  return {
    id: session.id,
    roundId: session.roundId,
    userId: session.userId,
    userName: session.user?.name || "Unknown worker",
    categoryId: session.categoryId,
    categoryName: session.category?.name || "Unknown category",
    categorySection: session.category?.section || "MISCELLANEOUS",
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationMinutes: Math.round(durationMilliseconds / 60000),
    durationHours: durationMilliseconds / 3600000,
    active: !session.endedAt,
    note: session.note,
    correctedByName: session.correctedBy?.name || null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function serializeRoundArchive(round) {
  const totalMinutes = (round.payouts || []).reduce((sum, payout) => sum + Number(payout.totalMinutes || 0), 0);
  const highestPayout = (round.payouts || []).reduce((max, payout) => {
    const value = Number(payout.payoutAmount || 0);
    return value > max ? value : max;
  }, 0);

  return {
    id: round.id,
    roundNumber: round.roundNumber,
    finalizedAt: round.finalizedAt,
    finalizedSalesTotal: Number(round.finalizedSalesTotal || 0),
    totalMinutes,
    participantCount: round._count?.payouts || round.payouts?.length || 0,
    saleEntryCount: round._count?.salesEntries || 0,
    highestPayout
  };
}

async function getActiveRound() {
  return prisma.factoryRound.findFirst({
    where: {
      status: "ACTIVE"
    },
    orderBy: {
      roundNumber: "desc"
    }
  });
}

async function getLastFinalizedRound() {
  return prisma.factoryRound.findFirst({
    where: {
      status: "FINALIZED"
    },
    orderBy: [
      { finalizedAt: "desc" },
      { roundNumber: "desc" }
    ]
  });
}

async function requireActiveRound() {
  const activeRound = await getActiveRound();

  if (!activeRound) {
    throw createError(400, "No active factory round exists yet. Ask an admin to start the next round.");
  }

  return activeRound;
}

function roundDetailInclude() {
  return {
    payouts: {
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { payoutAmount: "desc" },
        { totalMinutes: "desc" }
      ]
    },
    salesEntries: {
      include: {
        createdBy: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" }
      ]
    },
    sessions: {
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            section: true
          }
        }
      },
      orderBy: [
        { startedAt: "asc" },
        { id: "asc" }
      ]
    }
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    await ensureFactoryBootstrap();

    const now = new Date();
    const salesPage = parsePage(req.query.salesPage, 1);
    const archivePage = parsePage(req.query.archivePage, 1);

    const [categories, activeRound, lastFinalizedRound, archiveCount] = await Promise.all([
      prisma.factoryCategory.findMany({
        orderBy: [
          { section: "asc" },
          { sortOrder: "asc" }
        ]
      }),
      getActiveRound(),
      getLastFinalizedRound(),
      prisma.factoryRound.count({
        where: {
          status: "FINALIZED"
        }
      })
    ]);

    let viewerActiveCategoryId = "";
    let viewerActiveSessionId = "";
    let categoryView = categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      name: category.name,
      section: category.section,
      sectionLabel: factorySectionLabel(category.section),
      helperText: category.helperText,
      locked: category.locked,
      activeWorkers: [],
      activeWorkerCount: 0,
      viewerActive: false
    }));

    let currentRound = null;

    if (activeRound) {
      const salesPagination = buildPagination(
        await prisma.factorySaleEntry.count({
          where: {
            roundId: activeRound.id
          }
        }),
        salesPage,
        SALES_PAGE_SIZE
      );

      const [allSessions, currentSalesAggregate, salesEntries] = await Promise.all([
        prisma.factorySession.findMany({
          where: {
            roundId: activeRound.id
          },
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            },
            category: {
              select: {
                id: true,
                name: true,
                section: true
              }
            }
          },
          orderBy: [
            { startedAt: "asc" },
            { id: "asc" }
          ]
        }),
        prisma.factorySaleEntry.aggregate({
          where: {
            roundId: activeRound.id
          },
          _sum: {
            amount: true
          }
        }),
        prisma.factorySaleEntry.findMany({
          where: {
            roundId: activeRound.id
          },
          include: {
            createdBy: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: [
            { createdAt: "desc" },
            { id: "desc" }
          ],
          skip: salesPagination.skip,
          take: salesPagination.pageSize
        })
      ]);

      const currentSalesTotal = Number(currentSalesAggregate._sum.amount || 0);
      const lastFinalizedTotal = Number(lastFinalizedRound?.finalizedSalesTotal || 0);
      const estimateBasisTotal = currentSalesTotal > 0 ? currentSalesTotal : lastFinalizedTotal;
      const estimateBasisSource = currentSalesTotal > 0
        ? "CURRENT_ROUND"
        : lastFinalizedTotal > 0
          ? "LAST_FINALIZED_ROUND"
          : "NONE";
      const shareSnapshot = buildFactoryShareRows(allSessions, estimateBasisTotal, now);
      const categorySnapshot = buildFactoryCategoryView(categories, allSessions, req.user.id);

      viewerActiveCategoryId = categorySnapshot.viewerActiveCategoryId;
      viewerActiveSessionId = categorySnapshot.viewerActiveSessionId;
      categoryView = categorySnapshot.categories;

      currentRound = {
        id: activeRound.id,
        roundNumber: activeRound.roundNumber,
        startedAt: activeRound.createdAt,
        status: activeRound.status,
        salesTotal: currentSalesTotal,
        lastFinalizedTotal,
        estimateBasisTotal,
        estimateBasisSource,
        totalMinutes: Math.round(shareSnapshot.totalMilliseconds / 60000),
        shareRows: shareSnapshot.shareRows.map((row) => ({
          userId: row.userId,
          userName: row.userName,
          totalMinutes: row.totalMinutes,
          totalHours: row.totalHours,
          sharePercent: row.sharePercent,
          projectedPayout: row.projectedPayout,
          activeCategoryName: row.activeCategoryName
        })),
        salesEntries: salesEntries.map(serializeSaleEntry),
        salesPagination: {
          page: salesPagination.page,
          pageSize: salesPagination.pageSize,
          total: salesPagination.total,
          totalPages: salesPagination.totalPages
        }
      };
    }

    const archivePagination = buildPagination(archiveCount, archivePage, ARCHIVE_PAGE_SIZE);
    const archiveRounds = await prisma.factoryRound.findMany({
      where: {
        status: "FINALIZED"
      },
      orderBy: [
        { finalizedAt: "desc" },
        { roundNumber: "desc" }
      ],
      skip: archivePagination.skip,
      take: archivePagination.pageSize,
      include: {
        payouts: {
          select: {
            totalMinutes: true,
            payoutAmount: true
          }
        },
        _count: {
          select: {
            payouts: true,
            salesEntries: true
          }
        }
      }
    });

    res.json({
      viewer: {
        canAdmin: req.user.role === "ADMIN",
        activeCategoryId: viewerActiveCategoryId,
        activeSessionId: viewerActiveSessionId
      },
      categories: categoryView,
      currentRound,
      archives: {
        rounds: archiveRounds.map(serializeRoundArchive),
        pagination: {
          page: archivePagination.page,
          pageSize: archivePagination.pageSize,
          total: archivePagination.total,
          totalPages: archivePagination.totalPages
        }
      }
    });
  })
);

router.post(
  "/clock-in",
  asyncHandler(async (req, res) => {
    await ensureFactoryBootstrap();

    const activeRound = await requireActiveRound();
    const categoryId = requireString(req.body.categoryId, "Category");
    const category = await prisma.factoryCategory.findUnique({
      where: {
        id: categoryId
      }
    });

    if (!category) {
      throw createError(404, "Factory category not found.");
    }

    if (category.locked && req.user.role !== "ADMIN") {
      throw createError(403, "That category is locked right now. An admin can reopen it when needed.");
    }

    const now = new Date();
    const currentSession = await prisma.factorySession.findFirst({
      where: {
        roundId: activeRound.id,
        userId: req.user.id,
        endedAt: null
      },
      include: {
        category: {
          select: {
            name: true
          }
        }
      }
    });

    if (currentSession?.categoryId === category.id) {
      throw createError(400, "You are already clocked into that category.");
    }

    let session = null;

    await prisma.$transaction(async (tx) => {
      if (currentSession) {
        await tx.factorySession.update({
          where: {
            id: currentSession.id
          },
          data: {
            endedAt: now
          }
        });
      }

      session = await tx.factorySession.create({
        data: {
          roundId: activeRound.id,
          userId: req.user.id,
          categoryId: category.id,
          startedAt: now
        },
        include: {
          user: {
            select: {
              id: true,
              name: true
            }
          },
          category: {
            select: {
              id: true,
              name: true,
              section: true
            }
          }
        }
      });
    });

    res.status(201).json({
      session: serializeSession(session, now),
      switchedFromCategoryName: currentSession?.category?.name || null
    });
  })
);

router.post(
  "/clock-out",
  asyncHandler(async (req, res) => {
    const activeRound = await requireActiveRound();
    const currentSession = await prisma.factorySession.findFirst({
      where: {
        roundId: activeRound.id,
        userId: req.user.id,
        endedAt: null
      },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            section: true
          }
        }
      }
    });

    if (!currentSession) {
      throw createError(400, "You are not clocked into any factory category right now.");
    }

    const now = new Date();
    const session = await prisma.factorySession.update({
      where: {
        id: currentSession.id
      },
      data: {
        endedAt: now
      },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            section: true
          }
        }
      }
    });

    res.json({
      session: serializeSession(session, now)
    });
  })
);

router.patch(
  "/categories/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const category = await prisma.factoryCategory.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!category) {
      throw createError(404, "Factory category not found.");
    }

    if (typeof req.body.locked !== "boolean") {
      throw createError(400, "A locked value is required.");
    }

    const updatedCategory = await prisma.factoryCategory.update({
      where: {
        id: category.id
      },
      data: {
        locked: req.body.locked
      }
    });

    res.json({
      category: {
        id: updatedCategory.id,
        locked: updatedCategory.locked
      }
    });
  })
);

router.post(
  "/sales",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const activeRound = await requireActiveRound();
    const amount = Number(requireMoney(req.body.amount, "Sale amount"));

    if (amount <= 0) {
      throw createError(400, "Sale amount must be greater than zero.");
    }

    const entry = await prisma.factorySaleEntry.create({
      data: {
        roundId: activeRound.id,
        amount: amount.toFixed(2),
        note: normalizeOptionalString(req.body.note),
        createdById: req.user.id
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(201).json({
      entry: serializeSaleEntry(entry)
    });
  })
);

router.patch(
  "/sales/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const entry = await prisma.factorySaleEntry.findUnique({
      where: {
        id: req.params.id
      },
      include: {
        round: true
      }
    });

    if (!entry) {
      throw createError(404, "Sale entry not found.");
    }

    if (entry.round.status !== "ACTIVE") {
      throw createError(400, "Only the live round sale ledger can be edited.");
    }

    const amount = req.body.amount !== undefined
      ? Number(requireMoney(req.body.amount, "Sale amount"))
      : Number(entry.amount || 0);

    if (amount <= 0) {
      throw createError(400, "Sale amount must be greater than zero.");
    }

    const updatedEntry = await prisma.factorySaleEntry.update({
      where: {
        id: entry.id
      },
      data: {
        amount: amount.toFixed(2),
        note: req.body.note !== undefined
          ? normalizeOptionalString(req.body.note)
          : entry.note
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({
      entry: serializeSaleEntry(updatedEntry)
    });
  })
);

router.delete(
  "/sales/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const entry = await prisma.factorySaleEntry.findUnique({
      where: {
        id: req.params.id
      },
      include: {
        round: true
      }
    });

    if (!entry) {
      throw createError(404, "Sale entry not found.");
    }

    if (entry.round.status !== "ACTIVE") {
      throw createError(400, "Only the live round sale ledger can be edited.");
    }

    await prisma.factorySaleEntry.delete({
      where: {
        id: entry.id
      }
    });

    res.json({
      deleted: true
    });
  })
);

router.get(
  "/sessions",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query.page, 1);
    const activeRound = await getActiveRound();

    if (!activeRound) {
      return res.json({
        round: null,
        sessions: [],
        pagination: {
          page: 1,
          pageSize: SESSION_PAGE_SIZE,
          total: 0,
          totalPages: 1
        }
      });
    }

    const total = await prisma.factorySession.count({
      where: {
        roundId: activeRound.id
      }
    });
    const pagination = buildPagination(total, page, SESSION_PAGE_SIZE);
    const sessions = await prisma.factorySession.findMany({
      where: {
        roundId: activeRound.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            section: true
          }
        },
        correctedBy: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [
        { startedAt: "desc" },
        { id: "desc" }
      ],
      skip: pagination.skip,
      take: pagination.pageSize
    });

    res.json({
      round: {
        id: activeRound.id,
        roundNumber: activeRound.roundNumber
      },
      sessions: sessions.map((session) => serializeSession(session)),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: pagination.total,
        totalPages: pagination.totalPages
      }
    });
  })
);

router.patch(
  "/sessions/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existingSession = await prisma.factorySession.findUnique({
      where: {
        id: req.params.id
      },
      include: {
        round: true
      }
    });

    if (!existingSession) {
      throw createError(404, "Factory session not found.");
    }

    if (existingSession.round.status !== "ACTIVE") {
      throw createError(400, "Only current round sessions can be corrected.");
    }

    const startedAt = req.body.startedAt !== undefined
      ? requireDateTime(req.body.startedAt, "Session start time")
      : existingSession.startedAt;
    const endedAt = req.body.endedAt !== undefined
      ? parseSessionEnd(req.body.endedAt, "Session end time")
      : existingSession.endedAt;

    if (endedAt && endedAt < startedAt) {
      throw createError(400, "Session end time must be after the start time.");
    }

    await assertNoSessionOverlap({
      sessionId: existingSession.id,
      userId: existingSession.userId,
      roundId: existingSession.roundId,
      startedAt,
      endedAt
    });

    const updatedSession = await prisma.factorySession.update({
      where: {
        id: existingSession.id
      },
      data: {
        startedAt,
        endedAt,
        note: req.body.note !== undefined
          ? normalizeOptionalString(req.body.note)
          : existingSession.note,
        correctedById: req.user.id
      },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            section: true
          }
        },
        correctedBy: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.json({
      session: serializeSession(updatedSession)
    });
  })
);

router.delete(
  "/sessions/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existingSession = await prisma.factorySession.findUnique({
      where: {
        id: req.params.id
      },
      include: {
        round: true
      }
    });

    if (!existingSession) {
      throw createError(404, "Factory session not found.");
    }

    if (existingSession.round.status !== "ACTIVE") {
      throw createError(400, "Only current round sessions can be removed.");
    }

    await prisma.factorySession.delete({
      where: {
        id: existingSession.id
      }
    });

    res.json({
      deleted: true
    });
  })
);

router.post(
  "/rounds/finalize",
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const activeRound = await requireActiveRound();
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      await tx.factorySession.updateMany({
        where: {
          roundId: activeRound.id,
          endedAt: null
        },
        data: {
          endedAt: now
        }
      });

      const [sessions, salesAggregate] = await Promise.all([
        tx.factorySession.findMany({
          where: {
            roundId: activeRound.id
          },
          include: {
            user: {
              select: {
                id: true,
                name: true
              }
            },
            category: {
              select: {
                id: true,
                name: true,
                section: true
              }
            }
          },
          orderBy: [
            { startedAt: "asc" },
            { id: "asc" }
          ]
        }),
        tx.factorySaleEntry.aggregate({
          where: {
            roundId: activeRound.id
          },
          _sum: {
            amount: true
          }
        })
      ]);

      const salesTotal = Number(salesAggregate._sum.amount || 0);
      const shareSnapshot = buildFactoryShareRows(sessions, salesTotal, now);

      await tx.factoryRoundPayout.deleteMany({
        where: {
          roundId: activeRound.id
        }
      });

      if (shareSnapshot.shareRows.length) {
        await tx.factoryRoundPayout.createMany({
          data: shareSnapshot.shareRows.map((row) => ({
            roundId: activeRound.id,
            userId: row.userId,
            totalMinutes: row.totalMinutes,
            sharePercent: row.sharePercent.toFixed(4),
            payoutAmount: row.projectedPayout.toFixed(2)
          }))
        });
      }

      const round = await tx.factoryRound.update({
        where: {
          id: activeRound.id
        },
        data: {
          status: "FINALIZED",
          finalizedAt: now,
          finalizedSalesTotal: salesTotal.toFixed(2)
        }
      });

      return {
        round,
        salesTotal,
        payoutCount: shareSnapshot.shareRows.length
      };
    });

    res.json({
      round: {
        id: result.round.id,
        roundNumber: result.round.roundNumber,
        finalizedAt: result.round.finalizedAt,
        finalizedSalesTotal: Number(result.salesTotal || 0)
      },
      payoutCount: result.payoutCount
    });
  })
);

router.post(
  "/rounds/start",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await ensureFactoryBootstrap();

    const activeRound = await getActiveRound();

    if (activeRound) {
      throw createError(400, "There is already an active factory round running.");
    }

    const round = await prisma.factoryRound.create({
      data: {
        roundNumber: await getNextFactoryRoundNumber(),
        createdById: req.user.id
      }
    });

    res.status(201).json({
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        createdAt: round.createdAt
      }
    });
  })
);

router.get(
  "/rounds/:id",
  asyncHandler(async (req, res) => {
    const round = await prisma.factoryRound.findUnique({
      where: {
        id: req.params.id
      },
      include: roundDetailInclude()
    });

    if (!round) {
      throw createError(404, "Factory round not found.");
    }

    const categoryMap = new Map();

    round.sessions.forEach((session) => {
      const durationMilliseconds = computeSessionMilliseconds(session);
      const existing = categoryMap.get(session.categoryId) || {
        categoryId: session.categoryId,
        categoryName: session.category?.name || "Unknown category",
        section: session.category?.section || "MISCELLANEOUS",
        sectionLabel: factorySectionLabel(session.category?.section || "MISCELLANEOUS"),
        totalMilliseconds: 0
      };

      existing.totalMilliseconds += durationMilliseconds;
      categoryMap.set(session.categoryId, existing);
    });

    const categoryBreakdown = [...categoryMap.values()]
      .map((entry) => ({
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        section: entry.section,
        sectionLabel: entry.sectionLabel,
        totalMinutes: Math.round(entry.totalMilliseconds / 60000),
        totalHours: entry.totalMilliseconds / 3600000
      }))
      .sort((left, right) => right.totalMinutes - left.totalMinutes || left.categoryName.localeCompare(right.categoryName));

    const totalMinutes = round.payouts.reduce((sum, payout) => sum + Number(payout.totalMinutes || 0), 0);

    res.json({
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        status: round.status,
        createdAt: round.createdAt,
        finalizedAt: round.finalizedAt,
        finalizedSalesTotal: Number(round.finalizedSalesTotal || 0),
        totalMinutes,
        participantCount: round.payouts.length
      },
      payouts: round.payouts.map((payout) => ({
        id: payout.id,
        userId: payout.userId,
        userName: payout.user?.name || "Unknown worker",
        totalMinutes: payout.totalMinutes,
        totalHours: Number(payout.totalMinutes || 0) / 60,
        sharePercent: Number(payout.sharePercent || 0),
        payoutAmount: Number(payout.payoutAmount || 0)
      })),
      salesEntries: round.salesEntries.map(serializeSaleEntry),
      categoryBreakdown
    });
  })
);

export default router;
