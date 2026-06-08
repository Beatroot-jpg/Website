import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler } from "../http.js";
import { authenticateToken, listPermissionMetadata } from "../middleware/auth.js";

const router = Router();

router.get(
  "/bootstrap-status",
  asyncHandler(async (_req, res) => {
    const userCount = await prisma.user.count();
    res.json({ needsSetup: userCount === 0 });
  })
);

router.get(
  "/search",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const query = `${req.query.q ?? ""}`.trim();

    if (query.length < 2) {
      return res.json({ results: [] });
    }

    const containsFilter = { contains: query, mode: "insensitive" };
    const canEditSecretary = req.user.role === "ADMIN" || req.user.permissions.includes("SECRETARY");
    const canViewUsers = req.user.role === "ADMIN" || req.user.permissions.includes("USERS");

    const [meetings, records, users] = await Promise.all([
      prisma.secretaryMeeting.findMany({
        where: {
          OR: [
            { title: containsFilter },
            { location: containsFilter },
            { audience: containsFilter },
            { details: containsFilter }
          ]
        },
        orderBy: [{ startsAt: "asc" }, { updatedAt: "desc" }],
        take: 6,
        select: {
          id: true,
          title: true,
          location: true,
          status: true,
          startsAt: true,
          updatedAt: true
        }
      }),
      prisma.secretaryRecord.findMany({
        where: {
          OR: [
            { title: containsFilter },
            { summary: containsFilter },
            { content: containsFilter },
            { audience: containsFilter }
          ]
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          title: true,
          type: true,
          summary: true,
          updatedAt: true
        }
      }),
      canViewUsers
        ? prisma.user.findMany({
          where: {
            archived: false,
            OR: [
              { name: containsFilter },
              { email: containsFilter }
            ]
          },
          orderBy: [{ role: "asc" }, { name: "asc" }],
          take: 6,
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            updatedAt: true
          }
        })
        : []
    ]);

    const results = [
      ...meetings.map((meeting) => ({
        id: `meeting-${meeting.id}`,
        group: "Secretary",
        title: meeting.title,
        subtitle: `${meeting.status} - ${meeting.location || "No location set"}`,
        href: canEditSecretary
          ? `./secretary.html?editMeeting=${meeting.id}#meetingTable`
          : `./secretary.html?viewMeeting=${meeting.id}#meetingTable`,
        tone: meeting.status === "CANCELLED" ? "danger" : meeting.status === "COMPLETED" ? "good" : "accent",
        sortAt: meeting.updatedAt
      })),
      ...records.map((record) => ({
        id: `record-${record.id}`,
        group: "Secretary",
        title: record.title,
        subtitle: record.summary || record.type.replaceAll("_", " "),
        href: canEditSecretary
          ? `./secretary.html?editRecord=${record.id}#recordTable`
          : `./secretary.html?viewRecord=${record.id}#recordTable`,
        tone: record.type === "NOTICE" ? "accent" : record.type === "JOURNAL_ENTRY" ? "neutral" : "good",
        sortAt: record.updatedAt
      })),
      ...users.map((user) => ({
        id: `user-${user.id}`,
        group: "Users",
        title: user.name,
        subtitle: `${user.email} - ${user.role}`,
        href: `./users.html?editUser=${user.id}#userTable`,
        tone: user.role === "ADMIN" ? "accent" : "neutral",
        sortAt: user.updatedAt
      }))
    ]
      .sort((left, right) => new Date(right.sortAt).getTime() - new Date(left.sortAt).getTime())
      .slice(0, 12);

    res.json({ results });
  })
);

router.get(
  "/options",
  authenticateToken,
  asyncHandler(async (_req, res) => {
    res.json({
      permissions: listPermissionMetadata()
    });
  })
);

export default router;
