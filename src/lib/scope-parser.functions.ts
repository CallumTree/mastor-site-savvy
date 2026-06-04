import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  text: z.string().min(1).max(200000),
  document_name: z.string().max(255).default(""),
});

const SYSTEM_PROMPT = `You are a senior UK Construction Manager, Quantity Surveyor, Estimator, Buyer and Contracts Manager.

You are reading a project scope document such as a Bill of Quantities, Schedule of Works, Specification, Tender or Scope Document. Your job is to break it down into a structured project understanding.

For each top-level scope item in the document, identify:

1. tasks — discrete construction tasks (e.g. "Construct Stud Wall")
2. labour_activities — the sequenced labour operations to deliver each task (e.g. "Set Out Wall", "Install CLS Frame")
3. materials — physical materials with quantity and unit where stated (e.g. "100 x 50 CLS Timber")
4. claimable_elements — items that can be claimed in a valuation (e.g. "Stud Wall Construction")
5. procurement_items — material families that need to be procured/ordered (e.g. "CLS Timber", "Plasterboard")

Rules:
- Use British English construction terminology.
- Never invent items not implied by the document.
- Each item must include a "confidence": high, medium, or low.
- Each item must include a "source_reference" — quote the item number, section or BoQ reference from the document (e.g. "Item 1.3", "Section 2.4", "BoQ Ref B/12"). If none is present, use "".
- Each item must include a short "title" and an optional one-line "description".
- For materials, include "quantity" (number) and "unit" (e.g. "m", "m2", "no") when stated; otherwise quantity = 0 and unit = "".
- Return STRICT JSON via the provided tool. No prose.`;

const PARSE_TOOL = {
  type: "function",
  function: {
    name: "return_parsed_scope",
    description: "Return structured scope breakdown of the document",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              source_reference: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["title", "description", "source_reference", "confidence"],
            additionalProperties: false,
          },
        },
        labour_activities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              source_reference: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["title", "description", "source_reference", "confidence"],
            additionalProperties: false,
          },
        },
        materials: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              source_reference: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["title", "description", "quantity", "unit", "source_reference", "confidence"],
            additionalProperties: false,
          },
        },
        claimable_elements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              source_reference: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["title", "description", "source_reference", "confidence"],
            additionalProperties: false,
          },
        },
        procurement_items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              source_reference: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
            },
            required: ["title", "description", "source_reference", "confidence"],
            additionalProperties: false,
          },
        },
      },
      required: ["tasks", "labour_activities", "materials", "claimable_elements", "procurement_items"],
      additionalProperties: false,
    },
  },
} as const;

export const parseScopeDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI is not configured (missing LOVABLE_API_KEY)." };
    }

    // Truncate very long inputs to keep the request within model limits
    const text = data.text.length > 120000 ? data.text.slice(0, 120000) : data.text;

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
          {
            role: "user",
            content: `Document: ${data.document_name || "Untitled"}\n\nContents:\n\n${text}`,
          },
        ],
        tools: [PARSE_TOOL],
        tool_choice: { type: "function", function: { name: "return_parsed_scope" } },
      }),
    });

    if (res.status === 429) return { ok: false as const, error: "Rate limit reached. Try again shortly." };
    if (res.status === 402) return { ok: false as const, error: "AI credits exhausted. Add credits in workspace settings." };
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("AI gateway error", res.status, body);
      return { ok: false as const, error: `AI request failed (${res.status}).` };
    }

    const body = await res.json();
    const argsStr = body?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) return { ok: false as const, error: "AI returned no structured output." };
    try {
      return { ok: true as const, parsed: JSON.parse(argsStr) };
    } catch (e) {
      console.error("parse error", e);
      return { ok: false as const, error: "AI returned invalid JSON." };
    }
  });
