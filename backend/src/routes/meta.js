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
    const canViewUsers = req.user.role === "ADMIN" || req.user.permissions.includes("USERS");

    const [fighters, hallOfFame, fights, wagers, users] = await Promise.all([
      prisma.fightFighter.findMany({
        where: {
          active: true,
          OR: [{ name: containsFilter }]
        },
        orderBy: [{ points: "desc" }, { name: "asc" }],
        take: 6,
        select: {
          id: true,
          name: true,
          points: true,
          updatedAt: true
        }
      }),
      prisma.fightHallOfFameEntry.findMany({
        where: {
          OR: [
            { fighterName: containsFilter },
            { title: containsFilter },
            { notes: containsFilter }
          ]
        },
        orderBy: { wonAt: "desc" },
        take: 6,
        select: {
          id: true,
          fighterName: true,
          title: true,
          updatedAt: true
        }
      }),
      prisma.fightCard.findMany({
        where: {
          OR: [
            { fighterRedName: containsFilter },
            { fighterBlueName: containsFilter },
            { venue: containsFilter },
            { notes: containsFilter },
            { winnerName: containsFilter }
          ]
        },
        orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
        take: 6,
        select: {
          id: true,
          fighterRedName: true,
          fighterBlueName: true,
          status: true,
          scheduledAt: true,
          updatedAt: true
        }
      }),
      prisma.wagerEntry.findMany({
        where: {
          OR: [
            { bettorName: containsFilter },
            { pickedFighterName: containsFilter },
            { notes: containsFilter },
            { settlementNote: containsFilter }
          ]
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: {
          id: true,
          bettorName: true,
          pickedFighterName: true,
          status: true,
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
      ...fighters.map((fighter) => ({
        id: `fighter-${fighter.id}`,
        group: "Leaderboard",
        title: fighter.name,
        subtitle: `${fighter.points} points`,
        href: `./dashboard.html?search=${encodeURIComponent(fighter.name)}#leaderboardTable`,
        tone: "accent",
        sortAt: fighter.updatedAt
      })),
      ...hallOfFame.map((entry) => ({
        id: `hall-of-fame-${entry.id}`,
        group: "Hall of Fame",
        title: entry.fighterName,
        subtitle: entry.title || "Champion",
        href: "./dashboard.html#hallOfFameTable",
        tone: "good",
        sortAt: entry.updatedAt
      })),
      ...fights.map((fight) => ({
        id: `fight-${fight.id}`,
        group: "Fight Card",
        title: `${fight.fighterRedName} vs ${fight.fighterBlueName}`,
        subtitle: `${fight.status} - ${new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(fight.scheduledAt))}`,
        href: "./dashboard.html#fightCardTable",
        tone: fight.status === "COMPLETED" ? "good" : fight.status === "CANCELLED" ? "danger" : "accent",
        sortAt: fight.updatedAt
      })),
      ...wagers.map((bet) => ({
        id: `wager-${bet.id}`,
        group: "Wagers",
        title: bet.bettorName,
        subtitle: `${bet.pickedFighterName} - ${bet.status}`,
        href: "./wagers.html#wagerTable",
        tone: bet.status === "PAID_OUT" ? "good" : bet.status === "HOUSE_KEPT" ? "accent" : bet.status === "LOST_PENDING" ? "warn" : "neutral",
        sortAt: bet.updatedAt
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
