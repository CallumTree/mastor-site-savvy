## End-to-end CRUD verification

Use the existing project `bf8242d0-a9f2-41e9-8bbc-89ef2e094e04` ("Jones Terrace") as the test fixture. For each of the 5 tables, run insert → select → update → select → delete → select, and report pass/fail per step.

Tables and minimal payloads:

- **contract_items** — insert `{code:'T-001', description:'Test item', unit:'m2', total_qty:10, unit_rate:25}`; update description + unit_rate; delete.
- **variations** — insert `{description:'Test variation', qty:5, unit:'no', rate:100, status:'Pending'}`; update status → `Approved`; delete.
- **progress_logs** — insert `{transcript:'Test log entry'}`; update transcript; delete.
- **valuations** — insert `{valuation_number:999, valuation_date:'2026-06-04', status:'Draft'}`; update status → `Submitted`; delete.
- **procurement_items** — insert `{description:'Test package', quantity:2, estimated_cost:500, supplier:'ACME', status:'Required'}`; update status → `Ordered`; delete.

Execution uses `supabase--insert` for writes and `supabase--read_query` for reads. RETURNING-style read-back is done with an explicit SELECT keyed on a sentinel column (e.g. `code='T-001'` or `transcript='Test log entry'`) so we don't depend on capturing generated IDs between calls.

Output: a single markdown table — Table × {Insert, Read, Update, Read, Delete, Confirm} → ✅/❌ with the row count or error from each step. All rows are removed at the end so the project stays clean.