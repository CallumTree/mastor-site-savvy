## Goal

Find out exactly why "Parse Scope" appears to fail / hang for your DOCX upload (`CAP00290 - 32 College Park`). Current logs show the Anthropic request is sent but nothing logs after, which usually means the call is timing out, not actually erroring.

## What I'll add (diagnostics only — no behaviour change yet)

In `src/lib/parseDocument.functions.ts`:

1. **Time the Anthropic call.** Log `Date.now()` before and after `fetch(...)` so we can see how long it took and whether it ever returned.
2. **Log response shape on success.** Currently we only log on `!res.ok`. Add:
   - `res.status`
   - `body.stop_reason` (Anthropic returns `"end_turn"` for complete, `"max_tokens"` for truncated)
   - `body.usage` (input/output tokens used)
   - `text.length` and first/last 200 chars of the model output
3. **Log JSON parse failures with the actual text** (truncated to 1k chars) so we can see if Anthropic is returning a partial/fenced/empty response.
4. **Add a catch around `fetch` itself** to log network-level failures (currently only HTTP errors are caught).

In `src/components/project/ProjectDocumentsTab.tsx` `onParse`:

5. Log how long the whole flow takes client-side and surface a clearer toast when `result.ok` is false (include `result.error` verbatim instead of the generic "Parse failed").

## What we'll learn

After you click Parse Scope once more, the logs will tell us definitively whether:
- Anthropic is timing out (no second timestamp logged) → fix by switching to streaming or reducing prompt
- Anthropic returns `stop_reason: "max_tokens"` → response truncated, raise max_tokens further or chunk the doc
- Anthropic returns valid JSON but our parser fails → cleanup regex bug
- The handler crashes in the DB insert step → RLS / column mismatch

## Files affected

- `src/lib/parseDocument.functions.ts` (add ~10 lines of logging, wrap fetch in try/catch)
- `src/components/project/ProjectDocumentsTab.tsx` (improve error toast + timing log in `onParse`)

No business-logic changes. Once we see the new logs after one parse attempt, I'll come back with the actual fix.