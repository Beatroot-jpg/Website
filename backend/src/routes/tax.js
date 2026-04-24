import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import {
  normalizeOptionalString,
  requireMoney,
  requirePositiveInt,
  requireString
} from "../validators.js";

const router = Router();
const DAY_IN_MS = 24 * 60 * 60 * 1000;

router.use(authenticateToken, requirePermission("TAX"));

function normalizeEmploymentType(value, fallback = null) {
  const normalized = `${value ?? fallback ?? ""}`.trim().toUpperCase();

  if (!["FREELANCER", "ORGANIZATION"].includes(normalized)) {
    throw createError(400, "Employment type must be Freelancer or Organization.");
  }

  return normalized;
}

function resolveOrganizationName(employmentType, organizationName) {
  const normalized = normalizeOptionalString(organizationName);

  if (employmentType === "ORGANIZATION" && !normalized) {
    throw createError(400, "Organization name is required for organization tax records.");
  }

  return employmentType === "ORGANIZATION" ? normalized : null;
}

function addDays(date, days) {
  return new Date(date.getTime() + (days * DAY_IN_MS));
}

async function recalculateTaxTimeline(memberId) {
  const periods = await prisma.taxPeriod.findMany({
    where: { memberId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      createdAt: true,
      durationDays: true,
      expiresAt: true
    }
  });

  let rollingExpiry = null;
  const updates = [];

  periods.forEach((period) => {
    const createdAt = new Date(period.createdAt);
    const baseDate = rollingExpiry && rollingExpiry > createdAt ? rollingExpiry : createdAt;
    const nextExpiry = addDays(baseDate, Number(period.durationDays || 0));

    rollingExpiry = nextExpiry;

    if (new Date(period.expiresAt).getTime() !== nextExpiry.getTime()) {
      updates.push(prisma.taxPeriod.update({
        where: { id: period.id },
        data: {
          expiresAt: nextExpiry
        }
      }));
    }
  });

  if (updates.length) {
    await prisma.$transaction(updates);
  }
}

function serializeTaxMember(member, now = new Date()) {
  const periods = [...(member.periods || [])]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const latestPeriod = periods[0] || null;
  const expiresAt = latestPeriod ? new Date(latestPeriod.expiresAt) : null;
  const active = Boolean(expiresAt && expiresAt >= now);
  const expiringSoon = Boolean(active && expiresAt.getTime() <= now.getTime() + (7 * DAY_IN_MS));
  const daysRemaining = active
    ? Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_IN_MS))
    : 0;

  return {
    id: member.id,
    fullName: member.fullName,
    mobileNumber: member.mobileNumber,
    employmentType: member.employmentType,
    organizationName: member.organizationName,
    notes: member.notes,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
    currentAmount: latestPeriod ? Number(latestPeriod.amount || 0) : 0,
    currentDurationDays: latestPeriod ? Number(latestPeriod.durationDays || 0) : 0,
    expiresAt: latestPeriod?.expiresAt || null,
    status: active ? (expiringSoon ? "EXPIRING_SOON" : "ACTIVE") : "INACTIVE",
    active,
    expiringSoon,
    daysRemaining,
    history: periods.map((period, index) => ({
      id: period.id,
      amount: Number(period.amount || 0),
      durationDays: Number(period.durationDays || 0),
      expiresAt: period.expiresAt,
      notes: period.notes,
      createdAt: period.createdAt,
      updatedAt: period.updatedAt,
      createdByName: period.createdBy?.name || null,
      isLatest: index === 0
    }))
  };
}

async function fetchTaxMember(memberId) {
  const member = await prisma.taxMember.findUnique({
    where: { id: memberId },
    include: {
      periods: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          createdBy: {
            select: {
              name: true
            }
          }
        }
      }
    }
  });

  if (!member) {
    throw createError(404, "Tax tracker not found.");
  }

  return member;
}

async function fetchSerializedTaxMember(memberId) {
  return serializeTaxMember(await fetchTaxMember(memberId));
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const members = await prisma.taxMember.findMany({
      orderBy: [{ fullName: "asc" }, { createdAt: "desc" }],
      include: {
        periods: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            createdBy: {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    const serializedMembers = members.map((member) => serializeTaxMember(member, now));
    const activeMembers = serializedMembers
      .filter((member) => member.active)
      .sort((left, right) => new Date(left.expiresAt) - new Date(right.expiresAt) || left.fullName.localeCompare(right.fullName));
    const inactiveMembers = serializedMembers
      .filter((member) => !member.active)
      .sort((left, right) => new Date(right.expiresAt || right.updatedAt) - new Date(left.expiresAt || left.updatedAt));

    res.json({
      summary: {
        tracked: serializedMembers.length,
        active: activeMembers.length,
        inactive: inactiveMembers.length,
        expiringSoon: activeMembers.filter((member) => member.expiringSoon).length
      },
      activeMembers,
      inactiveMembers
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const employmentType = normalizeEmploymentType(req.body.employmentType);
    const amount = requireMoney(req.body.amount, "Amount paid");
    const durationDays = requirePositiveInt(req.body.durationDays, "Duration");
    const member = await prisma.$transaction(async (transaction) => {
      const createdMember = await transaction.taxMember.create({
        data: {
          fullName: requireString(req.body.fullName, "Full name"),
          mobileNumber: requireString(req.body.mobileNumber, "Mobile number"),
          employmentType,
          organizationName: resolveOrganizationName(employmentType, req.body.organizationName),
          notes: normalizeOptionalString(req.body.notes),
          createdById: req.user.id
        }
      });

      await transaction.taxPeriod.create({
        data: {
          memberId: createdMember.id,
          amount,
          durationDays,
          expiresAt: new Date(),
          notes: normalizeOptionalString(req.body.periodNotes),
          createdById: req.user.id
        }
      });

      return createdMember;
    });

    await recalculateTaxTimeline(member.id);

    res.status(201).json({
      message: "Tax tracker created.",
      member: await fetchSerializedTaxMember(member.id)
    });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingMember = await fetchTaxMember(req.params.id);
    const employmentType = req.body.employmentType !== undefined
      ? normalizeEmploymentType(req.body.employmentType)
      : existingMember.employmentType;

    await prisma.taxMember.update({
      where: { id: existingMember.id },
      data: {
        fullName: req.body.fullName !== undefined
          ? requireString(req.body.fullName, "Full name")
          : existingMember.fullName,
        mobileNumber: req.body.mobileNumber !== undefined
          ? requireString(req.body.mobileNumber, "Mobile number")
          : existingMember.mobileNumber,
        employmentType,
        organizationName: req.body.employmentType !== undefined || req.body.organizationName !== undefined
          ? resolveOrganizationName(
            employmentType,
            req.body.organizationName !== undefined ? req.body.organizationName : existingMember.organizationName
          )
          : existingMember.organizationName,
        notes: req.body.notes !== undefined
          ? normalizeOptionalString(req.body.notes)
          : existingMember.notes
      }
    });

    res.json({
      message: "Tax tracker updated.",
      member: await fetchSerializedTaxMember(existingMember.id)
    });
  })
);

router.post(
  "/:id/renewals",
  asyncHandler(async (req, res) => {
    const member = await fetchTaxMember(req.params.id);

    await prisma.taxPeriod.create({
      data: {
        memberId: member.id,
        amount: requireMoney(req.body.amount, "Amount paid"),
        durationDays: requirePositiveInt(req.body.durationDays, "Duration"),
        expiresAt: new Date(),
        notes: normalizeOptionalString(req.body.notes),
        createdById: req.user.id
      }
    });

    await recalculateTaxTimeline(member.id);

    res.status(201).json({
      message: "Tax renewal added.",
      member: await fetchSerializedTaxMember(member.id)
    });
  })
);

router.patch(
  "/renewals/:renewalId",
  asyncHandler(async (req, res) => {
    const existingPeriod = await prisma.taxPeriod.findUnique({
      where: { id: req.params.renewalId },
      select: {
        id: true,
        memberId: true,
        amount: true,
        durationDays: true,
        notes: true
      }
    });

    if (!existingPeriod) {
      throw createError(404, "Tax renewal not found.");
    }

    await prisma.taxPeriod.update({
      where: { id: existingPeriod.id },
      data: {
        amount: req.body.amount !== undefined
          ? requireMoney(req.body.amount, "Amount paid")
          : existingPeriod.amount,
        durationDays: req.body.durationDays !== undefined
          ? requirePositiveInt(req.body.durationDays, "Duration")
          : existingPeriod.durationDays,
        notes: req.body.notes !== undefined
          ? normalizeOptionalString(req.body.notes)
          : existingPeriod.notes
      }
    });

    await recalculateTaxTimeline(existingPeriod.memberId);

    res.json({
      message: "Tax renewal updated.",
      member: await fetchSerializedTaxMember(existingPeriod.memberId)
    });
  })
);

router.delete(
  "/renewals/:renewalId",
  asyncHandler(async (req, res) => {
    const existingPeriod = await prisma.taxPeriod.findUnique({
      where: { id: req.params.renewalId },
      select: {
        id: true,
        memberId: true
      }
    });

    if (!existingPeriod) {
      throw createError(404, "Tax renewal not found.");
    }

    await prisma.taxPeriod.delete({
      where: { id: existingPeriod.id }
    });

    await recalculateTaxTimeline(existingPeriod.memberId);

    res.json({
      message: "Tax renewal removed.",
      member: await fetchSerializedTaxMember(existingPeriod.memberId)
    });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const member = await prisma.taxMember.findUnique({
      where: { id: req.params.id },
      select: {
        id: true
      }
    });

    if (!member) {
      throw createError(404, "Tax tracker not found.");
    }

    await prisma.taxMember.delete({
      where: { id: member.id }
    });

    res.json({ message: "Tax tracker removed." });
  })
);

export default router;
