import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  project_id: z.string().uuid(),
});

const SYSTEM_PROMPT = `You are a senior UK Quantity Surveyor identifying claimable work.

You are given:
- A list of CLAIMABLE SCOPE ELEMENTS (from a parsed BoQ / Schedule of Works).
- A list of APPROVED PROGRESS findings (confirmed completed work from site walks).

Your job: match approved progress to the claimable elements it satisfies.

Use construction understanding — not literal text matching:
- "Stud wall complete" matches "Construct Stud Partition"
- "Studwork erected" matches "Construct Stud Partition"
- "Bathroom tiled" matches "Wall Tiling"
- "First fix electrics done" matches "Electrical First Fix"

Rules:
- Only return matches you are reasonably confident in.
- Each match must reference exactly one scope_element_id AND one approved_finding_id (both from the inputs).
- Confidence: high (strong terminology match), medium (likely match), low (possible match).
- claim_title should mirror the scope element title.
- claim_description: one short sentence explaining why the progress satisfies the element.
- Do NOT invent items not present in the inputs.
- Return STRICT JSON via the provided tool.`;

const MATCH_TOOL = {
  type: "function",
  function: {
    name: "return_potential_claims",
    description: "Return matches between approved progress and claimable scope elements",
    parameters: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scope_element_id: { type: "string" },
              approved_finding_id: { type: "string" },
              claim_title: { type: "string" },
              claim_description: { type: "string" },
              confidence_score: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["scope_element_id", "approved_finding_id", "claim_title", "claim_description", "confidence_score"],
            additionalProperties: false,
          },
        },
      },
      required: ["claims"],
      additionalProperties: false,
    },
  },
} as const;

export const generatePotentialClaims = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: scope, error: se }, { data: findings, error: fe }, { data: existing }] = await Promise.all([
      supabase
        .from("scope_elements")
        .select("id, title, description, source_reference, quantity, unit")
        .eq("project_id", data.project_id)
        .eq("element_type", "claimable_element"),
      supabase
        .from("approved_findings")
        .select("id, finding_text, finding_type, original_text")
        .eq("project_id", data.project_id)
        .eq("status", "Approved")
        .eq("finding_type", "progress"),
      supabase
        .from("claim_opportunities")
        .select("scope_element_id, approved_finding_id")
        .eq("project_id", data.project_id),
    ]);

    if (se) return { ok: false as const, error: se.message };
    if (fe) return { ok: false as const, error: fe.message };

    if (!scope || scope.length === 0) {
      return { ok: false as const, error: "No claimable scope elements found. Parse a scope document first." };
    }
    if (!findings || findings.length === 0) {
      return { ok: false as const, error: "No approved progress findings yet. Approve site progress first." };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not configured (missing LOVABLE_API_KEY)." };

    const userContent = `CLAIMABLE SCOPE ELEMENTS:
${JSON.stringify(scope, null, 2)}

APPROVED PROGRESS FINDINGS:
${JSON.stringify(findings, null, 2)}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        tools: [MATCH_TOOL],
        tool_choice: { type: "function", function: { name: "return_potential_claims" } },
      }),
    });

    if (res.status === 429) return { ok: false as const, error: "Rate limit reached. Try again shortly." };
    if (res.status === 402) return { ok: false as const, error: "AI credits exhausted. Add credits in workspace settings." };
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("AI gateway error", res.status, t);
      return { ok: false as const, error: `AI request failed (${res.status}).` };
    }

    const body = await res.json();
    const argsStr = body?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return { ok: false as const, error: "AI returned no structured output." };

    let parsed: { claims: Array<{ scope_element_id: string; approved_finding_id: string; claim_title: string; claim_description: string; confidence_score: "high" | "medium" | "low" }> };
    try {
      parsed = JSON.parse(argsStr);
    } catch (e) {
      console.error("parse error", e);
      return { ok: false as const, error: "AI returned invalid JSON." };
    }

    const scopeIds = new Set(scope.map((s: any) => s.id));
    const findingIds = new Set(findings.map((f: any) => f.id));
    const existingKey = new Set(
      (existing ?? []).map((e: any) => `${e.scope_element_id}::${e.approved_finding_id}`)
    );

    // Estimate value from a matching contract_item (best-effort by title overlap)
    const { data: contractItems } = await supabase
      .from("contract_items")
      .select("id, description, total_qty, unit_rate")
      .eq("project_id", data.project_id);

    const estimateValue = (title: string): number | null => {
      if (!contractItems || contractItems.length === 0) return null;
      const t = title.toLowerCase();
      const match = contractItems.find((c: any) =>
        c.description && t.includes(String(c.description).toLowerCase().split(" ")[0])
      );
      if (!match) return null;
      const qty = Number(match.total_qty ?? 0);
      const rate = Number(match.unit_rate ?? 0);
      return qty && rate ? qty * rate : null;
    };

    const rows = parsed.claims
      .filter((c) => scopeIds.has(c.scope_element_id) && findingIds.has(c.approved_finding_id))
      .filter((c) => !existingKey.has(`${c.scope_element_id}::${c.approved_finding_id}`))
      .map((c) => ({
        project_id: data.project_id,
        scope_element_id: c.scope_element_id,
        approved_finding_id: c.approved_finding_id,
        claim_title: c.claim_title,
        claim_description: c.claim_description,
        contract_value: estimateValue(c.claim_title),
        confidence_score: c.confidence_score,
        status: "Suggested",
      }));

    if (rows.length === 0) {
      return { ok: true as const, inserted: 0, skipped_existing: parsed.claims.length };
    }

    const { error: ie } = await supabase.from("potential_claims").insert(rows);
    if (ie) return { ok: false as const, error: ie.message };

    return { ok: true as const, inserted: rows.length, skipped_existing: parsed.claims.length - rows.length };
  });
