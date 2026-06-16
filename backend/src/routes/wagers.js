import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, authenticateTokenOptional } from "../middleware/auth.js";
import { normalizeOptionalString, requireMoney, requireString } from "../validators.js";

const router = Router();

const HOUSE_CUT_RATE = 0.1;
const NORMAL_FIGHT_THRESHOLD = 1000000;
const TITLE_FIGHT_THRESHOLD = 5000000;
const BETTING_MULTIPLIER = 1.9;

function canManageWagers(user) {
  return Boolean(user?.role === "ADMIN");
}

function requireWagerManager(req, _res, next) {
  if (!canManageWagers(req.user)) {
    throw createError(403, "Admin access is required to manage wagers.");
  }

  return next();
}

function defaultNightLabel(date = new Date()) {
  return `${new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "Australia/Sydney"
  }).format(date)} Fight Night`;
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

function normalizeResolveStatus(value) {
  const normalized = `${value || "COMPLETED"}`.trim().toUpperCase();

  if (!["COMPLETED", "CANCELLED"].includes(normalized)) {
    throw createError(400, "Fight result must be completed or cancelled.");
  }

  return normalized;
}

function normalizeBookAction(value) {
  const normalized = requireString(value, "Book action").toUpperCase();

  if (!["CLOSE", "REOPEN"].includes(normalized)) {
    throw createError(400, "Book action must be close or reopen.");
  }

  return normalized;
}

function assertPickedFighterName(fight, pickedFighterName) {
  const normalizedName = requireString(pickedFighterName, "Picked fighter");

  if (![fight.fighterRedName, fight.fighterBlueName].includes(normalizedName)) {
    throw createError(400, "Picked fighter must match one of the fighters on that book.");
  }

  return normalizedName;
}

function assertFightWinner(fight, winnerName) {
  const normalizedWinner = requireString(winnerName, "Winner");

  if (![fight.fighterRedName, fight.fighterBlueName].includes(normalizedWinner)) {
    throw createError(400, "Winner must match one of the booked fighters.");
  }

  return normalizedWinner;
}

async function getOrCreateActiveNight(client = prisma) {
  const existingNight = await client.wagerNight.findFirst({
    where: { status: "ACTIVE" },
    orderBy: [{ openedAt: "desc" }]
  });

  if (existingNight) {
    return existingNight;
  }

  return client.wagerNight.create({
    data: {
      label: defaultNightLabel(),
      status: "ACTIVE"
    }
  });
}

function calculateBetAmounts(stake) {
  const houseCut = stake * HOUSE_CUT_RATE;
  const netStake = stake - houseCut;

  return {
    houseCut: toMoneyString(houseCut),
    netStake: toMoneyString(netStake),
    projectedReturn: toMoneyString(stake + netStake),
    payoutMultiplier: BETTING_MULTIPLIER.toFixed(2)
  };
}

function getCountedWagers(wagers = []) {
  return wagers.filter((wager) => wager.status !== "VOIDED");
}

function calculateFightBook(fight) {
  const wagers = getCountedWagers(fight.wagers || []);
  const thresholdAmount = Math.max(1, toMoneyNumber(fight.thresholdAmount));
  const redTotal = wagers
    .filter((wager) => wager.pickedFighterName === fight.fighterRedName)
    .reduce((sum, wager) => sum + toMoneyNumber(wager.stake), 0);
  const blueTotal = wagers
    .filter((wager) => wager.pickedFighterName === fight.fighterBlueName)
    .reduce((sum, wager) => sum + toMoneyNumber(wager.stake), 0);

  const redCap = (Math.floor(blueTotal / thresholdAmount) + 1) * thresholdAmount;
  const blueCap = (Math.floor(redTotal / thresholdAmount) + 1) * thresholdAmount;

  return {
    redTotal: toMoneyString(redTotal),
    blueTotal: toMoneyString(blueTotal),
    redRemaining: toMoneyString(Math.max(0, redCap - redTotal)),
    blueRemaining: toMoneyString(Math.max(0, blueCap - blueTotal)),
    thresholdAmount: toMoneyString(thresholdAmount)
  };
}

function assertThresholdAvailable(fight, pickedFighterName, stake) {
  const book = calculateFightBook(fight);
  const pickedTotal = pickedFighterName === fight.fighterRedName
    ? toMoneyNumber(book.redTotal)
    : toMoneyNumber(book.blueTotal);
  const opponentTotal = pickedFighterName === fight.fighterRedName
    ? toMoneyNumber(book.blueTotal)
    : toMoneyNumber(book.redTotal);
  const thresholdAmount = toMoneyNumber(book.thresholdAmount);
  const allowedTotal = (Math.floor(opponentTotal / thresholdAmount) + 1) * thresholdAmount;
  const nextTotal = pickedTotal + stake;

  if (nextTotal > allowedTotal + 0.001) {
    throw createError(
      400,
      `${pickedFighterName} can only take ${toMoneyString(Math.max(0, allowedTotal - pickedTotal))} more before the opponent catches up to this betting band.`
    );
  }
}

function buildBetSnapshot(bet) {
  if (!bet) {
    return null;
  }

  return {
    id: bet.id,
    nightId: bet.nightId,
    fightId: bet.fightId || null,
    wagerFightId: bet.wagerFightId || null,
    bettorName: bet.bettorName,
    pickedFighterName: bet.pickedFighterName,
    stake: toMoneyString(bet.stake),
    payoutMultiplier: toMoneyString(bet.payoutMultiplier),
    houseCut: toMoneyString(bet.houseCut),
    netStake: toMoneyString(bet.netStake),
    projectedReturn: toMoneyString(bet.projectedReturn),
    status: bet.status,
    settlementNote: bet.settlementNote || null,
    notes: bet.notes || null,
    settledAt: serializeDateValue(bet.settledAt),
    createdAt: serializeDateValue(bet.createdAt),
    updatedAt: serializeDateValue(bet.updatedAt)
  };
}

function buildFightSnapshot(fight) {
  if (!fight) {
    return null;
  }

  return {
    id: fight.id,
    nightId: fight.nightId,
    fighterRedId: fight.fighterRedId || null,
    fighterRedName: fight.fighterRedName,
    fighterBlueId: fight.fighterBlueId || null,
    fighterBlueName: fight.fighterBlueName,
    scheduledAt: serializeDateValue(fight.scheduledAt),
    venue: fight.venue || null,
    notes: fight.notes || null,
    titleFight: Boolean(fight.titleFight),
    thresholdAmount: toMoneyString(fight.thresholdAmount),
    status: fight.status,
    winnerName: fight.winnerName || null,
    booksOpenedAt: serializeDateValue(fight.booksOpenedAt),
    settledAt: serializeDateValue(fight.settledAt),
    createdAt: serializeDateValue(fight.createdAt),
    updatedAt: serializeDateValue(fight.updatedAt)
  };
}

function serializeBet(bet) {
  return {
    ...buildBetSnapshot(bet),
    fight: bet.wagerFight ? buildFightSnapshot(bet.wagerFight) : null
  };
}

function serializeFight(fight) {
  return {
    ...buildFightSnapshot(fight),
    book: calculateFightBook(fight),
    wagers: (fight.wagers || []).map(serializeBet)
  };
}

function isRevertibleAuditAction(action) {
  return [
    "FIGHT_CREATED",
    "FIGHT_BOOKS_UPDATED",
    "FIGHT_SETTLED",
    "WAGER_CREATED",
    "WAGER_PAID",
    "WAGER_VOIDED",
    "WAGER_HOUSE_KEPT"
  ].includes(action);
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
    canRevert: isRevertibleAuditAction(entry.action) && !entry.revertedAt
  };
}

function buildAdminSummary(fights = []) {
  const wagers = fights.flatMap((fight) => fight.wagers || []);
  const countedWagers = getCountedWagers(wagers);
  const totalStaked = countedWagers.reduce((sum, bet) => sum + toMoneyNumber(bet.stake), 0);
  const houseCut = countedWagers.reduce((sum, bet) => sum + toMoneyNumber(bet.houseCut), 0);
  const pendingPayout = countedWagers
    .filter((bet) => bet.status === "WON_PENDING")
    .reduce((sum, bet) => sum + toMoneyNumber(bet.projectedReturn), 0);
  const paidOut = countedWagers
    .filter((bet) => bet.status === "PAID_OUT")
    .reduce((sum, bet) => sum + toMoneyNumber(bet.projectedReturn), 0);
  const houseKept = countedWagers
    .filter((bet) => bet.status === "HOUSE_KEPT")
    .reduce((sum, bet) => sum + toMoneyNumber(bet.stake), 0);
  const activeExposure = countedWagers
    .filter((bet) => bet.status === "ACTIVE")
    .reduce((sum, bet) => sum + toMoneyNumber(bet.projectedReturn), 0);

  return {
    totalStaked: toMoneyString(totalStaked),
    houseCut: toMoneyString(houseCut),
    pendingPayout: toMoneyString(pendingPayout),
    paidOut: toMoneyString(paidOut),
    houseKept: toMoneyString(houseKept),
    activeExposure: toMoneyString(activeExposure),
    projectedNet: toMoneyString(totalStaked - paidOut - pendingPayout)
  };
}

async function loadNightPayload(nightId, includeAdmin = false) {
  const include = {
    fights: {
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
      include: {
        wagers: {
          orderBy: [{ createdAt: "desc" }],
          include: {
            wagerFight: true
          }
        }
      }
    }
  };

  if (includeAdmin) {
    include.auditLogs = {
      orderBy: [{ createdAt: "desc" }],
      take: 25,
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
    };
  }

  return prisma.wagerNight.findUnique({
    where: { id: nightId },
    include
  });
}

async function createWagerAuditLog(client, {
  actorId,
  nightId,
  action,
  entityType,
  entityId,
  summary,
  before = null,
  after = null,
  metadata = null
}) {
  return client.wagerAuditLog.create({
    data: {
      actorId,
      nightId,
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

function buildPayload(night, reqUser, fighterDirectory = []) {
  const canManage = canManageWagers(reqUser);
  const fights = (night?.fights || []).map(serializeFight);
  const payouts = fights
    .flatMap((fight) => fight.wagers.map((bet) => ({
      ...bet,
      matchup: `${fight.fighterRedName} vs ${fight.fighterBlueName}`,
      winnerName: fight.winnerName
    })))
    .filter((bet) => ["WON_PENDING", "PAID_OUT"].includes(bet.status))
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "WON_PENDING" ? -1 : 1;
      }

      return toMoneyNumber(right.projectedReturn) - toMoneyNumber(left.projectedReturn);
    });

  return {
    night: night ? {
      id: night.id,
      label: night.label,
      status: night.status,
      notes: night.notes || null,
      openedAt: serializeDateValue(night.openedAt),
      closedAt: serializeDateValue(night.closedAt)
    } : null,
    fights,
    payouts,
    adminSummary: canManage ? buildAdminSummary(night?.fights || []) : null,
    fighterDirectory,
    auditLog: canManage ? (night?.auditLogs || []).map(serializeAuditLog) : [],
    viewer: {
      isLoggedIn: Boolean(reqUser),
      isAdmin: canManage,
      canManage,
      canUseAdminPanel: canManage
    }
  };
}

async function findWagerFightOrThrow(id, client = prisma) {
  const fight = await client.wagerFight.findUnique({
    where: { id },
    include: {
      wagers: true
    }
  });

  if (!fight) {
    throw createError(404, "Wager fight not found.");
  }

  return fight;
}

function buildBetRestoreData(snapshot) {
  return {
    nightId: snapshot.nightId,
    fightId: snapshot.fightId || null,
    wagerFightId: snapshot.wagerFightId || null,
    bettorName: snapshot.bettorName,
    pickedFighterName: snapshot.pickedFighterName,
    stake: snapshot.stake,
    payoutMultiplier: snapshot.payoutMultiplier,
    houseCut: snapshot.houseCut,
    netStake: snapshot.netStake,
    projectedReturn: snapshot.projectedReturn,
    status: snapshot.status,
    settlementNote: snapshot.settlementNote || null,
    notes: snapshot.notes || null,
    settledAt: snapshot.settledAt ? new Date(snapshot.settledAt) : null
  };
}

function buildFightRestoreData(snapshot) {
  return {
    nightId: snapshot.nightId,
    fighterRedId: snapshot.fighterRedId || null,
    fighterRedName: snapshot.fighterRedName,
    fighterBlueId: snapshot.fighterBlueId || null,
    fighterBlueName: snapshot.fighterBlueName,
    scheduledAt: snapshot.scheduledAt ? new Date(snapshot.scheduledAt) : null,
    venue: snapshot.venue || null,
    notes: snapshot.notes || null,
    titleFight: Boolean(snapshot.titleFight),
    thresholdAmount: snapshot.thresholdAmount,
    status: snapshot.status,
    winnerName: snapshot.winnerName || null,
    booksOpenedAt: snapshot.booksOpenedAt ? new Date(snapshot.booksOpenedAt) : new Date(),
    settledAt: snapshot.settledAt ? new Date(snapshot.settledAt) : null
  };
}

router.get(
  "/",
  authenticateTokenOptional,
  asyncHandler(async (req, res) => {
    const activeNight = await getOrCreateActiveNight();
    const canManage = canManageWagers(req.user);
    const [night, fighterDirectory] = await Promise.all([
      loadNightPayload(activeNight.id, canManage),
      canManage
        ? prisma.fightFighter.findMany({
          where: {
            archived: false,
            active: true
          },
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            name: true,
            isChampion: true
          }
        })
        : []
    ]);

    res.json(buildPayload(night, req.user, fighterDirectory));
  })
);

router.use(authenticateToken);
router.use(requireWagerManager);

router.post(
  "/nights/start",
  asyncHandler(async (req, res) => {
    const label = req.body.label ? requireString(req.body.label, "Night label") : defaultNightLabel();

    const night = await prisma.$transaction(async (transaction) => {
      await transaction.wagerNight.updateMany({
        where: { status: "ACTIVE" },
        data: {
          status: "CLOSED",
          closedAt: new Date()
        }
      });

      const newNight = await transaction.wagerNight.create({
        data: {
          label,
          status: "ACTIVE",
          notes: normalizeOptionalString(req.body.notes)
        }
      });

      await createWagerAuditLog(transaction, {
        actorId: req.user.id,
        nightId: newNight.id,
        action: "NIGHT_STARTED",
        entityType: "WAGER_NIGHT",
        entityId: newNight.id,
        summary: `${req.user.name} started ${newNight.label}.`,
        after: {
          id: newNight.id,
          label: newNight.label,
          notes: newNight.notes || null
        }
      });

      return newNight;
    });

    res.status(201).json({ night });
  })
);

router.post(
  "/fights",
  asyncHandler(async (req, res) => {
    const redId = requireString(req.body.fighterRedId, "Red corner fighter");
    const blueId = requireString(req.body.fighterBlueId, "Blue corner fighter");

    if (redId === blueId) {
      throw createError(400, "Choose two different fighters.");
    }

    const titleFight = req.body.titleFight === true;
    const thresholdAmount = req.body.thresholdAmount !== undefined
      ? requirePositiveMoney(req.body.thresholdAmount, "Betting threshold")
      : titleFight
        ? TITLE_FIGHT_THRESHOLD
        : NORMAL_FIGHT_THRESHOLD;
    const scheduledAt = requireOptionalDateTime(req.body.scheduledAt, "Fight time");

    const fight = await prisma.$transaction(async (transaction) => {
      const activeNight = await getOrCreateActiveNight(transaction);
      const fighters = await transaction.fightFighter.findMany({
        where: {
          id: { in: [redId, blueId] },
          archived: false,
          active: true
        }
      });

      if (fighters.length !== 2) {
        throw createError(400, "Both fighters must exist on the active leaderboard.");
      }

      const redFighter = fighters.find((fighter) => fighter.id === redId);
      const blueFighter = fighters.find((fighter) => fighter.id === blueId);

      const createdFight = await transaction.wagerFight.create({
        data: {
          nightId: activeNight.id,
          fighterRedId: redFighter.id,
          fighterRedName: redFighter.name,
          fighterBlueId: blueFighter.id,
          fighterBlueName: blueFighter.name,
          scheduledAt,
          venue: normalizeOptionalString(req.body.venue),
          notes: normalizeOptionalString(req.body.notes),
          titleFight,
          thresholdAmount: toMoneyString(thresholdAmount),
          status: "OPEN"
        }
      });

      await createWagerAuditLog(transaction, {
        actorId: req.user.id,
        nightId: activeNight.id,
        action: "FIGHT_CREATED",
        entityType: "WAGER_FIGHT",
        entityId: createdFight.id,
        summary: `${req.user.name} opened books for ${createdFight.fighterRedName} vs ${createdFight.fighterBlueName}.`,
        after: buildFightSnapshot(createdFight)
      });

      return createdFight;
    });

    res.status(201).json({ fight });
  })
);

router.patch(
  "/fights/:id/books",
  asyncHandler(async (req, res) => {
    const action = normalizeBookAction(req.body.action);

    const fight = await prisma.$transaction(async (transaction) => {
      const existingFight = await findWagerFightOrThrow(req.params.id, transaction);

      if (["COMPLETED", "CANCELLED"].includes(existingFight.status)) {
        throw createError(400, "Completed or cancelled fights cannot reopen books.");
      }

      const nextStatus = action === "CLOSE" ? "CLOSED" : "OPEN";

      const updatedFight = await transaction.wagerFight.update({
        where: { id: existingFight.id },
        data: { status: nextStatus }
      });

      await createWagerAuditLog(transaction, {
        actorId: req.user.id,
        nightId: existingFight.nightId,
        action: "FIGHT_BOOKS_UPDATED",
        entityType: "WAGER_FIGHT",
        entityId: updatedFight.id,
        summary: `${req.user.name} ${nextStatus === "OPEN" ? "reopened" : "closed"} books for ${updatedFight.fighterRedName} vs ${updatedFight.fighterBlueName}.`,
        before: buildFightSnapshot(existingFight),
        after: buildFightSnapshot(updatedFight)
      });

      return updatedFight;
    });

    res.json({ fight });
  })
);

router.patch(
  "/fights/:id/settle",
  asyncHandler(async (req, res) => {
    const status = normalizeResolveStatus(req.body.status);

    const fight = await prisma.$transaction(async (transaction) => {
      const existingFight = await findWagerFightOrThrow(req.params.id, transaction);
      const winnerName = status === "COMPLETED"
        ? assertFightWinner(existingFight, req.body.winnerName)
        : null;
      const beforeWagers = existingFight.wagers.map(buildBetSnapshot);

      const updatedFight = await transaction.wagerFight.update({
        where: { id: existingFight.id },
        data: {
          status,
          winnerName,
          settledAt: new Date()
        }
      });

      for (const wager of existingFight.wagers.filter((entry) => entry.status === "ACTIVE")) {
        const nextStatus = status === "CANCELLED"
          ? "VOIDED"
          : wager.pickedFighterName === winnerName
            ? "WON_PENDING"
            : "HOUSE_KEPT";

        await transaction.wagerEntry.update({
          where: { id: wager.id },
          data: {
            status: nextStatus,
            settledAt: nextStatus === "WON_PENDING" ? null : new Date(),
            settlementNote: nextStatus === "HOUSE_KEPT" ? "Settled as losing wager." : null
          }
        });
      }

      const afterWagers = await transaction.wagerEntry.findMany({
        where: { wagerFightId: existingFight.id }
      });

      await createWagerAuditLog(transaction, {
        actorId: req.user.id,
        nightId: existingFight.nightId,
        action: "FIGHT_SETTLED",
        entityType: "WAGER_FIGHT",
        entityId: updatedFight.id,
        summary: status === "COMPLETED"
          ? `${req.user.name} marked ${winnerName} as winner for ${updatedFight.fighterRedName} vs ${updatedFight.fighterBlueName}.`
          : `${req.user.name} cancelled ${updatedFight.fighterRedName} vs ${updatedFight.fighterBlueName}.`,
        before: buildFightSnapshot(existingFight),
        after: buildFightSnapshot(updatedFight),
        metadata: {
          beforeWagers,
          afterWagers: afterWagers.map(buildBetSnapshot)
        }
      });

      return updatedFight;
    });

    res.json({ fight });
  })
);

router.post(
  "/bets",
  asyncHandler(async (req, res) => {
    const fightId = requireString(req.body.wagerFightId, "Wager fight");
    const stake = requirePositiveMoney(req.body.stake, "Stake");
    const bettorName = requireString(req.body.bettorName, "Bettor name");

    const bet = await prisma.$transaction(async (transaction) => {
      const fight = await findWagerFightOrThrow(fightId, transaction);

      if (fight.status !== "OPEN") {
        throw createError(400, "Books must be open before adding wagers.");
      }

      const pickedFighterName = assertPickedFighterName(fight, req.body.pickedFighterName);
      assertThresholdAvailable(fight, pickedFighterName, stake);

      const amounts = calculateBetAmounts(stake);
      const createdBet = await transaction.wagerEntry.create({
        data: {
          nightId: fight.nightId,
          wagerFightId: fight.id,
          bettorName,
          pickedFighterName,
          stake: toMoneyString(stake),
          ...amounts,
          status: "ACTIVE",
          notes: normalizeOptionalString(req.body.notes)
        },
        include: {
          wagerFight: true
        }
      });

      await createWagerAuditLog(transaction, {
        actorId: req.user.id,
        nightId: fight.nightId,
        action: "WAGER_CREATED",
        entityType: "WAGER_ENTRY",
        entityId: createdBet.id,
        summary: `${req.user.name} logged ${bettorName}'s ${toMoneyString(stake)} wager on ${pickedFighterName}.`,
        after: buildBetSnapshot(createdBet),
        metadata: {
          fight: buildFightSnapshot(fight)
        }
      });

      return createdBet;
    });

    res.status(201).json({ bet: serializeBet(bet) });
  })
);

router.patch(
  "/bets/:id/settle",
  asyncHandler(async (req, res) => {
    const action = requireString(req.body.action, "Settlement action").toUpperCase();

    const bet = await prisma.$transaction(async (transaction) => {
      const existingBet = await transaction.wagerEntry.findUnique({
        where: { id: req.params.id },
        include: {
          wagerFight: true
        }
      });

      if (!existingBet) {
        throw createError(404, "Wager not found.");
      }

      let nextStatus = existingBet.status;
      let auditAction = "WAGER_UPDATED";

      if (action === "PAY_OUT" && existingBet.status === "WON_PENDING") {
        nextStatus = "PAID_OUT";
        auditAction = "WAGER_PAID";
      } else if (action === "VOID_BET" && !["PAID_OUT", "HOUSE_KEPT"].includes(existingBet.status)) {
        nextStatus = "VOIDED";
        auditAction = "WAGER_VOIDED";
      } else if (action === "KEEP_HOUSE" && ["ACTIVE", "LOST_PENDING"].includes(existingBet.status)) {
        nextStatus = "HOUSE_KEPT";
        auditAction = "WAGER_HOUSE_KEPT";
      } else {
        throw createError(400, "That settlement action is not valid for this wager.");
      }

      const updatedBet = await transaction.wagerEntry.update({
        where: { id: existingBet.id },
        data: {
          status: nextStatus,
          settledAt: new Date(),
          settlementNote: normalizeOptionalString(req.body.settlementNote)
        },
        include: {
          wagerFight: true
        }
      });

      await createWagerAuditLog(transaction, {
        actorId: req.user.id,
        nightId: existingBet.nightId,
        action: auditAction,
        entityType: "WAGER_ENTRY",
        entityId: updatedBet.id,
        summary: auditAction === "WAGER_PAID"
          ? `${req.user.name} marked ${updatedBet.bettorName}'s payout as paid.`
          : `${req.user.name} updated ${updatedBet.bettorName}'s wager to ${nextStatus}.`,
        before: buildBetSnapshot(existingBet),
        after: buildBetSnapshot(updatedBet)
      });

      return updatedBet;
    });

    res.json({ bet: serializeBet(bet) });
  })
);

router.post(
  "/audit/:id/revert",
  asyncHandler(async (req, res) => {
    const result = await prisma.$transaction(async (transaction) => {
      const auditLog = await transaction.wagerAuditLog.findUnique({
        where: { id: req.params.id }
      });

      if (!auditLog) {
        throw createError(404, "Audit log not found.");
      }

      if (auditLog.revertedAt) {
        throw createError(400, "This audit log has already been reverted.");
      }

      if (!isRevertibleAuditAction(auditLog.action)) {
        throw createError(400, "This audit action cannot be reverted safely.");
      }

      let summary = "";

      if (auditLog.action === "WAGER_CREATED") {
        const betId = auditLog.after?.id;

        if (!betId) {
          throw createError(400, "This wager audit entry is missing revert data.");
        }

        await transaction.wagerEntry.deleteMany({
          where: { id: betId }
        });
        summary = `${req.user.name} reverted wager creation ${betId}.`;
      } else if (["WAGER_PAID", "WAGER_VOIDED", "WAGER_HOUSE_KEPT"].includes(auditLog.action)) {
        if (!auditLog.before?.id) {
          throw createError(400, "This wager audit entry is missing revert data.");
        }

        await transaction.wagerEntry.update({
          where: { id: auditLog.before.id },
          data: buildBetRestoreData(auditLog.before)
        });
        summary = `${req.user.name} reverted wager ${auditLog.before.id}.`;
      } else if (auditLog.action === "FIGHT_CREATED") {
        const fightId = auditLog.after?.id;

        if (!fightId) {
          throw createError(400, "This fight audit entry is missing revert data.");
        }

        const wagerCount = await transaction.wagerEntry.count({
          where: { wagerFightId: fightId }
        });

        if (wagerCount > 0) {
          throw createError(400, "Revert the wagers on this fight before reverting the fight creation.");
        }

        await transaction.wagerFight.deleteMany({
          where: { id: fightId }
        });
        summary = `${req.user.name} reverted fight book ${fightId}.`;
      } else if (["FIGHT_BOOKS_UPDATED", "FIGHT_SETTLED"].includes(auditLog.action)) {
        if (!auditLog.before?.id) {
          throw createError(400, "This fight audit entry is missing revert data.");
        }

        await transaction.wagerFight.update({
          where: { id: auditLog.before.id },
          data: buildFightRestoreData(auditLog.before)
        });

        if (auditLog.action === "FIGHT_SETTLED" && Array.isArray(auditLog.metadata?.beforeWagers)) {
          for (const wagerSnapshot of auditLog.metadata.beforeWagers) {
            await transaction.wagerEntry.update({
              where: { id: wagerSnapshot.id },
              data: buildBetRestoreData(wagerSnapshot)
            });
          }
        }

        summary = `${req.user.name} reverted fight book ${auditLog.before.id}.`;
      }

      const revertedAt = new Date();

      await transaction.wagerAuditLog.update({
        where: { id: auditLog.id },
        data: {
          revertedAt,
          revertedById: req.user.id
        }
      });

      await createWagerAuditLog(transaction, {
        actorId: req.user.id,
        nightId: auditLog.nightId,
        action: "AUDIT_REVERTED",
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        summary,
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
