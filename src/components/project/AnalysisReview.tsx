import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Check, X, Loader2, CheckCircle2 } from "lucide-react";

type Confidence = "high" | "medium" | "low";
type FindingType = "progress" | "procurement" | "variation";

type ProgressItem = { description: string; location?: string; confidence: Confidence };
type ProcurementItem = {
  description: string;
  quantity?: number;
  unit?: string;
  location?: string;
  confidence: Confidence;
};
type VariationItem = { description: string; location?: string; confidence: Confidence };

type Analysis = {
  progress_items?: ProgressItem[];
  procurement_items?: ProcurementItem[];
  variation_items?: VariationItem[];
};

type Finding = {
  key: string;
  type: FindingType;
  text: string;
  confidence: Confidence;
};

type ReviewStatus = "approved" | "dismissed";

function confidenceClass(c: Confidence) {
  if (c === "high") return "border-emerald-500/40 text-emerald-700 bg-emerald-500/10";
  if (c === "medium") return "border-amber-500/40 text-amber-700 bg-amber-500/10";
  return "border-rose-500/40 text-rose-700 bg-rose-500/10";
}

function buildFindings(a: Analysis): Finding[] {
  const out: Finding[] = [];
  for (const p of a.progress_items ?? []) {
    const text = `${p.description}${p.location ? ` — ${p.location}` : ""}`.trim();
    if (text) out.push({ key: `progress|${text}`, type: "progress", text, confidence: p.confidence });
  }
  for (const p of a.procurement_items ?? []) {
    const text = `${p.quantity ? `${p.quantity} ` : ""}${p.unit ? `${p.unit} ` : ""}${p.description}${
      p.location ? ` — ${p.location}` : ""
    }`.trim();
    if (text) out.push({ key: `procurement|${text}`, type: "procurement", text, confidence: p.confidence });
  }
  for (const p of a.variation_items ?? []) {
    const text = `${p.description}${p.location ? ` — ${p.location}` : ""}`.trim();
    if (text) out.push({ key: `variation|${text}`, type: "variation", text, confidence: p.confidence });
  }
  return out;
}

export function AnalysisReview({
  analysisId,
  projectId,
  siteWalkId,
  analysisJson,
  walkTitle,
  onDone,
}: {
  analysisId: string;
  projectId: string;
  siteWalkId: string;
  analysisJson: Analysis;
  walkTitle: string;
  onDone: () => void;
}) {
  const findings = useMemo(() => buildFindings(analysisJson), [analysisJson]);
  const [statuses, setStatuses] = useState<Record<string, ReviewStatus>>({});
  const [rowIds, setRowIds] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("approved_findings")
        .select("id, finding_type, original_text, status")
        .eq("analysis_id", analysisId);
      if (error) {
        toast.error(error.message);
        return;
      }
      const s: Record<string, ReviewStatus> = {};
      const ids: Record<string, string> = {};
      for (const r of (data ?? []) as Array<{
        id: string;
        finding_type: string;
        original_text: string;
        status: string;
      }>) {
        if (r.status !== "approved" && r.status !== "dismissed") continue;
        const key = `${r.finding_type}|${r.original_text}`;
        s[key] = r.status as ReviewStatus;
        ids[key] = r.id;
      }
      setStatuses(s);
      setRowIds(ids);
    })();
  }, [analysisId]);

  const setStatus = async (f: Finding, status: ReviewStatus) => {
    setBusyKey(f.key);
    const payload: any = {
      project_id: projectId,
      analysis_id: analysisId,
      site_walk_id: siteWalkId,
      finding_type: f.type,
      original_text: f.text,
      finding_text: f.text,
      confidence: f.confidence,
      status,
      approved_at: status === "approved" ? new Date().toISOString() : null,
    };
    const existingId = rowIds[f.key];
    if (existingId) {
      const { error } = await (supabase as any)
        .from("approved_findings")
        .update(payload)
        .eq("id", existingId);
      if (error) {
        toast.error(error.message);
        setBusyKey(null);
        return;
      }
    } else {
      const { data, error } = await (supabase as any)
        .from("approved_findings")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast.error(error.message);
        setBusyKey(null);
        return;
      }
      setRowIds((p) => ({ ...p, [f.key]: (data as { id: string }).id }));
    }
    setStatuses((p) => ({ ...p, [f.key]: status }));

    // When a progress finding is approved, try to match it to a work package
    // and create a claim opportunity for the next-phase review.
    if (status === "approved" && f.type === "progress") {
      await linkProgressFindingToWorkPackage(f, projectId);
    }

    setBusyKey(null);
  };

  const sections: { key: FindingType; label: string }[] = [
    { key: "progress", label: "Progress" },
    { key: "procurement", label: "Procurement" },
    { key: "variation", label: "Variations" },
  ];

  const reviewedCount = findings.filter((f) => statuses[f.key]).length;
  const allReviewed = findings.length === 0 || reviewedCount === findings.length;

  if (allReviewed) {
    const summary = sections.map((s) => {
      const inSection = findings.filter((f) => f.type === s.key);
      const approved = inSection.filter((f) => statuses[f.key] === "approved").length;
      const dismissed = inSection.filter((f) => statuses[f.key] === "dismissed").length;
      return { ...s, total: inSection.length, approved, dismissed };
    });
    return (
      <div className="space-y-5 overflow-y-auto pr-1">
        <div className="text-[11px] text-muted-foreground">{walkTitle}</div>
        <div className="rounded-lg border border-border bg-card p-5 text-center space-y-2">
          <CheckCircle2 className="w-10 h-10 text-primary mx-auto" />
          <div className="text-base font-semibold">Review complete</div>
          <div className="text-sm text-muted-foreground">
            {findings.length === 0
              ? "No findings to review."
              : `${reviewedCount} finding${reviewedCount === 1 ? "" : "s"} reviewed.`}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {summary.map((s) => (
            <div key={s.key} className="rounded-md border border-border bg-background p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div className="mt-1 text-sm">
                <span className="font-medium text-emerald-700">{s.approved} approved</span>
                <span className="text-muted-foreground"> · </span>
                <span className="text-muted-foreground">{s.dismissed} dismissed</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {s.total} total
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={onDone}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 overflow-y-auto pr-1">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-muted-foreground">{walkTitle}</div>
        <div className="text-[11px] text-muted-foreground tabular-nums">
          {reviewedCount} / {findings.length} reviewed
        </div>
      </div>

      {sections.map((s) => {
        const items = findings.filter((f) => f.type === s.key);
        const sectionReviewed = items.filter((f) => statuses[f.key]).length;
        return (
          <section key={s.key} className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </h4>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
                {sectionReviewed} / {items.length}
              </span>
            </div>
            {items.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-background p-3 text-[11px] text-muted-foreground text-center">
                No items
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((f) => {
                  const st = statuses[f.key];
                  const busy = busyKey === f.key;
                  return (
                    <div
                      key={f.key}
                      className="rounded-lg border border-border bg-card p-3 space-y-2"
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-1 text-sm leading-relaxed">{f.text}</div>
                        <span
                          className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${confidenceClass(
                            f.confidence,
                          )}`}
                        >
                          {f.confidence}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        {st ? (
                          <span
                            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              st === "approved"
                                ? "border-emerald-500/40 text-emerald-700 bg-emerald-500/10"
                                : "border-muted-foreground/30 text-muted-foreground bg-muted/30"
                            }`}
                          >
                            {st === "approved" ? "Approved" : "Dismissed"}
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            Pending
                          </span>
                        )}
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={st === "dismissed" ? "secondary" : "ghost"}
                            className="gap-1"
                            disabled={busy}
                            onClick={() => setStatus(f, "dismissed")}
                          >
                            {busy && st !== "dismissed" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            Dismiss
                          </Button>
                          <Button
                            size="sm"
                            variant={st === "approved" ? "default" : "outline"}
                            className="gap-1"
                            disabled={busy}
                            onClick={() => setStatus(f, "approved")}
                          >
                            {busy && st !== "approved" ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Check className="w-3.5 h-3.5" />
                            )}
                            Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
