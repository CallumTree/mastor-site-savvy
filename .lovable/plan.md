## Goal

Close the £0 invoice gap by pricing every claim opportunity from contract items at creation time, carrying those numbers through to valuations and invoices, and letting the user override on the Valuation screen.

---

## 1. Database changes

**Migration on `claim_opportunities`** — add three nullable numeric columns:
- `unit_rate` numeric
- `quantity` numeric
- `claimed_value` numeric

**Migration on `valuation_items`** — add one column (the rest already exist):
- `unit_rate` numeric
  *(table already has `claimed_qty` and `claimed_value`; we'll reuse `claimed_qty` as the editable quantity field.)*

No new tables, no RLS changes.

---

## 2. Pricing logic at finding-approval time

In `src/components/project/AnalysisReview.tsx`, extend `linkProgressFindingToWorkPackage`:

After resolving the matching work package, run a second match against `contract_items` for the same project:

```text
score = (description token overlap × 2) + (trade/code token overlap × 1)
```

- Tokenise the finding text + work package name vs. each contract item's `description` (and `code`)
- Pick the highest-scoring row above a minimum threshold
- Pull `unit_rate` and `total_qty` (use as `quantity`)
- Compute `claimed_value = unit_rate × quantity`
- If no match found → leave the three fields null (UI will show "—" and editing on the Valuation screen will fill them in)

Write those three fields into the `claim_opportunities` insert.

---

## 3. Carry pricing through to valuation_items

In `src/components/project/ReadyToClaimTab.tsx` → `generateValuation()`:

When mapping approved claim opportunities into `valuation_items` rows, include:
- `unit_rate` → from claim opportunity
- `claimed_qty` → from claim opportunity `quantity`
- `claimed_value` → from claim opportunity

---

## 4. Valuation screen — editable line items

In `src/routes/_authenticated/valuations.$id.tsx`:

**New columns in the line items table:**

| Work Package | Description | Unit Rate | Quantity | Value |
|---|---|---|---|---|

- **Unit Rate** and **Quantity** become inline `<Input type="number">` fields when the valuation status is `Draft`.
- On every change, locally recompute `claimed_value = unit_rate × quantity` and update the row.
- Auto-save (debounced ~400ms) writes `unit_rate`, `claimed_qty`, `claimed_value` back to the `valuation_items` row. No save button.
- When status is `Approved`, render as plain text (read-only).

**Summary recalculation:**

Replace the current count-based "This Claim" with the real £ figure:

- **Previously Claimed** — sum of `claimed_value` across all prior Approved valuations for this project *(unchanged logic)*
- **This Claim** — `Σ claimed_value` of this valuation's line items *(was: count)*
- **Total Claimed** — `Previously Claimed + This Claim`
- **Remaining Value** — `project.gross_value (or contract_value) − Total Claimed`

All four figures display as £.

**Footer row** on the table shows the live £ total of the current line items, matching "This Claim".

---

## 5. Downstream effects on Invoice screen

`src/routes/_authenticated/valuations.$id.invoice.tsx` already sums `claimed_value` into `invoice.total_amount` at creation. Once steps 1–4 are in, invoice totals will be correct automatically — **no changes needed there**, but I'll re-verify after the build.

---

## Files touched

- New migration (2 ALTER TABLEs)
- `src/components/project/AnalysisReview.tsx` — pricing match logic
- `src/components/project/ReadyToClaimTab.tsx` — carry fields into valuation_items insert
- `src/routes/_authenticated/valuations.$id.tsx` — editable columns, autosave, £ summary

---

## Out of scope (flagging for later)

- Locking down editable quantity to ≤ remaining contract qty
- Showing which contract item a claim was matched to (for transparency / unmatch button)
- Bulk re-pricing of existing claim opportunities created before this change *(they'll still be £0 unless re-approved or manually edited on the Valuation screen)*

Tell me to proceed and I'll switch to build.
