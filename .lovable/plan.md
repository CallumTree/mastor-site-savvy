## Fix scope_elements insert mapping in ProjectDocumentsTab.tsx

### Problem
The `onParse` function in `ProjectDocumentsTab.tsx` builds rows for `scope_elements` with two fields that don't match the table schema:
1. `location: item.location` — the `scope_elements` table has no `location` column, causing `PGRST204`
2. `confidence: 1.0` — the column expects `"high" | "medium" | "low"`, not a number

### Changes
In `src/components/project/ProjectDocumentsTab.tsx`, within the `rows` mapping (around line 225–238):

1. **Remove** the line `location: item.location,`
2. **Change** `confidence: 1.0,` to `confidence: "high",`

This aligns the frontend insert with the actual database schema and the existing `ScopeElement` type definition.