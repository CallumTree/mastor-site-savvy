## Re-materialise College Park scope_elements from stored parse result

Job `04a8191f-...` is `succeeded` with 58 items in `parse_jobs.result->'items'`. Re-insert directly via SQL — no Anthropic call, no client code change.

### Steps (single migration)

1. `DELETE FROM public.scope_elements WHERE document_id = 'dd429f2e-e589-44dd-812a-49a3fd854979';`
2. `INSERT INTO public.scope_elements (project_id, document_id, element_type, title, description, quantity, unit, unit_rate, total_cost, source_reference, location, confidence)` selecting from `jsonb_array_elements(result->'items')` of that job, with the exact same field mapping the client uses (lines 226–239 of `ProjectDocumentsTab.tsx`):
   - title ← `description`
   - description ← `comments`
   - quantity ← `quantity`, unit ← `unit`
   - unit_rate ← `rate`, total_cost ← `cost`
   - source_reference ← `code`
   - location ← `location`
   - element_type = `'claimable_element'`, confidence = `'high'`
   - project_id / document_id from the parse_jobs row

### Out of scope

- Not touching `contract_items` (request was scope_elements only).
- Not calling the parse server function or Anthropic.
- No code changes; the insert/display path is already correct.

### Verification after run

`SELECT count(*), count(location) FROM scope_elements WHERE document_id = 'dd429f2e-...';` — expect 58 rows with location populated for the items that have it in the stored parse result.