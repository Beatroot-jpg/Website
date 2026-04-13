import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { getSydneyDateKey, getWeekStartKey, shiftDateKey } from "../services/time.js";
import { normalizeOptionalString, requireString } from "../validators.js";

const router = Router();

router.use(authenticateToken, requirePermission("SECRETARY"));

const MEETING_STATUSES = new Set(["SCHEDULED", "COMPLETED", "CANCELLED"]);
const RECORD_TYPES = new Set(["MEETING_MINUTES", "JOURNAL_ENTRY", "NOTICE"]);

function normalizeMeetingStatus(value, fallback = "SCHEDULED") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!MEETING_STATUSES.has(normalized)) {
    throw createError(400, "A valid meeting status is required.");
  }

  return normalized;
}

function normalizeRecordType(value, fallback = "NOTICE") {
  const normalized = `${value ?? fallback}`.trim().toUpperCase();

  if (!RECORD_TYPES.has(normalized)) {
    throw createError(400, "A valid record type is required.");
  }

  return normalized;
}

function requireDateTime(value, fieldName) {
  const normalized = requireString(value, fieldName);
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw createError(400, `${fieldName} must be a valid date and time.`);
  }

  return parsed;
}

function meetingInclude() {
  return {
    createdBy: {
      select: {
        id: true,
        name: true,
        email: true
      }
    },
    _count: {
      select: {
        records: true
      }
    }
  };
}

function recordInclude() {
  return {
    createdBy: {
      select: {
        id: true,
        name: true,
        email: true
      }
    },
    meeting: {
      select: {
        id: true,
        title: true,
        startsAt: true,
        status: true
      }
    }
  };
}

function buildSummary(meetings, { recordCount = 0, minutesCount = 0 } = {}) {
  const weekKey = getWeekStartKey(getSydneyDateKey());
  const now = new Date();
  const upcomingMeetings = meetings.filter((meeting) => (
    new Date(meeting.startsAt) >= now
    && meeting.status === "SCHEDULED"
  ));
  const thisWeekMeetings = meetings.filter((meeting) => getWeekStartKey(getSydneyDateKey(meeting.startsAt)) === weekKey);

  return {
    upcomingMeetings: upcomingMeetings.length,
    thisWeekMeetings: thisWeekMeetings.length,
    recordCount,
    minutesCount
  };
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const todayKey = getSydneyDateKey();
    const rangeStart = new Date(`${shiftDateKey(todayKey, -45)}T00:00:00Z`);
    const rangeEnd = new Date(`${shiftDateKey(todayKey, 150)}T23:59:59Z`);

    const [meetings, records, recordCount, minutesCount] = await Promise.all([
      prisma.secretaryMeeting.findMany({
        where: {
          startsAt: {
            gte: rangeStart,
            lte: rangeEnd
          }
        },
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
        include: meetingInclude()
      }),
      prisma.secretaryRecord.findMany({
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        take: 40,
        include: recordInclude()
      }),
      prisma.secretaryRecord.count(),
      prisma.secretaryRecord.count({
        where: {
          type: "MEETING_MINUTES"
        }
      })
    ]);

    res.json({
      summary: buildSummary(meetings, { recordCount, minutesCount }),
      meetings,
      records,
      options: {
        meetings: meetings.map((meeting) => ({
          id: meeting.id,
          title: meeting.title,
          startsAt: meeting.startsAt,
          status: meeting.status
        }))
      }
    });
  })
);

router.post(
  "/meetings",
  asyncHandler(async (req, res) => {
    const startsAt = requireDateTime(req.body.startsAt, "Meeting time");
    const endsAt = req.body.endsAt ? requireDateTime(req.body.endsAt, "Meeting end time") : null;

    if (endsAt && endsAt < startsAt) {
      throw createError(400, "Meeting end time must be after the start time.");
    }

    const meeting = await prisma.secretaryMeeting.create({
      data: {
        title: requireString(req.body.title, "Meeting title"),
        startsAt,
        endsAt,
        location: normalizeOptionalString(req.body.location),
        audience: normalizeOptionalString(req.body.audience),
        details: normalizeOptionalString(req.body.details),
        status: normalizeMeetingStatus(req.body.status),
        createdById: req.user.id
      },
      include: meetingInclude()
    });

    res.status(201).json({ meeting });
  })
);

router.patch(
  "/meetings/:id",
  asyncHandler(async (req, res) => {
    const existingMeeting = await prisma.secretaryMeeting.findUnique({
      where: { id: req.params.id }
    });

    if (!existingMeeting) {
      throw createError(404, "Meeting not found.");
    }

    const startsAt = req.body.startsAt !== undefined
      ? requireDateTime(req.body.startsAt, "Meeting time")
      : existingMeeting.startsAt;
    const endsAt = req.body.endsAt !== undefined
      ? (req.body.endsAt ? requireDateTime(req.body.endsAt, "Meeting end time") : null)
      : existingMeeting.endsAt;

    if (endsAt && endsAt < startsAt) {
      throw createError(400, "Meeting end time must be after the start time.");
    }

    const meeting = await prisma.secretaryMeeting.update({
      where: { id: existingMeeting.id },
      data: {
        title: req.body.title !== undefined
          ? requireString(req.body.title, "Meeting title")
          : existingMeeting.title,
        startsAt,
        endsAt,
        location: req.body.location !== undefined
          ? normalizeOptionalString(req.body.location)
          : existingMeeting.location,
        audience: req.body.audience !== undefined
          ? normalizeOptionalString(req.body.audience)
          : existingMeeting.audience,
        details: req.body.details !== undefined
          ? normalizeOptionalString(req.body.details)
          : existingMeeting.details,
        status: req.body.status !== undefined
          ? normalizeMeetingStatus(req.body.status, existingMeeting.status)
          : existingMeeting.status
      },
      include: meetingInclude()
    });

    res.json({ meeting });
  })
);

router.delete(
  "/meetings/:id",
  asyncHandler(async (req, res) => {
    const existingMeeting = await prisma.secretaryMeeting.findUnique({
      where: { id: req.params.id }
    });

    if (!existingMeeting) {
      throw createError(404, "Meeting not found.");
    }

    await prisma.secretaryMeeting.delete({
      where: { id: existingMeeting.id }
    });

    res.json({ deleted: true });
  })
);

router.post(
  "/records",
  asyncHandler(async (req, res) => {
    const meetingId = `${req.body.meetingId ?? ""}`.trim() || null;

    if (meetingId) {
      const meeting = await prisma.secretaryMeeting.findUnique({
        where: { id: meetingId }
      });

      if (!meeting) {
        throw createError(404, "Linked meeting not found.");
      }
    }

    const record = await prisma.secretaryRecord.create({
      data: {
        type: normalizeRecordType(req.body.type),
        title: requireString(req.body.title, "Record title"),
        summary: normalizeOptionalString(req.body.summary),
        content: requireString(req.body.content, "Record content"),
        audience: normalizeOptionalString(req.body.audience),
        meetingId,
        createdById: req.user.id
      },
      include: recordInclude()
    });

    res.status(201).json({ record });
  })
);

router.patch(
  "/records/:id",
  asyncHandler(async (req, res) => {
    const existingRecord = await prisma.secretaryRecord.findUnique({
      where: { id: req.params.id }
    });

    if (!existingRecord) {
      throw createError(404, "Record not found.");
    }

    const meetingId = req.body.meetingId !== undefined
      ? (`${req.body.meetingId ?? ""}`.trim() || null)
      : existingRecord.meetingId;

    if (meetingId) {
      const meeting = await prisma.secretaryMeeting.findUnique({
        where: { id: meetingId }
      });

      if (!meeting) {
        throw createError(404, "Linked meeting not found.");
      }
    }

    const record = await prisma.secretaryRecord.update({
      where: { id: existingRecord.id },
      data: {
        type: req.body.type !== undefined
          ? normalizeRecordType(req.body.type, existingRecord.type)
          : existingRecord.type,
        title: req.body.title !== undefined
          ? requireString(req.body.title, "Record title")
          : existingRecord.title,
        summary: req.body.summary !== undefined
          ? normalizeOptionalString(req.body.summary)
          : existingRecord.summary,
        content: req.body.content !== undefined
          ? requireString(req.body.content, "Record content")
          : existingRecord.content,
        audience: req.body.audience !== undefined
          ? normalizeOptionalString(req.body.audience)
          : existingRecord.audience,
        meetingId
      },
      include: recordInclude()
    });

    res.json({ record });
  })
);

router.delete(
  "/records/:id",
  asyncHandler(async (req, res) => {
    const existingRecord = await prisma.secretaryRecord.findUnique({
      where: { id: req.params.id }
    });

    if (!existingRecord) {
      throw createError(404, "Record not found.");
    }

    await prisma.secretaryRecord.delete({
      where: { id: existingRecord.id }
    });

    res.json({ deleted: true });
  })
);

export default router;
