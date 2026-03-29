import { prisma } from "../db.js";

export function getTransactionEffect(transaction) {
  const amount = Number(transaction.amount || 0);
  return transaction.type === "DEBIT" ? amount * -1 : amount;
}

export function getEntryTypeFromTransaction(transaction) {
  return transaction.type === "DEBIT" ? "SUBTRACT" : "CORRECTION";
}

export async function getBankBalances() {
  const transactions = await prisma.bankTransaction.findMany({
    select: {
      amount: true,
      type: true,
      moneyType: true
    }
  });

  const totals = transactions.reduce((sum, transaction) => {
    const effect = getTransactionEffect(transaction);

    if (transaction.moneyType === "DIRTY") {
      sum.dirty += effect;
    } else {
      sum.clean += effect;
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
