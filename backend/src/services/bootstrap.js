import { prisma } from "../db.js";
import { APP_PERMISSIONS } from "../constants.js";
import { hashPassword } from "./auth.js";

export async function ensureInitialAdmin() {
  const userCount = await prisma.user.count();

  if (userCount > 0) {
    return;
  }

  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    console.warn("No users found and ADMIN_EMAIL / ADMIN_PASSWORD are not configured yet.");
    return;
  }

  const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD);

  await prisma.user.create({
    data: {
      email: process.env.ADMIN_EMAIL.toLowerCase(),
      name: process.env.ADMIN_NAME || "Primary Admin",
      passwordHash,
      role: "ADMIN",
      permissions: {
        create: APP_PERMISSIONS.map((key) => ({ key }))
      }
    }
  });

  console.log(`Bootstrapped admin user ${process.env.ADMIN_EMAIL}.`);
}
