import jwt from "jsonwebtoken";

import { prisma } from "../db.js";
import { APP_PERMISSIONS } from "../constants.js";
import { getJwtSecret, serializeUser } from "../services/auth.js";

function readBearerToken(req) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length);
}

async function resolveAuthenticatedUser(token) {
  const payload = jwt.verify(token, getJwtSecret());
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { permissions: true }
  });

  if (!user || !user.active || user.archived) {
    throw new Error("Your account is unavailable.");
  }

  return serializeUser(user);
}

export async function authenticateToken(req, res, next) {
  const token = readBearerToken(req);

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    req.user = await resolveAuthenticatedUser(token);
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired session." });
  }
}

export async function authenticateTokenOptional(req, _res, next) {
  const token = readBearerToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = await resolveAuthenticatedUser(token);
  } catch (_error) {
    req.user = null;
  }

  return next();
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
  const labels = {
    USERS: "Admin Panel Access"
  };

  return APP_PERMISSIONS.map((key) => ({
    key,
    label: labels[key] || key
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  }));
}
