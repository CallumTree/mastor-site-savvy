# Verify Streaming Fix & Re-sync Inngest

## Steps

1. **Verify build passes** — check that `src/lib/parseBoQJob.server.ts` compiles cleanly with the new SSE streaming code (no TS errors on the updated `response` shape, SSE parser, or accumulated text logic).

2. **Re-sync Inngest** — hit the serve endpoint so Inngest picks up the updated `parse-boq-job` function definition:
   - `GET https://mastor-site-savvy.lovable.app/api/public/inngest` (or trigger sync from Inngest dashboard)

3. **Trigger a test Parse Scope job** — kick off a new parse via the app UI (or by inserting an event), then watch:
   - Server logs (`stack_modern--server-function-logs`) for the `[parseBoQJob] fetch -> Anthropic` line, elapsed ms, stop_reason, usage, and text length
   - The `parse_jobs` row to confirm `status: succeeded`, populated `result`, `prompt_tokens`, `completion_tokens`

4. **Confirm no 524** — the streaming connection should stay active well past the previous ~100s timeout. Expected total time ~120-180s with incremental SSE keeping the edge happy.

5. **If it still fails** — capture the exact failure mode (524 vs Anthropic error vs JSON parse) from logs and the `parse_jobs.error` column, then iterate.

## Notes
- No code changes planned in this step — purely verification.
- Will need the `jobId` of a freshly triggered run to inspect. Either trigger from the UI or I can call `startParseJob` directly via `stack_modern--invoke-server-function` if you give me a document_id with text already loaded.
