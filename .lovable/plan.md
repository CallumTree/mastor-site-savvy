## Goal

Eliminate the Cloudflare 524 timeout permanently by removing the long-running Anthropic call from inside the Inngest function. Instead, submit the work to Anthropic's **Message Batches API**, which returns a `batch_id` instantly, then poll its status from short-lived Inngest steps separated by `step.sleep`. No single Worker request ever stays open more than a few seconds.

## What changes

Only `src/lib/parseBoQJob.server.ts`. Everything else (UI flow, `startParseJob`, `parse_jobs` schema, `project_documents` updates, polling on the client) stays as-is.

## New flow inside `parseBoQJob`

1. Load `parse_jobs` row, mark `running`, mark document `running` (unchanged).
2. **`step.run("submit-batch")`** — POST to `https://api.anthropic.com/v1/messages/batches` with one request in the array:
   - `custom_id`: the `jobId`
   - `params`: same model (`claude-sonnet-4-6`), same system prompt, same `max_tokens: 16000`, same single user message (`Parse every line item…` + `document_text`). No `stream`.
   - Returns `{ id: "msgbatch_…", processing_status }`. Persist `batch_id` to `parse_jobs` (new column — see Schema below) and return it.
3. **Polling loop** (up to ~30 min, configurable cap):
   - `await step.sleep("wait", "15s")`
   - `const status = await step.run("poll-N", () => GET /v1/messages/batches/{id})`
     - Each iteration is a fresh Inngest step → fresh Worker invocation → no long-held connection.
   - Break when `processing_status === "ended"`.
   - If cap hit without ending, fail the job with a clear message.
4. **`step.run("fetch-results")`** — GET the `results_url` from the batch object (JSONL stream). Read it fully (small payload, one line for our one request). Extract the single result:
   - `result.type === "succeeded"` → `message.content[0].text` is the JSON string.
   - `result.type === "errored" | "canceled" | "expired"` → fail job with that reason.
5. **Parse + persist** (unchanged): strip ```` ```json ```` fences, `JSON.parse`, write `result`, `stop_reason`, `prompt_tokens` (from `message.usage.input_tokens`), `completion_tokens` (from `output_tokens`), `status: succeeded`, `finished_at`. Update `project_documents.parse_status = 'succeeded'` + `parsed_at`.

All Supabase reads/writes continue to use `supabaseAdmin` (already in place).

## Schema change

Add one nullable column for traceability and to support resume if a run is retried:

```sql
ALTER TABLE public.parse_jobs ADD COLUMN IF NOT EXISTS anthropic_batch_id text;
```

No new grants/policies needed (table already has them).

## Implementation loop shape

Inngest doesn't have a native "poll until done" primitive in our SDK version, so we implement a bounded `for` loop in the function body. Because every iteration's `step.sleep` and `step.run` are durably memoized, this is safe across retries and is the documented Inngest pattern for polling.

```text
const MAX_POLLS = 120          // 120 × 15s = 30 min cap
for (let i = 0; i < MAX_POLLS; i++) {
  await step.sleep(`wait-${i}`, "15s")
  const s = await step.run(`poll-${i}`, fetchBatchStatus)
  if (s.processing_status === "ended") { ended = s; break }
}
if (!ended) failJob("Anthropic batch did not complete within 30 minutes")
```

## Headers / endpoints

- `POST https://api.anthropic.com/v1/messages/batches`
- `GET  https://api.anthropic.com/v1/messages/batches/{id}`
- `GET  {results_url}` (signed, same `x-api-key`)
- Headers: `x-api-key: $ANTHROPIC_API_KEY`, `anthropic-version: 2023-06-01`, `content-type: application/json`.

## Out of scope

- No UI changes. The existing client poller on `parse_jobs.status` keeps working; users just see "running" until the batch ends (typically a few minutes, occasionally longer — Anthropic guarantees within 24h).
- No change to `startParseJob`, Inngest event name, or routing.
- No removal of streaming code from other files (none exist).

## Verification

1. Migration applied; `parse_jobs.anthropic_batch_id` column exists.
2. Build clean (no TS errors on new request/response shapes).
3. Re-sync Inngest (`PUT /api/public/inngest`).
4. Trigger Parse Scope on the existing document; watch:
   - `parse_jobs.anthropic_batch_id` populated within ~2s of clicking.
   - `status` stays `running` while polls happen, then flips to `succeeded` with populated `result`, `prompt_tokens`, `completion_tokens`.
   - No 524 in worker logs; instead many short successful invocations.
5. If batch errors, `parse_jobs.error` contains the Anthropic batch-result error message.
