import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, authenticateTokenOptional } from "../middleware/auth.js";
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
      notes: fighter.notes,
      lastFightAt: fighter.lastFightAt,
      lastAwardedAt: fighter.lastAwardedAt,
      createdAt: fighter.createdAt,
      updatedAt: fighter.updatedAt,
      daysSinceFight: inactivity.daysSinceFight,
      inactivityPenalty: inactivity.inactivityPenalty,
      inactivityState: inactivity.inactivityState,
      badges: []
    };
  });

  const publicFighters = derivedFighters.filter((fighter) => fighter.active && fighter.inactivityState !== "ELIMINATED");
  const winsLeaderValue = Math.max(0, ...publicFighters.map((fighter) => fighter.wins));
  const charismaLeaderValue = Math.max(0, ...publicFighters.map((fighter) => fighter.charismaPoints));
  const dominanceLeaderValue = Math.max(0, ...publicFighters.map((fighter) => fighter.dominancePoints));

  derivedFighters.forEach((fighter) => {
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

  const rankedFighters = publicFighters
    .slice()
    .sort(compareRankedFighters)
    .map((fighter, index) => ({
      ...fighter,
      rank: index + 1
    }));

  const fighterDirectory = derivedFighters
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name));

  const leaderCards = {
    wins: rankedFighters.find((fighter) => fighter.badges.includes("Most Wins")) || null,
    charisma: rankedFighters.find((fighter) => fighter.badges.includes("Most Charisma")) || null,
    dominance: rankedFighters.find((fighter) => fighter.badges.includes("Most Dominant")) || null
  };

  return {
    rankedFighters,
    fighterDirectory,
    leaderCards
  };
}

function buildBoutScoreData({
  scoringConfig,
  result,
  charismaPoints = 0,
  dominancePoints = 0,
  applyTitleWinBonus = false,
  applyFinishBonus = false
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

  if (applyFinishBonus) {
    bonusPoints += scoringConfig.finishBonus;
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
  const [fighters, hallOfFame, fightCard, recentScoreEntries] = await Promise.all([
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
    prisma.fightScoreEntry.findMany({
      take: 12,
      orderBy: [{ awardedAt: "desc" }, { createdAt: "desc" }],
      include: {
        fighter: {
          select: {
            id: true,
            name: true
          }
        },
        fight: {
          select: {
            id: true,
            fighterRedName: true,
            fighterBlueName: true,
            scheduledAt: true
          }
        }
      }
    })
  ]);

  const leaderboardData = buildFighterViews(fighters, scoringConfig);

  return {
    generatedAt: new Date().toISOString(),
    scoringConfig,
    fighters: leaderboardData.rankedFighters,
    fighterDirectory: leaderboardData.fighterDirectory,
    leaderCards: leaderboardData.leaderCards,
    hallOfFame,
    fightCard,
    scoreLog: recentScoreEntries.map((entry) => ({
      id: entry.id,
      fighterId: entry.fighterId,
      fighterName: entry.fighter.name,
      fightId: entry.fightId,
      fightLabel: entry.fight
        ? `${entry.fight.fighterRedName} vs ${entry.fight.fighterBlueName}`
        : null,
      entryType: entry.entryType,
      result: entry.result,
      resultPoints: entry.resultPoints,
      charismaPoints: entry.charismaPoints,
      dominancePoints: entry.dominancePoints,
      bonusPoints: entry.bonusPoints,
      totalDelta: entry.totalDelta,
      note: entry.note,
      awardedAt: entry.awardedAt
    })),
    viewer: {
      isLoggedIn: Boolean(reqUser),
      canManage: Boolean(reqUser),
      canUseAdminPanel: Boolean(reqUser?.role === "ADMIN" || reqUser?.permissions?.includes("USERS"))
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
    scoreLog: payload.scoreLog,
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
      const scoringConfig = await ensureScoringConfig(transaction);
      const openingPoints = req.body.points === undefined
        ? scoringConfig.startingPoints
        : requireInt(req.body.points, "Opening points");
      const isChampion = req.body.isChampion === true;

      if (isChampion) {
        await transaction.fightFighter.updateMany({
          where: { isChampion: true },
          data: { isChampion: false }
        });
      }

      return transaction.fightFighter.create({
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
          isChampion,
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

    if (!existingFighter) {
      throw createError(404, "Fighter not found.");
    }

    const nextChampionState = typeof req.body.isChampion === "boolean"
      ? req.body.isChampion
      : existingFighter.isChampion;

    const fighter = await prisma.$transaction(async (transaction) => {
      if (nextChampionState) {
        await transaction.fightFighter.updateMany({
          where: {
            isChampion: true,
            NOT: { id: existingFighter.id }
          },
          data: { isChampion: false }
        });
      }

      return transaction.fightFighter.update({
        where: { id: existingFighter.id },
        data: {
          name: req.body.name !== undefined
            ? requireString(req.body.name, "Fighter name")
            : existingFighter.name,
          points: req.body.points !== undefined
            ? requireInt(req.body.points, "Points")
            : existingFighter.points,
          wins: req.body.wins !== undefined
            ? requireNonNegativeInt(req.body.wins, "Wins")
            : existingFighter.wins,
          losses: req.body.losses !== undefined
            ? requireNonNegativeInt(req.body.losses, "Losses")
            : existingFighter.losses,
          charismaPoints: req.body.charismaPoints !== undefined
            ? requireNonNegativeInt(req.body.charismaPoints, "Charisma points")
            : existingFighter.charismaPoints,
          dominancePoints: req.body.dominancePoints !== undefined
            ? requireNonNegativeInt(req.body.dominancePoints, "Dominance points")
            : existingFighter.dominancePoints,
          active: typeof req.body.active === "boolean" ? req.body.active : existingFighter.active,
          isChampion: nextChampionState,
          notes: req.body.notes !== undefined ? normalizeOptionalString(req.body.notes) : existingFighter.notes,
          lastFightAt: req.body.lastFightAt
            ? requireDateTime(req.body.lastFightAt, "Last fight date")
            : req.body.lastFightAt === ""
              ? null
              : existingFighter.lastFightAt,
          lastAwardedAt: req.body.lastAwardedAt
            ? requireDateTime(req.body.lastAwardedAt, "Last awarded date")
            : req.body.lastAwardedAt === ""
              ? null
              : existingFighter.lastAwardedAt
        }
      });
    });

    res.json({ fighter });
  })
);

router.post(
  "/fighters/:id/award",
  asyncHandler(async (req, res) => {
    const existingFighter = await prisma.fightFighter.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFighter) {
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
        applyTitleWinBonus: req.body.applyTitleWinBonus === true,
        applyFinishBonus: req.body.applyFinishBonus === true
      }));
    } else {
      resultPoints = requireInt(req.body.correctionPoints, "Correction points");
    }

    const fighter = await prisma.$transaction(async (transaction) => {
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

      if (fight && entryType === "BOUT" && result === "WIN") {
        const validNames = [fight.fighterRedName, fight.fighterBlueName];

        if (validNames.includes(updatedFighter.name)) {
          await transaction.fightCard.update({
            where: { id: fight.id },
            data: {
              status: "COMPLETED",
              winnerName: updatedFighter.name
            }
          });
        }
      }

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
      applyTitleWinBonus: winnerCorner === "RED" && req.body.applyTitleWinBonus === true,
      applyFinishBonus: winnerCorner === "RED" && req.body.applyFinishBonus === true
    });
    const blueScoreData = buildBoutScoreData({
      scoringConfig,
      result: winnerCorner === "BLUE" ? "WIN" : "LOSS",
      charismaPoints: req.body.blueCharismaPoints ?? 0,
      dominancePoints: req.body.blueDominancePoints ?? 0,
      applyTitleWinBonus: winnerCorner === "BLUE" && req.body.applyTitleWinBonus === true,
      applyFinishBonus: winnerCorner === "BLUE" && req.body.applyFinishBonus === true
    });

    const note = normalizeOptionalString(req.body.note);

    const result = await prisma.$transaction(async (transaction) => {
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
      finishBonus: req.body.finishBonus !== undefined
        ? requireNonNegativeInt(req.body.finishBonus, "Finish bonus")
        : existingConfig.finishBonus,
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

    const scoringConfig = await prisma.fightScoringConfig.update({
      where: { id: existingConfig.id },
      data
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

    if (!existingFighter) {
      throw createError(404, "Fighter not found.");
    }

    await prisma.fightFighter.delete({
      where: { id: existingFighter.id }
    });

    res.json({ message: "Fighter deleted." });
  })
);

router.post(
  "/hall-of-fame",
  asyncHandler(async (req, res) => {
    const entry = await prisma.fightHallOfFameEntry.create({
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

    const entry = await prisma.fightHallOfFameEntry.update({
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

    await prisma.fightHallOfFameEntry.delete({
      where: { id: existingEntry.id }
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

    const fight = await prisma.fightCard.create({
      data: {
        fighterRedName: redName,
        fighterBlueName: blueName,
        scheduledAt: requireDateTime(req.body.scheduledAt, "Fight time"),
        venue: normalizeOptionalString(req.body.venue),
        notes: normalizeOptionalString(req.body.notes),
        status: normalizeFightStatus(req.body.status)
      }
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

    const fight = await prisma.fightCard.update({
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

    await prisma.fightCard.delete({
      where: { id: existingFight.id }
    });

    res.json({ message: "Fight deleted." });
  })
);

export default router;
