import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  transcript: z.string().min(1).max(50000),
});

const SYSTEM_PROMPT = `You are an experienced UK construction Site Manager, Quantity Surveyor and Buyer analysing a transcript of a site walk.

Your job is to read the transcript and identify, ONLY using information explicitly contained in the transcript:

1. progress_items — work that has been completed or progressed (e.g. "Bedroom 1 skim complete")
2. procurement_items — materials, tools or consumables required (with quantity + unit where mentioned)
3. variation_items — client requests, additional works, scope changes
4. risk_items — delays, blockers, missing trades, access issues, pending decisions
5. site_diary_summary — a single professional paragraph (3-5 sentences) summarising the walk

Rules:
- Never invent information. If something isn't said, don't include it.
- Use British English construction terminology.
- Each item must include a "confidence" of "high", "medium" or "low".
- Each item must include a short "location" string when an area marker like [Kitchen] or context makes it clear; otherwise use "".
- Keep descriptions concise (one line each).
- Return STRICT JSON matching the provided tool schema. No prose.`;

const ANALYSIS_TOOL = {
  type: "function",
  function: {
    name: "return_site_walk_analysis",
    description: "Return structured analysis of the site walk transcript",
    parameters: {
      type: "object",
      properties: {
        progress_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              location: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["description", "location", "confidence"],
            additionalProperties: false,
          },
        },
        procurement_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              location: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["description", "quantity", "unit", "location", "confidence"],
            additionalProperties: false,
          },
        },
        variation_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              location: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["description", "location", "confidence"],
            additionalProperties: false,
          },
        },
        risk_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              location: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["description", "location", "confidence"],
            additionalProperties: false,
          },
        },
        site_diary_summary: { type: "string" },
      },
      required: [
        "progress_items",
        "procurement_items",
        "variation_items",
        "risk_items",
        "site_diary_summary",
      ],
      additionalProperties: false,
    },
  },
} as const;

export const analyseSiteWalk = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not configured (missing LOVABLE_API_KEY)." };
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Transcript:\n\n${data.transcript}` },
        ],
        tools: [ANALYSIS_TOOL],
        tool_choice: {
          type: "function",
          function: { name: "return_site_walk_analysis" },
        },
      }),
    });

    if (res.status === 429) {
      return { ok: false as const, error: "Rate limit reached. Please try again in a moment." };
    }
    if (res.status === 402) {
      return { ok: false as const, error: "AI credits exhausted. Add credits in workspace settings." };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("AI gateway error", res.status, text);
      return { ok: false as const, error: `AI request failed (${res.status}).` };
    }

    const body = await res.json();
    const toolCall = body?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = toolCall?.function?.arguments;
    if (!argsStr) {
      return { ok: false as const, error: "AI returned no structured analysis." };
    }
    try {
      const analysis = JSON.parse(argsStr);
      return { ok: true as const, analysis };
    } catch (e) {
      console.error("Failed to parse AI tool args", e, argsStr);
      return { ok: false as const, error: "AI returned invalid JSON." };
    }
  });
