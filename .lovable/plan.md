## Goal

Replace all hardcoded/demo data in the Project Control Center (`/projects/:id`) with live Supabase-backed CRUD for each tab.

## Database changes

- New migration: create `procurement_items` table
  - Fields: `project_id` (FK → projects), `package_name`, `supplier`, `status`, `value` (numeric), `notes`, plus `id`, `created_at`, `updated_at`
  - Grants for `anon` + `authenticated`, RLS enabled with permissive `dev_all` policy (matching existing dev-mode pattern)
  - `updated_at` trigger

## Project header (top of page)

- Remove `demoProject` fallback entirely
- If project not found → show empty state ("Project not found") instead of fake data
- Keep real fields from Supabase (`name`, `client`, `location`, `contract_value`, `status`, `progress`)

## Scope & Variations tab

- **Contract Items table** (reads `contract_items` for this `project_id`)
  - Columns: code, description, unit, total_qty, unit_rate, line total (computed)
  - Inline "Add item" form + edit + delete
  - Empty state when none exist
- **Variations table** (reads `variations` for this `project_id`)
  - Columns: description, qty, unit, rate, status, computed amount
  - Add / edit / delete
  - Empty state

## Site Progress tab

- Read `progress_logs` for this project, ordered by `created_at DESC`
- Textarea + "Add log" button → insert with `transcript`
- Each entry shows transcript + formatted created date/time
- Empty state
- Remove all hardcoded programme % bars and site notes

## Valuations tab

- Read `valuations` for this project, ordered by `valuation_number DESC` (or `created_at`)
- "New draft valuation" button → inserts row with auto-incremented `valuation_number`, `status='Draft'`, `valuation_date=today`
- For each valuation, fetch `valuation_items` (joined with `contract_items` for description) and render line items (claimed_qty, claimed_value)
- Empty state
- Remove retention hardcoded rows

## Procurement tab

- Read `procurement_items` for this project
- Add / edit / delete (package_name, supplier, status, value)
- Empty state
- Remove hardcoded subcontractor packages and material orders

## Implementation approach

- Keep all data fetching client-side via `supabase` client (matches existing dev-mode pattern in `dashboard.tsx`)
- Extract each tab into its own component file under `src/components/project/` (ScopeTab, ProgressTab, ValuationsTab, ProcurementTab) to keep the route file manageable
- Use shadcn `Input`, `Button`, `Select`, `Textarea`, `Dialog` for forms
- Toast on success/error via `sonner`
- Refetch after each mutation

## Files

- New migration: `supabase/migrations/<ts>_procurement_items.sql`
- New: `src/components/project/ScopeTab.tsx`
- New: `src/components/project/ProgressTab.tsx`
- New: `src/components/project/ValuationsTab.tsx`
- New: `src/components/project/ProcurementTab.tsx`
- Edit: `src/routes/_authenticated/projects.$id.tsx` (remove demo data, mount new tab components, pass `projectId`)
