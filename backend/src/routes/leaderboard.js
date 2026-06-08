import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { normalizeOptionalString, requireInt, requireString } from "../validators.js";

const router = Router();

router.use(authenticateToken);

function requireDateTime(value, fieldName) {
  const normalized = requireString(value, fieldName);
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, `${fieldName} must be a valid date and time.`);
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

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [fighters, hallOfFame, fightCard] = await Promise.all([
      prisma.fightFighter.findMany({
        where: { active: true },
        orderBy: [{ points: "desc" }, { name: "asc" }]
      }),
      prisma.fightHallOfFameEntry.findMany({
        orderBy: [{ wonAt: "desc" }, { fighterName: "asc" }]
      }),
      prisma.fightCard.findMany({
        where: {
          status: "UPCOMING"
        },
        orderBy: [{ scheduledAt: "asc" }, { fighterRedName: "asc" }]
      })
    ]);

    res.json({
      fighters,
      hallOfFame,
      fightCard,
      viewer: {
        isAdmin: req.user.role === "ADMIN"
      }
    });
  })
);

router.post(
  "/fighters",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = requireString(req.body.name, "Fighter name");
    const points = req.body.points === undefined ? 20 : requireInt(req.body.points, "Points");

    const fighter = await prisma.fightFighter.create({
      data: {
        name,
        points,
        notes: normalizeOptionalString(req.body.notes)
      }
    });

    res.status(201).json({ fighter });
  })
);

router.patch(
  "/fighters/:id",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existingFighter = await prisma.fightFighter.findUnique({
      where: { id: req.params.id }
    });

    if (!existingFighter) {
      throw createError(404, "Fighter not found.");
    }

    const fighter = await prisma.fightFighter.update({
      where: { id: existingFighter.id },
      data: {
        name: req.body.name !== undefined ? requireString(req.body.name, "Fighter name") : existingFighter.name,
        points: req.body.points !== undefined ? requireInt(req.body.points, "Points") : existingFighter.points,
        active: typeof req.body.active === "boolean" ? req.body.active : existingFighter.active,
        notes: req.body.notes !== undefined ? normalizeOptionalString(req.body.notes) : existingFighter.notes
      }
    });

    res.json({ fighter });
  })
);

router.delete(
  "/fighters/:id",
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
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
  requireAdmin,
  asyncHandler(async (req, res) => {
    const fight = await prisma.fightCard.create({
      data: {
        fighterRedName: requireString(req.body.fighterRedName, "Red corner fighter"),
        fighterBlueName: requireString(req.body.fighterBlueName, "Blue corner fighter"),
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
  requireAdmin,
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

    const fight = await prisma.fightCard.update({
      where: { id: existingFight.id },
      data: {
        fighterRedName: req.body.fighterRedName !== undefined
          ? requireString(req.body.fighterRedName, "Red corner fighter")
          : existingFight.fighterRedName,
        fighterBlueName: req.body.fighterBlueName !== undefined
          ? requireString(req.body.fighterBlueName, "Blue corner fighter")
          : existingFight.fighterBlueName,
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
  requireAdmin,
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
