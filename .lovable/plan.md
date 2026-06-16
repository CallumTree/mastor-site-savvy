
## Problem

`parseBoQ` runs the Anthropic call inline inside a `createServerFn` request. The serverless gateway kills the request at ~45–50s, but Anthropic responses for 50+ line-item documents take 45s–2.5min. The client sees `result.ok === undefined` (504) and the parsed data is lost even though Anthropic eventually finishes.

Fix: turn parsing into a fire-and-forget background job. The "Parse Scope" button enqueues a job, returns immediately, and the UI polls a status row until it's `succeeded` or `failed`.

## Architecture

Use **Inngest** (available as a Lovable connector) as the durable executor. Inngest functions are not bound by the server-function gateway timeout and retry on failure.

Flow:

```text
[Client]               [Server fn]         [DB]                  [Inngest]
 click Parse  ───►  startParseJob ──insert─► parse_jobs(queued)
                        │
                        └──send event "boq/parse.requested" ──► schedules
                                                                    │
                                                                    ▼
                                                              [Inngest fn]
                                                              calls Anthropic (long)
 poll getParseJob every 4s ◄────reads──── parse_jobs ◄──updates── (running → succeeded)
 status=succeeded ──► load result, write scope_elements (existing path)
```

## Setup step (before code)

Link the **Inngest** connector to this project. That provisions `LOVABLE_API_KEY`, `INNGEST_API_KEY`, `INNGEST_SIGNING_KEY` as server env vars. Once linked, after deploying the `/api/inngest` route, the user has to visit that URL once (or click "Sync" in the Inngest dashboard) so Inngest discovers `parseBoQJob`.

## Database changes (one migration)

New table `public.parse_jobs`:
- `id uuid pk`
- `project_id uuid` FK projects, cascade
- `document_id uuid` FK project_documents, cascade
- `user_id uuid` (owner, for RLS)
- `status text` — `queued | running | succeeded | failed` (default `queued`)
- `document_text text` — extracted text the worker will send to Anthropic
- `error text` nullable
- `result jsonb` nullable — parsed `{ contract_reference, items, ... }`
- `stop_reason text`, `prompt_tokens int`, `completion_tokens int` nullable (diagnostics)
- `started_at`, `finished_at` timestamptz nullable
- `created_at`, `updated_at` timestamptz default now()

Standard order: CREATE TABLE → GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated + GRANT ALL TO service_role → ENABLE ROW LEVEL SECURITY → policies using existing `user_owns_project(project_id)` helper for all operations by the owner. Add `updated_at` trigger using existing `update_updated_at_column()`.

Add to `public.project_documents`:
- `parse_status text` (`idle | queued | running | succeeded | failed`, default `idle`)
- `last_parse_job_id uuid` nullable, FK `parse_jobs(id)` on delete set null

(Decision on the open question from last round: **Option A** — store `document_text` on the job row. Simplest path; jobs can be pruned later.)

## File changes

1. **`src/lib/parseDocument.functions.ts`** — replace `parseBoQ` with:
   - `startParseJob({ documentId, documentText })` — auth-required. Inserts a `parse_jobs` row (status `queued`, with `document_text`), updates `project_documents.parse_status='queued'` + `last_parse_job_id`, POSTs `boq/parse.requested` event with `{ jobId }` to `https://connector-gateway.lovable.dev/inngest/e/` using `LOVABLE_API_KEY` + `INNGEST_API_KEY` headers. Returns `{ ok: true, jobId }` immediately.
   - `getParseJob({ jobId })` — auth-required. Returns `{ status, error, result, started_at, finished_at }`. RLS restricts to owner.

2. **New `src/routes/api/inngest.ts`** — `createFileRoute('/api/inngest')` exporting the Inngest `serve` handler (GET/POST/PUT) from `inngest/edge`. `INNGEST_SIGNING_KEY` handles request verification automatically.

3. **New `src/lib/parseBoQJob.server.ts`** — Inngest function:
   - trigger: event `boq/parse.requested`
   - load `parse_jobs` row via `supabaseAdmin`
   - mark `running`, set `started_at`
   - call Anthropic with the existing SYSTEM_PROMPT + `document_text` from the job (existing prompt/model/max_tokens unchanged)
   - success: write `result`, `succeeded`, `finished_at`, token usage; update `project_documents.parse_status='succeeded'` and `parsed_at`
   - failure / non-2xx / JSON parse error: write `error`, `failed`, `finished_at`; update the document row
   - leans on Inngest's built-in retry for transient Anthropic 5xx

4. **`src/components/project/ProjectDocumentsTab.tsx`** — `onParse` becomes:
   - extract text (unchanged)
   - call `startParseJob` → get `jobId`
   - poll `getParseJob` every 4s
   - on `succeeded`: run the existing scope-element + contract-items insert logic against `job.result`, toast success
   - on `failed`: toast `job.error`
   - on mount, resume polling for any document with `parse_status` in (`queued`, `running`) so navigating away doesn't lose progress

5. **`src/lib/parseDocument.client.ts`** (DOCX/PDF extraction) — unchanged.

## Auth & security

- `startParseJob` and `getParseJob` use `requireSupabaseAuth`; RLS on `parse_jobs` scopes to owner.
- Inngest function runs server-side using `supabaseAdmin` — only ever acts on a specific `jobId` that an authorized user already created, and only writes back to that row.
- `/api/inngest` (not `/api/public/`) is authenticated by Inngest's signing-key check inside the SDK.

## Out of scope

- No changes to the prompt, model, `max_tokens`, or JSON contract returned to the UI.
- No changes to `scope_elements` schema or the scope-element insert path.
- Existing `[parseBoQ]` diagnostic logging moves into the Inngest function so the same lines still appear, just in background-job logs.
