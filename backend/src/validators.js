import { APP_PERMISSIONS } from "./constants.js";
import { createError } from "./http.js";

export function requireString(value, fieldName) {
  const normalized = `${value ?? ""}`.trim();

  if (!normalized) {
    throw createError(400, `${fieldName} is required.`);
  }

  return normalized;
}

export function normalizeUsername(value, fieldName = "Username") {
  const normalized = requireString(value, fieldName).toLowerCase();

  if (!/^[a-z0-9._@-]{3,64}$/.test(normalized)) {
    throw createError(
      400,
      `${fieldName} must be 3-64 characters and use only letters, numbers, dots, @ signs, hyphens, or underscores.`
    );
  }

  return normalized;
}

export function normalizeOptionalString(value) {
  const normalized = `${value ?? ""}`.trim();
  return normalized || null;
}

export function requirePositiveInt(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createError(400, `${fieldName} must be a positive whole number.`);
  }

  return parsed;
}

export function requireInt(value, fieldName) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw createError(400, `${fieldName} must be a whole number.`);
  }

  return parsed;
}

export function requireMoney(value, fieldName) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError(400, `${fieldName} must be zero or greater.`);
  }

  return parsed.toFixed(2);
}

export function requireIdList(value, fieldName) {
  if (!Array.isArray(value)) {
    throw createError(400, `${fieldName} are required.`);
  }

  const ids = [...new Set(value.map((entry) => `${entry ?? ""}`.trim()).filter(Boolean))];

  if (!ids.length) {
    throw createError(400, `${fieldName} are required.`);
  }

  return ids;
}

export function normalizePermissions(permissions, role) {
  if (role === "ADMIN") {
    return [...APP_PERMISSIONS];
  }

  if (!Array.isArray(permissions)) {
    return [];
  }

  return [...new Set(permissions.filter((key) => APP_PERMISSIONS.includes(key)))];
}
