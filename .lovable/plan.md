# Retire Ready To Claim — auto-post findings & variations to the open valuation

## Behaviour change

- Site diary findings (Progress items in `SiteWalksTab`) post **directly** to the project's open valuation as soon as analysis is approved — no Pending Review step, no Approve click in a separate tab.
- Variations: the Approve button on the Variations tab already posts to the open valuation (just shipped). That stays.
- The "Ready To Claim" tab disappears from both the top tab bar and the bottom nav.
- The home-page "Recover Revenue" stat row gets reworked since `Ready To Claim` status no longer accumulates.

## Changes

### `SiteWalksTab.tsx` — `approveProgress`
Replace the `claim_opportunities` insert (lines ~1809–1819) with a `valuation_items` insert against the open valuation, using the existing `getOrCreateOpenValuation` helper. The matched contract item logic above stays — it still produces `unit_rate`, `quantity`, `claimed_value`, which become the line item's fields. We still write the `approved_findings` row for audit trail. Toast becomes "Added to Valuation IV-XX". UI strings updated:
- "Progress · approve to send to Ready To Claim" → "Progress · approve to add to current valuation"
- "In Ready To Claim" → "Added to IV-XX" (or just a tick — we already track `approvedKeys`, no need to fetch the number per row; show a generic "Added")
- "Added to the Variations tab as Draft (duplicates skipped). Approve there to send to Ready To Claim." → "Added to the Variations tab as Draft (duplicates skipped). Approve there to add to the current valuation."

### `projects.$id.tsx`
- Remove the `ready-to-claim` `TabsTrigger` and its `TabsContent`.
- Remove the `ReadyToClaimTab` import.
- Bottom nav: drop the `Claim` entry from `PRIMARY_NAV`. That leaves 4 primary items (Scope, Site Diary, Valuations, Variations) plus More — total 5 buttons instead of 6, so change `grid-cols-6` to `grid-cols-5`.
- Stats: `claim_opportunities` is no longer the source of truth. Replace the "Potential Claim / Approved Claim / Ready To Claim / Included In Valuation / Paid" derivations with values derived from `valuation_items` joined to `valuations` and `invoices`:
  - **Potential Claim** = sum of `valuation_items.claimed_value` on the open valuation (Draft, no invoice)
  - Drop `readyToClaim`, `approvedClaim` from the displayed metrics — they no longer have a clear meaning. The header currently only renders `Open Variations`, `Procurement Outstanding`, `Potential Claim`, so removing the unused fields from the `stats` object is enough; no visible metric changes besides the new derivation of `Potential Claim`.

### `ReadyToClaimTab.tsx`
- File stays on disk, unimported. (Per your "Leave the rows, just hide the tab" choice we don't need to delete it; deleting is fine too but isn't required. I'll delete it to keep the tree clean — the rows in `claim_opportunities` are untouched.)

## Existing data

Per your answer, `claim_opportunities` rows already in `Pending Review` stay in the database untouched. They simply have no UI surface anymore. No migration, no backfill.

## Out of scope

- No change to the `claim_opportunities` table schema.
- No change to invoice flow.
- No change to the open-valuation helper (`src/lib/openValuation.ts`).
- No change to variation approval (already auto-posts).

## Files touched

- `src/components/project/SiteWalksTab.tsx` — auto-post on approve, label updates
- `src/routes/_authenticated/projects.$id.tsx` — remove tab + bottom-nav entry, rework stats query, grid-cols-5
- `src/components/project/ReadyToClaimTab.tsx` — delete

## Risks

- The matched-contract-item logic (`matchFn`) is currently inside `approveProgress` and runs synchronously per click. Moving the destination from `claim_opportunities` to `valuation_items` doesn't change that latency — same single-tap UX, same Anthropic call.
- If the same finding text is approved twice for the same room, we'll currently insert two `valuation_items` rows. The `claim_opportunity_id` unique index from last turn doesn't apply because we're not writing one. The in-memory `approvedKeys` set still prevents this within a session; cross-session duplicates remain possible but are unlikely (analyses aren't normally re-approved). I'd rather not add another unique index without a stable natural key — flag it and fix only if it actually hurts.
