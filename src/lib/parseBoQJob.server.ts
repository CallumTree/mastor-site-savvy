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

const PARSER_VERSION = "lovable-gemini-v1";

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

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      await failJob(jobId, job.document_id, "LOVABLE_API_KEY is not configured.");
      return { ok: false };
    }

    // Call Lovable AI Gateway (Gemini) inside a step so Inngest can retry
    let text = "";
    let usage: { prompt_tokens?: number; completion_tokens?: number } = {};
    let finishReason: string | undefined;
    try {
      const result = await step.run("gateway-call", async () => {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3.6-flash",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: `Parse every line item from this document:\n\n${job.document_text}`,
              },
            ],
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`AI gateway ${res.status}: ${body.slice(0, 500)}`);
        }
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        return {
          text: data.choices?.[0]?.message?.content ?? "",
          finish_reason: data.choices?.[0]?.finish_reason,
          usage: data.usage ?? {},
        };
      });
      text = result.text;
      usage = result.usage;
      finishReason = result.finish_reason;
    } catch (e: any) {
      const msg = `AI gateway call failed: ${e?.message || e}`;
      console.error("[parseBoQJob]", msg);
      await failJob(jobId, job.document_id, msg);
      return { ok: false };
    }

    console.log(
      "[parseBoQJob] finish_reason:",
      finishReason,
      "usage:",
      JSON.stringify(usage),
      "text len:",
      text.length,
    );

    if (!text) {
      await failJob(jobId, job.document_id, "AI returned no content.");
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
      const msg = `AI returned invalid JSON${
        finishReason === "length" ? " (truncated by output length)" : ""
      }: ${e?.message || ""}`;
      console.error("[parseBoQJob]", msg);
      await supabaseAdmin
        .from("parse_jobs")
        .update({
          status: "failed",
          error: msg,
          stop_reason: finishReason,
          prompt_tokens: usage?.prompt_tokens ?? null,
          completion_tokens: usage?.completion_tokens ?? null,
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
        stop_reason: finishReason,
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
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
