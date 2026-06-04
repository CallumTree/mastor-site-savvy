import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, ClipboardCheck } from "lucide-react";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

type Status = "Ready To Claim" | "Included In Valuation" | "Paid";
type Filter = "All" | Status;

type Claim = {
  id: string;
  project_id: string;
  scope_element_id: string | null;
  approved_finding_id: string | null;
  claim_title: string;
  claim_description: string | null;
  contract_value: number | null;
  confidence_score: "high" | "medium" | "low";
  status: Status | string;
  approved_at: string | null;
  ready_to_claim_at: string | null;
  created_at: string;
};

type ScopeEl = { id: string; title: string; source_reference: string | null; document_id: string | null };
type Finding = { id: string; finding_text: string; original_text: string; site_walk_id: string | null; analysis_id: string | null };
type Doc = { id: string; file_name: string };

const STATUSES: Status[] = ["Ready To Claim", "Included In Valuation", "Paid"];

export function ReadyToClaimTab({ projectId }: { projectId: string }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [scopeMap, setScopeMap] = useState<Record<string, ScopeEl>>({});
  const [findingMap, setFindingMap] = useState<Record<string, Finding>>({});
  const [docMap, setDocMap] = useState<Record<string, Doc>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("potential_claims")
      .select("*")
      .eq("project_id", projectId)
      .in("status", STATUSES)
      .order("ready_to_claim_at", { ascending: false });
    if (error) toast.error(error.message);
    const list = (data ?? []) as Claim[];
    setClaims(list);

    const scopeIds = Array.from(new Set(list.map((c) => c.scope_element_id).filter(Boolean) as string[]));
    const findingIds = Array.from(new Set(list.map((c) => c.approved_finding_id).filter(Boolean) as string[]));
    const [{ data: sc }, { data: fd }] = await Promise.all([
      scopeIds.length
        ? supabase.from("scope_elements").select("id, title, source_reference, document_id").in("id", scopeIds)
        : Promise.resolve({ data: [] as any[] }),
      findingIds.length
        ? supabase.from("approved_findings").select("id, finding_text, original_text, site_walk_id, analysis_id").in("id", findingIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const sm: Record<string, ScopeEl> = {};
    (sc ?? []).forEach((s: any) => (sm[s.id] = s));
    setScopeMap(sm);
    const fm: Record<string, Finding> = {};
    (fd ?? []).forEach((f: any) => (fm[f.id] = f));
    setFindingMap(fm);

    const docIds = Array.from(new Set(Object.values(sm).map((s) => s.document_id).filter(Boolean) as string[]));
    if (docIds.length) {
      const { data: docs } = await supabase.from("project_documents").select("id, file_name").in("id", docIds);
      const dMap: Record<string, Doc> = {};
      (docs ?? []).forEach((d: any) => (dMap[d.id] = d));
      setDocMap(dMap);
    } else {
      setDocMap({});
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const visible = filter === "All" ? claims : claims.filter((c) => c.status === filter);
  const ready = claims.filter((c) => c.status === "Ready To Claim");
  const readyValue = ready.reduce((s, c) => s + Number(c.contract_value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Claims Ready" value={String(ready.length)} />
        <SummaryCard label="Ready To Claim Value" value={GBP.format(readyValue)} />
      </div>

      <p className="text-xs text-muted-foreground">
        Approved claims ready to be included in the next valuation. Source of truth for future valuation generation.
      </p>

      <div className="flex flex-wrap gap-1">
        {(["All", ...STATUSES] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[11px] px-2 py-1 rounded uppercase tracking-wider ${
              filter === f ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          <ClipboardCheck className="w-5 h-5 mx-auto mb-2 opacity-50" />
          No claims here yet. Approve a Claim Opportunity, then click <strong>Mark Ready To Claim</strong>.
        </div>
      ) : (
        visible.map((c) => {
          const scope = c.scope_element_id ? scopeMap[c.scope_element_id] : null;
          const finding = c.approved_finding_id ? findingMap[c.approved_finding_id] : null;
          const doc = scope?.document_id ? docMap[scope.document_id] : null;
          const isExpanded = expanded.has(c.id);

          return (
            <div key={c.id} className="rounded-md bg-card border border-border">
              <div className="p-3 space-y-2">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-primary">{c.claim_title}</div>
                    {c.claim_description && (
                      <div className="text-xs text-muted-foreground mt-1">{c.claim_description}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-primary">
                      {c.contract_value != null ? GBP.format(Number(c.contract_value)) : "—"}
                    </div>
                    <ConfidenceBadge value={c.confidence_score} />
                  </div>
                </div>

                {finding && (
                  <div className="text-xs text-muted-foreground border-l-2 border-gold-foreground/30 pl-2">
                    <span className="uppercase tracking-wider text-[10px] mr-1">Progress:</span>
                    {finding.finding_text}
                  </div>
                )}

                <div className="flex justify-between items-center pt-1">
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                    Source & approval history
                  </button>
                  <StatusBadge status={c.status as Status} />
                </div>

                {isExpanded && (
                  <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border mt-2">
                    <TraceRow label="Scope element" value={scope?.title ?? "—"} />
                    <TraceRow label="Source document" value={doc?.file_name ?? "—"} />
                    <TraceRow label="BoQ / source ref" value={scope?.source_reference || "—"} />
                    <TraceRow label="Progress finding" value={finding?.finding_text ?? "—"} />
                    <TraceRow label="Original transcript" value={finding?.original_text ?? "—"} />
                    <TraceRow label="Site walk ref" value={finding?.site_walk_id ?? "—"} />
                    <TraceRow label="Analysis ref" value={finding?.analysis_id ?? "—"} />
                    {c.approved_at && <TraceRow label="Approved at" value={new Date(c.approved_at).toLocaleString()} />}
                    {c.ready_to_claim_at && <TraceRow label="Marked ready at" value={new Date(c.ready_to_claim_at).toLocaleString()} />}
                  </div>
                )}

                {c.status === "Ready To Claim" && (
                  <div className="flex gap-2 justify-end pt-2 border-t border-border">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const { error } = await supabase
                          .from("potential_claims")
                          .update({ status: "Approved", ready_to_claim_at: null })
                          .eq("id", c.id);
                        if (error) return toast.error(error.message);
                        toast.success("Returned to Approved");
                        load();
                      }}
                    >
                      Return to Approved
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-primary mt-0.5">{value}</div>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: "high" | "medium" | "low" }) {
  const cls =
    value === "high" ? "text-green-500" : value === "medium" ? "text-gold-foreground" : "text-muted-foreground";
  return <div className={`text-[10px] uppercase tracking-wider mt-1 ${cls}`}>{value} confidence</div>;
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    "Ready To Claim": "bg-gold-foreground/15 text-gold-foreground",
    "Included In Valuation": "bg-primary/15 text-primary",
    Paid: "bg-green-500/15 text-green-500",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${map[status]}`}>
      {status}
    </span>
  );
}

function TraceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="uppercase tracking-wider text-[10px] text-muted-foreground/70 shrink-0 w-32">{label}</span>
      <span className="text-foreground/80 break-all">{value}</span>
    </div>
  );
}
