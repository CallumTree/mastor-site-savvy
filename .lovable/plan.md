
## Where the key goes

The `ANTHROPIC_API_KEY` is now stored as a server-side secret in Lovable Cloud. It is automatically available as `process.env.ANTHROPIC_API_KEY` to any server-side code. It must NEVER be referenced from browser code (components, hooks) — that would bundle it into the client and leak it.

## Steps

1. **Create `src/lib/parseDocument.functions.ts`** — a TanStack `createServerFn` that:
   - Reads `process.env.ANTHROPIC_API_KEY` inside the handler
   - Takes `{ documentText, projectId, documentId }` as validated input
   - Calls `https://api.anthropic.com/v1/messages` with the proper headers (`x-api-key`, `anthropic-version: 2023-06-01`, `content-type`) — these are missing from the current `lib/parseDocument.js` and would 401
   - Uses the same system prompt and JSON output contract you put in `lib/parseDocument.js`
   - Inserts the parsed rows into `scope_elements` via the authenticated Supabase client (using `requireSupabaseAuth` middleware so RLS applies as the user)
   - Returns `{ ok: true, parsed }` or `{ ok: false, error }`

2. **Update `src/components/project/ProjectDocumentsTab.tsx`** — replace whatever currently calls the old parser (or the browser-side `lib/parseDocument.js`) with `useServerFn(parseBoQ)` and call it after the upload completes. Show toast on error.

3. **Keep or remove `lib/parseDocument.js`** — the new server function is the single source of truth. I'll delete `lib/parseDocument.js` so it can't accidentally be imported from the browser (where it would leak the key and CORS-fail anyway). If you want to keep it as reference, say so and I'll leave it.

## Technical notes

- Anthropic's API rejects browser `fetch` calls without `anthropic-dangerous-direct-browser-access: true` AND would expose the key — running server-side fixes both.
- The handler will read the key per-request (not at module scope) so it works correctly on Cloudflare Workers.
- Errors from Anthropic (401/429/5xx) are caught and returned as `{ ok: false, error }` so the UI can show a clean message.

Approve and I'll implement.
