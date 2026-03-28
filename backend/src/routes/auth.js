import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken } from "../middleware/auth.js";
import { serializeUser, signUserToken, verifyPassword } from "../services/auth.js";
import { requireString } from "../validators.js";

const router = Router();

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const email = requireString(req.body.email, "Email").toLowerCase();
    const password = requireString(req.body.password, "Password");

    const user = await prisma.user.findUnique({
      where: { email },
      include: { permissions: true }
    });

    if (!user || !user.active) {
      throw createError(401, "Invalid email or password.");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);

    if (!validPassword) {
      throw createError(401, "Invalid email or password.");
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
