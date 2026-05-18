import { prisma } from "../db.js";

export const FACTORY_CATEGORY_SEED = [
  {
    slug: "mine-copper-ore",
    name: "Mine Copper Ore",
    section: "MINING",
    workMode: "CLOCKED",
    helperText: "Mining section",
    sortOrder: 10
  },
  {
    slug: "mine-coal-ore",
    name: "Mine Coal Ore",
    section: "MINING",
    workMode: "CLOCKED",
    helperText: "Mining section",
    sortOrder: 20
  },
  {
    slug: "mine-zinc-ore",
    name: "Mine Zinc Ore",
    section: "MINING",
    workMode: "CLOCKED",
    helperText: "Mining section",
    sortOrder: 30
  },
  {
    slug: "smelt-brass",
    name: "Smelt Brass",
    section: "SMELTING",
    workMode: "LOGGED_ENTRY",
    helperText: "Uses Copper + Zinc ores",
    sortOrder: 40
  },
  {
    slug: "smelt-copper",
    name: "Smelt Copper",
    section: "SMELTING",
    workMode: "LOGGED_ENTRY",
    helperText: "Uses Copper + Coal ores",
    sortOrder: 50
  },
  {
    slug: "bullet-casings",
    name: "Bullet Casings",
    section: "MISCELLANEOUS",
    workMode: "CLOCKED",
    helperText: "Miscellaneous section",
    sortOrder: 60
  },
  {
    slug: "logistics-transit",
    name: "Logistics / Transit",
    section: "MISCELLANEOUS",
    workMode: "CLOCKED",
    helperText: "Miscellaneous section",
    sortOrder: 70
  },
  {
    slug: "crafting",
    name: "Crafting",
    section: "MISCELLANEOUS",
    workMode: "CLOCKED",
    helperText: "Miscellaneous section",
    sortOrder: 80
  }
];

export function factorySectionLabel(section) {
  switch (`${section || ""}`.toUpperCase()) {
    case "MINING":
      return "Mining";
    case "SMELTING":
      return "Smelting";
    default:
      return "Miscellaneous";
  }
}

export function factoryWorkModeLabel(workMode) {
  return `${workMode || ""}`.toUpperCase() === "LOGGED_ENTRY"
    ? "Log entry"
    : "Clocked";
}

export function slugifyFactoryCategoryName(name) {
  return `${name || ""}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export async function getUniqueFactoryCategorySlug(name, excludeId = "") {
  const baseSlug = slugifyFactoryCategoryName(name) || "factory-category";
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const existing = await prisma.factoryCategory.findFirst({
      where: {
        slug,
        ...(excludeId
          ? {
            NOT: {
              id: excludeId
            }
          }
          : {})
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      return slug;
    }

    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

export async function ensureFactoryCategories() {
  const existingCategories = await prisma.factoryCategory.findMany({
    where: {
      slug: {
        in: FACTORY_CATEGORY_SEED.map((category) => category.slug)
      }
    },
    select: {
      id: true,
      slug: true,
      workMode: true,
      name: true
    }
  });

  const existingBySlug = new Map(existingCategories.map((category) => [category.slug, category]));
  const operations = [];

  FACTORY_CATEGORY_SEED.forEach((category) => {
    const existing = existingBySlug.get(category.slug);

    if (!existing) {
      operations.push(prisma.factoryCategory.create({
        data: category
      }));
      return;
    }

    // Keep the two legacy smelting categories in the new logged-entry mode
    // without disturbing categories admins add on their own.
    if (existing.workMode !== category.workMode && category.section === "SMELTING" && existing.name === category.name) {
      operations.push(prisma.factoryCategory.update({
        where: {
          id: existing.id
        },
        data: {
          workMode: category.workMode
        }
      }));
    }
  });

  if (operations.length) {
    await prisma.$transaction(operations);
  }
}

export async function ensureFactoryBootstrap() {
  await ensureFactoryCategories();

  const activeRound = await prisma.factoryRound.findFirst({
    where: {
      status: "ACTIVE"
    },
    select: {
      id: true
    }
  });

  if (activeRound) {
    return;
  }

  await prisma.factoryRound.create({
    data: {
      roundNumber: await getNextFactoryRoundNumber()
    }
  });
}

export async function getNextFactoryRoundNumber(tx = prisma) {
  const latestRound = await tx.factoryRound.findFirst({
    orderBy: {
      roundNumber: "desc"
    },
    select: {
      roundNumber: true
    }
  });

  return (latestRound?.roundNumber || 0) + 1;
}

export function computeSessionMilliseconds(session, now = new Date()) {
  const startedAt = new Date(session.startedAt).getTime();
  const endedAt = session.endedAt ? new Date(session.endedAt).getTime() : now.getTime();
  return Math.max(0, endedAt - startedAt);
}

export function buildFactoryShareRows(sessions = [], projectionBasisTotal = 0, now = new Date()) {
  const perUser = new Map();

  sessions.forEach((session) => {
    const durationMilliseconds = computeSessionMilliseconds(session, now);

    if (durationMilliseconds <= 0) {
      return;
    }

    const existing = perUser.get(session.userId) || {
      userId: session.userId,
      userName: session.user?.name || "Unknown worker",
      totalMilliseconds: 0,
      activeCategoryName: ""
    };

    existing.totalMilliseconds += durationMilliseconds;

    if (!session.endedAt && `${session.workMode || session.category?.workMode || ""}`.toUpperCase() !== "LOGGED_ENTRY") {
      existing.activeCategoryName = session.category?.name || existing.activeCategoryName;
    }

    perUser.set(session.userId, existing);
  });

  const totalMilliseconds = [...perUser.values()].reduce((sum, entry) => sum + entry.totalMilliseconds, 0);
  const projectionTotal = Number(projectionBasisTotal || 0);

  const shareRows = [...perUser.values()]
    .map((entry) => {
      const shareRatio = totalMilliseconds > 0 ? entry.totalMilliseconds / totalMilliseconds : 0;
      const totalMinutes = Math.round(entry.totalMilliseconds / 60000);
      const totalHours = entry.totalMilliseconds / 3600000;

      return {
        userId: entry.userId,
        userName: entry.userName,
        totalMilliseconds: entry.totalMilliseconds,
        totalMinutes,
        totalHours,
        sharePercent: shareRatio * 100,
        shareRatio,
        projectedPayout: projectionTotal * shareRatio,
        activeCategoryName: entry.activeCategoryName || null
      };
    })
    .sort((left, right) => (
      right.totalMilliseconds - left.totalMilliseconds
      || left.userName.localeCompare(right.userName)
    ));

  return {
    shareRows,
    totalMilliseconds
  };
}

export function buildFactoryCategoryView(categories = [], sessions = [], viewerUserId = "") {
  const activeSessions = sessions.filter((session) => !session.endedAt);
  const categoryWorkers = new Map();
  let viewerActiveCategoryId = "";
  let viewerActiveSessionId = "";

  activeSessions.forEach((session) => {
    if (`${session.workMode || session.category?.workMode || ""}`.toUpperCase() === "LOGGED_ENTRY") {
      return;
    }

    const workers = categoryWorkers.get(session.categoryId) || [];
    workers.push({
      userId: session.userId,
      userName: session.user?.name || "Unknown worker",
      sessionId: session.id,
      startedAt: session.startedAt
    });
    categoryWorkers.set(session.categoryId, workers);

    if (session.userId === viewerUserId) {
      viewerActiveCategoryId = session.categoryId;
      viewerActiveSessionId = session.id;
    }
  });

  return {
    viewerActiveCategoryId,
    viewerActiveSessionId,
    categories: categories
      .filter((category) => !category.archived)
      .map((category) => {
        const workers = (categoryWorkers.get(category.id) || [])
          .sort((left, right) => left.userName.localeCompare(right.userName));

        return {
          id: category.id,
          slug: category.slug,
          name: category.name,
          section: category.section,
          sectionLabel: factorySectionLabel(category.section),
          workMode: category.workMode,
          workModeLabel: factoryWorkModeLabel(category.workMode),
          helperText: category.helperText,
          locked: category.locked,
          archived: category.archived,
          activeWorkers: workers,
          activeWorkerCount: workers.length,
          viewerActive: viewerActiveCategoryId === category.id
        };
      })
  };
}

export function summarizeFactoryCategoryBreakdown(sessions = []) {
  const categoryMap = new Map();

  sessions.forEach((session) => {
    const durationMilliseconds = computeSessionMilliseconds(session);
    const existing = categoryMap.get(session.categoryId) || {
      categoryId: session.categoryId,
      categoryName: session.category?.name || "Unknown category",
      section: session.category?.section || "MISCELLANEOUS",
      sectionLabel: factorySectionLabel(session.category?.section || "MISCELLANEOUS"),
      totalMilliseconds: 0
    };

    existing.totalMilliseconds += durationMilliseconds;
    categoryMap.set(session.categoryId, existing);
  });

  return [...categoryMap.values()]
    .map((entry) => ({
      categoryId: entry.categoryId,
      categoryName: entry.categoryName,
      section: entry.section,
      sectionLabel: entry.sectionLabel,
      totalMinutes: Math.round(entry.totalMilliseconds / 60000),
      totalHours: entry.totalMilliseconds / 3600000
    }))
    .sort((left, right) => right.totalMinutes - left.totalMinutes || left.categoryName.localeCompare(right.categoryName));
}
