import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { requirePositiveInt, requireString } from "../validators.js";

const VALID_STATUSES = new Set(["ACTIVE", "LOA", "INACTIVE"]);

function normalizeStatus(value, fallback = "ACTIVE") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!VALID_STATUSES.has(normalized)) {
    throw createError(400, "A valid roster status is required.");
  }

  return normalized;
}

function requireDateOnly(value, fieldName) {
  const normalized = requireString(value, fieldName);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createError(400, `${fieldName} must be a valid date.`);
  }

  const parsed = new Date(`${normalized}T12:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, `${fieldName} must be a valid date.`);
  }

  return parsed;
}

const router = Router();

router.use(authenticateToken, requirePermission("ROSTER"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const members = await prisma.rosterMember.findMany({
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    });

    res.json({ members });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = requireString(req.body.name, "Name");
    const discordName = requireString(req.body.discordName, "Discord name");
    const rank = requireString(req.body.rank, "Rank");
    const status = normalizeStatus(req.body.status);
    const dateJoined = requireDateOnly(req.body.dateJoined, "Date joined");
    const requestedOrder = requirePositiveInt(req.body.displayOrder, "Order");

    const member = await prisma.$transaction(async (transaction) => {
      const memberCount = await transaction.rosterMember.count();
      const displayOrder = Math.min(requestedOrder, memberCount + 1);

      await transaction.rosterMember.updateMany({
        where: {
          displayOrder: {
            gte: displayOrder
          }
        },
        data: {
          displayOrder: {
            increment: 1
          }
        }
      });

      return transaction.rosterMember.create({
        data: {
          name,
          discordName,
          rank,
          status,
          dateJoined,
          displayOrder
        }
      });
    });

    res.status(201).json({ member });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingMember = await prisma.rosterMember.findUnique({
      where: { id: req.params.id }
    });

    if (!existingMember) {
      throw createError(404, "Roster member not found.");
    }

    const memberCount = await prisma.rosterMember.count();
    const nextOrder = req.body.displayOrder !== undefined && req.body.displayOrder !== ""
      ? Math.min(requirePositiveInt(req.body.displayOrder, "Order"), memberCount)
      : existingMember.displayOrder;

    await prisma.$transaction(async (transaction) => {
      if (nextOrder < existingMember.displayOrder) {
        await transaction.rosterMember.updateMany({
          where: {
            id: { not: existingMember.id },
            displayOrder: {
              gte: nextOrder,
              lt: existingMember.displayOrder
            }
          },
          data: {
            displayOrder: {
              increment: 1
            }
          }
        });
      } else if (nextOrder > existingMember.displayOrder) {
        await transaction.rosterMember.updateMany({
          where: {
            id: { not: existingMember.id },
            displayOrder: {
              gt: existingMember.displayOrder,
              lte: nextOrder
            }
          },
          data: {
            displayOrder: {
              decrement: 1
            }
          }
        });
      }

      await transaction.rosterMember.update({
        where: { id: existingMember.id },
        data: {
          name: req.body.name !== undefined ? requireString(req.body.name, "Name") : existingMember.name,
          discordName: req.body.discordName !== undefined
            ? requireString(req.body.discordName, "Discord name")
            : existingMember.discordName,
          rank: req.body.rank !== undefined ? requireString(req.body.rank, "Rank") : existingMember.rank,
          status: req.body.status !== undefined ? normalizeStatus(req.body.status) : existingMember.status,
          dateJoined: req.body.dateJoined !== undefined
            ? requireDateOnly(req.body.dateJoined, "Date joined")
            : existingMember.dateJoined,
          displayOrder: nextOrder
        }
      });
    });

    const member = await prisma.rosterMember.findUnique({
      where: { id: existingMember.id }
    });

    res.json({ member });
  })
);

export default router;
