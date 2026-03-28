import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken } from "../middleware/auth.js";
import { serializeUser, signUserToken, verifyPassword } from "../services/auth.js";
import { normalizeUsername, requireString } from "../validators.js";

const router = Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const username = normalizeUsername(req.body.username ?? req.body.email);
    const password = requireString(req.body.password, "Password");

    const user = await prisma.user.findUnique({
      where: { email: username },
      include: { permissions: true }
    });

    if (!user || !user.active) {
      throw createError(401, "Invalid username or password.");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);

    if (!validPassword) {
      throw createError(401, "Invalid username or password.");
    }

    res.json({
      token: signUserToken(user),
      user: serializeUser(user)
    });
  })
);

router.get(
  "/me",
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

export default router;
