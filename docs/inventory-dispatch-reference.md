# Inventory and Dispatch Page Blueprint

## Purpose
Use this as the working thesis for the next page. Inventory and Dispatch establish the current standard: a focused page does one job, shows the most useful information first, hides sensitive controls by default, and makes every consequential action recoverable.

## Shared Product Rules

### Information hierarchy
1. Put the page's live register or main number first.
2. Keep the first container focused on viewing and understanding the current state.
3. Move management tools below the primary register.
4. Put audit, backup, and recovery tools last.
5. Do not make people scroll through permanent forms to understand the page.

### Visual language
- Dense but readable desktop-first layouts for `1920x1080` and `2560x1440`.
- Square or lightly rounded charcoal/grey cards with strong gold headings.
- White body text, muted grey helper text, and gold only for important numbers, headings, or affirmative actions.
- One major container per row; related tools may live inside that container.
- Use table rows for registers, not stacks of mini-cards.
- Keep dangerous actions red and visually separated from normal workflows.

### Interaction rules
- Use a button that opens a focused modal for every create, edit, or correction flow.
- Use toast feedback after every saved action.
- Let fast, low-risk edits happen inline only when the page supports it deliberately.
- Show a clear read-only state instead of giving visitors controls that later fail.
- Paginate history before it becomes noisy.
- Keep search, filtering, and pagination adjacent to the table they control.

### Security model
- Public/read-only information can load without a login when it is safe to expose.
- Signed-in members can view only the information appropriate to their role.
- `ADMIN` is enforced by the API, not only hidden in the browser.
- Sensitive amounts, phone numbers, updates, deletes, deposits, recovery, and audit tools remain admin-only.
- Frontend hiding is for clarity; backend permission checks are the real protection.

## Inventory Reference

### Main page layout
- One large overview card at the top.
- Dirty Money is the largest number in the header and is visible to admins only.
- The current stock register is directly below it and is public read-only.
- The Inventory Admin card sits below the register and is hidden from non-admins.

### Stock register
- Fields: item name, stock on hand, low point, internal price, external price, unit.
- Visitors can view on-hand stock without being authenticated.
- Admins can use the Update Inventory modal for add, edit, or delete.
- Admins can double-click table values for deliberate quick edits.
- Stock colour logic remains tied to the configured low point.

### Recovery and corrections
- Every normal Inventory mutation writes an audit record.
- The audit table shows ten entries per page.
- An action can only be reverted when no newer action exists for the same entity.
- Restore points capture a complete Inventory state and can reinstate it later.
- Permanent item deletion removes the active listing and its stock movements.
- Older distribution history is retained but detached from a deleted item so it never blocks a correction.

### API contract
- `GET /api/inventory`: public stock register; money is withheld for non-admins.
- Inventory write routes: admin only.
- Audit and restore routes: admin only.

## Dispatch Reference

### Main page layout
- The Dispatch register is the primary page container.
- Signed-in users can see the basic register: person, stock released, sale type, due date, and status.
- Admins additionally see balances, actions, phone numbers, collection tools, and audit history.
- Phonebook and New Dispatch buttons only appear for admins.
- Collections and Audit sit together in a protected admin container below the register.

### Data model
- Phonebook contact: name, phone number, active state, notes.
- Dispatch record: person snapshot, stock snapshot, quantity, price, sale type, amount owed, amount paid, due date, status, notes.
- Payment: an individual collected amount that starts pending deposit.
- Deposit: a selected set of pending payments credited to Dirty Money.
- Audit log: an immutable description of every administrative action plus its reversal metadata.

### Core flows

#### Paid upfront
1. Admin selects an active phonebook contact and an active Inventory item.
2. Admin enters quantity and price.
3. Stock is deducted immediately.
4. The record is marked paid and a pending-deposit payment is created.
5. The payment appears in the collection ledger until deposited into Dirty Money.

#### On credit
1. Admin selects the person, item, quantity, price, and repayment due date.
2. Stock is deducted immediately.
3. The record starts active.
4. Partial or full payments are recorded against the remaining balance.
5. Each payment enters the collection ledger until deposited.

#### Void and correction
- Price, due date, and notes can be corrected while the record is not voided.
- A void can optionally return stock to Inventory.
- A void cannot proceed after its payment has been deposited; the deposit must be reverted first.
- Reverts are newest-action-first to prevent older actions overwriting newer work.

### Integrity safeguards
- Stock release uses a conditional database write, so two admins cannot oversell the same units.
- Deposit selection uses a conditional payment-state claim, so the same payment cannot be deposited twice.
- A void cannot race a deposit into an impossible paid-and-voided state.
- Inactive phonebook people can be shown and reactivated from the Phonebook modal.
- Ledger selections survive pagination so admins can deposit entries chosen across multiple pages.

### API contract
- `GET /api/dispatch`: signed-in member register; sensitive values are withheld from non-admins.
- Phonebook, create/edit/void, payments, deposits, and audit endpoints: admin only.
- Dispatch endpoints are registered from `backend/src/server.js` under `/api/dispatch`.

## New Page Build Checklist

### Before building
1. State the page's one job in one sentence.
2. Decide exactly what guests, members, and admins may see and change.
3. Identify the single source of truth for its key numbers or records.
4. List the actions that require an audit or recovery path.

### Page structure
1. Primary live view or register.
2. Filter/search/pagination when a register can grow.
3. Admin action button row, hidden when not authorised.
4. Modal-first forms for creates, edits, corrections, and destructive actions.
5. Protected audit and recovery area last.

### Data safety
1. Use database transactions for a single action that changes several records.
2. Use conditional writes for stock, money, seats, or any limited resource.
3. Persist display snapshots when historic records must remain readable after source data changes.
4. Prevent a revert if a newer related action exists.
5. Never rely on frontend visibility for permission enforcement.

### Final acceptance checks
1. Guest/member/admin views show the correct information and no extra controls.
2. A full create-to-completion workflow updates all dependent data.
3. A correction and a revert leave totals consistent.
4. Tables remain readable at ten, twenty-five, and many rows.
5. A failed or duplicate request produces a helpful message without changing data twice.