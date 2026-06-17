# BoQ Parse Pipeline — Full Diagnostic

Goal: hand this to Claude (or any other reviewer) so they can spot what is breaking. No code changes are proposed here — this is a read-out of the current state.

---

## 1. Symptom

User clicks **Parse Scope** on a document in `ProjectDocumentsTab`. Nothing visible happens, or after ~2 minutes the job ends in `failed` with a Cloudflare 524 timeout. Multiple Anthropic API calls are being burned without producing a result. A prior `f4fb2aa7-3bc3-4a2b-87f0-e74a44850235` job logged `Anthropic responded in 125038 ms status 524` from a direct `/v1/messages` call, despite the code being rewritten to use the Batch API.

A subsequent tiny smoke test (`750584e1...`) succeeded via the Batch API path (`msgbatch_…`, 348 in / 149 out tokens), proving the new code works in isolation. Full-document parses from the UI still fail.

---

## 2. Architecture

```text
Browser (ProjectDocumentsTab.tsx)
  │  extracts text (pdf/docx → string)
  │  startParseJob serverFn  ── POST /_serverFn ──▶ TanStack Start (Cloudflare Worker)
  │                                                  │ insert parse_jobs row (status=queued)
  │                                                  │ POST connector-gateway.lovable.dev/inngest/e/
  │                                                  │   event: boq/parse.requested {jobId}
  │                                                  ▼
  │                                              Inngest cloud
  │                                                  │ POST /api/public/inngest  (signed)
  │                                                  ▼
  │                                              parseBoQJob (Inngest fn)
  │                                                  │ step.run submit-batch → Anthropic /v1/messages/batches
  │                                                  │ loop step.sleep 15s + step.run poll-N
  │                                                  │ step.run fetch-results
  │                                                  │ write parse_jobs.status=succeeded + result
  │
  └─ polls getParseJob every 4s for 5 min, then writes scope_elements + contract_items
```

Key files (paths shown for reviewer):
- `src/lib/parseBoQJob.server.ts` — Inngest function (batch submit + poll + fetch results)
- `src/lib/parseDocument.functions.ts` — `startParseJob`, `getParseJob` server fns
- `src/routes/api/public/inngest.ts` — Inngest serve endpoint (edge)
- `src/start.ts` — global middleware registration
- `src/components/project/ProjectDocumentsTab.tsx` — UI trigger + polling
- `supabase/migrations/20260616150111_*.sql` — `parse_jobs` table
- `supabase/migrations/20260617075521_*.sql` — `ALTER TABLE parse_jobs ADD COLUMN anthropic_batch_id text`

---

## 3. Database schema (relevant)

```sql
CREATE TABLE public.parse_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.project_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed')),
  document_text text,
  error text,
  result jsonb,
  stop_reason text,
  prompt_tokens int,
  completion_tokens int,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- later migration:
ALTER TABLE public.parse_jobs ADD COLUMN IF NOT EXISTS anthropic_batch_id text;

ALTER TABLE public.project_documents
  ADD COLUMN parse_status text NOT NULL DEFAULT 'idle'
    CHECK (parse_status IN ('idle','queued','running','succeeded','failed')),
  ADD COLUMN last_parse_job_id uuid REFERENCES public.parse_jobs(id) ON DELETE SET NULL;

-- RLS: SELECT/INSERT/UPDATE/DELETE to authenticated, ALL to service_role.
-- Policy: USING/WITH CHECK public.user_owns_project(project_id).
```

---

## 4. Code — `src/lib/parseBoQJob.server.ts`

```ts
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "mastor-app" });

const SYSTEM_PROMPT = `…BoQ parser system prompt…`;

const ANTHROPIC_HEADERS = (apiKey: string) => ({
  "content-type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01",
});

const MAX_POLLS = 120; // 120 * 15s = 30 min
const PARSER_VERSION = "anthropic-batch-v2";

export const parseBoQJob = inngest.createFunction(
  { id: "parse-boq-job", retries: 1, triggers: [{ event: "boq/parse.requested" }] },
  async ({ event, step }) => {
    const jobId = (event.data as { jobId?: string })?.jobId;
    if (!jobId) throw new Error("Missing jobId in event data");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    console.log(`[parseBoQJob] ${PARSER_VERSION} starting job`, jobId);

    const { data: job, error: loadErr } = await supabaseAdmin
      .from("parse_jobs")
      .select("id, document_id, project_id, document_text, anthropic_batch_id")
      .eq("id", jobId).single();
    if (loadErr || !job) throw new Error(`parse_jobs load failed: ${loadErr?.message}`);
    if (!job.document_text) throw new Error("parse_jobs row has no document_text");

    await supabaseAdmin.from("parse_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);
    if (job.document_id) {
      await supabaseAdmin.from("project_documents")
        .update({ parse_status: "running" }).eq("id", job.document_id);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { /* fail */ }

    // (1) Submit batch — or resume if anthropic_batch_id already set
    let batchId = job.anthropic_batch_id;
    if (!batchId) {
      batchId = await step.run("submit-batch", async () => {
        const res = await fetch("https://api.anthropic.com/v1/messages/batches", {
          method: "POST",
          headers: ANTHROPIC_HEADERS(apiKey),
          body: JSON.stringify({
            requests: [{
              custom_id: jobId,
              params: {
                model: "claude-sonnet-4-6",
                max_tokens: 16000,
                system: SYSTEM_PROMPT,
                messages: [{ role: "user",
                  content: `Parse every line item from this document:\n\n${job.document_text}` }],
              },
            }],
          }),
        });
        if (!res.ok) throw new Error(`Anthropic batch submit ${res.status}: …`);
        return ((await res.json()) as { id: string }).id;
      });
      await supabaseAdmin.from("parse_jobs")
        .update({ anthropic_batch_id: batchId, error: null }).eq("id", jobId);
    }

    // (2) Poll
    let ended;
    for (let i = 0; i < MAX_POLLS; i++) {
      await step.sleep(`wait-${i}`, "15s");
      const status = await step.run(`poll-${i}`, async () => {
        const res = await fetch(
          `https://api.anthropic.com/v1/messages/batches/${batchId}`,
          { method: "GET", headers: ANTHROPIC_HEADERS(apiKey) });
        if (!res.ok) throw new Error(`Anthropic batch poll ${res.status}: …`);
        return await res.json() as { id: string; processing_status: string; results_url: string | null };
      });
      if (status.processing_status === "ended") { ended = status; break; }
    }

    // (3) Fetch JSONL and parse
    const resultRow = await step.run("fetch-results", async () => { /* fetch results_url, find row by custom_id */ });
    // → write status=succeeded + result, stop_reason, tokens
  },
);
```

---

## 5. Code — `src/lib/parseDocument.functions.ts`

```ts
export const startParseJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => startInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: doc } = await supabase.from("project_documents")
      .select("id, project_id").eq("id", data.documentId).single();

    // Idempotency: reuse any queued/running job for the same document
    const { data: activeJob } = await supabase.from("parse_jobs")
      .select("id, status").eq("document_id", doc.id)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (activeJob?.id) {
      await supabase.from("project_documents")
        .update({ parse_status: activeJob.status, last_parse_job_id: activeJob.id })
        .eq("id", doc.id);
      return { ok: true, jobId: activeJob.id };
    }

    const { data: job } = await supabase.from("parse_jobs").insert({
      project_id: doc.project_id, document_id: doc.id, user_id: userId,
      status: "queued", document_text: data.documentText,
    }).select("id").single();

    await supabase.from("project_documents")
      .update({ parse_status: "queued", last_parse_job_id: job.id }).eq("id", doc.id);

    // Send Inngest event via Lovable connector gateway
    const res = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": process.env.INNGEST_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "boq/parse.requested", data: { jobId: job.id } }),
    });
    if (!res.ok) { /* mark failed */ }

    return { ok: true, jobId: job.id };
  });

export const getParseJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => getInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("parse_jobs")
      .select("id, status, error, result, anthropic_batch_id, stop_reason, prompt_tokens, completion_tokens, started_at, finished_at")
      .eq("id", data.jobId).single();
    return { ok: true, job: row };
  });
```

---

## 6. Code — `src/routes/api/public/inngest.ts`

```ts
import { createFileRoute } from "@tanstack/react-router";
import { serve } from "inngest/edge";
import { inngest, parseBoQJob } from "@/lib/parseBoQJob.server";

const handler = serve({ client: inngest, functions: [parseBoQJob] });

export const Route = createFileRoute("/api/public/inngest")({
  server: {
    handlers: {
      GET: async ({ request }) => handler(request),
      POST: async ({ request }) => handler(request),
      PUT: async ({ request }) => handler(request),
    },
  },
});
```

Inngest signing key (`INNGEST_SIGNING_KEY`) is set in env; SDK reads it automatically.

---

## 7. UI trigger (`ProjectDocumentsTab.tsx`, abbreviated)

```ts
const startFn = useServerFn(startParseJob);
const getFn   = useServerFn(getParseJob);

const onParse = async (doc: Doc) => {
  // 1. signed URL → fetch file → extract text client-side (pdfjs, mammoth, xlsx, csv, txt)
  const text = await extractText(buf, doc.file_type);

  // 2. enqueue
  const start = await startFn({ data: { documentId: doc.id, documentText: text } });
  const jobId = start.jobId;

  // 3. poll every 4s for up to 5 minutes
  while (Date.now() < deadline) {
    await sleep(4000);
    const poll = await getFn({ data: { jobId } });
    if (poll.job.status === "succeeded" || poll.job.status === "failed") break;
  }
  // 4. write scope_elements + contract_items from job.result.items
};
```

A separate `useEffect` resumes polling for any doc with `parse_status in ('queued','running')` and a `last_parse_job_id`, so a refresh during a long job picks it back up.

---

## 8. Environment / secrets present

- `ANTHROPIC_API_KEY` ✔
- `LOVABLE_API_KEY` ✔
- `INNGEST_API_KEY` ✔ (connector proxy key, used as `X-Connection-Api-Key`)
- `INNGEST_SIGNING_KEY` ✔ (used by the SDK to verify inbound calls to `/api/public/inngest`)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ✔

---

## 9. Observed failure timeline

1. UI submits parse for a real BoQ document.
2. `parse_jobs` row inserted, `status=queued`, `document_text` populated (large — full extracted document).
3. Inngest event accepted by gateway (200 OK).
4. **Expected**: `parseBoQJob` runs on Inngest worker, sets `status=running`, hits `/v1/messages/batches`, writes `anthropic_batch_id`.
   **Actually observed in last failed run (`f4fb2aa7…`)**: log line `fetch -> Anthropic` followed by `Anthropic responded in 125038 ms status 524`. `anthropic_batch_id` stayed NULL. No `submitted batch` log. The `[parseBoQJob] anthropic-batch-v2 starting job` startup log was **not** seen.
5. A subsequent smoke test with tiny `document_text` did follow the new path end-to-end and succeeded (`msgbatch_…`, succeeded, tokens populated).
6. Real document re-runs still hang/fail in the UI; user reports "nothing happens".

---

## 10. Hypotheses for reviewer to evaluate

1. **Stale Inngest deployment.** The `parse-boq-job` function registered with Inngest might still point at the *previous* serve URL/version of the worker, so events land on old code. The new batch version exists only on the latest preview build. Evidence: missing `anthropic-batch-v2 starting job` log on the failed real run, but present on the smoke run after a manual re-sync.
2. **`document_text` payload size.** Real BoQ PDFs produce very large extracted text. The serverFn `startParseJob` ships it in the RPC body; `parse_jobs.document_text` is unbounded `text` (no column limit). But the input validator caps at 500_000 chars (`z.string().min(1).max(500_000)`). A larger doc would fail Zod validation before insert — would surface in the UI as `Parse failed: …`. Worth checking whether the document actually exceeds that.
3. **Edge function cold-start vs. Inngest signing.** `/api/public/inngest` runs on the Cloudflare edge. If the Worker cold-starts and `INNGEST_SIGNING_KEY` is missing during the first request, signature verification fails silently and Inngest retries against the old version.
4. **Inngest step retry replaying old code.** Even with idempotency, when Inngest *retries* a step it replays the function from the top. If the *registered* function still has the old direct-`/v1/messages` body, retries continue to hit Anthropic directly.
5. **UI polling stops at 5 min** while Inngest poll loop runs up to 30 min. For long batches the user sees "Parse is taking longer than expected" toast and assumes failure even though the batch may complete later. The resume-polling `useEffect` will only re-pick up if `project_documents.parse_status` is still `queued`/`running` — confirm it is being set.
6. **Cloudflare 524 origin.** The 524 came from a call that took 125s — that is the symptom of *the old direct-message implementation still running on Inngest workers* (Inngest workers tolerate up to 2h, but the Anthropic call itself returned 524 from Cloudflare in front of Anthropic). The new batch code never holds a connection that long.
7. **Token / size mismatch for batch.** Anthropic Batch API has different limits than realtime. If the prompt exceeds the per-request size limit, the batch submit returns 4xx with `invalid_request_error`; current code surfaces that as `failJob(…)` with the body — confirm none of the failed runs contain that message.

---

## 11. Questions the reviewer should answer

- Does the registered Inngest function on the live worker URL contain the `anthropic-batch-v2` string? (`GET /api/public/inngest` returns the function manifest.)
- For the most recent failed `parse_jobs` row, what are `status`, `anthropic_batch_id`, `error`, `stop_reason`, `length(document_text)`?
- Are there Cloudflare Worker logs showing the `[parseBoQJob] anthropic-batch-v2 starting job <id>` line for the failing run? If not, the old code is what executed.
- Did the Inngest dashboard show a single function version, or two (old + new) racing?
- Is `requireSupabaseAuth` actually returning quickly for `startParseJob`, or is the time being burned before the Inngest event is even sent?

---

## 12. What is NOT in scope for this dump

- Frontend layout / styling.
- Other tabs (Valuations, Procurement, etc.).
- Auth/session — confirmed working (smoke test succeeded under same user).

This document is intentionally a snapshot. Once Claude reviews, the next iteration plan will be created from their findings.
