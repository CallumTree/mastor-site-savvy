import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  documentText: z.string().min(1).max(500_000),
});

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

export const parseBoQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "ANTHROPIC_API_KEY is not configured." };
    }

    console.log("[parseBoQ] documentText length:", data.documentText.length);
    console.log("[parseBoQ] documentText (first 500 chars):", data.documentText.slice(0, 500));
    console.log("[parseBoQ] anthropic-version: 2023-06-01");
    console.log("[parseBoQ] x-api-key present:", Boolean(apiKey), "length:", apiKey.length);
    console.log("[parseBoQ] max_tokens: 16000");

    const startedAt = Date.now();
    console.log("[parseBoQ] fetch -> Anthropic at", new Date(startedAt).toISOString());

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
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
            {
              role: "user",
              content: `Parse every line item from this document:\n\n${data.documentText}`,
            },
          ],
        }),
      });
    } catch (e: any) {
      const elapsed = Date.now() - startedAt;
      console.error("[parseBoQ] fetch threw after", elapsed, "ms:", e?.name, e?.message);
      return { ok: false as const, error: `Network error calling Anthropic after ${elapsed}ms: ${e?.message || e}` };
    }

    const elapsed = Date.now() - startedAt;
    console.log("[parseBoQ] Anthropic responded in", elapsed, "ms with status", res.status);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[parseBoQ] Anthropic API error", res.status, res.statusText);
      console.error("[parseBoQ] Anthropic error body:", body);
      return { ok: false as const, error: `Anthropic ${res.status}: ${body.slice(0, 500)}` };
    }

    const body = await res.json();
    const text: string | undefined = body?.content?.[0]?.text;
    console.log("[parseBoQ] stop_reason:", body?.stop_reason, "usage:", JSON.stringify(body?.usage));
    console.log("[parseBoQ] text length:", text?.length ?? 0);
    if (text) {
      console.log("[parseBoQ] text head (200):", text.slice(0, 200));
      console.log("[parseBoQ] text tail (200):", text.slice(-200));
    }

    if (!text) return { ok: false as const, error: "Anthropic returned no content." };

    if (body?.stop_reason === "max_tokens") {
      console.warn("[parseBoQ] response truncated by max_tokens — JSON will likely be invalid");
    }

    try {
      const cleaned = text
        .trim()
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/, "")
        .replace(/```\s*$/, "");
      return { ok: true as const, parsed: JSON.parse(cleaned) };
    } catch (e: any) {
      console.error("[parseBoQ] JSON parse failed:", e?.message);
      console.error("[parseBoQ] cleaned text (first 1000):", text.slice(0, 1000));
      return {
        ok: false as const,
        error: `Anthropic returned invalid JSON${body?.stop_reason === "max_tokens" ? " (response was truncated by max_tokens)" : ""}: ${e?.message || ""}`,
      };
    }
  });

