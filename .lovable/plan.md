## Valuation engine

Build on the existing schema — no migration needed. `contract_items` holds `total_qty` + `unit_rate`; each claim is a row in `valuation_items` (`claimed_qty`, `claimed_value`) belonging to a `valuations` period. The "engine" is just an aggregation across all valuation_items for the project, sliced by current vs. previous draft.

## Workflow

1. User opens the Valuations tab → sees list of periods (existing).
2. User creates or expands a **Draft** valuation. A draft is the "current claim period". Only one draft should be active at a time (enforced softly: "New draft" disabled while a Draft exists).
3. Inside the draft, Mastor renders a **Claim Progress** table — one row per contract item — with the engine columns and an editable "This Claim" qty input + Save per row.
4. On Save, upsert one `valuation_items` row keyed by `(valuation_id, contract_item_id)` with `claimed_qty = thisClaim` and `claimed_value = thisClaim × unit_rate`. Then refetch.

## Engine columns (per contract item)

| Column | Source |
|---|---|
| Code | `contract_items.code` |
| Description | `contract_items.description` |
| Total Qty | `contract_items.total_qty` |
| Unit Rate | `contract_items.unit_rate` |
| Previously Claimed | Σ `valuation_items.claimed_qty` for this contract_item across valuations **other than the current draft** |
| This Claim | `valuation_items.claimed_qty` in the current draft (0 if no row) |
| Total Claimed | Previously + This Claim |
| Remaining Qty | `total_qty − Total Claimed` |
| % Complete | `Total Claimed / total_qty × 100` |
| Value Claimed | `Total Claimed × unit_rate` |

All numbers are recomputed from a fresh fetch of `contract_items` + `valuation_items` (filtered by `project_id`); nothing is held in local state beyond the edit input value.

## Data fetch (single load per draft expansion)

Two queries in parallel:
- `contract_items` where `project_id = …`
- `valuation_items` joined inline via `.in('valuation_id', allValuationIdsForProject)` — already grouped client-side into `previousByItem` (sum) and `currentByItem` (lookup) using the current draft id.

Per Save, only re-run the valuation_items query (contract_items don't change here).

## UX details

- Engine table is mobile-first, two-row stacked layout under `sm`, full table at `sm+`.
- Per-row Save button enabled only when input differs from stored `currentByItem` qty.
- Footer row shows totals: Σ Value Claimed (this draft), Σ Value Claimed (cumulative).
- Existing "view items" list inside non-draft (Submitted) valuations stays read-only as today.

## Files touched

- `src/components/project/ValuationsTab.tsx` — extend to render the engine inside the expanded draft. New subcomponent `ClaimProgressTable` colocated in the same file (small, single-purpose).

No schema, RLS, or route changes. No new dependencies.