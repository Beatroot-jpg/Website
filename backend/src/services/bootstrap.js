import { prisma } from "../db.js";
import { APP_PERMISSIONS } from "../constants.js";
import { hashPassword } from "./auth.js";
import { normalizeUsername } from "../validators.js";

export async function ensureInitialAdmin() {
  const adminIdentity = process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || "admin";
  const adminPassword = process.env.ADMIN_PASSWORD || "CAZ";
  const adminName = process.env.ADMIN_NAME || "Admin";
  const passwordHash = await hashPassword(adminPassword);
  const username = normalizeUsername(adminIdentity, "Admin username");

  await prisma.user.upsert({
    where: { email: username },
    update: {
      name: adminName,
      passwordHash,
      role: "ADMIN",
      owner: true,
      active: true,
      archived: false,
      permissions: {
        deleteMany: {},
        create: APP_PERMISSIONS.map((key) => ({ key }))
      }
    },
    create: {
      email: username,
      name: adminName,
      passwordHash,
      role: "ADMIN",
      owner: true,
      active: true,
      archived: false,
      permissions: {
        create: APP_PERMISSIONS.map((key) => ({ key }))
      }
    }
  });

  console.log(`Ensured admin user ${username}.`);
}
