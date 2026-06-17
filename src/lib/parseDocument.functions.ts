import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const startInput = z.object({
  documentId: z.string().uuid(),
  documentText: z.string().min(1).max(500_000),
});

const getInput = z.object({
  jobId: z.string().uuid(),
});

export const startParseJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Look up project_id from the document (and confirm the user can see it via RLS).
    const { data: doc, error: docErr } = await supabase
      .from("project_documents")
      .select("id, project_id")
      .eq("id", data.documentId)
      .single();
    if (docErr || !doc) {
      console.error("[startParseJob] document lookup failed:", docErr?.message);
      return { ok: false as const, error: "Document not found." };
    }

    const { data: activeJob } = await supabase
      .from("parse_jobs")
      .select("id, status")
      .eq("document_id", doc.id)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (activeJob?.id) {
      console.log("[startParseJob] reusing active job", activeJob.id, activeJob.status);
      await supabase
        .from("project_documents")
        .update({ parse_status: activeJob.status, last_parse_job_id: activeJob.id })
        .eq("id", doc.id);
      return { ok: true as const, jobId: activeJob.id };
    }

    const { data: job, error: insErr } = await supabase
      .from("parse_jobs")
      .insert({
        project_id: doc.project_id,
        document_id: doc.id,
        user_id: userId,
        status: "queued",
        document_text: data.documentText,
      })
      .select("id")
      .single();
    if (insErr || !job) {
      console.error("[startParseJob] insert parse_jobs failed:", insErr?.message);
      return { ok: false as const, error: insErr?.message || "Could not enqueue parse job." };
    }

    await supabase
      .from("project_documents")
      .update({ parse_status: "queued", last_parse_job_id: job.id })
      .eq("id", doc.id);

    const lovableKey = process.env.LOVABLE_API_KEY;
    const inngestKey = process.env.INNGEST_API_KEY;
    if (!lovableKey || !inngestKey) {
      const msg = "Inngest connector is not configured.";
      console.error("[startParseJob]", msg);
      await supabase
        .from("parse_jobs")
        .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
        .eq("id", job.id);
      await supabase
        .from("project_documents")
        .update({ parse_status: "failed" })
        .eq("id", doc.id);
      return { ok: false as const, error: msg };
    }

    try {
      const res = await fetch("https://connector-gateway.lovable.dev/inngest/e/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": inngestKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "boq/parse.requested", data: { jobId: job.id } }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Inngest gateway ${res.status}: ${body.slice(0, 300)}`);
      }
      console.log("[startParseJob] enqueued job", job.id);
    } catch (e: any) {
      console.error("[startParseJob] failed to send Inngest event:", e?.message);
      await supabase
        .from("parse_jobs")
        .update({ status: "failed", error: e?.message || "Failed to enqueue.", finished_at: new Date().toISOString() })
        .eq("id", job.id);
      await supabase
        .from("project_documents")
        .update({ parse_status: "failed" })
        .eq("id", doc.id);
      return { ok: false as const, error: e?.message || "Failed to enqueue parse job." };
    }

    return { ok: true as const, jobId: job.id };
  });

export const getParseJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => getInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("parse_jobs")
      .select(
        "id, status, error, result, anthropic_batch_id, stop_reason, prompt_tokens, completion_tokens, started_at, finished_at",
      )
      .eq("id", data.jobId)
      .single();
    if (error || !row) {
      return { ok: false as const, error: error?.message || "Job not found." };
    }
    return { ok: true as const, job: row };
  });
