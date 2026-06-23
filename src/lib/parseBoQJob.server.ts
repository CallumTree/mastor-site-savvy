import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "mastor-app" });

const SYSTEM_PROMPT = `
You are a construction document parser for a UK building contractor platform.

Your job is to extract every single line item from the document provided.
You must not skip, summarise or combine any items.
Every row in the document becomes one object in your output.

Rules:
- Extract ALL items regardless of trade, location or type
- Preserve the exact description as written in the document
- Capture the comments field if present
- Capture code, quantity, unit, rate and cost exactly as written
- Group items under their location heading
- If no location heading exists use "General"
- Return ONLY valid JSON. No explanation. No markdown. No preamble.

Return this exact structure:
{
  "contract_reference": "string",
  "project_title": "string",
  "property_address": "string",
  "contract_value": number,
  "items": [
    {
      "location": "string",
      "description": "string",
      "comments": "string or null",
      "code": "string or null",
      "quantity": number,
      "unit": "string or null",
      "rate": number,
      "cost": number,
      "element_type": "claimable_element"
    }
  ]
}

Be concise. Keep description and comments fields as short as possible while preserving meaning. Do not pad or repeat information from other fields.
`;

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

    // Load job
    const { data: job, error: loadErr } = await supabaseAdmin
      .from("parse_jobs")
      .select("id, document_id, project_id, document_text, anthropic_batch_id")
      .eq("id", jobId)
      .single();
    if (loadErr || !job) throw new Error(`parse_jobs load failed: ${loadErr?.message}`);
    if (!job.document_text) throw new Error("parse_jobs row has no document_text");

    // Mark running
    await supabaseAdmin
      .from("parse_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);
    if (job.document_id) {
      await supabaseAdmin
        .from("project_documents")
        .update({ parse_status: "running" })
        .eq("id", job.document_id);
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await failJob(jobId, job.document_id, "ANTHROPIC_API_KEY is not configured.");
      return { ok: false };
    }

    // 1) Submit batch, or resume an existing batch when Inngest retries this job.
    let batchId = job.anthropic_batch_id;
    if (batchId) {
      console.log(
        `[parseBoQJob] ${PARSER_VERSION} resuming existing batch`,
        batchId,
        "for job",
        jobId,
      );
    } else {
      try {
        batchId = await step.run("submit-batch", async () => {
          const res = await fetch("https://api.anthropic.com/v1/messages/batches", {
            method: "POST",
            headers: ANTHROPIC_HEADERS(apiKey),
            body: JSON.stringify({
              requests: [
                {
                  custom_id: jobId,
                  params: {
                    model: "claude-sonnet-4-6",
                    max_tokens: 32000,
                    system: SYSTEM_PROMPT,
                    messages: [
                      {
                        role: "user",
                        content: `Parse every line item from this document:\n\n${job.document_text}`,
                      },
                    ],
                  },
                },
              ],
            }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`Anthropic batch submit ${res.status}: ${body.slice(0, 500)}`);
          }
          const data = (await res.json()) as { id: string };
          return data.id;
        });
      } catch (e: any) {
        const msg = `Failed to submit Anthropic batch: ${e?.message || e}`;
        console.error("[parseBoQJob]", msg);
        await failJob(jobId, job.document_id, msg);
        return { ok: false };
      }

      console.log(`[parseBoQJob] ${PARSER_VERSION} submitted batch`, batchId, "for job", jobId);
      await supabaseAdmin
        .from("parse_jobs")
        .update({ anthropic_batch_id: batchId, error: null })
        .eq("id", jobId);
    }

    if (!batchId) {
      await failJob(jobId, job.document_id, "Anthropic batch was not created.");
      return { ok: false };
    }

    // 2) Poll batch status
    let ended:
      | { id: string; processing_status: string; results_url: string | null }
      | undefined;
    for (let i = 0; i < MAX_POLLS; i++) {
      await step.sleep(`wait-${i}`, "15s");
      const status = await step.run(`poll-${i}`, async () => {
        const res = await fetch(
          `https://api.anthropic.com/v1/messages/batches/${batchId}`,
          { method: "GET", headers: ANTHROPIC_HEADERS(apiKey) },
        );
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Anthropic batch poll ${res.status}: ${body.slice(0, 300)}`);
        }
        return (await res.json()) as {
          id: string;
          processing_status: string;
          results_url: string | null;
        };
      });
      if (status.processing_status === "ended") {
        ended = status;
        break;
      }
    }

    if (!ended) {
      await failJob(
        jobId,
        job.document_id,
        "Anthropic batch did not complete within 30 minutes.",
      );
      return { ok: false };
    }

    if (!ended.results_url) {
      await failJob(jobId, job.document_id, "Anthropic batch ended without results_url.");
      return { ok: false };
    }

    // 3) Fetch results JSONL
    type BatchResult = {
      custom_id: string;
      result:
        | {
            type: "succeeded";
            message: {
              content: Array<{ type: string; text?: string }>;
              stop_reason?: string;
              usage?: { input_tokens?: number; output_tokens?: number };
            };
          }
        | { type: "errored"; error: { type: string; message: string } }
        | { type: "canceled" }
        | { type: "expired" };
    };

    let resultRow: BatchResult;
    try {
      resultRow = await step.run("fetch-results", async () => {
        const res = await fetch(ended!.results_url!, {
          method: "GET",
          headers: ANTHROPIC_HEADERS(apiKey),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Anthropic batch results ${res.status}: ${body.slice(0, 300)}`);
        }
        const text = await res.text();
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const match = lines
          .map((l) => JSON.parse(l) as BatchResult)
          .find((r) => r.custom_id === jobId);
        if (!match) throw new Error("No matching custom_id in batch results JSONL.");
        return match;
      });
    } catch (e: any) {
      const msg = `Failed to fetch Anthropic batch results: ${e?.message || e}`;
      console.error("[parseBoQJob]", msg);
      await failJob(jobId, job.document_id, msg);
      return { ok: false };
    }

    if (resultRow.result.type !== "succeeded") {
      const reason =
        resultRow.result.type === "errored"
          ? `${resultRow.result.error.type}: ${resultRow.result.error.message}`
          : resultRow.result.type;
      await failJob(jobId, job.document_id, `Anthropic batch result ${reason}`);
      return { ok: false };
    }

    const message = resultRow.result.message;
    const text = message.content.find((c) => c.type === "text")?.text ?? "";
    const stopReason = message.stop_reason;
    const usage = message.usage ?? {};
    console.log(
      "[parseBoQJob] stop_reason:",
      stopReason,
      "usage:",
      JSON.stringify(usage),
      "text len:",
      text.length,
    );

    if (!text) {
      await failJob(jobId, job.document_id, "Anthropic returned no content.");
      return { ok: false };
    }

    let result: any;
    try {
      const cleaned = text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```\s*$/, "");
      result = JSON.parse(cleaned);
    } catch (e: any) {
      const msg = `Anthropic returned invalid JSON${
        stopReason === "max_tokens" ? " (truncated by max_tokens)" : ""
      }: ${e?.message || ""}`;
      console.error("[parseBoQJob]", msg);
      await supabaseAdmin
        .from("parse_jobs")
        .update({
          status: "failed",
          error: msg,
          stop_reason: stopReason,
          prompt_tokens: usage?.input_tokens ?? null,
          completion_tokens: usage?.output_tokens ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (job.document_id) {
        await supabaseAdmin
          .from("project_documents")
          .update({ parse_status: "failed" })
          .eq("id", job.document_id);
      }
      return { ok: false };
    }

    await supabaseAdmin
      .from("parse_jobs")
      .update({
        status: "succeeded",
        result,
        stop_reason: stopReason,
        prompt_tokens: usage?.input_tokens ?? null,
        completion_tokens: usage?.output_tokens ?? null,
        finished_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", jobId);

    if (job.document_id) {
      await supabaseAdmin
        .from("project_documents")
        .update({ parse_status: "succeeded", parsed_at: new Date().toISOString() })
        .eq("id", job.document_id);
    }

    return { ok: true, jobId };
  },
);

async function failJob(jobId: string, documentId: string | null, error: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("parse_jobs")
    .update({ status: "failed", error, finished_at: new Date().toISOString() })
    .eq("id", jobId);
  if (documentId) {
    await supabaseAdmin
      .from("project_documents")
      .update({ parse_status: "failed" })
      .eq("id", documentId);
  }
}
