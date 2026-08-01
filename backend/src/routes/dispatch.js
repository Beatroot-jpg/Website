import { Router } from "express";

import { prisma } from "../db.js";
import { asyncHandler, createError } from "../http.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { normalizeOptionalString, requireString } from "../validators.js";

const router = Router();
const DIRTY_MONEY_ID = "dirty-money";
const REGISTER_PAGE_SIZE = 25;
const LEDGER_PAGE_SIZE = 10;
const AUDIT_PAGE_SIZE = 10;
const REVERSIBLE_ACTIONS = new Set([
  "CONTACT_CREATED",
  "CONTACT_UPDATED",
  "DISPATCH_CREATED",
  "DISPATCH_UPDATED",
  "PAYMENT_RECORDED",
  "DISPATCH_VOIDED",
  "PAYMENTS_DEPOSITED"
]);

function requireWhole(value, label, { positive = false } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || (positive && parsed === 0)) {
    throw createError(400, `${label} must be a whole number${positive ? " greater than zero" : " that is zero or greater"}.`);
  }
  return parsed;
}

function requireMoney(value, label, { positive = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (positive && parsed === 0)) {
    throw createError(400, `${label} must be ${positive ? "greater than zero" : "zero or greater"}.`);
  }
  return parsed.toFixed(2);
}

function saleType(value) {
  const normalized = `${value ?? ""}`.trim().toUpperCase();
  if (!["PAID_UPFRONT", "ON_CREDIT"].includes(normalized)) {
    throw createError(400, "Choose paid upfront or on credit.");
  }
  return normalized;
}

function dueDate(value, required = false) {
  const raw = `${value ?? ""}`.trim();
  if (!raw) {
    if (required) throw createError(400, "On-credit dispatches need a due date.");
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw createError(400, "Use a valid due date.");
  const parsed = new Date(`${raw}T23:59:59.999+11:00`);
  if (Number.isNaN(parsed.getTime())) throw createError(400, "Use a valid due date.");
  return parsed;
}

function totalFor(quantity, unitPrice) {
  return (Number(quantity) * Number(unitPrice)).toFixed(2);
}

function storedStatus(totalOwed, totalPaid, status = "ACTIVE") {
  if (status === "VOIDED") return "VOIDED";
  if (Number(totalPaid) >= Number(totalOwed)) return "PAID";
  return Number(totalPaid) > 0 ? "PARTIAL" : "ACTIVE";
}

function displayStatus(record) {
  if (record.status === "VOIDED") return "VOIDED";
  if (Number(record.totalPaid) >= Number(record.totalOwed)) return "PAID";
  if (record.dueDate && new Date(record.dueDate).getTime() < Date.now()) return "OVERDUE";
  return Number(record.totalPaid) > 0 ? "PARTIAL" : "ACTIVE";
}

function inventorySnapshot(item) {
  return {
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    reorderLevel: item.reorderLevel,
    unit: item.unit,
    internalPrice: item.internalPrice.toString(),
    externalPrice: item.externalPrice.toString(),
    archived: Boolean(item.archived)
  };
}

function recordSnapshot(record) {
  return {
    id: record.id,
    contactId: record.contactId,
    contactName: record.contactName,
    contactPhone: record.contactPhone,
    inventoryItemId: record.inventoryItemId,
    itemName: record.itemName,
    unit: record.unit,
    quantity: record.quantity,
    unitPrice: record.unitPrice.toString(),
    totalOwed: record.totalOwed.toString(),
    totalPaid: record.totalPaid.toString(),
    saleType: record.saleType,
    status: record.status,
    dueDate: record.dueDate?.toISOString() || null,
    notes: record.notes
  };
}

function paymentSnapshot(payment) {
  return {
    id: payment.id,
    dispatchId: payment.dispatchId,
    amount: payment.amount.toString(),
    note: payment.note,
    status: payment.status,
    depositId: payment.depositId,
    createdAt: payment.createdAt.toISOString()
  };
}

function serializeRecord(record, isAdmin) {
  const serialized = {
    id: record.id,
    contactName: record.contactName,
    itemName: record.itemName,
    unit: record.unit,
    quantity: record.quantity,
    saleType: record.saleType,
    status: displayStatus(record),
    dueDate: record.dueDate,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
  if (isAdmin) {
    Object.assign(serialized, {
      contactId: record.contactId,
      contactPhone: record.contactPhone,
      inventoryItemId: record.inventoryItemId,
      unitPrice: record.unitPrice.toString(),
      totalOwed: record.totalOwed.toString(),
      totalPaid: record.totalPaid.toString(),
      balance: record.status === "VOIDED" ? "0.00" : Math.max(0, Number(record.totalOwed) - Number(record.totalPaid)).toFixed(2),
      notes: record.notes
    });
  }
  return serialized;
}

function serializePayment(payment) {
  return {
    id: payment.id,
    dispatchId: payment.dispatchId,
    amount: payment.amount.toString(),
    note: payment.note,
    status: payment.status,
    depositId: payment.depositId,
    depositedAt: payment.depositedAt,
    recordedByName: payment.recordedByName || "System",
    createdAt: payment.createdAt,
    dispatch: payment.dispatch ? {
      id: payment.dispatch.id,
      contactName: payment.dispatch.contactName,
      itemName: payment.dispatch.itemName,
      unit: payment.dispatch.unit
    } : null
  };
}

function serializeAudit(entry) {
  return {
    id: entry.id,
    action: entry.action,
    summary: entry.summary,
    actorName: entry.actorName || "System",
    createdAt: entry.createdAt,
    revertedAt: entry.revertedAt,
    revertedByName: entry.revertedByName,
    canRevert: REVERSIBLE_ACTIONS.has(entry.action) && !entry.revertedAt
  };
}

async function audit(database, { actor, action, entityType, entityId = null, summary, before = null, after = null }) {
  return database.dispatchAuditLog.create({
    data: {
      actorId: actor?.id || null,
      actorName: actor?.name || "System",
      action,
      entityType,
      entityId,
      summary,
      before,
      after
    }
  });
}

async function inventoryAudit(database, { actor, action, entityType, entityId, summary, before, after }) {
  return database.inventoryAuditLog.create({
    data: {
      actorId: actor?.id || null,
      actorName: actor?.name || "System",
      action,
      entityType,
      entityId,
      summary,
      before,
      after
    }
  });
}

async function dirtyAccount(database) {
  return database.inventoryDirtyMoneyAccount.upsert({
    where: { id: DIRTY_MONEY_ID },
    update: {},
    create: { id: DIRTY_MONEY_ID, amount: 0 }
  });
}

function registerWhere(scope, search) {
  const filters = [];
  if (scope === "OPEN") filters.push({ status: { in: ["ACTIVE", "PARTIAL"] } });
  if (scope === "OVERDUE") {
    filters.push({ status: { in: ["ACTIVE", "PARTIAL"] } });
    filters.push({ dueDate: { lt: new Date() } });
  }
  if (scope === "PAID") filters.push({ status: "PAID" });
  if (scope === "VOIDED") filters.push({ status: "VOIDED" });
  if (search) {
    filters.push({ OR: [
      { contactName: { contains: search, mode: "insensitive" } },
      { itemName: { contains: search, mode: "insensitive" } }
    ] });
  }
  return filters.length ? { AND: filters } : {};
}

function scope(value) {
  const normalized = `${value ?? "OPEN"}`.trim().toUpperCase();
  if (!["OPEN", "OVERDUE", "PAID", "VOIDED", "ALL"].includes(normalized)) {
    throw createError(400, "Choose a valid Dispatch filter.");
  }
  return normalized;
}
router.get(
  "/",
  authenticateToken,
  asyncHandler(async (req, res) => {
    const isAdmin = req.user.role === "ADMIN";
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const selectedScope = scope(req.query.scope);
    const search = normalizeOptionalString(req.query.search);
    const where = registerWhere(selectedScope, search);
    const [total, records] = await Promise.all([
      prisma.dispatchRecord.count({ where }),
      prisma.dispatchRecord.findMany({
        where,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * REGISTER_PAGE_SIZE,
        take: REGISTER_PAGE_SIZE
      })
    ]);

    res.json({
      records: records.map((record) => serializeRecord(record, isAdmin)),
      page,
      pageSize: REGISTER_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / REGISTER_PAGE_SIZE)),
      viewer: { isLoggedIn: true, isAdmin }
    });
  })
);

router.get(
  "/contacts",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const includeInactive = `${req.query.includeInactive ?? ""}`.toLowerCase() === "true";
    const contacts = await prisma.dispatchContact.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
    const contactIds = contacts.map((contact) => contact.id);
    const records = contactIds.length
      ? await prisma.dispatchRecord.findMany({
        where: { contactId: { in: contactIds } },
        select: { contactId: true, status: true, totalOwed: true, totalPaid: true }
      })
      : [];

    const serialized = contacts.map((contact) => {
      const active = records.filter((record) => record.contactId === contact.id && ["ACTIVE", "PARTIAL"].includes(record.status));
      const outstanding = active.reduce((sum, record) => sum + Math.max(0, Number(record.totalOwed) - Number(record.totalPaid)), 0);
      return {
        id: contact.id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        active: contact.active,
        notes: contact.notes,
        activeDispatchCount: active.length,
        outstanding: outstanding.toFixed(2),
        updatedAt: contact.updatedAt
      };
    });

    res.json({ contacts: serialized });
  })
);

router.post(
  "/contacts",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = requireString(req.body.name, "Name");
    const phoneNumber = requireString(req.body.phoneNumber, "Phone number");
    const notes = normalizeOptionalString(req.body.notes);

    const contact = await prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.dispatchContact.findUnique({ where: { phoneNumber } });
      if (duplicate) throw createError(409, "A phonebook contact already uses that number.");

      const created = await transaction.dispatchContact.create({
        data: { name, phoneNumber, notes, active: true }
      });
      await audit(transaction, {
        actor: req.user,
        action: "CONTACT_CREATED",
        entityType: "DISPATCH_CONTACT",
        entityId: created.id,
        summary: `${req.user.name} added ${created.name} to the Dispatch phonebook.`,
        after: { id: created.id, name, phoneNumber, notes, active: true }
      });
      return created;
    });

    res.status(201).json({ contact });
  })
);

router.patch(
  "/contacts/:id",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.dispatchContact.findUnique({ where: { id: req.params.id } });
    if (!existing) throw createError(404, "Phonebook contact not found.");

    const data = {};
    if (req.body.name !== undefined) data.name = requireString(req.body.name, "Name");
    if (req.body.phoneNumber !== undefined) data.phoneNumber = requireString(req.body.phoneNumber, "Phone number");
    if (req.body.notes !== undefined) data.notes = normalizeOptionalString(req.body.notes);
    if (req.body.active !== undefined) data.active = Boolean(req.body.active);
    if (!Object.keys(data).length) throw createError(400, "Choose a phonebook value to update.");

    const contact = await prisma.$transaction(async (transaction) => {
      if (data.phoneNumber && data.phoneNumber !== existing.phoneNumber) {
        const duplicate = await transaction.dispatchContact.findUnique({ where: { phoneNumber: data.phoneNumber } });
        if (duplicate) throw createError(409, "A phonebook contact already uses that number.");
      }
      const updated = await transaction.dispatchContact.update({ where: { id: existing.id }, data });
      await audit(transaction, {
        actor: req.user,
        action: "CONTACT_UPDATED",
        entityType: "DISPATCH_CONTACT",
        entityId: updated.id,
        summary: `${req.user.name} updated phonebook contact ${updated.name}.`,
        before: { name: existing.name, phoneNumber: existing.phoneNumber, notes: existing.notes, active: existing.active },
        after: { name: updated.name, phoneNumber: updated.phoneNumber, notes: updated.notes, active: updated.active }
      });
      return updated;
    });

    res.json({ contact });
  })
);

router.post(
  "/records",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const contactId = requireString(req.body.contactId, "Phonebook contact");
    const inventoryItemId = requireString(req.body.inventoryItemId, "Inventory item");
    const quantity = requireWhole(req.body.quantity, "Quantity", { positive: true });
    const unitPrice = requireMoney(req.body.unitPrice, "Unit price");
    const paymentType = saleType(req.body.saleType);
    const repaymentDue = dueDate(req.body.dueDate, paymentType === "ON_CREDIT");
    const notes = normalizeOptionalString(req.body.notes);
    const totalOwed = totalFor(quantity, unitPrice);

    const record = await prisma.$transaction(async (transaction) => {
      const [contact, item] = await Promise.all([
        transaction.dispatchContact.findFirst({ where: { id: contactId, active: true } }),
        transaction.inventoryItem.findFirst({ where: { id: inventoryItemId, archived: false } })
      ]);
      if (!contact) throw createError(404, "Choose an active phonebook contact.");
      if (!item) throw createError(404, "Inventory item not found.");

      // The conditional write is the source of truth: two releases cannot both use the same stock.
      const stockClaim = await transaction.inventoryItem.updateMany({
        where: { id: item.id, archived: false, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } }
      });
      if (stockClaim.count !== 1) {
        throw createError(409, "Stock changed before this dispatch could be released. Refresh and try again.");
      }
      const updatedItem = await transaction.inventoryItem.findUnique({ where: { id: item.id } });
      if (!updatedItem) throw createError(409, "Inventory item is no longer available.");
      await transaction.inventoryMovement.create({
        data: {
          itemId: item.id,
          quantityDelta: -quantity,
          type: "DISTRIBUTED",
          reason: `Dispatch to ${contact.name}`
        }
      });
      const created = await transaction.dispatchRecord.create({
        data: {
          contactId: contact.id,
          contactName: contact.name,
          contactPhone: contact.phoneNumber,
          inventoryItemId: item.id,
          itemName: item.name,
          unit: item.unit,
          quantity,
          unitPrice,
          totalOwed,
          totalPaid: paymentType === "PAID_UPFRONT" ? totalOwed : "0.00",
          saleType: paymentType,
          status: paymentType === "PAID_UPFRONT" ? "PAID" : "ACTIVE",
          dueDate: repaymentDue,
          notes,
          createdById: req.user.id,
          createdByName: req.user.name
        }
      });
      let upfrontPayment = null;
      if (paymentType === "PAID_UPFRONT") {
        upfrontPayment = await transaction.dispatchPayment.create({
          data: {
            dispatchId: created.id,
            amount: totalOwed,
            note: "Paid upfront at dispatch.",
            recordedById: req.user.id,
            recordedByName: req.user.name
          }
        });
      }

      await audit(transaction, {
        actor: req.user,
        action: "DISPATCH_CREATED",
        entityType: "DISPATCH_RECORD",
        entityId: created.id,
        summary: `${req.user.name} created a ${paymentType === "PAID_UPFRONT" ? "paid-upfront" : "credit"} dispatch for ${contact.name}.`,
        after: { record: recordSnapshot(created), upfrontPayment: upfrontPayment ? paymentSnapshot(upfrontPayment) : null }
      });
      await inventoryAudit(transaction, {
        actor: req.user,
        action: "DISPATCH_STOCK_RELEASED",
        entityType: "INVENTORY_ITEM",
        entityId: item.id,
        summary: `${req.user.name} released ${quantity} ${item.unit} of ${item.name} through Dispatch.`,
        before: inventorySnapshot(item),
        after: inventorySnapshot(updatedItem)
      });
      return created;
    });

    res.status(201).json({ record: serializeRecord(record, true) });
  })
);

router.patch(
  "/records/:id",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.dispatchRecord.findUnique({ where: { id: req.params.id } });
    if (!existing) throw createError(404, "Dispatch record not found.");
    if (existing.status === "VOIDED") throw createError(409, "Voided dispatches cannot be edited.");

    const data = {};
    if (req.body.notes !== undefined) data.notes = normalizeOptionalString(req.body.notes);
    if (req.body.dueDate !== undefined) data.dueDate = dueDate(req.body.dueDate, existing.saleType === "ON_CREDIT");
    if (req.body.unitPrice !== undefined) {
      data.unitPrice = requireMoney(req.body.unitPrice, "Unit price");
      data.totalOwed = totalFor(existing.quantity, data.unitPrice);
      if (Number(data.totalOwed) < Number(existing.totalPaid)) {
        throw createError(400, "The new total cannot be less than payments already collected.");
      }
      data.status = storedStatus(data.totalOwed, existing.totalPaid, existing.status);
    }
    if (!Object.keys(data).length) throw createError(400, "Choose a dispatch value to update.");

    const record = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.dispatchRecord.update({ where: { id: existing.id }, data });
      await audit(transaction, {
        actor: req.user,
        action: "DISPATCH_UPDATED",
        entityType: "DISPATCH_RECORD",
        entityId: updated.id,
        summary: `${req.user.name} updated dispatch ${updated.itemName} for ${updated.contactName}.`,
        before: recordSnapshot(existing),
        after: recordSnapshot(updated)
      });
      return updated;
    });
    res.json({ record: serializeRecord(record, true) });
  })
);

router.post(
  "/records/:id/payments",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const amount = requireMoney(req.body.amount, "Payment amount", { positive: true });
    const note = normalizeOptionalString(req.body.note);

    const result = await prisma.$transaction(async (transaction) => {
      const record = await transaction.dispatchRecord.findUnique({ where: { id: req.params.id } });
      if (!record) throw createError(404, "Dispatch record not found.");
      if (record.status === "VOIDED" || Number(record.totalPaid) >= Number(record.totalOwed)) {
        throw createError(409, "This dispatch cannot receive another payment.");
      }
      const balance = Number(record.totalOwed) - Number(record.totalPaid);
      if (Number(amount) > balance) throw createError(400, "Payment cannot exceed the remaining balance.");

      const nextPaid = (Number(record.totalPaid) + Number(amount)).toFixed(2);
      const updated = await transaction.dispatchRecord.update({
        where: { id: record.id },
        data: { totalPaid: nextPaid, status: storedStatus(record.totalOwed, nextPaid, record.status) }
      });
      const payment = await transaction.dispatchPayment.create({
        data: {
          dispatchId: record.id,
          amount,
          note,
          recordedById: req.user.id,
          recordedByName: req.user.name
        }
      });
      await audit(transaction, {
        actor: req.user,
        action: "PAYMENT_RECORDED",
        entityType: "DISPATCH_RECORD",
        entityId: record.id,
        summary: `${req.user.name} recorded ${amount} against ${record.contactName}'s dispatch.`,
        before: recordSnapshot(record),
        after: { record: recordSnapshot(updated), payment: paymentSnapshot(payment) }
      });
      return { record: updated, payment };
    });

    res.status(201).json({ record: serializeRecord(result.record, true), payment: serializePayment(result.payment) });
  })
);

router.post(
  "/records/:id/void",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const returnStock = Boolean(req.body.returnStock);
    const note = normalizeOptionalString(req.body.note);

    const record = await prisma.$transaction(async (transaction) => {
      const current = await transaction.dispatchRecord.findUnique({
        where: { id: req.params.id },
        include: { payments: true }
      });
      if (!current) throw createError(404, "Dispatch record not found.");
      if (current.status === "VOIDED") throw createError(409, "This dispatch is already voided.");
      if (current.payments.some((payment) => payment.status === "DEPOSITED")) {
        throw createError(409, "Revert the deposit before voiding this dispatch.");
      }

      let inventoryBefore = null;
      let inventoryAfter = null;
      if (returnStock) {
        const item = current.inventoryItemId
          ? await transaction.inventoryItem.findFirst({ where: { id: current.inventoryItemId, archived: false } })
          : null;
        if (!item) throw createError(409, "The original Inventory listing no longer exists, so stock cannot be returned automatically.");
        inventoryBefore = inventorySnapshot(item);
        const updatedItem = await transaction.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: { increment: current.quantity } }
        });
        inventoryAfter = inventorySnapshot(updatedItem);
        await transaction.inventoryMovement.create({
          data: {
            itemId: item.id,
            quantityDelta: current.quantity,
            type: "CORRECTION",
            reason: `Dispatch void for ${current.contactName}`
          }
        });
      }

      await transaction.dispatchPayment.updateMany({
        where: { dispatchId: current.id, status: "PENDING_DEPOSIT" },
        data: { status: "VOIDED" }
      });
      const voidClaim = await transaction.dispatchRecord.updateMany({
        where: {
          id: current.id,
          status: { not: "VOIDED" },
          payments: { none: { status: "DEPOSITED" } }
        },
        data: { status: "VOIDED", notes: note || current.notes }
      });
      if (voidClaim.count !== 1) {
        throw createError(409, "A payment was deposited while this dispatch was being voided. Refresh and try again.");
      }
      const updated = await transaction.dispatchRecord.findUnique({ where: { id: current.id } });
      if (!updated) throw createError(409, "Dispatch record is no longer available.");
      await audit(transaction, {
        actor: req.user,
        action: "DISPATCH_VOIDED",
        entityType: "DISPATCH_RECORD",
        entityId: current.id,
        summary: `${req.user.name} voided ${current.itemName} for ${current.contactName}.${returnStock ? " Stock was returned." : ""}`,
        before: { record: recordSnapshot(current), payments: current.payments.map(paymentSnapshot) },
        after: { returnStock, note, inventoryBefore, inventoryAfter }
      });
      if (inventoryBefore && inventoryAfter) {
        await inventoryAudit(transaction, {
          actor: req.user,
          action: "DISPATCH_STOCK_RETURNED",
          entityType: "INVENTORY_ITEM",
          entityId: inventoryBefore.id,
          summary: `${req.user.name} returned ${current.quantity} ${current.unit} of ${current.itemName} from a voided dispatch.`,
          before: inventoryBefore,
          after: inventoryAfter
        });
      }
      return updated;
    });

    res.json({ record: serializeRecord(record, true) });
  })
);

router.get(
  "/collections",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const where = { status: "PENDING_DEPOSIT" };
    const [total, payments] = await Promise.all([
      prisma.dispatchPayment.count({ where }),
      prisma.dispatchPayment.findMany({
        where,
        include: { dispatch: true },
        orderBy: { createdAt: "asc" },
        skip: (page - 1) * LEDGER_PAGE_SIZE,
        take: LEDGER_PAGE_SIZE
      })
    ]);
    res.json({
      payments: payments.map(serializePayment),
      page,
      pageSize: LEDGER_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE))
    });
  })
);

router.post(
  "/collections/deposit",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const paymentIds = [...new Set(Array.isArray(req.body.paymentIds) ? req.body.paymentIds : [])]
      .map((id) => `${id ?? ""}`.trim())
      .filter(Boolean);
    if (!paymentIds.length) throw createError(400, "Choose at least one collection to deposit.");

    const result = await prisma.$transaction(async (transaction) => {
      const payments = await transaction.dispatchPayment.findMany({
        where: {
          id: { in: paymentIds },
          status: "PENDING_DEPOSIT",
          dispatch: { status: { not: "VOIDED" } }
        },
        include: { dispatch: true }
      });
      if (payments.length !== paymentIds.length) {
        throw createError(409, "One or more selected collections are no longer pending deposit.");
      }

      const amount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0).toFixed(2);
      const deposit = await transaction.dispatchDeposit.create({
        data: {
          amount,
          paymentCount: payments.length,
          depositedById: req.user.id,
          depositedByName: req.user.name
        }
      });
      const depositedAt = new Date();
      const paymentClaim = await transaction.dispatchPayment.updateMany({
        where: {
          id: { in: paymentIds },
          status: "PENDING_DEPOSIT",
          dispatch: { status: { not: "VOIDED" } }
        },
        data: { status: "DEPOSITED", depositId: deposit.id, depositedAt }
      });
      if (paymentClaim.count !== payments.length) {
        throw createError(409, "One or more selected collections are no longer pending deposit.");
      }

      const account = await dirtyAccount(transaction);
      const updatedAccount = await transaction.inventoryDirtyMoneyAccount.update({
        where: { id: DIRTY_MONEY_ID },
        data: { amount: { increment: Number(amount) } }
      });
      const moneyAudit = await inventoryAudit(transaction, {
        actor: req.user,
        action: "DISPATCH_DEPOSIT",
        entityType: "DIRTY_MONEY",
        entityId: DIRTY_MONEY_ID,
        summary: `${req.user.name} deposited ${amount} from the Dispatch collection ledger.`,
        before: { amount: account.amount.toString() },
        after: { amount: updatedAccount.amount.toString(), paymentIds }
      });
      await transaction.dispatchDeposit.update({
        where: { id: deposit.id },
        data: { inventoryAuditLogId: moneyAudit.id }
      });
      await audit(transaction, {
        actor: req.user,
        action: "PAYMENTS_DEPOSITED",
        entityType: "DISPATCH_DEPOSIT",
        entityId: deposit.id,
        summary: `${req.user.name} deposited ${payments.length} collection ${payments.length === 1 ? "entry" : "entries"} totalling ${amount}.`,
        before: { amount: account.amount.toString(), paymentIds },
        after: { depositId: deposit.id, amount, paymentIds, dirtyMoney: updatedAccount.amount.toString() }
      });
      return { deposit, dirtyMoney: updatedAccount.amount.toString() };
    });

    res.json({ message: `${result.deposit.paymentCount} collection entries deposited.`, dirtyMoney: result.dirtyMoney });
  })
);

router.get(
  "/audit",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const [total, entries] = await Promise.all([
      prisma.dispatchAuditLog.count(),
      prisma.dispatchAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * AUDIT_PAGE_SIZE,
        take: AUDIT_PAGE_SIZE
      })
    ]);
    res.json({
      entries: entries.map(serializeAudit),
      page,
      pageSize: AUDIT_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))
    });
  })
);

async function assertRevertable(database, entry) {
  if (!REVERSIBLE_ACTIONS.has(entry.action) || entry.revertedAt) {
    throw createError(409, "This action cannot be reverted.");
  }
  const newer = await database.dispatchAuditLog.findFirst({
    where: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      createdAt: { gt: entry.createdAt },
      revertedAt: null
    },
    orderBy: { createdAt: "desc" }
  });
  if (newer) throw createError(409, "This action has a newer change. Revert the newer action first.");
}

async function reverseCreatedDispatch(transaction, entry, actor) {
  const record = await transaction.dispatchRecord.findUnique({
    where: { id: entry.entityId },
    include: { payments: true }
  });
  if (!record) throw createError(409, "This dispatch no longer exists.");
  if (record.payments.some((payment) => payment.status === "DEPOSITED")) {
    throw createError(409, "Revert the deposit before reverting this dispatch.");
  }
  const item = record.inventoryItemId
    ? await transaction.inventoryItem.findFirst({ where: { id: record.inventoryItemId, archived: false } })
    : null;
  if (!item) throw createError(409, "The original Inventory listing no longer exists, so stock cannot be restored automatically.");

  const updatedItem = await transaction.inventoryItem.update({
    where: { id: item.id },
    data: { quantity: { increment: record.quantity } }
  });
  await transaction.inventoryMovement.create({
    data: {
      itemId: item.id,
      quantityDelta: record.quantity,
      type: "CORRECTION",
      reason: "Dispatch creation reverted"
    }
  });
  await transaction.dispatchRecord.delete({ where: { id: record.id } });
  await inventoryAudit(transaction, {
    actor,
    action: "DISPATCH_STOCK_RELEASE_REVERTED",
    entityType: "INVENTORY_ITEM",
    entityId: item.id,
    summary: `${actor.name} reverted a Dispatch stock release for ${record.itemName}.`,
    before: inventorySnapshot(item),
    after: inventorySnapshot(updatedItem)
  });
  return { action: "DISPATCH_CREATION_REVERTED", before: recordSnapshot(record), after: null };
}

async function reverseUpdatedDispatch(transaction, entry) {
  const record = await transaction.dispatchRecord.findUnique({ where: { id: entry.entityId } });
  const saved = entry.before;
  if (!record || !saved) throw createError(409, "This dispatch no longer exists.");
  const restored = await transaction.dispatchRecord.update({
    where: { id: record.id },
    data: {
      unitPrice: requireMoney(saved.unitPrice, "Saved unit price"),
      totalOwed: requireMoney(saved.totalOwed, "Saved total"),
      totalPaid: requireMoney(saved.totalPaid, "Saved paid total"),
      status: saved.status,
      dueDate: saved.dueDate ? new Date(saved.dueDate) : null,
      notes: normalizeOptionalString(saved.notes)
    }
  });
  return { action: "DISPATCH_UPDATE_REVERTED", before: recordSnapshot(record), after: recordSnapshot(restored) };
}

async function reversePayment(transaction, entry) {
  const paymentId = entry.after?.payment?.id;
  const [record, payment] = await Promise.all([
    transaction.dispatchRecord.findUnique({ where: { id: entry.entityId } }),
    paymentId ? transaction.dispatchPayment.findUnique({ where: { id: paymentId } }) : null
  ]);
  if (!record || !payment) throw createError(409, "This payment can no longer be reverted.");
  if (payment.status !== "PENDING_DEPOSIT") throw createError(409, "Revert the deposit before reverting this payment.");

  const nextPaid = Math.max(0, Number(record.totalPaid) - Number(payment.amount)).toFixed(2);
  const updated = await transaction.dispatchRecord.update({
    where: { id: record.id },
    data: { totalPaid: nextPaid, status: storedStatus(record.totalOwed, nextPaid, record.status) }
  });
  await transaction.dispatchPayment.delete({ where: { id: payment.id } });
  return {
    action: "PAYMENT_REVERTED",
    before: { record: recordSnapshot(record), payment: paymentSnapshot(payment) },
    after: recordSnapshot(updated)
  };
}

async function reverseContact(transaction, entry) {
  if (entry.action === "CONTACT_CREATED") {
    const contact = await transaction.dispatchContact.findUnique({ where: { id: entry.entityId } });
    if (!contact) throw createError(409, "This phonebook contact no longer exists.");
    await transaction.dispatchContact.delete({ where: { id: contact.id } });
    return {
      action: "CONTACT_CREATION_REVERTED",
      before: { id: contact.id, name: contact.name, phoneNumber: contact.phoneNumber, notes: contact.notes, active: contact.active },
      after: null
    };
  }

  const contact = await transaction.dispatchContact.findUnique({ where: { id: entry.entityId } });
  const saved = entry.before;
  if (!contact || !saved) throw createError(409, "This phonebook change can no longer be reverted.");
  if (saved.phoneNumber !== contact.phoneNumber) {
    const duplicate = await transaction.dispatchContact.findUnique({ where: { phoneNumber: saved.phoneNumber } });
    if (duplicate && duplicate.id !== contact.id) throw createError(409, "The saved phone number is now used by another contact.");
  }
  const restored = await transaction.dispatchContact.update({
    where: { id: contact.id },
    data: {
      name: requireString(saved.name, "Saved name"),
      phoneNumber: requireString(saved.phoneNumber, "Saved phone number"),
      notes: normalizeOptionalString(saved.notes),
      active: Boolean(saved.active)
    }
  });
  return {
    action: "CONTACT_UPDATE_REVERTED",
    before: { name: contact.name, phoneNumber: contact.phoneNumber, notes: contact.notes, active: contact.active },
    after: { name: restored.name, phoneNumber: restored.phoneNumber, notes: restored.notes, active: restored.active }
  };
}

async function reverseVoid(transaction, entry, actor) {
  const saved = entry.before;
  const record = await transaction.dispatchRecord.findUnique({ where: { id: entry.entityId } });
  if (!saved?.record || !record) throw createError(409, "This voided dispatch can no longer be reverted.");

  if (entry.after?.returnStock) {
    const itemId = saved.record.inventoryItemId;
    const item = itemId ? await transaction.inventoryItem.findFirst({ where: { id: itemId, archived: false } }) : null;
    if (!item) {
      throw createError(409, "The returned stock is no longer available to remove automatically.");
    }
    const stockClaim = await transaction.inventoryItem.updateMany({
      where: {
        id: item.id,
        archived: false,
        quantity: { gte: Number(saved.record.quantity) }
      },
      data: { quantity: { decrement: Number(saved.record.quantity) } }
    });
    if (stockClaim.count !== 1) {
      throw createError(409, "Stock changed before this return could be reversed. Refresh and try again.");
    }
    const updatedItem = await transaction.inventoryItem.findUnique({ where: { id: item.id } });
    if (!updatedItem) throw createError(409, "Inventory item is no longer available.");
    await transaction.inventoryMovement.create({
      data: {
        itemId: item.id,
        quantityDelta: -Number(saved.record.quantity),
        type: "CORRECTION",
        reason: "Dispatch void reverted"
      }
    });
    await inventoryAudit(transaction, {
      actor,
      action: "DISPATCH_STOCK_RETURN_REVERTED",
      entityType: "INVENTORY_ITEM",
      entityId: item.id,
      summary: `${actor.name} reverted a returned Dispatch stock entry for ${saved.record.itemName}.`,
      before: inventorySnapshot(item),
      after: inventorySnapshot(updatedItem)
    });
  }

  const restored = await transaction.dispatchRecord.update({
    where: { id: record.id },
    data: {
      unitPrice: requireMoney(saved.record.unitPrice, "Saved unit price"),
      totalOwed: requireMoney(saved.record.totalOwed, "Saved total"),
      totalPaid: requireMoney(saved.record.totalPaid, "Saved paid total"),
      status: saved.record.status,
      dueDate: saved.record.dueDate ? new Date(saved.record.dueDate) : null,
      notes: normalizeOptionalString(saved.record.notes)
    }
  });
  for (const payment of saved.payments || []) {
    await transaction.dispatchPayment.update({
      where: { id: payment.id },
      data: { status: payment.status }
    });
  }
  return { action: "DISPATCH_VOID_REVERTED", before: recordSnapshot(record), after: recordSnapshot(restored) };
}

async function reverseDeposit(transaction, entry, actor) {
  const depositId = entry.after?.depositId;
  const deposit = depositId ? await transaction.dispatchDeposit.findUnique({ where: { id: depositId } }) : null;
  if (!deposit || deposit.revertedAt) throw createError(409, "This deposit can no longer be reverted.");

  const moneyAudit = deposit.inventoryAuditLogId
    ? await transaction.inventoryAuditLog.findUnique({ where: { id: deposit.inventoryAuditLogId } })
    : null;
  if (!moneyAudit) throw createError(409, "The linked Dirty Money audit entry is unavailable.");
  const laterMoneyAction = await transaction.inventoryAuditLog.findFirst({
    where: {
      entityType: "DIRTY_MONEY",
      entityId: DIRTY_MONEY_ID,
      createdAt: { gt: moneyAudit.createdAt },
      revertedAt: null
    }
  });
  if (laterMoneyAction) throw createError(409, "A newer Dirty Money change exists. Resolve it before reverting this deposit.");

  const account = await dirtyAccount(transaction);
  if (Number(account.amount) < Number(deposit.amount)) {
    throw createError(409, "Dirty Money is lower than this deposit, so it cannot be safely reverted.");
  }
  const updatedAccount = await transaction.inventoryDirtyMoneyAccount.update({
    where: { id: DIRTY_MONEY_ID },
    data: { amount: { decrement: Number(deposit.amount) } }
  });
  await transaction.dispatchPayment.updateMany({
    where: { depositId: deposit.id },
    data: { status: "PENDING_DEPOSIT", depositId: null, depositedAt: null }
  });
  await transaction.dispatchDeposit.update({
    where: { id: deposit.id },
    data: { revertedAt: new Date(), revertedById: actor.id, revertedByName: actor.name }
  });
  await inventoryAudit(transaction, {
    actor,
    action: "DISPATCH_DEPOSIT_REVERTED",
    entityType: "DIRTY_MONEY",
    entityId: DIRTY_MONEY_ID,
    summary: `${actor.name} reverted a Dispatch deposit of ${deposit.amount.toString()}.`,
    before: { amount: account.amount.toString(), depositId: deposit.id },
    after: { amount: updatedAccount.amount.toString(), depositId: deposit.id }
  });
  return {
    action: "DISPATCH_DEPOSIT_REVERTED",
    before: { amount: account.amount.toString(), depositId: deposit.id },
    after: { amount: updatedAccount.amount.toString(), depositId: deposit.id }
  };
}

router.post(
  "/audit/:id/revert",
  authenticateToken,
  requireAdmin,
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (transaction) => {
      const entry = await transaction.dispatchAuditLog.findUnique({ where: { id: req.params.id } });
      if (!entry) throw createError(404, "Dispatch audit action not found.");
      await assertRevertable(transaction, entry);

      let reversal;
      if (["CONTACT_CREATED", "CONTACT_UPDATED"].includes(entry.action)) reversal = await reverseContact(transaction, entry);
      else if (entry.action === "DISPATCH_CREATED") reversal = await reverseCreatedDispatch(transaction, entry, req.user);
      else if (entry.action === "DISPATCH_UPDATED") reversal = await reverseUpdatedDispatch(transaction, entry);
      else if (entry.action === "PAYMENT_RECORDED") reversal = await reversePayment(transaction, entry);
      else if (entry.action === "DISPATCH_VOIDED") reversal = await reverseVoid(transaction, entry, req.user);
      else if (entry.action === "PAYMENTS_DEPOSITED") reversal = await reverseDeposit(transaction, entry, req.user);
      else throw createError(409, "This action cannot be reverted.");

      const reversalAudit = await audit(transaction, {
        actor: req.user,
        action: reversal.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: `${req.user.name} reverted: ${entry.summary}`,
        before: reversal.before,
        after: reversal.after
      });
      await transaction.dispatchAuditLog.update({
        where: { id: entry.id },
        data: {
          revertedAt: new Date(),
          revertedById: req.user.id,
          revertedByName: req.user.name,
          reversalAuditId: reversalAudit.id
        }
      });
    });

    res.json({ message: "Dispatch action reverted." });
  })
);

export default router;
