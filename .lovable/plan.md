## Problem

On Android Chrome, the Web Speech API emits final results that **grow cumulatively** — each new final result repeats and extends the previous one ("so" → "so in" → "so in the" → "so in the kitchen" → "so in the kitchen suite is ready"). The current code dedupes by `resultIndex` and appends each new final as if it were a new phrase, so a single spoken sentence ("the kitchen is ready to be ordered") gets appended dozens of times in growing fragments.

The current `committed: Set<number>` strategy is the wrong model for Android — the engine reuses/grows indices instead of producing one immutable final per index.

## Fix (single file: `src/components/project/SiteWalksTab.tsx`)

Rewrite the recognition result handling in `createRecognition` and the session lifecycle:

1. **Snapshot a session base.** When a recognition session starts (and on every auto-restart inside `onend`), capture `sessionBaseRef = transcriptRef.current` — the committed transcript from all *previous* sessions.

2. **Rebuild, don't append.** In `onresult`, iterate the full `event.results` from index 0 (not from `event.resultIndex`):
   - Concatenate all `isFinal` transcripts into `sessionFinal`.
   - Concatenate all non-final transcripts into `sessionInterim`.
   - Set `transcript = sessionBase + (sep) + sessionFinal` (always overwrite, never append).
   - Set `interim = sessionInterim` (preview only).

   This makes the latest cumulative final result authoritative — duplicates collapse naturally because we replace instead of append.

3. **Auto-restart handling.** In `onend`, before restarting, fold the just-completed session's final text into `transcriptRef` (it already is, via step 2) and reset `sessionBaseRef` to the new `transcriptRef.current` so the next session starts from a clean base. Clear interim.

4. **Pause/Resume.** `handlePause` already calls `stopRecognition` and `handleResume` calls `startRecognition` — both will get a fresh session base via step 1, so resumed speech appends cleanly after the paused transcript.

5. **Manual area markers** (e.g. "[Kitchen]") inserted while recording also become part of the new `sessionBaseRef` automatically on the next restart; to be safe, refresh `sessionBaseRef = transcriptRef.current` whenever an area marker is inserted mid-recording.

6. Remove the now-unused `committed: Set<number>`.

## Out of scope

- No change to the analysis engine, approval workflow, DB schema, or UI layout.
- No switch to ElevenLabs realtime (can be a follow-up if Web Speech remains unreliable on other devices).
- Save flow already uses `transcript.trim()` (final-only state), so saved data is correct once the live state is correct.

## Expected result

Saying "the kitchen is ready to be ordered" once produces exactly that text in the transcript, regardless of how many cumulative interim/final updates Android Chrome emits.