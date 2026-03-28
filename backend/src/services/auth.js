import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { APP_PERMISSIONS } from "../constants.js";

export function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return process.env.JWT_SECRET;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function getEffectivePermissions(user) {
  if (!user) {
    return [];
  }

  if (user.role === "ADMIN") {
    return [...APP_PERMISSIONS];
  }

  return (user.permissions ?? []).map((permission) => permission.key ?? permission);
}

export function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    permissions: getEffectivePermissions(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

export function signUserToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      permissions: getEffectivePermissions(user)
    },
    getJwtSecret(),
    { expiresIn: "12h" }
  );
}
