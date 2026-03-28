import { prisma } from "../db.js";
import { APP_PERMISSIONS } from "../constants.js";
import { hashPassword } from "./auth.js";
import { normalizeUsername } from "../validators.js";

export async function ensureInitialAdmin() {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    return;
  }

  const adminIdentity = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL;

  if (!adminIdentity || !process.env.ADMIN_PASSWORD) {
    console.warn("No users found and ADMIN_USERNAME / ADMIN_PASSWORD are not configured yet.");
    return;
  }

  const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD);
  const username = normalizeUsername(adminIdentity, "Admin username");

  await prisma.user.create({
    data: {
      email: username,
      name: process.env.ADMIN_NAME || "Primary Admin",
      passwordHash,
      role: "ADMIN",
      permissions: {
        create: APP_PERMISSIONS.map((key) => ({ key }))
      }
    }
  });

  console.log(`Bootstrapped admin user ${username}.`);
}
