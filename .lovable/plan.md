# Plan: Editable fields, invoice unwind, and lock-on-invoice

## 1. Locking rule — "has this valuation been invoiced?"

Single source of truth: a row in `invoices` whose `valuation_id` matches and whose `status <> 'void'` (deleted invoices are hard-deleted, see §7, so simple existence is enough).

Implementation:
- Add a helper SQL function `public.valuation_is_invoiced(_valuation_id uuid) returns boolean` (SECURITY DEFINER, `SELECT EXISTS(... FROM invoices WHERE valuation_id = _valuation_id)`).
- Client side: each valuation/variation query joins/embeds `invoices(id)` and derives `isLocked = invoices.length > 0`. For variations, "locked" = the valuation containing it (via `valuation_items.scope_element_id`/variation linkage) has been invoiced. Concretely a variation is locked when **any** `valuation_items` row references it AND that valuation has an invoice. Until then, fully editable.
- Server-side guards in the edit/delete server functions re-check the same condition before mutating, so a stale client can't bypass.

## 2. Database migration (single migration)

```sql
ALTER TABLE public.projects   ADD COLUMN po_number text;
ALTER TABLE public.variations ADD COLUMN client_reference text;
ALTER TABLE public.variations ADD COLUMN variation_number text;  -- stores V-01 etc. (currently derived?)
-- (confirm: if V-01 is already derived from created_at order, skip variation_number)

CREATE OR REPLACE FUNCTION public.valuation_is_invoiced(_vid uuid) ...;
```

No schema change needed for invoice number editing (column already `text`), scope edits (columns exist), valuation item edits (columns exist), or invoice delete (just `DELETE`).

## 3. File-by-file changes

**Projects / PO number**
- `src/routes/_authenticated/projects.$id.tsx` — add editable PO Number field in header/metadata area, server fn `updateProject({id, po_number})`.
- `src/components/project/InvoicesTab.tsx` + `src/routes/_authenticated/valuations.$id.invoice.tsx` — render `project.po_number` on the invoice PDF/preview when present.

**Variations**
- `src/components/project/VariationsTab.tsx`:
  - Show `client_reference` next to the internal `V-NN` label (e.g. `V-02 · Ref: CC-2451`).
  - Inline edit (or edit dialog) for `description`, `qty`, `unit`, `rate`, `client_reference` when `!isLocked`.
  - When locked, render read-only with a small "Invoiced in V-### – locked" badge.
- New server fn `updateVariation` with the invoiced-lock guard.
- Anywhere else variations are displayed (valuation builder, valuation detail, invoice line items) — append `client_reference` to the label.

**Scope elements**
- `src/components/project/ProjectDocumentsTab.tsx` (or wherever the scope tree lives — search for `scope_elements`):
  - Per-row edit (qty, unit, unit_rate, description, title) and delete buttons.
  - New server fns `updateScopeElement`, `deleteScopeElement`.
  - Delete should refuse (or cascade-warn) if the element is referenced by an invoiced `valuation_items` row; otherwise allow and cascade-clean the `valuation_basket_items` / non-invoiced `valuation_items` references.

**Valuations**
- `src/routes/_authenticated/valuations.$id.tsx`:
  - Compute `isLocked` from embedded `invoices`.
  - Existing line-item remove dialog: wrap in `disabled={isLocked}`; same for edit controls.
  - Add inline edit for `claimed_qty`, `unit_rate`, `description` on each `valuation_items` row when unlocked.
- Server fns `updateValuationItem`, `deleteValuationItem` re-check lock.

**Invoices**
- `src/routes/_authenticated/valuations.$id.invoice.tsx` (and `InvoicesTab.tsx`):
  - Make `invoice_number` an editable text input with a Save button; server fn `updateInvoiceNumber`.
  - Add a Delete Invoice button with confirm dialog ("This will unlock the valuation for further edits. Underlying line items are kept."). Server fn `deleteInvoice` performs only `DELETE FROM invoices WHERE id=...`; the valuation/items remain. Optionally set `valuations.status` back to `draft` if you currently flip it on invoice creation.

## 4. Build order

1. **Migration** (PO number, client_reference, helper fn) — unblocks everything else; types regenerate.
2. **Lock helper** — small `useIsValuationInvoiced(valuationId)` hook + server-fn guard utility, used by 3–6.
3. **Invoice delete + editable invoice number** — smallest, makes the unlock path testable end-to-end before piling edit UIs on top.
4. **Valuation item edit/delete lock wiring** — extends existing remove dialog.
5. **Variations edit + client_reference display** (depends on lock helper).
6. **Scope element edit/delete**.
7. **PO number field + invoice template wiring** (independent, can slot in anywhere after step 1).

## 5. Open questions before I build

- Is `V-01 / V-02` currently derived from `created_at` order, or is there a stored variation number column I missed? Affects whether the migration adds `variation_number`.
- For scope element delete: hard-delete, or soft-delete (`status='deleted'`) so historical valuation references stay resolvable?
- When an invoice is deleted, should the valuation's `status` revert to a specific value (e.g. `submitted` → `draft`)? What's the current status flow?
