import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import {
  authenticateToken,
  authenticateTokenOptional,
  requireAdmin
} from "../middleware/auth.js";
import { normalizeOptionalString, requireString } from "../validators.js";

const router = Router();

const HALL_OF_FAME_CATEGORIES = new Set([
  "STREET_DEALER",
  "ELECTRICAL",
  "MINING",
  "METH_COOK",
  "TRUCKING",
  "BIN_DIVING",
  "WEED",
  "TAXI"
]);

function normalizeCategory(value) {
  const category = String(value ?? "").trim().toUpperCase();

  if (!HALL_OF_FAME_CATEGORIES.has(category)) {
    throw createError(400, "Choose a valid Hall of Fame category.");
  }

  return category;
}

async function assertEntryAvailable(name, category, excludedId = null) {
  const duplicate = await prisma.hallOfFameEntry.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      category,
      ...(excludedId ? { id: { not: excludedId } } : {})
    }
  });

  if (duplicate) {
    throw createError(409, "That person is already listed in this category.");
  }
}

function serializeEntry(entry) {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    note: entry.note,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

router.get(
  "/",
  authenticateTokenOptional,
  asyncHandler(async (req, res) => {
    const entries = await prisma.hallOfFameEntry.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }]
    });

    res.json({
      entries: entries.map(serializeEntry),
      viewer: {
        isLoggedIn: Boolean(req.user),
        canManage: req.user?.role === "ADMIN"
      }
    });
  })
);

router.post(
  "/entries",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = requireString(req.body.name, "Name");
    const category = normalizeCategory(req.body.category);
    await assertEntryAvailable(name, category);

    const entry = await prisma.hallOfFameEntry.create({
      data: {
        name,
        category,
        note: normalizeOptionalString(req.body.note)
      }
    });

    res.status(201).json({ entry: serializeEntry(entry) });
  })
);

router.patch(
  "/entries/:id",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.hallOfFameEntry.findUnique({
      where: { id: req.params.id }
    });

    if (!existing) {
      throw createError(404, "Hall of Fame entry not found.");
    }

    const data = {};

    if (req.body.name !== undefined) {
      data.name = requireString(req.body.name, "Name");
    }

    if (req.body.category !== undefined) {
      data.category = normalizeCategory(req.body.category);
    }

    if (req.body.note !== undefined) {
      data.note = normalizeOptionalString(req.body.note);
    }

    if (!Object.keys(data).length) {
      throw createError(400, "Choose an entry value to update.");
    }

    await assertEntryAvailable(
      data.name || existing.name,
      data.category || existing.category,
      existing.id
    );

    const entry = await prisma.hallOfFameEntry.update({
      where: { id: existing.id },
      data
    });

    res.json({ entry: serializeEntry(entry) });
  })
);

router.delete(
  "/entries/:id",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const entry = await prisma.hallOfFameEntry.findUnique({
      where: { id: req.params.id }
    });

    if (!entry) {
      throw createError(404, "Hall of Fame entry not found.");
    }

    await prisma.hallOfFameEntry.delete({ where: { id: entry.id } });
    res.json({ message: entry.name + " was removed from the Hall of Fame." });
  })
);

export default router;