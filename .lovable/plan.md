# Auto-append approvals to the open valuation

## Concept

Each project has at most **one open valuation** at any time — a rolling Draft bucket that accumulates every approved claim opportunity and approved variation across many site diary entries, over days or weeks. It stays open until the user generates an invoice from it. Only after that does the next approval spawn a brand new Draft valuation.

## "Open" definition

A valuation is **open** for the project iff:
- `valuations.project_id = <project>`
- AND no row exists in `invoices` where `invoices.valuation_id = valuations.id`

Status (`Draft` / `Approved` / `Sent`) is informational only — the authoritative signal is "has an invoice been generated from it". The existing `invoices` table already has `valuation_id`, so a `LEFT JOIN invoices ON invoices.valuation_id = valuations.id WHERE invoices.id IS NULL` (ordered by `created_at DESC`, limit 1) reliably finds it.

## Helper: `getOrCreateOpenValuation(projectId)`

Shared client-side helper (e.g. `src/lib/openValuation.ts`):

1. Query the most recent valuation for the project that has no matching invoice row. Two-step is fine and keeps RLS simple:
   - `select id, valuation_number from valuations where project_id = $p order by created_at desc`
   - `select valuation_id from invoices where valuation_id in (...)` → build a Set
   - pick the first valuation whose id is NOT in that set
2. If found, return it.
3. If none, compute `nextNum = max(valuation_number) + 1` for the project and `insert` a new `Draft` valuation with today's date, return it.

Returns `{ id, valuation_number }`.

## Wire-in points

### 1. Approving a claim opportunity (`ReadyToClaimTab.tsx`)
Currently `updateStatus(id, "Approved")` only flips status + sets scope_element to In Progress. Extend it to also:
- call `getOrCreateOpenValuation(projectId)`
- insert a `valuation_items` row mirroring the same shape as today's `generateValuation` (work_package_id/name, description = finding_text, unit_rate, claimed_qty, claimed_value, claim_opportunity_id, scope_element_id, status `Draft`)
- update the linked `scope_element` with `claimed_in_valuation: { id, number: 'IV-XX' }` so the badge in the scope tab is accurate immediately
- toast "Added to Valuation IV-XX"

### 2. Approving a variation (`VariationsTab.tsx`)
Same flow when a variation is approved: call the helper, insert a corresponding `valuation_items` row carrying the variation's value/description so it shows in the rolling valuation.

### 3. Retire/repurpose `generateValuation` button
With auto-append, the bulk "Generate Valuation" button on Ready To Claim becomes redundant. Replace it with a link to the current open valuation: "View open Valuation IV-XX →" (computed from the same helper, read-only — does not create one if none exists). Closing out happens via the existing invoice flow on the valuation page, which already creates an `invoices` row → next approval will then spawn a new draft.

## Edge cases

- **Race / double-click**: insert a unique partial index `unique (claim_opportunity_id) where claim_opportunity_id is not null` on `valuation_items` so a re-approval can't double-add (small migration). Same for `variation_id` if we add that column.
- **Manually-deleted valuation_items**: harmless — approval already happened; user can re-add manually from the valuation page if needed. We don't re-derive on every change.
- **Valuation marked `Approved` but not yet invoiced**: still considered open by our definition, so new approvals keep landing in it. This matches the user's stated rule: only invoicing closes it out.
- **First-ever approval on a project**: no valuations exist, helper creates IV-01.

## Out of scope

- No change to the invoice generation flow itself.
- No change to the valuation detail page beyond it naturally showing the growing line-item list.
- No backfill of historical approvals.

## Files touched

- new `src/lib/openValuation.ts`
- `src/components/project/ReadyToClaimTab.tsx` — append-on-approve, replace bulk generate button with "View open valuation" link
- `src/components/project/VariationsTab.tsx` — append-on-approve
- one small migration for the uniqueness guard on `valuation_items`
