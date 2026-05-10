import { prisma } from "../db.js";

export const FACTORY_CATEGORY_SEED = [
  {
    slug: "mine-copper-ore",
    name: "Mine Copper Ore",
    section: "MINING",
    helperText: "Mining section",
    sortOrder: 10
  },
  {
    slug: "mine-coal-ore",
    name: "Mine Coal Ore",
    section: "MINING",
    helperText: "Mining section",
    sortOrder: 20
  },
  {
    slug: "mine-zinc-ore",
    name: "Mine Zinc Ore",
    section: "MINING",
    helperText: "Mining section",
    sortOrder: 30
  },
  {
    slug: "smelt-brass",
    name: "Smelt Brass",
    section: "SMELTING",
    helperText: "Uses Copper + Zinc ores",
    sortOrder: 40
  },
  {
    slug: "smelt-copper",
    name: "Smelt Copper",
    section: "SMELTING",
    helperText: "Uses Copper + Coal ores",
    sortOrder: 50
  },
  {
    slug: "bullet-casings",
    name: "Bullet Casings",
    section: "MISCELLANEOUS",
    helperText: "Miscellaneous section",
    sortOrder: 60
  },
  {
    slug: "logistics-transit",
    name: "Logistics / Transit",
    section: "MISCELLANEOUS",
    helperText: "Miscellaneous section",
    sortOrder: 70
  },
  {
    slug: "crafting",
    name: "Crafting",
    section: "MISCELLANEOUS",
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

export async function ensureFactoryCategories() {
  await prisma.$transaction(
    FACTORY_CATEGORY_SEED.map((category) => prisma.factoryCategory.upsert({
      where: {
        slug: category.slug
      },
      update: {
        name: category.name,
        section: category.section,
        helperText: category.helperText,
        sortOrder: category.sortOrder
      },
      create: category
    }))
  );
}

export async function ensureFactoryBootstrap() {
  await ensureFactoryCategories();

  const roundCount = await prisma.factoryRound.count();

  if (roundCount > 0) {
    return;
  }

  await prisma.factoryRound.create({
    data: {
      roundNumber: 1
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

    const key = session.userId;
    const existing = perUser.get(key) || {
      userId: session.userId,
      userName: session.user?.name || "Unknown worker",
      totalMilliseconds: 0,
      activeCategoryName: ""
    };

    existing.totalMilliseconds += durationMilliseconds;

    if (!session.endedAt) {
      existing.activeCategoryName = session.category?.name || existing.activeCategoryName;
    }

    perUser.set(key, existing);
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
    categories: categories.map((category) => {
      const workers = (categoryWorkers.get(category.id) || [])
        .sort((left, right) => left.userName.localeCompare(right.userName));

      return {
        id: category.id,
        slug: category.slug,
        name: category.name,
        section: category.section,
        sectionLabel: factorySectionLabel(category.section),
        helperText: category.helperText,
        locked: category.locked,
        activeWorkers: workers,
        activeWorkerCount: workers.length,
        viewerActive: viewerActiveCategoryId === category.id
      };
    })
  };
}
