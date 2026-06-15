import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, authenticateTokenOptional, requireOwner } from "../middleware/auth.js";
import {
  normalizeOptionalString,
  requireInt,
  requireString
} from "../validators.js";

const router = Router();

function requireDateTime(value, fieldName) {
  const normalized = requireString(value, fieldName);
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, `${fieldName} must be a valid date and time.`);
  }

  return parsed;
}

function requireBoundedInt(value, fieldName, min, max) {
  const parsed = requireInt(value, fieldName);

  if (parsed < min || parsed > max) {
    throw createError(400, `${fieldName} must be between ${min} and ${max}.`);
  }

  return parsed;
}

function requireNonNegativeInt(value, fieldName) {
  const parsed = requireInt(value, fieldName);

  if (parsed < 0) {
    throw createError(400, `${fieldName} must be zero or greater.`);
  }

  return parsed;
}

function requireNegativeOrZeroInt(value, fieldName) {
  const parsed = requireInt(value, fieldName);

  if (parsed > 0) {
    throw createError(400, `${fieldName} must be zero or less.`);
  }

  return parsed;
}

function normalizeFightStatus(value, fallback = "UPCOMING") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!["UPCOMING", "COMPLETED", "CANCELLED"].includes(normalized)) {
    throw createError(400, "A valid fight status is required.");
  }

  return normalized;
}

function assertWinnerName(fight, winnerName) {
  if (!winnerName) {
    return null;
  }

  const normalizedWinner = requireString(winnerName, "Winner name");
  const validNames = [fight?.fighterRedName, fight?.fighterBlueName].filter(Boolean);

  if (fight && !validNames.includes(normalizedWinner)) {
    throw createError(400, "Winner must match one of the scheduled fighters.");
  }

  return normalizedWinner;
}

function normalizeAwardType(value, fallback = "BOUT") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!["BOUT", "CORRECTION"].includes(normalized)) {
    throw createError(400, "Award type must be bout or correction.");
  }

  return normalized;
}

function normalizeAwardResult(value) {
  const normalized = `${value ?? ""}`.trim().toUpperCase();

  if (!["WIN", "LOSS"].includes(normalized)) {
    throw createError(400, "A bout result of win or loss is required.");
  }

  return normalized;
}

function normalizeWinnerCorner(value) {
  const normalized = `${value ?? ""}`.trim().toUpperCase();

  if (!["RED", "BLUE"].includes(normalized)) {
    throw createError(400, "Winner corner must be red or blue.");
  }

  return normalized;
}

function requireDistinctFightParticipants(redName, blueName) {
  if (redName === blueName) {
    throw createError(400, "A fight requires two different fighters.");
  }
}

function serializeDateValue(value) {
  return value instanceof Date ? value.toISOString() : value || null;
}

async function ensureScoringConfig(client = prisma) {
  const existingConfig = await client.fightScoringConfig.findUnique({
    where: { slug: "default" }
  });

  if (existingConfig) {
    return existingConfig;
  }

  return client.fightScoringConfig.create({
    data: { slug: "default" }
  });
}

async function ensureFightSecurityState(client = prisma) {
  const existingState = await client.fightSecurityState.findUnique({
    where: { slug: "default" }
  });

  if (existingState) {
    return existingState;
  }

  return client.fightSecurityState.create({
    data: { slug: "default" }
  });
}

async function ensureLeaderboardWriteAccess(user, client = prisma) {
  const securityState = await ensureFightSecurityState(client);

  if (securityState.writesLocked && !user?.owner) {
    throw createError(423, "Leaderboard writes are locked. Only the owner can make changes right now.");
  }

  return securityState;
}

function buildFighterSnapshot(fighter) {
  if (!fighter) {
    return null;
  }

  return {
    id: fighter.id,
    name: fighter.name,
    points: fighter.points,
    wins: fighter.wins,
    losses: fighter.losses,
    charismaPoints: fighter.charismaPoints,
    dominancePoints: fighter.dominancePoints,
    isChampion: fighter.isChampion,
    active: fighter.active,
    archived: Boolean(fighter.archived),
    notes: fighter.notes,
    lastFightAt: serializeDateValue(fighter.lastFightAt),
    lastAwardedAt: serializeDateValue(fighter.lastAwardedAt),
    archivedAt: serializeDateValue(fighter.archivedAt),
    restoredAt: serializeDateValue(fighter.restoredAt),
    createdAt: serializeDateValue(fighter.createdAt),
    updatedAt: serializeDateValue(fighter.updatedAt)
  };
}

function buildFightSnapshot(fight) {
  if (!fight) {
    return null;
  }

  return {
    id: fight.id,
    fighterRedName: fight.fighterRedName,
    fighterBlueName: fight.fighterBlueName,
    scheduledAt: serializeDateValue(fight.scheduledAt),
    venue: fight.venue,
    notes: fight.notes,
    status: fight.status,
    winnerName: fight.winnerName,
    createdAt: serializeDateValue(fight.createdAt),
    updatedAt: serializeDateValue(fight.updatedAt)
  };
}

function buildScoringConfigSnapshot(config) {
  if (!config) {
    return null;
  }

  return {
    id: config.id,
    slug: config.slug,
    startingPoints: config.startingPoints,
    winPoints: config.winPoints,
    lossPoints: config.lossPoints,
    charismaMax: config.charismaMax,
    dominanceMax: config.dominanceMax,
    titleWinBonus: config.titleWinBonus,
    inactivityGraceDays: config.inactivityGraceDays,
    inactivityWeeklyPenalty: config.inactivityWeeklyPenalty,
    eliminationDays: config.eliminationDays,
    createdAt: serializeDateValue(config.createdAt),
    updatedAt: serializeDateValue(config.updatedAt)
  };
}

function buildHallOfFameSnapshot(entry) {
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    fighterName: entry.fighterName,
    title: entry.title,
    pointsAtTitle: entry.pointsAtTitle,
    notes: entry.notes,
    wonAt: serializeDateValue(entry.wonAt),
    createdAt: serializeDateValue(entry.createdAt),
    updatedAt: serializeDateValue(entry.updatedAt)
  };
}

function buildSecurityStateSnapshot(securityState, actorName = null) {
  if (!securityState) {
    return null;
  }

  return {
    writesLocked: Boolean(securityState.writesLocked),
    lockReason: securityState.lockReason,
    lockedAt: serializeDateValue(securityState.lockedAt),
    lockedByName: actorName
  };
}

async function createFightAuditLog(transaction, {
  actorId = null,
  action,
  entityType,
  entityId = null,
  summary,
  before = null,
  after = null,
  metadata = null
}) {
  return transaction.fightAuditLog.create({
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

function deriveInactivityState(fighter, scoringConfig, now = new Date()) {
  const referenceDate = fighter.lastFightAt ?? fighter.lastAwardedAt ?? fighter.createdAt;
  const elapsedMs = now.getTime() - referenceDate.getTime();
  const daysSinceFight = Math.max(0, Math.floor(elapsedMs / 86400000));

  if (daysSinceFight <= scoringConfig.inactivityGraceDays) {
    return {
      daysSinceFight,
      inactivityPenalty: 0,
      inactivityState: "ACTIVE"
    };
  }

  const overdueDays = daysSinceFight - scoringConfig.inactivityGraceDays;
  const overdueWeeks = Math.floor(overdueDays / 7);
  const inactivityPenalty = Math.max(0, overdueWeeks * scoringConfig.inactivityWeeklyPenalty);
  const inactivityState = daysSinceFight >= scoringConfig.eliminationDays ? "ELIMINATED" : "COLD";

  return {
    daysSinceFight,
    inactivityPenalty,
    inactivityState
  };
}

function compareRankedFighters(left, right) {
  if (left.isChampion !== right.isChampion) {
    return left.isChampion ? -1 : 1;
  }

  if (right.effectivePoints !== left.effectivePoints) {
    return right.effectivePoints - left.effectivePoints;
  }

  if (right.points !== left.points) {
    return right.points - left.points;
  }

  if (right.wins !== left.wins) {
    return right.wins - left.wins;
  }

  return left.name.localeCompare(right.name);
}

function compareContenderFighters(left, right) {
  if (right.effectivePoints !== left.effectivePoints) {
    return right.effectivePoints - left.effectivePoints;
  }

  if (right.points !== left.points) {
    return right.points - left.points;
  }

  if (right.wins !== left.wins) {
    return right.wins - left.wins;
  }

  return left.name.localeCompare(right.name);
}

function buildFighterViews(fighters, scoringConfig) {
  const derivedFighters = fighters.map((fighter) => {
    const inactivity = deriveInactivityState(fighter, scoringConfig);

    return {
      id: fighter.id,
      name: fighter.name,
      points: fighter.points,
      effectivePoints: fighter.points - inactivity.inactivityPenalty,
      wins: fighter.wins,
      losses: fighter.losses,
      charismaPoints: fighter.charismaPoints,
      dominancePoints: fighter.dominancePoints,
      isChampion: fighter.isChampion,
      active: fighter.active,
      archived: Boolean(fighter.archived),
      notes: fighter.notes,
      lastFightAt: fighter.lastFightAt,
      lastAwardedAt: fighter.lastAwardedAt,
      archivedAt: fighter.archivedAt,
      restoredAt: fighter.restoredAt,
      createdAt: fighter.createdAt,
      updatedAt: fighter.updatedAt,
      daysSinceFight: inactivity.daysSinceFight,
      inactivityPenalty: inactivity.inactivityPenalty,
      inactivityState: inactivity.inactivityState,
      badges: []
    };
  });

  const activeFighters = derivedFighters.filter((fighter) => !fighter.archived);
  const publicFighters = activeFighters.filter((fighter) => fighter.active && fighter.inactivityState !== "ELIMINATED");
  const winsLeaderValue = Math.max(0, ...publicFighters.map((fighter) => fighter.wins));
  const charismaLeaderValue = Math.max(0, ...publicFighters.map((fighter) => fighter.charismaPoints));
  const dominanceLeaderValue = Math.max(0, ...publicFighters.map((fighter) => fighter.dominancePoints));

  activeFighters.forEach((fighter) => {
    if (fighter.isChampion) {
      fighter.badges.push("Champion");
    }

    if (winsLeaderValue > 0 && fighter.wins === winsLeaderValue) {
      fighter.badges.push("Most Wins");
    }

    if (charismaLeaderValue > 0 && fighter.charismaPoints === charismaLeaderValue) {
      fighter.badges.push("Most Charisma");
    }

    if (dominanceLeaderValue > 0 && fighter.dominancePoints === dominanceLeaderValue) {
      fighter.badges.push("Most Dominant");
    }

    if (fighter.inactivityState === "COLD") {
      fighter.badges.push("Cold");
    }

    if (fighter.inactivityState === "ELIMINATED") {
      fighter.badges.push("Eliminated");
    }
  });

  const champion = publicFighters
    .filter((fighter) => fighter.isChampion)
    .sort(compareRankedFighters)[0] || null;

  const contenderPool = publicFighters
    .filter((fighter) => !fighter.isChampion)
    .slice()
    .sort(compareContenderFighters);

  const rankedFighters = [];

  if (champion) {
    rankedFighters.push({
      ...champion,
      rank: 1
    });
  }

  contenderPool.forEach((fighter, index) => {
    rankedFighters.push({
      ...fighter,
      rank: index + 2
    });
  });

  const fighterDirectory = derivedFighters
    .filter((fighter) => !fighter.archived)
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));

  const archivedFighters = derivedFighters
    .filter((fighter) => fighter.archived)
    .slice()
    .sort((left, right) => {
      const leftTime = left.archivedAt ? new Date(left.archivedAt).getTime() : 0;
      const rightTime = right.archivedAt ? new Date(right.archivedAt).getTime() : 0;

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return left.name.localeCompare(right.name);
    });

  const leaderCards = {
    wins: rankedFighters.find((fighter) => fighter.badges.includes("Most Wins")) || null,
    charisma: rankedFighters.find((fighter) => fighter.badges.includes("Most Charisma")) || null,
    dominance: rankedFighters.find((fighter) => fighter.badges.includes("Most Dominant")) || null
  };

  return {
    rankedFighters,
    fighterDirectory,
    archivedFighters,
    leaderCards
  };
}

function buildBoutScoreData({
  scoringConfig,
  result,
  charismaPoints = 0,
  dominancePoints = 0,
  applyTitleWinBonus = false
}) {
  const normalizedResult = normalizeAwardResult(result);
  const safeCharismaPoints = requireBoundedInt(
    charismaPoints,
    "Charisma points",
    0,
    scoringConfig.charismaMax
  );
  const safeDominancePoints = requireBoundedInt(
    dominancePoints,
    "Dominance points",
    0,
    scoringConfig.dominanceMax
  );

  let bonusPoints = 0;

  if (applyTitleWinBonus) {
    bonusPoints += scoringConfig.titleWinBonus;
  }

  return {
    result: normalizedResult,
    resultPoints: normalizedResult === "WIN" ? scoringConfig.winPoints : scoringConfig.lossPoints,
    charismaPoints: safeCharismaPoints,
    dominancePoints: safeDominancePoints,
    bonusPoints
  };
}

async function applyScoreEntry(transaction, {
  fighterId,
  fightId = null,
  entryType = "BOUT",
  result = null,
  resultPoints = 0,
  charismaPoints = 0,
  dominancePoints = 0,
  bonusPoints = 0,
  awardedAt,
  note = null
}) {
  const totalDelta = resultPoints + charismaPoints + dominancePoints + bonusPoints;

  const fighter = await transaction.fightFighter.update({
    where: { id: fighterId },
    data: {
      points: {
        increment: totalDelta
      },
      wins: entryType === "BOUT" && result === "WIN"
        ? { increment: 1 }
        : undefined,
      losses: entryType === "BOUT" && result === "LOSS"
        ? { increment: 1 }
        : undefined,
      charismaPoints: charismaPoints
        ? { increment: charismaPoints }
        : undefined,
      dominancePoints: dominancePoints
        ? { increment: dominancePoints }
        : undefined,
      lastFightAt: entryType === "BOUT" ? awardedAt : undefined,
      lastAwardedAt: awardedAt
    }
  });

  const scoreEntry = await transaction.fightScoreEntry.create({
    data: {
      fighterId,
      fightId,
      entryType,
      result,
      resultPoints,
      charismaPoints,
      dominancePoints,
      bonusPoints,
      totalDelta,
      awardedAt,
      note: normalizeOptionalString(note)
    }
  });

  return {
    fighter,
    scoreEntry,
    totalDelta
  };
}

async function buildLeaderboardPayload(reqUser = null) {
  const scoringConfig = await ensureScoringConfig();
  const [fighters, hallOfFame, fightCard, securityState, recentAuditEntries] = await Promise.all([
    prisma.fightFighter.findMany({
      orderBy: [{ isChampion: "desc" }, { points: "desc" }, { name: "asc" }]
    }),
    prisma.fightHallOfFameEntry.findMany({
      orderBy: [{ wonAt: "desc" }, { fighterName: "asc" }]
    }),
    prisma.fightCard.findMany({
      where: {
        status: "UPCOMING"
      },
      orderBy: [{ scheduledAt: "asc" }, { fighterRedName: "asc" }]
    }),
    prisma.fightSecurityState.findUnique({
      where: { slug: "default" },
      include: {
        lockedBy: {
          select: {
            id: true,
            name: true
          }
        }
      }
    }),
    prisma.fightAuditLog.findMany({
      take: 60,
      orderBy: [{ createdAt: "desc" }],
      include: {
        actor: {
          select: {
            id: true,
            name: true
          }
        },
      }
    })
  ]);

  const leaderboardData = buildFighterViews(fighters, scoringConfig);
  const resolvedSecurityState = securityState || await ensureFightSecurityState();

  return {
    generatedAt: new Date().toISOString(),
    scoringConfig,
    fighters: leaderboardData.rankedFighters,
    fighterDirectory: leaderboardData.fighterDirectory,
    archivedFighters: leaderboardData.archivedFighters,
    leaderCards: leaderboardData.leaderCards,
    hallOfFame,
    fightCard,
    securityState: buildSecurityStateSnapshot(
      resolvedSecurityState,
      securityState?.lockedBy?.name || null
    ),
    auditLog: recentAuditEntries.map((entry) => ({
      id: entry.id,
      actorName: entry.actor?.name || "Unknown",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      createdAt: entry.createdAt
    })),
    viewer: {
      isLoggedIn: Boolean(reqUser),
      canManage: Boolean(reqUser),
      canUseAdminPanel: Boolean(reqUser?.role === "ADMIN" || reqUser?.permissions?.includes("USERS")),
      isOwner: Boolean(reqUser?.owner)
    }
  };
}

function toPublicLeaderboardPayload(payload) {
  return {
    generatedAt: payload.generatedAt,
    fighters: payload.fighters,
    leaderCards: payload.leaderCards,
    hallOfFame: payload.hallOfFame,
    fightCard: payload.fightCard
  };
}

function toAdminLeaderboardPayload(payload) {
  return {
    generatedAt: payload.generatedAt,
    scoringConfig: payload.scoringConfig,
    fighterDirectory: payload.fighterDirectory,
    archivedFighters: payload.archivedFighters,
    securityState: payload.securityState,
    auditLog: payload.auditLog,
    viewer: payload.viewer
  };
}

router.get(
  "/public",
  asyncHandler(async (_req, res) => {
    res.json(toPublicLeaderboardPayload(await buildLeaderboardPayload(null)));
  })
);

router.get(
  "/admin",
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json(toAdminLeaderboardPayload(await buildLeaderboardPayload(req.user)));
  })
);

router.get(
  "/",
  authenticateTokenOptional,
  asyncHandler(async (req, res) => {
    res.json(await buildLeaderboardPayload(req.user));
  })
);

router.use(authenticateToken);

router.post(
  "/fighters",
  asyncHandler(async (req, res) => {
    const name = requireString(req.body.name, "Fighter name");

    const fighter = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);
      const scoringConfig = await ensureScoringConfig(transaction);
      const openingPoints = req.body.points === undefined
        ? scoringConfig.startingPoints
        : requireInt(req.body.points, "Opening points");

      const fighter = await transaction.fightFighter.create({
        data: {
          name,
          points: openingPoints,
          wins: req.body.wins !== undefined
            ? requireNonNegativeInt(req.body.wins, "Wins")
            : 0,
          losses: req.body.losses !== undefined
            ? requireNonNegativeInt(req.body.losses, "Losses")
            : 0,
          charismaPoints: req.body.charismaPoints !== undefined
            ? requireNonNegativeInt(req.body.charismaPoints, "Charisma points")
            : 0,
          dominancePoints: req.body.dominancePoints !== undefined
            ? requireNonNegativeInt(req.body.dominancePoints, "Dominance points")
            : 0,
          isChampion: false,
          active: typeof req.body.active === "boolean" ? req.body.active : true,
          lastFightAt: req.body.lastFightAt
            ? requireDateTime(req.body.lastFightAt, "Last fight date")
            : null,
          lastAwardedAt: req.body.lastAwardedAt
            ? requireDateTime(req.body.lastAwardedAt, "Last awarded date")
            : null,
          notes: normalizeOptionalString(req.body.notes)
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "FIGHTER_CREATED",
        entityType: "FIGHTER",
        entityId: fighter.id,
        summary: `${req.user.name} created fighter ${fighter.name}.`,
        after: buildFighterSnapshot(fighter)
      });

      return fighter;
    });

    res.status(201).json({ fighter });
  })
);

router.patch(
  "/fighters/:id",
  asyncHandler(async (req, res) => {
    const existingFighter = await prisma.fightFighter.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFighter || existingFighter.archived) {
      throw createError(404, "Fighter not found.");
    }

    const applyStatOverride = req.body.applyStatOverride === true;
    const nextActiveState = typeof req.body.active === "boolean" ? req.body.active : existingFighter.active;

    if (existingFighter.isChampion && !nextActiveState) {
      throw createError(400, "The current belt holder cannot be set inactive. Vacate or move the belt first.");
    }

    const fighter = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const fighter = await transaction.fightFighter.update({
        where: { id: existingFighter.id },
        data: {
          name: req.body.name !== undefined
            ? requireString(req.body.name, "Fighter name")
            : existingFighter.name,
          points: applyStatOverride && req.body.points !== undefined
            ? requireInt(req.body.points, "Points")
            : existingFighter.points,
          wins: applyStatOverride && req.body.wins !== undefined
            ? requireNonNegativeInt(req.body.wins, "Wins")
            : existingFighter.wins,
          losses: applyStatOverride && req.body.losses !== undefined
            ? requireNonNegativeInt(req.body.losses, "Losses")
            : existingFighter.losses,
          charismaPoints: applyStatOverride && req.body.charismaPoints !== undefined
            ? requireNonNegativeInt(req.body.charismaPoints, "Charisma points")
            : existingFighter.charismaPoints,
          dominancePoints: applyStatOverride && req.body.dominancePoints !== undefined
            ? requireNonNegativeInt(req.body.dominancePoints, "Dominance points")
            : existingFighter.dominancePoints,
          active: nextActiveState,
          notes: req.body.notes !== undefined ? normalizeOptionalString(req.body.notes) : existingFighter.notes,
          lastFightAt: applyStatOverride && req.body.lastFightAt
            ? requireDateTime(req.body.lastFightAt, "Last fight date")
            : applyStatOverride && req.body.lastFightAt === ""
              ? null
              : existingFighter.lastFightAt,
          lastAwardedAt: applyStatOverride && req.body.lastAwardedAt
            ? requireDateTime(req.body.lastAwardedAt, "Last awarded date")
            : applyStatOverride && req.body.lastAwardedAt === ""
              ? null
              : existingFighter.lastAwardedAt
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "FIGHTER_UPDATED",
        entityType: "FIGHTER",
        entityId: fighter.id,
        summary: applyStatOverride
          ? `${req.user.name} updated fighter ${fighter.name} with a direct stat override.`
          : `${req.user.name} updated fighter ${fighter.name}.`,
        before: buildFighterSnapshot(existingFighter),
        after: buildFighterSnapshot(fighter),
        metadata: {
          applyStatOverride
        }
      });

      return fighter;
    });

    res.json({ fighter });
  })
);

router.patch(
  "/security",
  requireOwner,
  asyncHandler(async (req, res) => {
    const writesLocked = req.body.writesLocked === true;
    const lockReason = writesLocked ? normalizeOptionalString(req.body.lockReason) : null;
    const changedAt = new Date();

    const securityState = await prisma.$transaction(async (transaction) => {
      const existingState = await ensureFightSecurityState(transaction);

      const securityState = await transaction.fightSecurityState.update({
        where: { id: existingState.id },
        data: {
          writesLocked,
          lockReason,
          lockedAt: writesLocked ? changedAt : null,
          lockedById: writesLocked ? req.user.id : null
        },
        include: {
          lockedBy: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "SECURITY_LOCK_UPDATED",
        entityType: "SECURITY_STATE",
        entityId: securityState.id,
        summary: writesLocked
          ? `${req.user.name} locked leaderboard writes.`
          : `${req.user.name} unlocked leaderboard writes.`,
        before: buildSecurityStateSnapshot(existingState),
        after: buildSecurityStateSnapshot(securityState, securityState.lockedBy?.name || null),
        metadata: {
          writesLocked,
          lockReason
        }
      });

      return securityState;
    });

    res.json({
      securityState: buildSecurityStateSnapshot(securityState, securityState.lockedBy?.name || null)
    });
  })
);

router.post(
  "/champion",
  asyncHandler(async (req, res) => {
    const fighterId = normalizeOptionalString(req.body.fighterId);
    const awardedAt = req.body.awardedAt
      ? requireDateTime(req.body.awardedAt, "Awarded at")
      : new Date();

    const champion = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const currentChampion = await transaction.fightFighter.findFirst({
        where: {
          isChampion: true,
          archived: false
        }
      });

      await transaction.fightFighter.updateMany({
        where: { isChampion: true },
        data: { isChampion: false }
      });

      if (!fighterId) {
        await createFightAuditLog(transaction, {
          actorId: req.user.id,
          action: "BELT_VACATED",
          entityType: "FIGHTER",
          entityId: currentChampion?.id || null,
          summary: `${req.user.name} vacated the belt.`,
          before: buildFighterSnapshot(currentChampion),
          after: null
        });

        return null;
      }

      const existingFighter = await transaction.fightFighter.findUnique({
        where: { id: fighterId }
      });

      if (!existingFighter) {
        throw createError(404, "Fighter not found.");
      }

      if (!existingFighter.active || existingFighter.archived) {
        throw createError(400, "Only active fighters can hold the belt.");
      }

      const champion = await transaction.fightFighter.update({
        where: { id: existingFighter.id },
        data: {
          isChampion: true,
          lastAwardedAt: awardedAt
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "BELT_AWARDED",
        entityType: "FIGHTER",
        entityId: champion.id,
        summary: `${req.user.name} awarded the belt to ${champion.name}.`,
        before: {
          previousChampion: buildFighterSnapshot(currentChampion),
          nextChampion: buildFighterSnapshot(existingFighter)
        },
        after: buildFighterSnapshot(champion)
      });

      return champion;
    });

    res.json({ champion });
  })
);

router.post(
  "/fighters/:id/award",
  asyncHandler(async (req, res) => {
    const existingFighter = await prisma.fightFighter.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFighter || existingFighter.archived) {
      throw createError(404, "Fighter not found.");
    }

    const scoringConfig = await ensureScoringConfig();
    const entryType = normalizeAwardType(req.body.entryType);
    const awardedAt = req.body.awardedAt
      ? requireDateTime(req.body.awardedAt, "Awarded at")
      : new Date();
    const fightId = req.body.fightId ? requireString(req.body.fightId, "Fight") : null;
    let fight = null;

    if (fightId) {
      fight = await prisma.fightCard.findUnique({
        where: { id: fightId }
      });

      if (!fight) {
        throw createError(404, "Fight not found.");
      }
    }

    let result = null;
    let resultPoints = 0;
    let charismaPoints = 0;
    let dominancePoints = 0;
    let bonusPoints = 0;

    if (entryType === "BOUT") {
      ({
        result,
        resultPoints,
        charismaPoints,
        dominancePoints,
        bonusPoints
      } = buildBoutScoreData({
        scoringConfig,
        result: req.body.result,
        charismaPoints: req.body.charismaPoints ?? 0,
        dominancePoints: req.body.dominancePoints ?? 0,
        applyTitleWinBonus: req.body.applyTitleWinBonus === true
      }));
    } else {
      resultPoints = requireInt(req.body.correctionPoints, "Correction points");
    }

    const fighter = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const { fighter: updatedFighter } = await applyScoreEntry(transaction, {
        fighterId: existingFighter.id,
        fightId,
        entryType,
        result,
        resultPoints,
        charismaPoints,
        dominancePoints,
        bonusPoints,
        awardedAt,
        note: req.body.note
      });

      let updatedFight = null;

      if (fight && entryType === "BOUT" && result === "WIN") {
        const validNames = [fight.fighterRedName, fight.fighterBlueName];

        if (validNames.includes(updatedFighter.name)) {
          updatedFight = await transaction.fightCard.update({
            where: { id: fight.id },
            data: {
              status: "COMPLETED",
              winnerName: updatedFighter.name
            }
          });
        }
      }

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: entryType === "CORRECTION" ? "FIGHTER_CORRECTED" : "FIGHTER_SCORED",
        entityType: "FIGHTER",
        entityId: updatedFighter.id,
        summary: entryType === "CORRECTION"
          ? `${req.user.name} corrected ${updatedFighter.name} by ${resultPoints} points.`
          : `${req.user.name} recorded a ${result?.toLowerCase() || "fight"} entry for ${updatedFighter.name}.`,
        before: buildFighterSnapshot(existingFighter),
        after: buildFighterSnapshot(updatedFighter),
        metadata: {
          entryType,
          result,
          resultPoints,
          charismaPoints,
          dominancePoints,
          bonusPoints,
          fightId,
          fight: updatedFight ? buildFightSnapshot(updatedFight) : buildFightSnapshot(fight),
          note: normalizeOptionalString(req.body.note)
        }
      });

      return updatedFighter;
    });

    res.status(201).json({ fighter });
  })
);

router.post(
  "/fights/:id/score",
  asyncHandler(async (req, res) => {
    const existingFight = await prisma.fightCard.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFight) {
      throw createError(404, "Fight not found.");
    }

    requireDistinctFightParticipants(existingFight.fighterRedName, existingFight.fighterBlueName);

    const existingScoreEntries = await prisma.fightScoreEntry.count({
      where: { fightId: existingFight.id }
    });

    if (existingScoreEntries > 0) {
      throw createError(409, "This fight has already been scored. Use manual corrections for changes.");
    }

    const winnerCorner = normalizeWinnerCorner(req.body.winnerCorner);
    const awardedAt = req.body.awardedAt
      ? requireDateTime(req.body.awardedAt, "Awarded at")
      : new Date();
    const scoringConfig = await ensureScoringConfig();

    const [redFighter, blueFighter] = await Promise.all([
      prisma.fightFighter.findUnique({
        where: { name: existingFight.fighterRedName }
      }),
      prisma.fightFighter.findUnique({
        where: { name: existingFight.fighterBlueName }
      })
    ]);

    if (!redFighter || !blueFighter) {
      throw createError(400, "Both scheduled fighters must exist on the ladder before the fight can be scored.");
    }

    const redScoreData = buildBoutScoreData({
      scoringConfig,
      result: winnerCorner === "RED" ? "WIN" : "LOSS",
      charismaPoints: req.body.redCharismaPoints ?? 0,
      dominancePoints: req.body.redDominancePoints ?? 0,
      applyTitleWinBonus: winnerCorner === "RED" && req.body.applyTitleWinBonus === true
    });
    const blueScoreData = buildBoutScoreData({
      scoringConfig,
      result: winnerCorner === "BLUE" ? "WIN" : "LOSS",
      charismaPoints: req.body.blueCharismaPoints ?? 0,
      dominancePoints: req.body.blueDominancePoints ?? 0,
      applyTitleWinBonus: winnerCorner === "BLUE" && req.body.applyTitleWinBonus === true
    });

    const note = normalizeOptionalString(req.body.note);

    const result = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const redResult = await applyScoreEntry(transaction, {
        fighterId: redFighter.id,
        fightId: existingFight.id,
        awardedAt,
        note,
        ...redScoreData
      });
      const blueResult = await applyScoreEntry(transaction, {
        fighterId: blueFighter.id,
        fightId: existingFight.id,
        awardedAt,
        note,
        ...blueScoreData
      });

      const fight = await transaction.fightCard.update({
        where: { id: existingFight.id },
        data: {
          status: "COMPLETED",
          winnerName: winnerCorner === "RED" ? redFighter.name : blueFighter.name
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "FIGHT_SCORED",
        entityType: "FIGHT_CARD",
        entityId: fight.id,
        summary: `${req.user.name} scored ${fight.fighterRedName} vs ${fight.fighterBlueName}.`,
        before: {
          fight: buildFightSnapshot(existingFight),
          fighters: [
            buildFighterSnapshot(redFighter),
            buildFighterSnapshot(blueFighter)
          ]
        },
        after: {
          fight: buildFightSnapshot(fight),
          fighters: [
            buildFighterSnapshot(redResult.fighter),
            buildFighterSnapshot(blueResult.fighter)
          ]
        },
        metadata: {
          winnerCorner,
          awardedAt: serializeDateValue(awardedAt),
          note
        }
      });

      return {
        fight,
        fighters: [redResult.fighter, blueResult.fighter]
      };
    });

    res.status(201).json(result);
  })
);

router.patch(
  "/scoring",
  asyncHandler(async (req, res) => {
    const existingConfig = await ensureScoringConfig();
    const data = {
      startingPoints: req.body.startingPoints !== undefined
        ? requireNonNegativeInt(req.body.startingPoints, "Starting points")
        : existingConfig.startingPoints,
      winPoints: req.body.winPoints !== undefined
        ? requireInt(req.body.winPoints, "Win points")
        : existingConfig.winPoints,
      lossPoints: req.body.lossPoints !== undefined
        ? requireNegativeOrZeroInt(req.body.lossPoints, "Loss points")
        : existingConfig.lossPoints,
      charismaMax: req.body.charismaMax !== undefined
        ? requireNonNegativeInt(req.body.charismaMax, "Charisma max")
        : existingConfig.charismaMax,
      dominanceMax: req.body.dominanceMax !== undefined
        ? requireNonNegativeInt(req.body.dominanceMax, "Dominance max")
        : existingConfig.dominanceMax,
      titleWinBonus: req.body.titleWinBonus !== undefined
        ? requireNonNegativeInt(req.body.titleWinBonus, "Title win bonus")
        : existingConfig.titleWinBonus,
      inactivityGraceDays: req.body.inactivityGraceDays !== undefined
        ? requireNonNegativeInt(req.body.inactivityGraceDays, "Inactivity grace days")
        : existingConfig.inactivityGraceDays,
      inactivityWeeklyPenalty: req.body.inactivityWeeklyPenalty !== undefined
        ? requireNonNegativeInt(req.body.inactivityWeeklyPenalty, "Inactivity weekly penalty")
        : existingConfig.inactivityWeeklyPenalty,
      eliminationDays: req.body.eliminationDays !== undefined
        ? requireNonNegativeInt(req.body.eliminationDays, "Elimination days")
        : existingConfig.eliminationDays
    };

    if (data.eliminationDays <= data.inactivityGraceDays) {
      throw createError(400, "Elimination days must be greater than inactivity grace days.");
    }

    const scoringConfig = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const scoringConfig = await transaction.fightScoringConfig.update({
        where: { id: existingConfig.id },
        data
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "SCORING_UPDATED",
        entityType: "SCORING_CONFIG",
        entityId: scoringConfig.id,
        summary: `${req.user.name} updated leaderboard scoring rules.`,
        before: buildScoringConfigSnapshot(existingConfig),
        after: buildScoringConfigSnapshot(scoringConfig)
      });

      return scoringConfig;
    });

    res.json({ scoringConfig });
  })
);

router.delete(
  "/fighters/:id",
  asyncHandler(async (req, res) => {
    const existingFighter = await prisma.fightFighter.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFighter || existingFighter.archived) {
      throw createError(404, "Fighter not found.");
    }

    await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const archivedFighter = await transaction.fightFighter.update({
        where: { id: existingFighter.id },
        data: {
          active: false,
          archived: true,
          isChampion: false,
          archivedAt: new Date(),
          archivedById: req.user.id,
          restoredAt: null,
          restoredById: null
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "FIGHTER_ARCHIVED",
        entityType: "FIGHTER",
        entityId: archivedFighter.id,
        summary: `${req.user.name} archived fighter ${archivedFighter.name}.`,
        before: buildFighterSnapshot(existingFighter),
        after: buildFighterSnapshot(archivedFighter)
      });
    });

    res.json({ message: "Fighter archived." });
  })
);

router.post(
  "/fighters/:id/restore",
  asyncHandler(async (req, res) => {
    const existingFighter = await prisma.fightFighter.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFighter || !existingFighter.archived) {
      throw createError(404, "Archived fighter not found.");
    }

    const fighter = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const fighter = await transaction.fightFighter.update({
        where: { id: existingFighter.id },
        data: {
          active: true,
          archived: false,
          archivedAt: null,
          archivedById: null,
          restoredAt: new Date(),
          restoredById: req.user.id
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "FIGHTER_RESTORED",
        entityType: "FIGHTER",
        entityId: fighter.id,
        summary: `${req.user.name} restored fighter ${fighter.name}.`,
        before: buildFighterSnapshot(existingFighter),
        after: buildFighterSnapshot(fighter)
      });

      return fighter;
    });

    res.json({ fighter });
  })
);

router.post(
  "/hall-of-fame",
  asyncHandler(async (req, res) => {
    const entry = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const entry = await transaction.fightHallOfFameEntry.create({
        data: {
          fighterName: requireString(req.body.fighterName, "Fighter name"),
          title: req.body.title ? requireString(req.body.title, "Title") : "Champion",
          pointsAtTitle: req.body.pointsAtTitle !== undefined && req.body.pointsAtTitle !== ""
            ? requireInt(req.body.pointsAtTitle, "Points at title")
            : null,
          notes: normalizeOptionalString(req.body.notes),
          wonAt: req.body.wonAt ? requireDateTime(req.body.wonAt, "Won at") : new Date()
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "HALL_OF_FAME_CREATED",
        entityType: "HALL_OF_FAME",
        entityId: entry.id,
        summary: `${req.user.name} added ${entry.fighterName} to the hall of fame.`,
        after: buildHallOfFameSnapshot(entry)
      });

      return entry;
    });

    res.status(201).json({ entry });
  })
);

router.patch(
  "/hall-of-fame/:id",
  asyncHandler(async (req, res) => {
    const existingEntry = await prisma.fightHallOfFameEntry.findUnique({
      where: { id: req.params.id }
    });

    if (!existingEntry) {
      throw createError(404, "Hall of fame entry not found.");
    }

    const entry = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const entry = await transaction.fightHallOfFameEntry.update({
        where: { id: existingEntry.id },
        data: {
          fighterName: req.body.fighterName !== undefined
            ? requireString(req.body.fighterName, "Fighter name")
            : existingEntry.fighterName,
          title: req.body.title !== undefined
            ? requireString(req.body.title, "Title")
            : existingEntry.title,
          pointsAtTitle: req.body.pointsAtTitle !== undefined && req.body.pointsAtTitle !== ""
            ? requireInt(req.body.pointsAtTitle, "Points at title")
            : req.body.pointsAtTitle === ""
              ? null
              : existingEntry.pointsAtTitle,
          notes: req.body.notes !== undefined ? normalizeOptionalString(req.body.notes) : existingEntry.notes,
          wonAt: req.body.wonAt ? requireDateTime(req.body.wonAt, "Won at") : existingEntry.wonAt
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "HALL_OF_FAME_UPDATED",
        entityType: "HALL_OF_FAME",
        entityId: entry.id,
        summary: `${req.user.name} updated hall of fame entry for ${entry.fighterName}.`,
        before: buildHallOfFameSnapshot(existingEntry),
        after: buildHallOfFameSnapshot(entry)
      });

      return entry;
    });

    res.json({ entry });
  })
);

router.delete(
  "/hall-of-fame/:id",
  asyncHandler(async (req, res) => {
    const existingEntry = await prisma.fightHallOfFameEntry.findUnique({
      where: { id: req.params.id }
    });

    if (!existingEntry) {
      throw createError(404, "Hall of fame entry not found.");
    }

    await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      await transaction.fightHallOfFameEntry.delete({
        where: { id: existingEntry.id }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "HALL_OF_FAME_DELETED",
        entityType: "HALL_OF_FAME",
        entityId: existingEntry.id,
        summary: `${req.user.name} deleted hall of fame entry for ${existingEntry.fighterName}.`,
        before: buildHallOfFameSnapshot(existingEntry)
      });
    });

    res.json({ message: "Hall of fame entry deleted." });
  })
);

router.post(
  "/fights",
  asyncHandler(async (req, res) => {
    const redName = requireString(req.body.fighterRedName, "Red corner fighter");
    const blueName = requireString(req.body.fighterBlueName, "Blue corner fighter");
    requireDistinctFightParticipants(redName, blueName);

    const fight = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const fight = await transaction.fightCard.create({
        data: {
          fighterRedName: redName,
          fighterBlueName: blueName,
          scheduledAt: requireDateTime(req.body.scheduledAt, "Fight time"),
          venue: normalizeOptionalString(req.body.venue),
          notes: normalizeOptionalString(req.body.notes),
          status: normalizeFightStatus(req.body.status)
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "FIGHT_CREATED",
        entityType: "FIGHT_CARD",
        entityId: fight.id,
        summary: `${req.user.name} scheduled ${fight.fighterRedName} vs ${fight.fighterBlueName}.`,
        after: buildFightSnapshot(fight)
      });

      return fight;
    });

    res.status(201).json({ fight });
  })
);

router.patch(
  "/fights/:id",
  asyncHandler(async (req, res) => {
    const existingFight = await prisma.fightCard.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFight) {
      throw createError(404, "Fight not found.");
    }

    const status = req.body.status !== undefined
      ? normalizeFightStatus(req.body.status, existingFight.status)
      : existingFight.status;
    const winnerName = req.body.winnerName !== undefined
      ? assertWinnerName(existingFight, normalizeOptionalString(req.body.winnerName))
      : existingFight.winnerName;
    const fighterRedName = req.body.fighterRedName !== undefined
      ? requireString(req.body.fighterRedName, "Red corner fighter")
      : existingFight.fighterRedName;
    const fighterBlueName = req.body.fighterBlueName !== undefined
      ? requireString(req.body.fighterBlueName, "Blue corner fighter")
      : existingFight.fighterBlueName;

    requireDistinctFightParticipants(fighterRedName, fighterBlueName);

    const fight = await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      const fight = await transaction.fightCard.update({
        where: { id: existingFight.id },
        data: {
          fighterRedName,
          fighterBlueName,
          scheduledAt: req.body.scheduledAt
            ? requireDateTime(req.body.scheduledAt, "Fight time")
            : existingFight.scheduledAt,
          venue: req.body.venue !== undefined ? normalizeOptionalString(req.body.venue) : existingFight.venue,
          notes: req.body.notes !== undefined ? normalizeOptionalString(req.body.notes) : existingFight.notes,
          status,
          winnerName
        }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "FIGHT_UPDATED",
        entityType: "FIGHT_CARD",
        entityId: fight.id,
        summary: `${req.user.name} updated ${fight.fighterRedName} vs ${fight.fighterBlueName}.`,
        before: buildFightSnapshot(existingFight),
        after: buildFightSnapshot(fight)
      });

      return fight;
    });

    res.json({ fight });
  })
);

router.delete(
  "/fights/:id",
  asyncHandler(async (req, res) => {
    const existingFight = await prisma.fightCard.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFight) {
      throw createError(404, "Fight not found.");
    }

    await prisma.$transaction(async (transaction) => {
      await ensureLeaderboardWriteAccess(req.user, transaction);

      await transaction.fightCard.delete({
        where: { id: existingFight.id }
      });

      await createFightAuditLog(transaction, {
        actorId: req.user.id,
        action: "FIGHT_DELETED",
        entityType: "FIGHT_CARD",
        entityId: existingFight.id,
        summary: `${req.user.name} deleted ${existingFight.fighterRedName} vs ${existingFight.fighterBlueName}.`,
        before: buildFightSnapshot(existingFight)
      });
    });

    res.json({ message: "Fight deleted." });
  })
);

export default router;
