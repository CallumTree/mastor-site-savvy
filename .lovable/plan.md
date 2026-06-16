
## Problem

`parseBoQ` runs the Anthropic call inline inside a `createServerFn` request. The serverless gateway kills the request at ~45–50s, but Anthropic responses for 50+ line-item documents take 45s–2.5min. The client sees `result.ok === undefined` (504) and the parsed data is lost even though Anthropic eventually finishes.

Fix: turn parsing into a fire-and-forget background job. The "Parse Scope" button enqueues a job, returns immediately, and the UI polls a status row until it's `succeeded` or `failed`.

## Architecture

Use **Inngest** (already available as a Lovable connector) as the durable executor. Inngest functions are not bound by the server-function gateway timeout, retry on failure, and we already have `LOVABLE_API_KEY` / `INNGEST_API_KEY` / `INNGEST_SIGNING_KEY` plumbing documented for this project.

Flow:

```text
[Client]                [Server fn]            [DB]              [Inngest]            [Inngest fn]
 click Parse  ───►  startParseJob  ──insert──► parse_jobs(queued) 
                       │                                          
                       └──send event "boq/parse.requested" ────►  schedules ──► parseBoQJob
 poll every 4s ──► getParseJob ──read──► parse_jobs                                │
                                                                                    │ calls Anthropic (long)
                                                                  parse_jobs ◄─────┤ update status=running
                                                                  parse_jobs ◄─────┤ update status=succeeded + result
 status=succeeded ──► load result, write scope_elements (existing path)
```

## Database changes (one migration)

New table `public.parse_jobs`:

- `id uuid pk`
- `project_id uuid` (FK projects, cascade)
- `document_id uuid` (FK project_documents, cascade, nullable in case a re-parse pre-dates the row)
- `user_id uuid` (owner, for RLS)
- `status text` — one of `queued | running | succeeded | failed` (default `queued`)
- `error text` nullable
- `result jsonb` nullable — the parsed `{ contract_reference, items, ... }` payload
- `prompt_tokens int`, `completion_tokens int`, `stop_reason text` nullable (diagnostics)
- `started_at`, `finished_at` timestamptz nullable
- `created_at`, `updated_at` timestamptz default now()

Standard structure: `CREATE TABLE` → `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` + `GRANT ALL … TO service_role` → `ENABLE ROW LEVEL SECURITY` → policy using existing `user_owns_project(project_id)` helper for SELECT/INSERT/UPDATE/DELETE by the owner. Add the `updated_at` trigger using the existing `update_updated_at_column()` function.

Also add to `public.project_documents`:
- `parse_status text` (`idle | queued | running | succeeded | failed`, default `idle`)
- `last_parse_job_id uuid` nullable, FK `parse_jobs(id)` on delete set null

This lets the documents list show a per-row status without a join.

No changes to `scope_elements` — once a job succeeds the existing insert path runs on the client (or moves into the Inngest handler — see optional below).

## File changes

1. `src/lib/parseDocument.functions.ts` — replace the single `parseBoQ` server fn with:
   - `startParseJob({ documentId, documentText })` — auth-required server fn. Inserts a `parse_jobs` row (status `queued`), updates `project_documents.parse_status='queued'` and `last_parse_job_id`, then `POST`s an `boq/parse.requested` event to the Inngest gateway (`https://connector-gateway.lovable.dev/inngest/e/`) with `{ jobId }`. Returns `{ ok: true, jobId }` immediately (well under 45s).
   - `getParseJob({ jobId })` — auth-required server fn. Returns `{ status, error, result, started_at, finished_at }`. RLS already restricts to the owner.

2. New `src/routes/api/inngest.ts` — `createFileRoute('/api/inngest')` exporting the Inngest `serve` handler (GET/POST/PUT) wired to the function below. (`INNGEST_SIGNING_KEY` handles request verification automatically.) Used by Inngest to call into our app.

3. New `src/lib/parseBoQJob.server.ts` — defines the Inngest function:
   - trigger: event `boq/parse.requested`
   - load the `parse_jobs` row via `supabaseAdmin` (this is the only legitimate admin use — caller already authorized when creating the job)
   - mark `running`, set `started_at`
   - call Anthropic with the existing prompt + `documentText` from the job row (store `documentText` on the job, or re-extract — see "Open question" below)
   - on success: write `result`, `succeeded`, `finished_at`, token usage; also update `project_documents.parse_status='succeeded'` and `parsed_at`
   - on failure / non-2xx / parse error: write `error`, `failed`, `finished_at`; update the document row
   - rely on Inngest's built-in retry (1–2 attempts) for transient Anthropic 5xx

4. `src/components/project/ProjectDocumentsTab.tsx` — `onParse` becomes:
   - extract text (unchanged)
   - call `startParseJob` → get `jobId`, set `parsingId` and a local job state
   - start a `setInterval` (or React Query `useQuery({ refetchInterval: 4000, enabled: status pending })`) calling `getParseJob`
   - on `succeeded`: stop polling, run the existing scope-element insert logic against `job.result`, toast success
   - on `failed`: stop polling, toast `job.error`
   - persist polling across page reloads by reading `project_documents.parse_status` + `last_parse_job_id` on mount, so a user who navigates away and back still sees progress

5. `src/lib/parseDocument.client.ts` (existing DOCX/PDF text extraction) — unchanged.

## Auth & security

- `startParseJob` and `getParseJob` use `requireSupabaseAuth`; RLS on `parse_jobs` scopes everything to the owner.
- Inngest function runs server-side and uses `supabaseAdmin` because it has no end-user session — it only ever acts on a specific `jobId` that was already created by an authorized user, and it writes back to that same row.
- `/api/inngest` is under `/api/` (not `/api/public/`), and Inngest's signing-key verification (handled by the SDK) authenticates the caller.

## Open question for you

When the job is enqueued, where should the extracted `documentText` live?

- **A. Store it on the `parse_jobs` row** as a `text` column. Simple, one DB read in the worker. Costs DB space (up to ~500 KB per job) but jobs are short-lived and can be pruned.
- **B. Re-extract on the worker** by downloading the file from storage using `file_path`. Keeps the DB small but means the Inngest function has to run PDF/DOCX extraction server-side, which currently only runs in the browser.

A is the pragmatic default and matches the current "client extracts, server parses" split. Confirm A or pick B before I implement.

## Out of scope (intentionally)

- No changes to the prompt, model, `max_tokens`, or the JSON contract returned to the UI.
- No changes to `scope_elements` schema or how parsed items are turned into rows.
- No removal of the existing diagnostic logging — it moves into the Inngest function so the same `[parseBoQ]` lines still appear, just in the background-job logs.
