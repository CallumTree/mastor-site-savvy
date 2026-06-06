# Post-Analysis Review Screen

## Goal
After a site walk is analysed, present a focused review flow with three sections (Progress, Procurement, Variations). Each finding is a card with **Approve** and **Dismiss**. Once every finding is reviewed, show a summary and a **Done** button.

The existing `AnalysisViewer` in `SiteWalksTab.tsx` is a denser admin view with edit + Approve/Reject + Risks + downstream record creation. We will leave it in place and add a new lightweight `AnalysisReview` component for the post-analysis flow described here.

## UX Flow
1. User finishes recording → site walk analysed → `analysis_results` row created (already happens today).
2. App opens `AnalysisReview` for that `analysis_id` (in the same dialog currently used to view analyses, plus auto-open right after a fresh analysis finishes).
3. Three section headers in order: **Progress**, **Procurement**, **Variations**, each showing a count "reviewed / total".
4. Each finding is a card showing the finding text + confidence pill + two buttons: **Approve** and **Dismiss**.
5. Tapping a button immediately writes one row to `approved_findings`:
   - `project_id`, `site_walk_id`, `analysis_id`
   - `finding_type` = `"progress" | "procurement" | "variation"`
   - `finding_text` = the displayed text
   - `original_text` = same as finding_text (column is NOT NULL)
   - `status` = `"approved"` or `"dismissed"`
   - `approved_at` set when approved
   The card visibly switches to a reviewed state (Approved / Dismissed badge, buttons disabled). Re-tapping the other button updates the existing row.
6. When every finding across all three sections has a status, the review screen swaps to a **Summary** view: totals approved / dismissed per section + a **Done** button that closes the dialog.
7. If there are zero findings in all three sections, show the summary immediately.

This flow intentionally:
- excludes Risks (per spec — only the three sections),
- has no edit step (Approve/Dismiss only),
- does NOT create downstream `procurement_items` / `variations` records (that is the existing AnalysisViewer's job; this is the lightweight review the user described).

## Technical Plan

### New component
`src/components/project/AnalysisReview.tsx`
- Props: `{ analysisId, projectId, siteWalkId, analysisJson, walkTitle, onDone }`
- Loads existing `approved_findings` rows where `analysis_id = analysisId` to resume in-progress reviews.
- Builds a stable key per finding using `finding_type + original_text` (matches existing AnalysisViewer convention so the two views stay consistent).
- `approve(finding)` and `dismiss(finding)` upsert into `approved_findings` with `status` `"approved"` or `"dismissed"`.
- Tracks `reviewedCount` vs `totalCount`; when equal, renders the Summary.
- Summary shows per-section approved/dismissed counts and a **Done** button calling `onDone`.

### Wiring in `SiteWalksTab.tsx`
- After a successful analysis (in the existing `analyseWalk` handler), set a state flag to open the review dialog with the new component for that analysis.
- Add a "Review" action on each saved analysis row that opens the same `AnalysisReview` (separate from the existing detailed "View" which keeps using `AnalysisViewer`).
- No changes to the existing AnalysisViewer.

### Data
- No schema migration. `approved_findings` already has all required columns.
- Status values used by this screen: `"approved"`, `"dismissed"`. Existing AnalysisViewer uses `"Approved"`/`"Rejected"`; we keep those untouched. The new screen filters/writes its own lowercase values so the two flows do not collide visually. (We'll only consider a finding "reviewed" in the new screen if status is exactly `approved` or `dismissed`.)

### Out of scope
- No edits to finding text.
- No downstream record creation on approve.
- No changes to Risks handling.
- No changes to the analysis pipeline itself.

## Files
- **New**: `src/components/project/AnalysisReview.tsx`
- **Edit**: `src/components/project/SiteWalksTab.tsx` (open the new review after analysis + add a Review entry point on saved analyses)
