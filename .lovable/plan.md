## Goal

Replace direct Anthropic Claude calls with Google Gemini through the Lovable AI Gateway. No user-facing API key input needed — billing runs on your Lovable credits via the auto-provisioned `LOVABLE_API_KEY`.

## Files to change

1. **`src/lib/analyseSiteWalk.functions.ts`** — the site walk transcript → structured diary analysis (main AI call, ~8k output tokens).
2. **`src/lib/matchFindingToScopeElement.functions.ts`** — the finding-to-BoQ scope matcher.
3. **`src/lib/parseBoQJob.server.ts`** — the background BoQ document parser (long-running Inngest job).

## What changes in each file

For each of the three files:

- Remove the `ANTHROPIC_API_KEY` env read and the `fetch("https://api.anthropic.com/v1/messages", ...)` block.
- Read `LOVABLE_API_KEY` from `process.env` inside the handler.
- Call `https://ai.gateway.lovable.dev/v1/chat/completions` with:
  - `Authorization: Bearer ${LOVABLE_API_KEY}`
  - Model: `google/gemini-3.6-flash` (default) — fast, multimodal, plenty of context for BoQs and transcripts.
  - Body shape: OpenAI-compatible — `{ model, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }], max_tokens }`.
- Extract text from `body.choices[0].message.content` (OpenAI shape) instead of `body.content[0].text`.
- Keep the existing JSON cleanup / parse logic — it already strips ```json fences.
- Handle 429 (rate limit) and 402 (credits exhausted) with clear error messages surfaced back to the UI.

## What does NOT change

- Prompts stay identical — the JSON schemas and instructions still apply.
- All Supabase logic (usage tracking, auto-insert procurement/variations, photo matching, site walk status update) is untouched.
- The Inngest job structure stays as-is; only the model call inside changes.
- `ANTHROPIC_API_KEY` secret stays configured (harmless); it just stops being read.

## Notes

- `LOVABLE_API_KEY` is already provisioned in your project secrets — nothing to configure.
- No frontend changes; users won't notice anything except that analyses now run on Gemini.
- Costs come from your Lovable credit balance rather than your Anthropic account.
