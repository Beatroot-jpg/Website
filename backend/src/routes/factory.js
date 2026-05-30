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
  factoryWorkModeLabel,
  getNextFactoryRoundNumber,
  getUniqueFactoryCategorySlug,
  summarizeFactoryCategoryBreakdown
} from "../services/factory.js";
import {
  normalizeOptionalString,
  requireMoney,
  requirePositiveInt,
  requireString
} from "../validators.js";

const router = Router();

const SALES_PAGE_SIZE = 8;
const ROUND_LIST_PAGE_SIZE = 8;
const SESSION_PAGE_SIZE = 10;
const DETAIL_SALES_PAGE_SIZE = 8;
const DETAIL_SESSIONS_PAGE_SIZE = 10;

const FACTORY_SECTIONS = new Set(["MINING", "SMELTING", "MISCELLANEOUS"]);
const FACTORY_WORK_MODES = new Set(["CLOCKED", "LOGGED_ENTRY"]);

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

function requireFactorySection(value) {
  const normalized = requireString(value, "Section").toUpperCase();

  if (!FACTORY_SECTIONS.has(normalized)) {
    throw createError(400, "Section must be Mining, Smelting, or Miscellaneous.");
  }

  return normalized;
}

function requireFactoryWorkMode(value) {
  const normalized = requireString(value, "Work mode").toUpperCase();

  if (!FACTORY_WORK_MODES.has(normalized)) {
    throw createError(400, "Work mode must be Clocked or Logged entry.");
  }

  return normalized;
}

function rangesOverlap(startA, endA, startB, endB) {
  const leftStart = new Date(startA).getTime();
  const leftEnd = endA ? new Date(endA).getTime() : Number.POSITIVE_INFINITY;
  const rightStart = new Date(startB).getTime();
  const rightEnd = endB ? new Date(endB).getTime() : Number.POSITIVE_INFINITY;

  return leftStart < rightEnd && rightStart < leftEnd;
}

async function assertNoSessionOverlap(client, { sessionId = "", userId, roundId, startedAt, endedAt }) {
  const existingSessions = await client.factorySession.findMany({
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
    throw createError(400, "This session overlaps with another work block for that worker.");
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
    categorySectionLabel: factorySectionLabel(session.category?.section || "MISCELLANEOUS"),
    workMode: session.workMode || session.category?.workMode || "CLOCKED",
    workModeLabel: factoryWorkModeLabel(session.workMode || session.category?.workMode || "CLOCKED"),
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

function summarizeRoundForList(round) {
  const totalMinutes = (round.payouts || []).reduce((sum, payout) => sum + Number(payout.totalMinutes || 0), 0);
  const highestPayout = (round.payouts || []).reduce((max, payout) => {
    const value = Number(payout.payoutAmount || 0);
    return value > max ? value : max;
  }, 0);

  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    salesTotal: Number(round.finalizedSalesTotal || 0),
    totalMinutes,
    participantCount: round._count?.payouts || round.payouts?.length || 0,
    saleEntryCount: round._count?.salesEntries || 0,
    highestPayout,
    frozenAt: round.frozenAt,
    paidAt: round.paidAt,
    finalizedAt: round.finalizedAt,
    createdAt: round.createdAt
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

async function getLatestReferenceRound() {
  return prisma.factoryRound.findFirst({
    where: {
      status: {
        in: ["FROZEN", "PAID", "FINALIZED"]
      }
    },
    orderBy: [
      { roundNumber: "desc" }
    ]
  });
}

async function requireActiveRound() {
  const activeRound = await getActiveRound();

  if (!activeRound) {
    throw createError(400, "No active factory week exists yet. Ask an admin to open the next week.");
  }

  return activeRound;
}

async function getRoundSalesTotal(client, roundId) {
  const aggregate = await client.factorySaleEntry.aggregate({
    where: {
      roundId
    },
    _sum: {
      amount: true
    }
  });

  return Number(aggregate._sum.amount || 0);
}

function canCorrectRoundSessions(status) {
  return ["ACTIVE", "FROZEN"].includes(`${status || ""}`.toUpperCase());
}

async function syncLockedRoundPayouts(client, roundId) {
  const salesTotal = await getRoundSalesTotal(client, roundId);
  const payouts = await client.factoryRoundPayout.findMany({
    where: {
      roundId
    },
    select: {
      id: true,
      sharePercent: true
    }
  });

  for (const payout of payouts) {
    const shareRatio = Number(payout.sharePercent || 0) / 100;
    const payoutAmount = salesTotal * shareRatio;

    await client.factoryRoundPayout.update({
      where: {
        id: payout.id
      },
      data: {
        payoutAmount: payoutAmount.toFixed(2)
      }
    });
  }

  await client.factoryRound.update({
    where: {
      id: roundId
    },
    data: {
      finalizedSalesTotal: salesTotal.toFixed(2)
    }
  });

  return salesTotal;
}

async function rebuildLockedRoundPayouts(client, roundId, now = new Date()) {
  const [sessions, salesTotal] = await Promise.all([
    client.factorySession.findMany({
      where: {
        roundId
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
            section: true,
            workMode: true
          }
        }
      },
      orderBy: [
        { startedAt: "asc" },
        { id: "asc" }
      ]
    }),
    getRoundSalesTotal(client, roundId)
  ]);

  const shareSnapshot = buildFactoryShareRows(sessions, salesTotal, now);

  await client.factoryRoundPayout.deleteMany({
    where: {
      roundId
    }
  });

  if (shareSnapshot.shareRows.length) {
    await client.factoryRoundPayout.createMany({
      data: shareSnapshot.shareRows.map((row) => ({
        roundId,
        userId: row.userId,
        totalMinutes: row.totalMinutes,
        sharePercent: row.sharePercent.toFixed(4),
        payoutAmount: row.projectedPayout.toFixed(2)
      }))
    });
  }

  await client.factoryRound.update({
    where: {
      id: roundId
    },
    data: {
      finalizedSalesTotal: salesTotal.toFixed(2)
    }
  });

  return {
    salesTotal,
    shareRows: shareSnapshot.shareRows
  };
}

function roundBaseDetailInclude() {
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
    }
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    await ensureFactoryBootstrap();

    const now = new Date();
    const salesPage = parsePage(req.query.salesPage, 1);
    const frozenPage = parsePage(req.query.frozenPage, 1);
    const archivePage = parsePage(req.query.archivePage, 1);

    const [allCategories, activeRound, latestReferenceRound, frozenCount, archiveCount] = await Promise.all([
      prisma.factoryCategory.findMany({
        orderBy: [
          { archived: "asc" },
          { section: "asc" },
          { sortOrder: "asc" },
          { name: "asc" }
        ]
      }),
      getActiveRound(),
      getLatestReferenceRound(),
      req.user.role === "ADMIN"
        ? prisma.factoryRound.count({
          where: {
            status: "FROZEN"
          }
        })
        : Promise.resolve(0),
      req.user.role === "ADMIN"
        ? prisma.factoryRound.count({
          where: {
            status: {
              in: ["PAID", "FINALIZED"]
            }
          }
        })
        : Promise.resolve(0)
    ]);

    let categoryView = buildFactoryCategoryView(allCategories, [], req.user.id);
    let activeRoundPayload = null;

    if (activeRound) {
      const activeSalesCountPromise = req.user.role === "ADMIN"
        ? prisma.factorySaleEntry.count({
          where: {
            roundId: activeRound.id
          }
        })
        : Promise.resolve(0);

      const [sessions, currentSalesTotal, activeSalesCount] = await Promise.all([
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
                section: true,
                workMode: true
              }
            }
          },
          orderBy: [
            { startedAt: "asc" },
            { id: "asc" }
          ]
        }),
        getRoundSalesTotal(prisma, activeRound.id),
        activeSalesCountPromise
      ]);

      categoryView = buildFactoryCategoryView(allCategories, sessions, req.user.id);

      const referenceSalesTotal = Number(latestReferenceRound?.finalizedSalesTotal || 0);
      const estimateBasisTotal = currentSalesTotal > 0 ? currentSalesTotal : referenceSalesTotal;
      const estimateBasisSource = currentSalesTotal > 0
        ? "CURRENT_WEEK_SALES"
        : referenceSalesTotal > 0
          ? "LAST_CLOSED_WEEK"
          : "NONE";
      const shareSnapshot = buildFactoryShareRows(sessions, estimateBasisTotal, now);
      let salesEntries = [];
      let salesPagination = null;

      if (req.user.role === "ADMIN") {
        const pagination = buildPagination(activeSalesCount, salesPage, SALES_PAGE_SIZE);
        salesEntries = await prisma.factorySaleEntry.findMany({
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
          skip: pagination.skip,
          take: pagination.pageSize
        });
        salesPagination = {
          page: pagination.page,
          pageSize: pagination.pageSize,
          total: pagination.total,
          totalPages: pagination.totalPages
        };
      }

      activeRoundPayload = {
        id: activeRound.id,
        roundNumber: activeRound.roundNumber,
        startedAt: activeRound.createdAt,
        status: activeRound.status,
        salesTotal: currentSalesTotal,
        estimateBasisTotal,
        estimateBasisSource,
        referenceSalesTotal,
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
        ...(req.user.role === "ADMIN"
          ? {
            salesEntries: salesEntries.map(serializeSaleEntry),
            salesPagination
          }
          : {})
      };
    }

    let adminPayload = null;

    if (req.user.role === "ADMIN") {
      const frozenPagination = buildPagination(frozenCount, frozenPage, ROUND_LIST_PAGE_SIZE);
      const archivePagination = buildPagination(archiveCount, archivePage, ROUND_LIST_PAGE_SIZE);
      const [frozenRounds, archivedRounds, workers] = await Promise.all([
        prisma.factoryRound.findMany({
          where: {
            status: "FROZEN"
          },
          orderBy: [
            { frozenAt: "desc" },
            { roundNumber: "desc" }
          ],
          skip: frozenPagination.skip,
          take: frozenPagination.pageSize,
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
        }),
        prisma.factoryRound.findMany({
          where: {
            status: {
              in: ["PAID", "FINALIZED"]
            }
          },
          orderBy: [
            { paidAt: "desc" },
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
        }),
        prisma.user.findMany({
          where: {
            archived: false,
            active: true
          },
          select: {
            id: true,
            name: true
          },
          orderBy: [
            { name: "asc" }
          ]
        })
      ]);

      adminPayload = {
        workers,
        categories: allCategories.map((category) => ({
          id: category.id,
          slug: category.slug,
          name: category.name,
          section: category.section,
          sectionLabel: factorySectionLabel(category.section),
          workMode: category.workMode,
          workModeLabel: factoryWorkModeLabel(category.workMode),
          helperText: category.helperText,
          sortOrder: category.sortOrder,
          locked: category.locked,
          archived: category.archived
        })),
        frozenRounds: {
          rounds: frozenRounds.map(summarizeRoundForList),
          pagination: {
            page: frozenPagination.page,
            pageSize: frozenPagination.pageSize,
            total: frozenPagination.total,
            totalPages: frozenPagination.totalPages
          }
        },
        archives: {
          rounds: archivedRounds.map(summarizeRoundForList),
          pagination: {
            page: archivePagination.page,
            pageSize: archivePagination.pageSize,
            total: archivePagination.total,
            totalPages: archivePagination.totalPages
          }
        }
      };
    }

    res.json({
      viewer: {
        canAdmin: req.user.role === "ADMIN",
        activeCategoryId: categoryView.viewerActiveCategoryId,
        activeSessionId: categoryView.viewerActiveSessionId
      },
      categories: categoryView.categories,
      activeRound: activeRoundPayload,
      admin: adminPayload
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

    if (!category || category.archived) {
      throw createError(404, "Factory category not found.");
    }

    if (category.workMode !== "CLOCKED") {
      throw createError(400, "That category uses a logged work entry, not a live clock.");
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
          workMode: "CLOCKED",
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
              section: true,
              workMode: true
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
            section: true,
            workMode: true
          }
        }
      }
    });

    if (!currentSession) {
      throw createError(400, "You are not clocked into any factory category right now.");
    }

    if (currentSession.workMode !== "CLOCKED") {
      throw createError(400, "Logged work entries close automatically once they are saved.");
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
            section: true,
            workMode: true
          }
        }
      }
    });

    res.json({
      session: serializeSession(session, now)
    });
  })
);

router.post(
  "/entries",
  asyncHandler(async (req, res) => {
    await ensureFactoryBootstrap();

    const activeRound = await requireActiveRound();
    const categoryId = requireString(req.body.categoryId, "Category");
    const minutes = requirePositiveInt(req.body.minutes, "Minutes spent");
    const note = normalizeOptionalString(req.body.note);
    const category = await prisma.factoryCategory.findUnique({
      where: {
        id: categoryId
      }
    });

    if (!category || category.archived) {
      throw createError(404, "Factory category not found.");
    }

    if (category.workMode !== "LOGGED_ENTRY") {
      throw createError(400, "That category uses a live clock. Use Clock in instead.");
    }

    if (category.locked && req.user.role !== "ADMIN") {
      throw createError(403, "That category is locked right now. An admin can reopen it when needed.");
    }

    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - (minutes * 60000));

    let session = null;
    let closedCurrentCategoryName = null;

    await prisma.$transaction(async (tx) => {
      const currentSession = await tx.factorySession.findFirst({
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

      if (currentSession) {
        if (new Date(currentSession.startedAt).getTime() > startedAt.getTime()) {
          throw createError(
            400,
            "This logged block overlaps your current clocked time. Clock out first or enter a shorter duration."
          );
        }

        await tx.factorySession.update({
          where: {
            id: currentSession.id
          },
          data: {
            endedAt: startedAt
          }
        });

        closedCurrentCategoryName = currentSession.category?.name || null;
      }

      await assertNoSessionOverlap(tx, {
        userId: req.user.id,
        roundId: activeRound.id,
        startedAt,
        endedAt
      });

      session = await tx.factorySession.create({
        data: {
          roundId: activeRound.id,
          userId: req.user.id,
          categoryId: category.id,
          workMode: "LOGGED_ENTRY",
          startedAt,
          endedAt,
          note
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
              section: true,
              workMode: true
            }
          }
        }
      });
    });

    res.status(201).json({
      session: serializeSession(session, endedAt),
      closedCurrentCategoryName
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
            section: true,
            workMode: true
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

router.post(
  "/sessions",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const targetRoundId = normalizeOptionalString(req.body.roundId);
    const round = targetRoundId
      ? await prisma.factoryRound.findUnique({
        where: {
          id: targetRoundId
        }
      })
      : await requireActiveRound();

    if (!round) {
      throw createError(404, "Factory round not found.");
    }

    if (!canCorrectRoundSessions(round.status)) {
      throw createError(400, "Work blocks can only be added to the current active week or a frozen unpaid week.");
    }

    const userId = requireString(req.body.userId, "Worker");
    const categoryId = requireString(req.body.categoryId, "Category");
    const startedAt = requireDateTime(req.body.startedAt, "Session start time");
    const endedAt = requireDateTime(req.body.endedAt, "Session end time");

    if (endedAt <= startedAt) {
      throw createError(400, "Session end time must be after the start time.");
    }

    const [worker, category] = await Promise.all([
      prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          id: true,
          name: true,
          archived: true
        }
      }),
      prisma.factoryCategory.findUnique({
        where: {
          id: categoryId
        }
      })
    ]);

    if (!worker || worker.archived) {
      throw createError(404, "Worker not found.");
    }

    if (!category) {
      throw createError(404, "Factory category not found.");
    }

    await assertNoSessionOverlap(prisma, {
      userId,
      roundId: round.id,
      startedAt,
      endedAt
    });

    let session = null;

    await prisma.$transaction(async (tx) => {
      session = await tx.factorySession.create({
        data: {
          roundId: round.id,
          userId,
          categoryId: category.id,
          workMode: category.workMode,
          startedAt,
          endedAt,
          note: normalizeOptionalString(req.body.note),
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
              section: true,
              workMode: true
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

      if (round.status === "FROZEN") {
        await rebuildLockedRoundPayouts(tx, round.id);
      }
    });

    res.status(201).json({
      session: serializeSession(session)
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

    if (!canCorrectRoundSessions(existingSession.round.status)) {
      throw createError(400, "Only the active week and frozen unpaid weeks can have sessions corrected.");
    }

    const nextUserId = req.body.userId !== undefined
      ? requireString(req.body.userId, "Worker")
      : existingSession.userId;
    const nextCategoryId = req.body.categoryId !== undefined
      ? requireString(req.body.categoryId, "Category")
      : existingSession.categoryId;
    const startedAt = req.body.startedAt !== undefined
      ? requireDateTime(req.body.startedAt, "Session start time")
      : existingSession.startedAt;
    const endedAt = req.body.endedAt !== undefined
      ? parseSessionEnd(req.body.endedAt, "Session end time")
      : existingSession.endedAt;

    if (endedAt && endedAt < startedAt) {
      throw createError(400, "Session end time must be after the start time.");
    }

    const [worker, category] = await Promise.all([
      prisma.user.findUnique({
        where: {
          id: nextUserId
        },
        select: {
          id: true,
          archived: true
        }
      }),
      prisma.factoryCategory.findUnique({
        where: {
          id: nextCategoryId
        }
      })
    ]);

    if (!worker) {
      throw createError(404, "Worker not found.");
    }

    if (worker.archived && nextUserId !== existingSession.userId) {
      throw createError(400, "Archived workers cannot be assigned new work blocks.");
    }

    if (!category) {
      throw createError(404, "Factory category not found.");
    }

    if (existingSession.round.status === "FROZEN" && !endedAt) {
      throw createError(400, "Frozen unpaid weeks can only store closed work blocks.");
    }

    if (category.workMode === "LOGGED_ENTRY" && !endedAt) {
      throw createError(400, "Logged-entry categories must have a start and end time.");
    }

    await assertNoSessionOverlap(prisma, {
      sessionId: existingSession.id,
      userId: nextUserId,
      roundId: existingSession.roundId,
      startedAt,
      endedAt
    });

    let updatedSession = null;

    await prisma.$transaction(async (tx) => {
      updatedSession = await tx.factorySession.update({
        where: {
          id: existingSession.id
        },
        data: {
          userId: nextUserId,
          categoryId: nextCategoryId,
          workMode: category.workMode,
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
              section: true,
              workMode: true
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

      if (existingSession.round.status === "FROZEN") {
        await rebuildLockedRoundPayouts(tx, existingSession.roundId);
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

    if (!canCorrectRoundSessions(existingSession.round.status)) {
      throw createError(400, "Only the active week and frozen unpaid weeks can remove work blocks.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.factorySession.delete({
        where: {
          id: existingSession.id
        }
      });

      if (existingSession.round.status === "FROZEN") {
        await rebuildLockedRoundPayouts(tx, existingSession.roundId);
      }
    });

    res.json({
      deleted: true
    });
  })
);

router.post(
  "/categories",
  requireAdmin,
  asyncHandler(async (req, res) => {
    await ensureFactoryBootstrap();

    const name = requireString(req.body.name, "Category name");
    const section = requireFactorySection(req.body.section);
    const workMode = requireFactoryWorkMode(req.body.workMode);
    const helperText = normalizeOptionalString(req.body.helperText);
    const slug = await getUniqueFactoryCategorySlug(name);
    const latestCategory = await prisma.factoryCategory.findFirst({
      orderBy: {
        sortOrder: "desc"
      },
      select: {
        sortOrder: true
      }
    });

    const category = await prisma.factoryCategory.create({
      data: {
        slug,
        name,
        section,
        workMode,
        helperText,
        sortOrder: Number(latestCategory?.sortOrder || 0) + 10,
        locked: false,
        archived: false
      }
    });

    res.status(201).json({
      category: {
        id: category.id,
        slug: category.slug,
        name: category.name,
        section: category.section,
        workMode: category.workMode,
        helperText: category.helperText,
        sortOrder: category.sortOrder,
        locked: category.locked,
        archived: category.archived
      }
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

    const nextSection = req.body.section !== undefined
      ? requireFactorySection(req.body.section)
      : category.section;
    const nextWorkMode = req.body.workMode !== undefined
      ? requireFactoryWorkMode(req.body.workMode)
      : category.workMode;
    const nextArchived = typeof req.body.archived === "boolean"
      ? req.body.archived
      : category.archived;

    const hasLiveSession = await prisma.factorySession.count({
      where: {
        categoryId: category.id,
        endedAt: null
      }
    });

    if (hasLiveSession && (nextArchived || nextWorkMode !== category.workMode)) {
      throw createError(400, "Close the live clock session on this category before archiving it or changing how it works.");
    }

    const updatedCategory = await prisma.factoryCategory.update({
      where: {
        id: category.id
      },
      data: {
        name: req.body.name !== undefined ? requireString(req.body.name, "Category name") : category.name,
        section: nextSection,
        workMode: nextWorkMode,
        helperText: req.body.helperText !== undefined
          ? normalizeOptionalString(req.body.helperText)
          : category.helperText,
        locked: typeof req.body.locked === "boolean"
          ? req.body.locked
          : nextArchived
            ? true
            : category.locked,
        archived: nextArchived
      }
    });

    res.json({
      category: {
        id: updatedCategory.id,
        slug: updatedCategory.slug,
        name: updatedCategory.name,
        section: updatedCategory.section,
        workMode: updatedCategory.workMode,
        helperText: updatedCategory.helperText,
        sortOrder: updatedCategory.sortOrder,
        locked: updatedCategory.locked,
        archived: updatedCategory.archived
      }
    });
  })
);

router.post(
  "/sales",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const amount = Number(requireMoney(req.body.amount, "Sale amount"));

    if (amount <= 0) {
      throw createError(400, "Sale amount must be greater than zero.");
    }

    const targetRoundId = normalizeOptionalString(req.body.roundId);
    const round = targetRoundId
      ? await prisma.factoryRound.findUnique({
        where: {
          id: targetRoundId
        }
      })
      : await requireActiveRound();

    if (!round) {
      throw createError(404, "Factory round not found.");
    }

    if (!["ACTIVE", "FROZEN"].includes(round.status)) {
      throw createError(400, "Sales can only be logged against the current active week or a frozen unpaid week.");
    }

    let entry = null;

    await prisma.$transaction(async (tx) => {
      entry = await tx.factorySaleEntry.create({
        data: {
          roundId: round.id,
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

      if (round.status === "FROZEN") {
        await syncLockedRoundPayouts(tx, round.id);
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

    if (!["ACTIVE", "FROZEN"].includes(entry.round.status)) {
      throw createError(400, "Only active weeks and frozen unpaid weeks can edit sale entries.");
    }

    const amount = req.body.amount !== undefined
      ? Number(requireMoney(req.body.amount, "Sale amount"))
      : Number(entry.amount || 0);

    if (amount <= 0) {
      throw createError(400, "Sale amount must be greater than zero.");
    }

    let updatedEntry = null;

    await prisma.$transaction(async (tx) => {
      updatedEntry = await tx.factorySaleEntry.update({
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

      if (entry.round.status === "FROZEN") {
        await syncLockedRoundPayouts(tx, entry.roundId);
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

    if (!["ACTIVE", "FROZEN"].includes(entry.round.status)) {
      throw createError(400, "Only active weeks and frozen unpaid weeks can edit sale entries.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.factorySaleEntry.delete({
        where: {
          id: entry.id
        }
      });

      if (entry.round.status === "FROZEN") {
        await syncLockedRoundPayouts(tx, entry.roundId);
      }
    });

    res.json({
      deleted: true
    });
  })
);

router.post(
  "/rounds/freeze",
  requireAdmin,
  asyncHandler(async (req, res) => {
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
      const { salesTotal } = await rebuildLockedRoundPayouts(tx, activeRound.id, now);

      const frozenRound = await tx.factoryRound.update({
        where: {
          id: activeRound.id
        },
        data: {
          status: "FROZEN",
          frozenAt: now,
          finalizedSalesTotal: salesTotal.toFixed(2)
        }
      });

      const nextRound = await tx.factoryRound.create({
        data: {
          roundNumber: await getNextFactoryRoundNumber(tx),
          createdById: req.user.id
        }
      });

      return {
        frozenRound,
        nextRound
      };
    });

    res.json({
      frozenRound: {
        id: result.frozenRound.id,
        roundNumber: result.frozenRound.roundNumber,
        frozenAt: result.frozenRound.frozenAt
      },
      nextRound: {
        id: result.nextRound.id,
        roundNumber: result.nextRound.roundNumber,
        createdAt: result.nextRound.createdAt
      }
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
      throw createError(400, "There is already an active factory week running.");
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

router.post(
  "/rounds/:id/pay",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const round = await prisma.factoryRound.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!round) {
      throw createError(404, "Factory round not found.");
    }

    if (round.status !== "FROZEN") {
      throw createError(400, "Only frozen unpaid weeks can be marked as paid.");
    }

    const now = new Date();
    const updatedRound = await prisma.$transaction(async (tx) => {
      const { salesTotal } = await rebuildLockedRoundPayouts(tx, round.id, now);

      return tx.factoryRound.update({
        where: {
          id: round.id
        },
        data: {
          status: "PAID",
          paidAt: now,
          finalizedAt: now,
          finalizedSalesTotal: salesTotal.toFixed(2)
        }
      });
    });

    res.json({
      round: {
        id: updatedRound.id,
        roundNumber: updatedRound.roundNumber,
        status: updatedRound.status,
        paidAt: updatedRound.paidAt
      }
    });
  })
);

router.get(
  "/rounds/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const salesPage = parsePage(req.query.salesPage, 1);
    const sessionsPage = parsePage(req.query.sessionsPage, 1);

    const round = await prisma.factoryRound.findUnique({
      where: {
        id: req.params.id
      },
      include: roundBaseDetailInclude()
    });

    if (!round) {
      throw createError(404, "Factory round not found.");
    }

    const [salesTotalCount, sessionTotalCount, salesEntries, pagedSessions, allSessions] = await Promise.all([
      prisma.factorySaleEntry.count({
        where: {
          roundId: round.id
        }
      }),
      prisma.factorySession.count({
        where: {
          roundId: round.id
        }
      }),
      (async () => {
        const pagination = buildPagination(
          await prisma.factorySaleEntry.count({
            where: {
              roundId: round.id
            }
          }),
          salesPage,
          DETAIL_SALES_PAGE_SIZE
        );

        const entries = await prisma.factorySaleEntry.findMany({
          where: {
            roundId: round.id
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
          skip: pagination.skip,
          take: pagination.pageSize
        });

        return {
          pagination,
          entries
        };
      })(),
      (async () => {
        const pagination = buildPagination(
          await prisma.factorySession.count({
            where: {
              roundId: round.id
            }
          }),
          sessionsPage,
          DETAIL_SESSIONS_PAGE_SIZE
        );

        const sessions = await prisma.factorySession.findMany({
          where: {
            roundId: round.id
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
                section: true,
                workMode: true
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

        return {
          pagination,
          sessions
        };
      })(),
      prisma.factorySession.findMany({
        where: {
          roundId: round.id
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              section: true
            }
          }
        }
      })
    ]);

    const totalMinutes = round.payouts.reduce((sum, payout) => sum + Number(payout.totalMinutes || 0), 0);

    res.json({
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        status: round.status,
        createdAt: round.createdAt,
        frozenAt: round.frozenAt,
        paidAt: round.paidAt,
        finalizedAt: round.finalizedAt,
        salesTotal: Number(round.finalizedSalesTotal || 0),
        totalMinutes,
        participantCount: round.payouts.length,
        canEditSales: round.status === "FROZEN",
        canMarkPaid: round.status === "FROZEN",
        canCorrectSessions: round.status === "FROZEN"
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
      salesEntries: salesEntries.entries.map(serializeSaleEntry),
      salesPagination: {
        page: salesEntries.pagination.page,
        pageSize: salesEntries.pagination.pageSize,
        total: salesTotalCount,
        totalPages: salesEntries.pagination.totalPages
      },
      sessions: pagedSessions.sessions.map((session) => serializeSession(session)),
      sessionsPagination: {
        page: pagedSessions.pagination.page,
        pageSize: pagedSessions.pagination.pageSize,
        total: sessionTotalCount,
        totalPages: pagedSessions.pagination.totalPages
      },
      categoryBreakdown: summarizeFactoryCategoryBreakdown(allSessions)
    });
  })
);

export default router;
