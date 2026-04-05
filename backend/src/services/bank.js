import { prisma } from "../db.js";

function isManualBalanceCorrection(transaction) {
  return ["manual", "manual_correction"].includes(transaction.sourceSystem) && transaction.type === "CREDIT";
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
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

function getMoneyBalanceKey(transaction) {
  return transaction.moneyType === "DIRTY" ? "dirty" : "clean";
}

function compareTransactions(left, right) {
  const dateDifference = new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();

  if (dateDifference !== 0) {
    return dateDifference;
  }

  return `${left.id || ""}`.localeCompare(`${right.id || ""}`);
}

export function replayBankLedger(transactions = []) {
  const balances = {
    clean: 0,
    dirty: 0
  };

  const effects = [...transactions]
    .sort(compareTransactions)
    .map((transaction) => {
      const balanceKey = getMoneyBalanceKey(transaction);
      const balanceBefore = toMoney(balances[balanceKey]);
      const rawAmount = toMoney(transaction.amount);
      const effectAmount = isManualBalanceCorrection(transaction)
        ? toMoney(rawAmount - balanceBefore)
        : toMoney(getTransactionEffect(transaction));
      const balanceAfter = isManualBalanceCorrection(transaction)
        ? rawAmount
        : toMoney(balanceBefore + effectAmount);

      balances[balanceKey] = balanceAfter;

      return {
        ...transaction,
        balanceBefore,
        balanceAfter,
        effectAmount
      };
    });

  const clean = toMoney(balances.clean);
  const dirty = toMoney(balances.dirty);

  return {
    effects,
    balances: {
      clean,
      dirty,
      overall: toMoney(clean + dirty)
    }
  };
}

export async function getBankBalances() {
  const transactions = await prisma.bankTransaction.findMany({
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" }
    ],
    select: {
      id: true,
      amount: true,
      createdAt: true,
      type: true,
      moneyType: true,
      sourceSystem: true
    }
  });

  return replayBankLedger(transactions).balances;
}

export async function getBankBalance() {
  const balances = await getBankBalances();
  return balances.overall;
}
