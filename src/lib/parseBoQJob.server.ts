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
`;

export const parseBoQJob = inngest.createFunction(
  { id: "parse-boq-job", retries: 1, triggers: [{ event: "boq/parse.requested" }] },
  async ({ event, step }) => {
    const jobId = (event.data as { jobId?: string })?.jobId;
    if (!jobId) throw new Error("Missing jobId in event data");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Load job
    const { data: job, error: loadErr } = await supabaseAdmin
      .from("parse_jobs")
      .select("id, document_id, project_id, document_text")
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

    const startedAt = Date.now();
    console.log("[parseBoQJob] fetch -> Anthropic at", new Date(startedAt).toISOString(), "docText:", job.document_text.length);

    const callAnthropic = async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [
            { role: "user", content: `Parse every line item from this document:\n\n${job.document_text}` },
          ],
        }),
      });
      const text = await res.text();
      return { status: res.status, ok: res.ok, body: text };
    };

    let response: { status: number; ok: boolean; body: string };
    try {
      response = await step.run("anthropic-call", callAnthropic);
    } catch (e: any) {
      const msg = `Network error calling Anthropic: ${e?.message || e}`;
      console.error("[parseBoQJob]", msg);
      await failJob(jobId, job.document_id, msg);
      return { ok: false };
    }

    const elapsed = Date.now() - startedAt;
    console.log("[parseBoQJob] Anthropic responded in", elapsed, "ms status", response.status);

    if (!response.ok) {
      const msg = `Anthropic ${response.status}: ${response.body.slice(0, 500)}`;
      console.error("[parseBoQJob]", msg);
      await failJob(jobId, job.document_id, msg);
      return { ok: false };
    }

    let parsedBody: any;
    try {
      parsedBody = JSON.parse(response.body);
    } catch (e: any) {
      await failJob(jobId, job.document_id, `Bad Anthropic envelope: ${e?.message}`);
      return { ok: false };
    }

    const text: string | undefined = parsedBody?.content?.[0]?.text;
    const stopReason: string | undefined = parsedBody?.stop_reason;
    const usage = parsedBody?.usage ?? {};
    console.log("[parseBoQJob] stop_reason:", stopReason, "usage:", JSON.stringify(usage), "text len:", text?.length ?? 0);

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
      const msg = `Anthropic returned invalid JSON${stopReason === "max_tokens" ? " (truncated by max_tokens)" : ""}: ${e?.message || ""}`;
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
        await supabaseAdmin.from("project_documents").update({ parse_status: "failed" }).eq("id", job.document_id);
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
    await supabaseAdmin.from("project_documents").update({ parse_status: "failed" }).eq("id", documentId);
  }
}
