import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireMoney, requireString } from "../validators.js";

const router = Router();

router.use(authenticateToken);

function serializePriceItem(item) {
  return {
    id: item.id,
    name: item.name,
    unitPrice: Number(item.unitPrice || 0),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

async function findDuplicateName(name, excludeId = "") {
  return prisma.priceListItem.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive"
      },
      ...(excludeId
        ? {
          NOT: {
            id: excludeId
          }
        }
        : {})
    }
  });
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const items = await prisma.priceListItem.findMany({
      orderBy: [{ name: "asc" }, { updatedAt: "desc" }]
    });

    res.json({
      items: items.map(serializePriceItem)
    });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const name = requireString(req.body.name, "Item name");
    const unitPrice = requireMoney(req.body.unitPrice, "Unit price");

    const duplicate = await findDuplicateName(name);

    if (duplicate) {
      throw createError(409, "That item already exists in the price list.");
    }

    const item = await prisma.priceListItem.create({
      data: {
        name,
        unitPrice
      }
    });

    res.status(201).json({
      item: serializePriceItem(item)
    });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingItem = await prisma.priceListItem.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!existingItem) {
      throw createError(404, "Price list item not found.");
    }

    const nextName = req.body.name !== undefined
      ? requireString(req.body.name, "Item name")
      : existingItem.name;
    const nextUnitPrice = req.body.unitPrice !== undefined
      ? requireMoney(req.body.unitPrice, "Unit price")
      : existingItem.unitPrice;

    const duplicate = await findDuplicateName(nextName, existingItem.id);

    if (duplicate) {
      throw createError(409, "That item already exists in the price list.");
    }

    const item = await prisma.priceListItem.update({
      where: {
        id: existingItem.id
      },
      data: {
        name: nextName,
        unitPrice: nextUnitPrice
      }
    });

    res.json({
      item: serializePriceItem(item)
    });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existingItem = await prisma.priceListItem.findUnique({
      where: {
        id: req.params.id
      }
    });

    if (!existingItem) {
      throw createError(404, "Price list item not found.");
    }

    await prisma.priceListItem.delete({
      where: {
        id: existingItem.id
      }
    });

    res.json({
      deleted: true
    });
  })
);

export default router;
