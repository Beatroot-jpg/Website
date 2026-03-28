import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { hashPassword, serializeUser } from "../services/auth.js";
import {
  normalizeUsername,
  requireIdList,
  normalizePermissions,
  requireString
} from "../validators.js";

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { permissions: true }
    });

    res.json({ users: users.map(serializeUser) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body.username ?? req.body.email);
    const password = requireString(req.body.password, "Password");
    const name = requireString(req.body.name, "Name");
    const role = req.body.role === "ADMIN" ? "ADMIN" : "USER";
    const permissions = normalizePermissions(req.body.permissions, role);

    const existingUser = await prisma.user.findUnique({ where: { email: username } });

    if (existingUser) {
      throw createError(409, "A user with that username already exists.");
    }

    const user = await prisma.user.create({
      data: {
        email: username,
        name,
        passwordHash: await hashPassword(password),
        role,
        active: req.body.active !== false,
        permissions: {
          create: permissions.map((key) => ({ key }))
        }
      },
      include: { permissions: true }
    });

    res.status(201).json({ user: serializeUser(user) });
  })
);

router.patch(
  "/bulk",
  asyncHandler(async (req, res) => {
    const userIds = requireIdList(req.body.userIds, "Users");

    if (typeof req.body.active !== "boolean") {
      throw createError(400, "An active state is required for bulk updates.");
    }

    const count = await prisma.user.count({
      where: {
        id: {
          in: userIds
        }
      }
    });

    if (count !== userIds.length) {
      throw createError(404, "One or more users were not found.");
    }

    const result = await prisma.user.updateMany({
      where: {
        id: {
          in: userIds
        }
      },
      data: {
        active: req.body.active
      }
    });

    res.json({ updatedCount: result.count });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingUser = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { permissions: true }
    });

    if (!existingUser) {
      throw createError(404, "User not found.");
    }

    const nextRole = req.body.role === "ADMIN"
      ? "ADMIN"
      : req.body.role === "USER"
        ? "USER"
        : existingUser.role;
    const permissions = normalizePermissions(
      req.body.permissions ?? existingUser.permissions.map((permission) => permission.key),
      nextRole
    );

    const data = {
      email: req.body.username !== undefined || req.body.email !== undefined
        ? normalizeUsername(req.body.username ?? req.body.email)
        : existingUser.email,
      name: req.body.name ? requireString(req.body.name, "Name") : existingUser.name,
      role: nextRole,
      active: typeof req.body.active === "boolean" ? req.body.active : existingUser.active
    };

    if (data.email !== existingUser.email) {
      const duplicate = await prisma.user.findUnique({ where: { email: data.email } });
      if (duplicate) {
        throw createError(409, "A user with that username already exists.");
      }
    }

    if (req.body.password) {
      const password = requireString(req.body.password, "Password");
      data.passwordHash = await hashPassword(password);
    }

    const user = await prisma.$transaction(async (transaction) => {
      await transaction.userPermission.deleteMany({
        where: { userId: existingUser.id }
      });

      return transaction.user.update({
        where: { id: existingUser.id },
        data: {
          ...data,
          permissions: {
            create: permissions.map((key) => ({ key }))
          }
        },
        include: { permissions: true }
      });
    });

    res.json({ user: serializeUser(user) });
  })
);

export default router;
