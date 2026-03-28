import "dotenv/config";

import { prisma } from "../src/db.js";
import { APP_PERMISSIONS, DEFAULT_USER_PERMISSIONS } from "../src/constants.js";
import { hashPassword } from "../src/services/auth.js";
import { normalizeUsername } from "../src/validators.js";

async function seed() {
  const adminUsername = normalizeUsername(process.env.ADMIN_USERNAME || process.env.ADMIN_EMAIL || "admin");
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeMe123!";

  const admin = await prisma.user.upsert({
    where: { email: adminUsername },
    update: {
      name: process.env.ADMIN_NAME || "Primary Admin",
      role: "ADMIN",
      active: true
    },
    create: {
      email: adminUsername,
      name: process.env.ADMIN_NAME || "Primary Admin",
      passwordHash: await hashPassword(adminPassword),
      role: "ADMIN",
      permissions: {
        create: APP_PERMISSIONS.map((key) => ({ key }))
      }
    },
    include: { permissions: true }
  });

  const staffUsername = "operator";
  const existingStaff = await prisma.user.findUnique({ where: { email: staffUsername } });

  if (!existingStaff) {
    await prisma.user.create({
      data: {
        email: staffUsername,
        name: "Operations User",
        passwordHash: await hashPassword("ChangeMe123!"),
        permissions: {
          create: DEFAULT_USER_PERMISSIONS.map((key) => ({ key }))
        }
      }
    });
  }

  console.log(`Seeded admin ${admin.email} and an example operator account.`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
