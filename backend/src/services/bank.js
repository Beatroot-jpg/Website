import { prisma } from "../db.js";

export async function getBankBalance() {
  const transactions = await prisma.bankTransaction.findMany({
    select: {
      amount: true,
      type: true
    }
  });

  const balance = transactions.reduce((sum, transaction) => {
    const amount = Number(transaction.amount);
    return transaction.type === "CREDIT" ? sum + amount : sum - amount;
  }, 0);

  return Number(balance.toFixed(2));
}
