import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const contractItemSchema = z.object({
  id: z.string(),
  description: z.string().nullable().optional(),
  unit_rate: z.number().nullable().optional(),
  total_qty: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
});

const inputSchema = z.object({
  finding_text: z.string().min(1),
  room_name: z.string().default(""),
  contract_items: z.array(contractItemSchema).max(500),
});

const SYSTEM_PROMPT = `You are a UK quantity surveyor. Given a site walk finding and a list of contract items, identify the single best matching contract item. Consider trade, location, and activity — "skim complete" matches "plaster skim finish", "second fix carpentry" matches "fix door linings and skirtings" etc.

Return JSON only: { "matched": true/false, "contract_item_id": "uuid or null", "confidence": "high/medium/low", "reason": "string" }`;

export const matchFindingToContractItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "ANTHROPIC_API_KEY is not configured." };
    }
    if (data.contract_items.length === 0) {
      return {
        ok: true as const,
        result: { matched: false, contract_item_id: null, confidence: "low", reason: "No contract items" },
      };
    }

    const userMsg = `Finding: ${data.finding_text}
Room/Area: ${data.room_name || "(unspecified)"}

Contract items:
${data.contract_items
  .map(
    (c) =>
      `- id: ${c.id} | description: ${c.description ?? ""} | unit: ${c.unit ?? ""} | unit_rate: ${c.unit_rate ?? ""} | total_qty: ${c.total_qty ?? ""}`,
  )
  .join("\n")}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMsg }],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[matchFindingToContractItem] Anthropic error", res.status, errBody);
      return { ok: false as const, error: `Anthropic request failed (${res.status})` };
    }

    const body = await res.json();
    const text: string | undefined = body?.content?.[0]?.text;
    if (!text) return { ok: false as const, error: "Anthropic returned no content." };

    try {
      const cleaned = text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```\s*$/, "");
      const result = JSON.parse(cleaned);
      return { ok: true as const, result };
    } catch (e) {
      console.error("[matchFindingToContractItem] JSON parse failed", e, text.slice(0, 300));
      return { ok: false as const, error: "Anthropic returned invalid JSON." };
    }
  });
