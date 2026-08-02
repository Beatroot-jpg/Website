import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, authenticateTokenOptional, requireAdmin } from "../middleware/auth.js";
import { requireString } from "../validators.js";

const router = Router();

function parseQuotaCompleted(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw createError(400, "Choose whether the quota is completed.");
}

function serializeMember(member) {
  return {
    id: member.id,
    name: member.name,
    quotaCompleted: member.quotaCompleted,
    completedAt: member.completedAt,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt
  };
}

async function assertAvailableName(name, excludedId = null) {
  const duplicate = await prisma.quotaMember.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludedId ? { id: { not: excludedId } } : {})
    }
  });

  if (duplicate) {
    throw createError(409, "A quota member already uses that name.");
  }
}

router.get(
  "/",
  authenticateTokenOptional,
  asyncHandler(async (req, res) => {
    const members = await prisma.quotaMember.findMany({
      orderBy: [{ quotaCompleted: "asc" }, { name: "asc" }]
    });

    res.json({
      members: members.map(serializeMember),
      viewer: {
        isLoggedIn: Boolean(req.user),
        canManage: req.user?.role === "ADMIN"
      }
    });
  })
);

router.post(
  "/members",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = requireString(req.body.name, "Member name");
    const quotaCompleted = req.body.quotaCompleted === undefined
      ? false
      : parseQuotaCompleted(req.body.quotaCompleted);

    await assertAvailableName(name);
    const member = await prisma.quotaMember.create({
      data: {
        name,
        quotaCompleted,
        completedAt: quotaCompleted ? new Date() : null
      }
    });

    res.status(201).json({ member: serializeMember(member) });
  })
);

router.patch(
  "/members/:id",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.quotaMember.findUnique({ where: { id: req.params.id } });
    if (!existing) throw createError(404, "Quota member not found.");

    const data = {};
    if (req.body.name !== undefined) {
      const name = requireString(req.body.name, "Member name");
      await assertAvailableName(name, existing.id);
      data.name = name;
    }
    if (req.body.quotaCompleted !== undefined) {
      const quotaCompleted = parseQuotaCompleted(req.body.quotaCompleted);
      data.quotaCompleted = quotaCompleted;
      if (quotaCompleted !== existing.quotaCompleted) {
        data.completedAt = quotaCompleted ? new Date() : null;
      }
    }
    if (!Object.keys(data).length) throw createError(400, "Choose a quota value to update.");

    const member = await prisma.quotaMember.update({
      where: { id: existing.id },
      data
    });

    res.json({ member: serializeMember(member) });
  })
);

router.delete(
  "/members/:id",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.quotaMember.findUnique({ where: { id: req.params.id } });
    if (!existing) throw createError(404, "Quota member not found.");

    await prisma.quotaMember.delete({ where: { id: existing.id } });
    res.json({ message: `${existing.name} was removed from Quota.` });
  })
);

export default router;