import jwt from "jsonwebtoken";

import { prisma } from "../db.js";
import { APP_PERMISSIONS } from "../constants.js";
import { getJwtSecret, serializeUser } from "../services/auth.js";

export async function authenticateToken(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, getJwtSecret());
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { permissions: true }
    });

    if (!user || !user.active) {
      return res.status(401).json({ message: "Your account is unavailable." });
    }

    req.user = serializeUser(user);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired session." });
  }
}

export function requirePermission(...requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required." });
    }

    if (req.user.role === "ADMIN") {
      return next();
    }

    if (requiredPermissions.length === 0) {
      return next();
    }

    const allowed = requiredPermissions.some((key) => req.user.permissions.includes(key));

    if (!allowed) {
      return res.status(403).json({ message: "You do not have access to this section." });
    }

    return next();
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authentication required." });
  }

  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access is required." });
  }

  return next();
}

export function listPermissionMetadata() {
  return APP_PERMISSIONS.map((key) => ({
    key,
    label: key.charAt(0) + key.slice(1).toLowerCase()
  }));
}
