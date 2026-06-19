## Add `location` column to `scope_elements` and surface it in the UI

### 1. Database migration
Add a nullable `location` text column to `public.scope_elements`. No default, no backfill needed.

```sql
ALTER TABLE public.scope_elements ADD COLUMN location text;
```

### 2. `src/components/project/ProjectDocumentsTab.tsx`

**a. Type update (around line 25–39)** — add `location` to the `ScopeElement` type:
```ts
location?: string | null;
```

**b. Row mapping in `onParse` (around line 225–237)** — restore `location: item.location`:
```ts
const rows = items.map((item) => ({
  project_id: projectId,
  document_id: doc.id,
  element_type: "claimable_element",
  title: item.description,
  description: item.comments || null,
  quantity: item.quantity,
  unit: item.unit || null,
  unit_rate: item.rate,
  total_cost: item.cost,
  source_reference: item.code || null,
  location: item.location || null,
  confidence: "high",
}));
```

**c. `ScopeElementRow` display (around line 469–477)** — render the location alongside Ref/Doc:
```tsx
{item.location && <span>{item.location}</span>}
{item.source_reference && <span>Ref: {item.source_reference}</span>}
{docName && <span>Doc: {docName}</span>}
```

### Out of scope
- No changes to the parse server function or prompt — `item.location` is already present in the parsed result.
- No backfill of existing rows; the College Park parse can be re-materialised separately if desired.
