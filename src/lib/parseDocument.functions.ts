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
    console.log("[parseBoQ] max_tokens: 8000");

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
          {
            role: "user",
            content: `Parse every line item from this document:\n\n${data.documentText}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[parseBoQ] Anthropic API error", res.status, res.statusText);
      console.error("[parseBoQ] Anthropic error body:", body);
      return { ok: false as const, error: `Anthropic ${res.status}: ${body.slice(0, 500)}` };
    }


    const body = await res.json();
    const text: string | undefined = body?.content?.[0]?.text;
    if (!text) return { ok: false as const, error: "Anthropic returned no content." };

    try {
      return { ok: true as const, parsed: JSON.parse(text) };
    } catch (e) {
      console.error("JSON parse failed", e);
      return { ok: false as const, error: "Anthropic returned invalid JSON." };
    }
  });
