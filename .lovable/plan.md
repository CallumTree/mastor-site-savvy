## Problem found

The latest failed parse job (`f4fb2aa7-3bc3-4a2b-87f0-e74a44850235`) still ran the old direct Anthropic request:

- `anthropic_batch_id` is still empty
- logs show `fetch -> Anthropic` and `Anthropic responded in 125038 ms status 524`
- no `submitted batch` log appeared

So the batch implementation is in the codebase, but the live Inngest run is still executing the previously deployed/synced handler. That is why it burned another API call and failed the same way.

## Plan

1. **Add a hard safety guard in `parseBoQJob.server.ts`**
   - Remove/replace any remaining direct `/v1/messages` path if present in the built source.
   - Add startup logs that clearly identify the batch parser version.
   - Before any expensive request, mark the job with `status: running` and write a small diagnostic field/log so we can prove the new code is executing.

2. **Make batch submission idempotent**
   - If a job already has `anthropic_batch_id`, do not submit another Anthropic batch.
   - Resume polling the existing batch instead.
   - This prevents repeated button clicks/retries from creating duplicate paid Anthropic work.

3. **Fix live Inngest sync/deployment mismatch**
   - Re-sync the `/api/public/inngest` serve endpoint after the code changes.
   - Verify the sync response and published worker logs show the new batch handler, not the old direct call.

4. **Add better failure visibility to the UI polling data**
   - Include `anthropic_batch_id`, token counts, and `stop_reason` in `getParseJob` so the UI/debug logs can distinguish: queued, running old code, batch submitted, batch polling, failed, or succeeded.

5. **Validate without burning another full parse unnecessarily**
   - First query the failed job and logs to confirm old-code failure.
   - Then create/trigger only one new parse attempt.
   - Confirm within seconds that `anthropic_batch_id` is populated.
   - If it is not populated, stop immediately and debug sync/deployment instead of waiting 2 minutes or sending more Anthropic calls.

## Expected result

The next parse should show `anthropic_batch_id` quickly and then sit in `running` while Inngest polls the batch. It should no longer make a 125-second direct Anthropic request or hit a 524 timeout.