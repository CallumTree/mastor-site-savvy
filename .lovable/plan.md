## Status check

All three files already use `model: "claude-sonnet-4-6"` — no model changes needed:
- `src/lib/parseDocument.functions.ts:70` ✓
- `src/lib/analyseSiteWalk.functions.ts:159` ✓
- `src/lib/matchFinding.functions.ts:57` ✓

## Change

In `src/lib/parseDocument.functions.ts` (lines 94–99), strip markdown code fences before `JSON.parse`, mirroring the cleanup in `analyseSiteWalk.functions.ts`:

```ts
try {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/, "")
    .replace(/```\s*$/, "");
  return { ok: true as const, parsed: JSON.parse(cleaned) };
} catch (e) {
  console.error("JSON parse failed", e);
  return { ok: false as const, error: "Anthropic returned invalid JSON." };
}
```

No other changes.