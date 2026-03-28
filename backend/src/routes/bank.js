import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requirePermission } from "../middleware/auth.js";
import { getBankBalance } from "../services/bank.js";
import { normalizeOptionalString, requireMoney } from "../validators.js";

const router = Router();

router.use(authenticateToken, requirePermission("BANK"));

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [balance, recentTransactions] = await Promise.all([
      getBankBalance(),
      prisma.bankTransaction.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          distribution: {
            select: {
              id: true,
              quantity: true,
              status: true,
              item: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      })
    ]);

    res.json({ balance, recentTransactions });
  })
);

router.get(
  "/transactions",
  asyncHandler(async (_req, res) => {
    const transactions = await prisma.bankTransaction.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        distribution: {
          select: {
            id: true,
            quantity: true,
            status: true,
            item: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    res.json({ transactions });
  })
);

router.post(
  "/transactions",
  asyncHandler(async (req, res) => {
    const transaction = await prisma.bankTransaction.create({
      data: {
        amount: requireMoney(req.body.amount, "Amount"),
        type: req.body.type === "DEBIT" ? "DEBIT" : "CREDIT",
        description: normalizeOptionalString(req.body.description),
        sourceSystem: "manual",
        createdById: req.user.id
      }
    });

    res.status(201).json({
      transaction,
      balance: await getBankBalance()
    });
  })
);

router.patch(
  "/transactions/:id",
  asyncHandler(async (req, res) => {
    const transaction = await prisma.bankTransaction.findUnique({
      where: { id: req.params.id }
    });

    if (!transaction) {
      throw createError(404, "Bank transaction not found.");
    }

    if (transaction.distributionId || transaction.sourceSystem !== "manual") {
      throw createError(400, "This transaction must be edited from its source system.");
    }

    const type = req.body.type !== undefined
      ? req.body.type === "DEBIT"
        ? "DEBIT"
        : req.body.type === "CREDIT"
          ? "CREDIT"
          : null
      : transaction.type;

    if (!type) {
      throw createError(400, "A valid transaction type is required.");
    }

    const updatedTransaction = await prisma.bankTransaction.update({
      where: { id: transaction.id },
      data: {
        amount: req.body.amount !== undefined
          ? requireMoney(req.body.amount, "Amount")
          : transaction.amount,
        type,
        description: req.body.description !== undefined
          ? normalizeOptionalString(req.body.description)
          : transaction.description
      }
    });

    res.json({
      transaction: updatedTransaction,
      balance: await getBankBalance()
    });
  })
);

export default router;
