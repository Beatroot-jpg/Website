import { prisma } from "../db.js";

function isManualBalanceCorrection(transaction) {
  return ["manual", "manual_correction"].includes(transaction.sourceSystem) && transaction.type === "CREDIT";
}

export function getTransactionEffect(transaction) {
  const amount = Number(transaction.amount || 0);
  return transaction.type === "DEBIT" ? amount * -1 : amount;
}

export function getEntryTypeFromTransaction(transaction) {
  if (transaction.type === "DEBIT") {
    return "SUBTRACT";
  }

  return transaction.sourceSystem === "manual_addition" ? "ADD" : "CORRECTION";
}

export async function getBankBalances() {
  const transactions = await prisma.bankTransaction.findMany({
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" }
    ],
    select: {
      amount: true,
      type: true,
      moneyType: true,
      sourceSystem: true
    }
  });

  const totals = transactions.reduce((sum, transaction) => {
    if (transaction.moneyType === "DIRTY") {
      sum.dirty = isManualBalanceCorrection(transaction)
        ? Number(transaction.amount || 0)
        : sum.dirty + getTransactionEffect(transaction);
    } else {
      sum.clean = isManualBalanceCorrection(transaction)
        ? Number(transaction.amount || 0)
        : sum.clean + getTransactionEffect(transaction);
    }

    return sum;
  }, { clean: 0, dirty: 0 });

  const clean = Number(totals.clean.toFixed(2));
  const dirty = Number(totals.dirty.toFixed(2));

  return {
    clean,
    dirty,
    overall: Number((clean + dirty).toFixed(2))
  };
}

export async function getBankBalance() {
  const balances = await getBankBalances();
  return balances.overall;
}
