import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  transcript: z.string().min(1).max(50_000),
  projectId: z.string().uuid(),
  siteWalkId: z.string().uuid(),
});

const SYSTEM_PROMPT = `You are an AI assistant for a UK construction site manager.

You will receive a raw site walk transcript spoken naturally on site.

Your job is to structure it into a clear site diary document organised by room or area.

For each room or area mentioned extract:
- Room or area name
- Progress: what has been completed. For each progress item, estimate completion_percent (an integer 0-100) based on how complete the work sounds. "Complete" or "finished" = 100. "Nearly done" / "snagging" = 90. "Half done" = 50. "Started" / "just begun" = 20. If unclear, make a reasonable estimate.
- Next tasks: what still needs doing
- Materials needed: anything mentioned as required
- Health and safety flags: any hazards, risks or safety issues mentioned
- Valuation notes: any work that could support a payment claim

Also produce:
- A one paragraph overall site summary
- A flat list of all procurement items across all rooms
- A flat list of all potential variations mentioned
- A flat list of all health and safety flags across all rooms

Where progress mentioned matches a contract item, include the contract item code in the progress item as contract_item_ref. This helps map completed work directly to the schedule of rates.

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
      "progress": [{ "text": "string", "completion_percent": 0, "contract_item_ref": "string (optional, omit if no match)" }],
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

function normaliseText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isSimilar(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export const analyseSiteWalk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "ANTHROPIC_API_KEY is not configured." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const plan = getUserPlan(userId);
    const limit = PLAN_LIMITS[plan];
    const month = currentMonth();

    // Check current usage for this calendar month
    const { data: usageRow, error: usageErr } = await supabaseAdmin
      .from("usage_tracking")
      .select("id, analysis_count")
      .eq("user_id", userId)
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

    // Fetch contract items (BoQ) to help the model map progress to rates.
    const { data: ciRows } = await supabaseAdmin
      .from("contract_items")
      .select("code, description, total_qty, unit, unit_rate")
      .eq("project_id", data.projectId);
    const contractItems = (ciRows ?? []) as Array<{
      code: string | null;
      description: string | null;
      total_qty: number | null;
      unit: string | null;
      unit_rate: number | null;
    }>;
    let userMessage = `Transcript:\n\n${data.transcript}`;
    if (contractItems.length > 0) {
      const lines = contractItems.map((c) => {
        const code = c.code ?? "—";
        const desc = c.description ?? "";
        const qty = c.total_qty ?? "";
        const unit = c.unit ?? "";
        const rate = c.unit_rate != null ? Number(c.unit_rate).toFixed(2) : "";
        return `[${code}] ${desc} — ${qty} ${unit} @ £${rate}`.trim();
      });
      userMessage += `\n\nCONTRACT ITEMS (BoQ):\n${lines.join("\n")}`;
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
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userMessage },
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

    // Auto-insert procurement items (dedup against active rows)
    const procurement: string[] = Array.isArray(analysis.all_procurement)
      ? analysis.all_procurement.filter((s: any) => typeof s === "string" && s.trim())
      : [];
    let procurementAdded = 0;
    let procurementSkipped = 0;
    if (procurement.length) {
      const { data: existingProc } = await supabaseAdmin
        .from("procurement_items")
        .select("description, status")
        .eq("project_id", data.projectId)
        .in("status", ["Required", "Quoted", "Ordered"]);
      const existingNorm = (existingProc ?? []).map((r: any) => normaliseText(String(r.description ?? "")));
      const { data: scopeRows } = await supabaseAdmin
        .from("scope_elements")
        .select("id, title, description")
        .eq("project_id", data.projectId);
      const { classifyProcurement } = await import("./procurement-phase");
      const toInsert: Array<{ project_id: string; description: string; status: string; scope_element_id: string | null; phase_order: number }> = [];
      const seenThisRun: string[] = [];
      for (const raw of procurement) {
        const desc = raw.trim();
        const n = normaliseText(desc);
        if (existingNorm.some((e) => isSimilar(e, n)) || seenThisRun.some((e) => isSimilar(e, n))) {
          procurementSkipped++;
          continue;
        }
        seenThisRun.push(n);
        const cls = classifyProcurement(desc, (scopeRows ?? []) as any);
        toInsert.push({
          project_id: data.projectId,
          description: desc,
          status: "Required",
          scope_element_id: cls.scope_element_id,
          phase_order: cls.phase_order,
        });
      }
      if (toInsert.length) {
        const { error: pErr } = await supabaseAdmin.from("procurement_items").insert(toInsert);
        if (pErr) console.error("[analyseSiteWalk] procurement insert failed", pErr);
        else procurementAdded = toInsert.length;
      }
    }

    // Auto-insert variations (dedup against open variations for this project)
    const variations: string[] = Array.isArray(analysis.all_variations)
      ? analysis.all_variations.filter((s: any) => typeof s === "string" && s.trim())
      : [];
    let variationsAdded = 0;
    let variationsSkipped = 0;
    if (variations.length) {
      const { data: existingVars } = await supabaseAdmin
        .from("variations")
        .select("description, status")
        .eq("project_id", data.projectId)
        .in("status", ["Draft", "Pending", "Approved"]);
      const existingNorm = (existingVars ?? []).map((r: any) => normaliseText(String(r.description ?? "")));
      const toInsert: Array<{ project_id: string; description: string; status: string }> = [];
      const seenThisRun: string[] = [];
      for (const raw of variations) {
        const desc = raw.trim();
        const n = normaliseText(desc);
        if (existingNorm.some((e) => isSimilar(e, n)) || seenThisRun.some((e) => isSimilar(e, n))) {
          variationsSkipped++;
          continue;
        }
        seenThisRun.push(n);
        toInsert.push({ project_id: data.projectId, description: desc, status: "Draft" });
      }
      if (toInsert.length) {
        const { error: vErr } = await supabaseAdmin.from("variations").insert(toInsert);
        if (vErr) console.error("[analyseSiteWalk] variations insert failed", vErr);
        else variationsAdded = toInsert.length;
      }
    }

    // -------- Match snapshots to nearest finding --------
    // For each photo on this walk, pick the variation/procurement row whose
    // description best overlaps the photo's transcript_context (last 15s).
    try {
      const { data: photos } = await supabaseAdmin
        .from("site_walk_photos")
        .select("id, transcript_context, timestamp_seconds, linked_variation_id, linked_procurement_id")
        .eq("site_walk_id", data.siteWalkId);
      const photoRows = (photos ?? []) as any[];
      if (photoRows.length) {
        const [{ data: varRows }, { data: procRows }] = await Promise.all([
          supabaseAdmin
            .from("variations")
            .select("id, description")
            .eq("project_id", data.projectId),
          supabaseAdmin
            .from("procurement_items")
            .select("id, description")
            .eq("project_id", data.projectId),
        ]);
        const candidates: Array<{ id: string; kind: "variation" | "procurement"; tokens: Set<string> }> = [];
        for (const r of (varRows ?? []) as any[]) {
          if (!r.description) continue;
          candidates.push({
            id: r.id,
            kind: "variation",
            tokens: new Set(normaliseText(r.description).split(" ").filter((t) => t.length > 2)),
          });
        }
        for (const r of (procRows ?? []) as any[]) {
          if (!r.description) continue;
          candidates.push({
            id: r.id,
            kind: "procurement",
            tokens: new Set(normaliseText(r.description).split(" ").filter((t) => t.length > 2)),
          });
        }
        for (const photo of photoRows) {
          if (photo.linked_variation_id || photo.linked_procurement_id) continue;
          const ctx = String(photo.transcript_context ?? "").trim();
          if (!ctx) continue;
          const ctxTokens = new Set(
            normaliseText(ctx).split(" ").filter((t) => t.length > 2),
          );
          if (ctxTokens.size === 0) continue;
          let best: { score: number; id: string; kind: "variation" | "procurement" } | null = null;
          for (const c of candidates) {
            let overlap = 0;
            for (const t of c.tokens) if (ctxTokens.has(t)) overlap++;
            if (overlap >= 2 && (!best || overlap > best.score)) {
              best = { score: overlap, id: c.id, kind: c.kind };
            }
          }
          if (best) {
            const update =
              best.kind === "variation"
                ? { linked_variation_id: best.id }
                : { linked_procurement_id: best.id };
            await supabaseAdmin.from("site_walk_photos").update(update).eq("id", photo.id);
          }
        }
      }
    } catch (e) {
      console.error("[analyseSiteWalk] photo matching failed", e);
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
        .insert({ user_id: userId, month, analysis_count: 1 });
    }

    return {
      ok: true as const,
      analysis,
      row: inserted,
      usage: { plan, used: currentCount + 1, limit },
      autoInserts: {
        procurementAdded,
        procurementSkipped,
        variationsAdded,
        variationsSkipped,
      },
    };
  });
