import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, authenticateTokenOptional } from "../middleware/auth.js";
import { normalizeOptionalString, requireMoney, requireString } from "../validators.js";

const router = Router();

function defaultNightLabel(date = new Date()) {
  return `${new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeZone: "Australia/Sydney"
  }).format(date)} Fight Night`;
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

function parseMultiplier(value) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw createError(400, "Payout multiplier must be greater than zero.");
  }

  return parsed.toFixed(2);
}

function calculateProjectedReturn(stake, multiplier) {
  return (Number.parseFloat(stake) * Number.parseFloat(multiplier)).toFixed(2);
}

function assertPickedFighterName(fight, pickedFighterName) {
  const normalizedName = requireString(pickedFighterName, "Picked fighter");

  if (![fight.fighterRedName, fight.fighterBlueName].includes(normalizedName)) {
    throw createError(400, "Picked fighter must match one of the fighters on that card.");
  }

  return normalizedName;
}

function buildNightTotals(bets = []) {
  const totalStaked = bets.reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const activeExposure = bets
    .filter((bet) => ["ACTIVE", "WON_PENDING"].includes(bet.status))
    .reduce((sum, bet) => sum + Number(bet.projectedReturn || 0), 0);
  const pendingHouseTake = bets
    .filter((bet) => ["LOST_PENDING", "HOUSE_KEPT"].includes(bet.status))
    .reduce((sum, bet) => sum + Number(bet.stake || 0), 0);
  const paidOutTotal = bets
    .filter((bet) => bet.status === "PAID_OUT")
    .reduce((sum, bet) => sum + Number(bet.projectedReturn || 0), 0);
  const houseKeptTotal = bets
    .filter((bet) => bet.status === "HOUSE_KEPT")
    .reduce((sum, bet) => sum + Number(bet.stake || 0), 0);

  return {
    totalStaked: totalStaked.toFixed(2),
    activeExposure: activeExposure.toFixed(2),
    pendingHouseTake: pendingHouseTake.toFixed(2),
    paidOutTotal: paidOutTotal.toFixed(2),
    houseKeptTotal: houseKeptTotal.toFixed(2),
    overallResult: (houseKeptTotal - paidOutTotal).toFixed(2)
  };
}

function normalizeResolveStatus(value) {
  const normalized = `${value || "COMPLETED"}`.trim().toUpperCase();

  if (!["COMPLETED", "CANCELLED"].includes(normalized)) {
    throw createError(400, "Fight result must be completed or cancelled.");
  }

  return normalized;
}

function assertFightWinner(fight, winnerName) {
  const normalizedWinner = requireString(winnerName, "Winner");

  if (![fight.fighterRedName, fight.fighterBlueName].includes(normalizedWinner)) {
    throw createError(400, "Winner must match one of the scheduled fighters.");
  }

  return normalizedWinner;
}

router.get(
  "/",
  authenticateTokenOptional,
  asyncHandler(async (req, res) => {
    const activeNight = await getOrCreateActiveNight();

    const [night, fights] = await Promise.all([
      prisma.wagerNight.findUnique({
        where: { id: activeNight.id },
        include: {
          wagers: {
            orderBy: [{ createdAt: "desc" }],
            include: {
              fight: true
            }
          }
        }
      }),
      prisma.fightCard.findMany({
        orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }]
      })
    ]);

    res.json({
      night,
      fights,
      totals: buildNightTotals(night?.wagers || []),
      viewer: {
        isLoggedIn: Boolean(req.user),
        canManage: Boolean(req.user),
        canUseAdminPanel: Boolean(req.user?.role === "ADMIN" || req.user?.permissions?.includes("USERS"))
      }
    });
  })
);

router.use(authenticateToken);

router.post(
  "/nights/start",
  asyncHandler(async (req, res) => {
    const label = req.body.label ? requireString(req.body.label, "Night label") : defaultNightLabel();

    const newNight = await prisma.$transaction(async (transaction) => {
      await transaction.wagerNight.updateMany({
        where: { status: "ACTIVE" },
        data: {
          status: "CLOSED",
          closedAt: new Date()
        }
      });

      return transaction.wagerNight.create({
        data: {
          label,
          status: "ACTIVE",
          notes: normalizeOptionalString(req.body.notes)
        }
      });
    });

    res.status(201).json({ night: newNight });
  })
);

router.post(
  "/bets",
  asyncHandler(async (req, res) => {
    const activeNight = await getOrCreateActiveNight();
    const stake = requireMoney(req.body.stake, "Stake");
    const payoutMultiplier = parseMultiplier(req.body.payoutMultiplier);
    const fightId = requireString(req.body.fightId, "Fight");
    const fight = await prisma.fightCard.findUnique({ where: { id: fightId } });

    if (!fight) {
      throw createError(404, "Fight not found.");
    }

    const bet = await prisma.wagerEntry.create({
      data: {
        nightId: activeNight.id,
        fightId,
        bettorName: requireString(req.body.bettorName, "Bettor name"),
        pickedFighterName: assertPickedFighterName(fight, req.body.pickedFighterName),
        stake,
        payoutMultiplier,
        projectedReturn: calculateProjectedReturn(stake, payoutMultiplier),
        notes: normalizeOptionalString(req.body.notes)
      },
      include: {
        fight: true
      }
    });

    res.status(201).json({ bet });
  })
);

router.patch(
  "/bets/:id",
  asyncHandler(async (req, res) => {
    const existingBet = await prisma.wagerEntry.findUnique({
      where: { id: req.params.id },
      include: { fight: true }
    });

    if (!existingBet) {
      throw createError(404, "Bet not found.");
    }

    const stake = req.body.stake !== undefined
      ? requireMoney(req.body.stake, "Stake")
      : `${existingBet.stake}`;
    const payoutMultiplier = req.body.payoutMultiplier !== undefined
      ? parseMultiplier(req.body.payoutMultiplier)
      : `${existingBet.payoutMultiplier}`;
    const nextFightId = req.body.fightId !== undefined
      ? requireString(req.body.fightId, "Fight")
      : existingBet.fightId;

    let fight = existingBet.fight;

    if (nextFightId) {
      fight = await prisma.fightCard.findUnique({ where: { id: nextFightId } });

      if (!fight) {
        throw createError(404, "Fight not found.");
      }
    }

    const bet = await prisma.wagerEntry.update({
      where: { id: existingBet.id },
      data: {
        fightId: nextFightId,
        bettorName: req.body.bettorName !== undefined
          ? requireString(req.body.bettorName, "Bettor name")
          : existingBet.bettorName,
        pickedFighterName: req.body.pickedFighterName !== undefined
          ? assertPickedFighterName(fight, req.body.pickedFighterName)
          : existingBet.pickedFighterName,
        stake,
        payoutMultiplier,
        projectedReturn: calculateProjectedReturn(stake, payoutMultiplier),
        notes: req.body.notes !== undefined ? normalizeOptionalString(req.body.notes) : existingBet.notes
      },
      include: {
        fight: true
      }
    });

    res.json({ bet });
  })
);

router.delete(
  "/bets/:id",
  asyncHandler(async (req, res) => {
    const existingBet = await prisma.wagerEntry.findUnique({
      where: { id: req.params.id }
    });

    if (!existingBet) {
      throw createError(404, "Bet not found.");
    }

    await prisma.wagerEntry.delete({
      where: { id: existingBet.id }
    });

    res.json({ message: "Bet deleted." });
  })
);

router.patch(
  "/fights/:id/resolve",
  asyncHandler(async (req, res) => {
    const existingFight = await prisma.fightCard.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFight) {
      throw createError(404, "Fight not found.");
    }

    const status = normalizeResolveStatus(req.body.status);
    const winnerName = status === "COMPLETED"
      ? assertFightWinner(existingFight, req.body.winnerName)
      : null;

    const result = await prisma.$transaction(async (transaction) => {
      const fight = await transaction.fightCard.update({
        where: { id: existingFight.id },
        data: {
          status,
          winnerName
        }
      });

      const unsettledBets = await transaction.wagerEntry.findMany({
        where: {
          fightId: existingFight.id,
          status: {
            in: ["ACTIVE", "WON_PENDING", "LOST_PENDING"]
          }
        }
      });

      for (const bet of unsettledBets) {
        const nextStatus = status === "CANCELLED"
          ? "VOIDED"
          : bet.pickedFighterName === winnerName
            ? "WON_PENDING"
            : "LOST_PENDING";

        await transaction.wagerEntry.update({
          where: { id: bet.id },
          data: {
            status: nextStatus,
            settledAt: nextStatus === "VOIDED" ? new Date() : null
          }
        });
      }

      return fight;
    });

    res.json({ fight: result });
  })
);

router.patch(
  "/bets/:id/settle",
  asyncHandler(async (req, res) => {
    const existingBet = await prisma.wagerEntry.findUnique({
      where: { id: req.params.id }
    });

    if (!existingBet) {
      throw createError(404, "Bet not found.");
    }

    const action = requireString(req.body.action, "Settlement action").toUpperCase();
    let nextStatus = existingBet.status;

    if (action === "PAY_OUT" && existingBet.status === "WON_PENDING") {
      nextStatus = "PAID_OUT";
    } else if (action === "KEEP_HOUSE" && existingBet.status === "LOST_PENDING") {
      nextStatus = "HOUSE_KEPT";
    } else if (action === "VOID_BET") {
      nextStatus = "VOIDED";
    } else {
      throw createError(400, "That settlement action is not valid for this bet.");
    }

    const bet = await prisma.wagerEntry.update({
      where: { id: existingBet.id },
      data: {
        status: nextStatus,
        settledAt: new Date(),
        settlementNote: normalizeOptionalString(req.body.settlementNote)
      },
      include: {
        fight: true
      }
    });

    res.json({ bet });
  })
);

export default router;
