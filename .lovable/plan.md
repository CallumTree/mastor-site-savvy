Update the Anthropic model identifier in all three AI-calling server functions to resolve the 404 `not_found_error` for the retired model.

Changes:
- `src/lib/parseDocument.functions.ts` line 70: `"claude-sonnet-4-20250514"` → `"claude-sonnet-4-6"`
- `src/lib/analyseSiteWalk.functions.ts` line 159: `"claude-sonnet-4-20250514"` → `"claude-sonnet-4-6"`
- `src/lib/matchFinding.functions.ts` line 57: `"claude-sonnet-4-20250514"` → `"claude-sonnet-4-6"`

No other request parameters (max_tokens, system prompt, messages shape, headers) are changed.