import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  transcript: z.string().min(1).max(50_000),
  projectId: z.string().uuid(),
  siteWalkId: z.string().uuid(),
  userId: z.string().uuid(),
});

const SYSTEM_PROMPT = `You are an AI assistant for a UK construction site manager.

You will receive a raw site walk transcript spoken naturally on site.

Your job is to structure it into a clear site diary document organised by room or area.

For each room or area mentioned extract:
- Room or area name
- Progress: what has been completed
- Next tasks: what still needs doing
- Materials needed: anything mentioned as required
- Health and safety flags: any hazards, risks or safety issues mentioned
- Valuation notes: any work that could support a payment claim

Also produce:
- A one paragraph overall site summary
- A flat list of all procurement items across all rooms
- A flat list of all potential variations mentioned
- A flat list of all health and safety flags across all rooms

Rules:
- Use plain British English
- Never invent items not mentioned in the transcript
- If something is unclear mark it as needs clarification
- Return ONLY valid JSON, no markdown, no preamble

Return this exact structure:
{
  "summary": "string",
  "rooms": [
    {
      "room": "string",
      "progress": ["string"],
      "next_tasks": ["string"],
      "materials_needed": ["string"],
      "health_and_safety": ["string"],
      "valuation_notes": ["string"]
    }
  ],
  "all_procurement": ["string"],
  "all_variations": ["string"],
  "all_health_and_safety": ["string"]
}`;

// Plan tier limits. Everyone hardcoded to "company" (unlimited) for now;
// flip getUserPlan() to read a real source when billing is wired up.
const PLAN_LIMITS = {
  solo: 10,
  builder: 30,
  company: Infinity,
} as const;

type PlanTier = keyof typeof PLAN_LIMITS;

function getUserPlan(_userId: string): PlanTier {
  // TODO: read from profiles/subscriptions when billing exists
  return "company";
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const analyseSiteWalk = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "ANTHROPIC_API_KEY is not configured." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const plan = getUserPlan(data.userId);
    const limit = PLAN_LIMITS[plan];
    const month = currentMonth();

    // Check current usage for this calendar month
    const { data: usageRow, error: usageErr } = await supabaseAdmin
      .from("usage_tracking")
      .select("id, analysis_count")
      .eq("user_id", data.userId)
      .eq("month", month)
      .maybeSingle();

    if (usageErr) {
      console.error("[analyseSiteWalk] usage_tracking read failed", usageErr);
      return { ok: false as const, error: "Could not check usage limits." };
    }

    const currentCount = usageRow?.analysis_count ?? 0;
    if (currentCount >= limit) {
      return {
        ok: false as const,
        limitReached: true as const,
        plan,
        limit,
        error: `You have reached your monthly limit of ${limit} AI analyses on the ${plan} plan. Upgrade your plan to continue.`,
      };
    }

    // Call Anthropic
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: `Transcript:\n\n${data.transcript}` },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[analyseSiteWalk] Anthropic error", res.status, errBody);
      return {
        ok: false as const,
        error: `Anthropic request failed (${res.status}): ${errBody.slice(0, 500)}`,
      };
    }

    const body = await res.json();
    const text: string | undefined = body?.content?.[0]?.text;
    if (!text) {
      return { ok: false as const, error: "Anthropic returned no content." };
    }

    let analysis: any;
    try {
      const cleaned = text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```\s*$/, "");
      analysis = JSON.parse(cleaned);
    } catch (e) {
      console.error("[analyseSiteWalk] JSON parse failed", e, text.slice(0, 500));
      return { ok: false as const, error: "Anthropic returned invalid JSON." };
    }

    // Save analysis_results
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("analysis_results")
      .insert({
        project_id: data.projectId,
        site_walk_id: data.siteWalkId,
        analysis_json: analysis,
      })
      .select("*")
      .single();

    if (insertErr) {
      console.error("[analyseSiteWalk] insert analysis_results failed", insertErr);
      return { ok: false as const, error: `Failed to save analysis: ${insertErr.message}` };
    }

    // Mark site walk as analysed
    const { error: updateErr } = await supabaseAdmin
      .from("site_walks")
      .update({ status: "analysed" })
      .eq("id", data.siteWalkId);
    if (updateErr) {
      console.error("[analyseSiteWalk] update site_walks status failed", updateErr);
    }

    // Increment usage counter
    if (usageRow) {
      await supabaseAdmin
        .from("usage_tracking")
        .update({ analysis_count: currentCount + 1 })
        .eq("id", usageRow.id);
    } else {
      await supabaseAdmin
        .from("usage_tracking")
        .insert({ user_id: data.userId, month, analysis_count: 1 });
    }

    return {
      ok: true as const,
      analysis,
      row: inserted,
      usage: { plan, used: currentCount + 1, limit },
    };
  });
