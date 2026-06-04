import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generatePotentialClaims } from "@/lib/valuation-intelligence.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Sparkles, Check, X, Pencil, Save, ChevronDown, ChevronRight, ShoppingBasket } from "lucide-react";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

type Claim = {
  id: string;
  project_id: string;
  scope_element_id: string | null;
  approved_finding_id: string | null;
  claim_title: string;
  claim_description: string | null;
  contract_value: number | null;
  confidence_score: "high" | "medium" | "low";
  status: "Suggested" | "Approved" | "Rejected" | "Added To Valuation";
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
};

type ScopeEl = {
  id: string;
  title: string;
  description: string | null;
  source_reference: string | null;
  document_id: string | null;
};

type Finding = {
  id: string;
  finding_text: string;
  original_text: string;
  site_walk_id: string | null;
  analysis_id: string | null;
};

type Doc = { id: string; file_name: string };

export function ValuationIntelligenceTab({ projectId }: { projectId: string }) {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [scopeMap, setScopeMap] = useState<Record<string, ScopeEl>>({});
  const [findingMap, setFindingMap] = useState<Record<string, Finding>>({});
  const [docMap, setDocMap] = useState<Record<string, Doc>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Record<string, Partial<Claim>>>({});

  const generate = useServerFn(generatePotentialClaims);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: cs, error: ce } = await supabase
      .from("potential_claims")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (ce) toast.error(ce.message);
    const list = (cs ?? []) as Claim[];
    setClaims(list);

    const scopeIds = Array.from(new Set(list.map((c) => c.scope_element_id).filter(Boolean) as string[]));
    const findingIds = Array.from(new Set(list.map((c) => c.approved_finding_id).filter(Boolean) as string[]));

    const [{ data: sc }, { data: fd }] = await Promise.all([
      scopeIds.length
        ? supabase.from("scope_elements").select("id, title, description, source_reference, document_id").in("id", scopeIds)
        : Promise.resolve({ data: [] as any[] }),
      findingIds.length
        ? supabase.from("approved_findings").select("id, finding_text, original_text, site_walk_id, analysis_id").in("id", findingIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const sMap: Record<string, ScopeEl> = {};
    (sc ?? []).forEach((s: any) => (sMap[s.id] = s));
    setScopeMap(sMap);

    const fMap: Record<string, Finding> = {};
    (fd ?? []).forEach((f: any) => (fMap[f.id] = f));
    setFindingMap(fMap);

    const docIds = Array.from(new Set(Object.values(sMap).map((s) => s.document_id).filter(Boolean) as string[]));
    if (docIds.length) {
      const { data: docs } = await supabase.from("project_documents").select("id, file_name").in("id", docIds);
      const dMap: Record<string, Doc> = {};
      (docs ?? []).forEach((d: any) => (dMap[d.id] = d));
      setDocMap(dMap);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const runMatching = async () => {
    setGenerating(true);
    try {
      const res = await generate({ data: { project_id: projectId } });
      if (!res.ok) {
        toast.error(res.error);
      } else {
        if (res.inserted === 0) {
          toast.info("No new potential claims found.");
        } else {
          toast.success(`${res.inserted} potential claim${res.inserted === 1 ? "" : "s"} identified.`);
        }
        load();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "AI matching failed");
    } finally {
      setGenerating(false);
    }
  };

  const updateStatus = async (id: string, status: Claim["status"]) => {
    const patch: any = { status };
    if (status === "Approved") patch.approved_at = new Date().toISOString();
    if (status === "Rejected") patch.rejected_at = new Date().toISOString();
    const { error } = await supabase.from("potential_claims").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Claim ${status.toLowerCase()}`);
    load();
  };

  const saveEdit = async (id: string) => {
    const e = editing[id];
    if (!e) return;
    const { error } = await supabase
      .from("potential_claims")
      .update({
        claim_title: e.claim_title,
        claim_description: e.claim_description,
        contract_value: e.contract_value != null ? Number(e.contract_value) : null,
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setEditing((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    toast.success("Saved");
    load();
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  // Summary stats
  const potential = claims.filter((c) => c.status === "Suggested");
  const approved = claims.filter((c) => c.status === "Approved" || c.status === "Added To Valuation");
  const potentialValue = potential.reduce((s, c) => s + Number(c.contract_value ?? 0), 0);
  const approvedValue = approved.reduce((s, c) => s + Number(c.contract_value ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Potential Claims" value={String(potential.length)} />
        <SummaryCard label="Potential Value" value={GBP.format(potentialValue)} />
        <SummaryCard label="Approved Claims" value={String(approved.length)} />
        <SummaryCard label="Approved Value" value={GBP.format(approvedValue)} />
      </div>

      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Compares approved progress against claimable scope elements.
        </p>
        <Button size="sm" onClick={runMatching} disabled={generating}>
          <Sparkles className="w-3 h-3 mr-1" />
          {generating ? "Matching…" : "Run AI Matching"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : claims.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No potential claims yet. Click <strong>Run AI Matching</strong> to compare approved progress against scope.
        </div>
      ) : (
        claims.map((c) => {
          const scope = c.scope_element_id ? scopeMap[c.scope_element_id] : null;
          const finding = c.approved_finding_id ? findingMap[c.approved_finding_id] : null;
          const doc = scope?.document_id ? docMap[scope.document_id] : null;
          const isExpanded = expanded.has(c.id);
          const isEditing = !!editing[c.id];
          const e = editing[c.id] ?? {};

          return (
            <div key={c.id} className="rounded-md bg-card border border-border">
              <div className="p-3 space-y-2">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <Input
                        value={e.claim_title ?? c.claim_title}
                        onChange={(ev) => setEditing({ ...editing, [c.id]: { ...e, claim_title: ev.target.value } })}
                        className="h-8"
                      />
                    ) : (
                      <div className="text-sm font-semibold text-primary">{c.claim_title}</div>
                    )}
                    {!isEditing && c.claim_description && (
                      <div className="text-xs text-muted-foreground mt-1">{c.claim_description}</div>
                    )}
                    {isEditing && (
                      <Textarea
                        value={e.claim_description ?? c.claim_description ?? ""}
                        onChange={(ev) => setEditing({ ...editing, [c.id]: { ...e, claim_description: ev.target.value } })}
                        className="mt-2 min-h-16"
                      />
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {isEditing ? (
                      <Input
                        type="number"
                        value={e.contract_value ?? c.contract_value ?? ""}
                        onChange={(ev) =>
                          setEditing({
                            ...editing,
                            [c.id]: { ...e, contract_value: ev.target.value === "" ? null : Number(ev.target.value) },
                          })
                        }
                        className="h-8 w-24 text-right"
                      />
                    ) : (
                      <div className="text-sm font-semibold text-primary">
                        {c.contract_value != null ? GBP.format(Number(c.contract_value)) : "—"}
                      </div>
                    )}
                    <ConfidenceBadge value={c.confidence_score} />
                  </div>
                </div>

                {finding && (
                  <div className="text-xs text-muted-foreground border-l-2 border-gold-foreground/30 pl-2">
                    <span className="uppercase tracking-wider text-[10px] mr-1">Matched progress:</span>
                    {finding.finding_text}
                  </div>
                )}

                <div className="flex justify-between items-center pt-1">
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                    Source traceability
                  </button>
                  <StatusBadge status={c.status} />
                </div>

                {isExpanded && (
                  <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border mt-2">
                    <TraceRow label="Scope element" value={scope?.title ?? "—"} />
                    <TraceRow label="Source document" value={doc?.file_name ?? "—"} />
                    <TraceRow label="BoQ / source ref" value={scope?.source_reference || "—"} />
                    <TraceRow label="Original transcript" value={finding?.original_text ?? "—"} />
                    {c.approved_at && <TraceRow label="Approved at" value={new Date(c.approved_at).toLocaleString()} />}
                    {c.rejected_at && <TraceRow label="Rejected at" value={new Date(c.rejected_at).toLocaleString()} />}
                  </div>
                )}

                {c.status === "Suggested" && (
                  <div className="flex gap-2 justify-end pt-2 border-t border-border">
                    {isEditing ? (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing((p) => { const n = { ...p }; delete n[c.id]; return n; })}>
                          <X className="w-3 h-3 mr-1" />Cancel
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(c.id)}>
                          <Save className="w-3 h-3 mr-1" />Save
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => setEditing({ ...editing, [c.id]: {} })}>
                          <Pencil className="w-3 h-3 mr-1" />Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => updateStatus(c.id, "Rejected")}>
                          <X className="w-3 h-3 mr-1" />Reject
                        </Button>
                        <Button size="sm" onClick={() => updateStatus(c.id, "Approved")}>
                          <Check className="w-3 h-3 mr-1" />Approve
                        </Button>
                      </>
                    )}
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
    value === "high"
      ? "text-green-500"
      : value === "medium"
      ? "text-gold-foreground"
      : "text-muted-foreground";
  return <div className={`text-[10px] uppercase tracking-wider mt-1 ${cls}`}>{value} confidence</div>;
}

function StatusBadge({ status }: { status: Claim["status"] }) {
  const map: Record<Claim["status"], string> = {
    Suggested: "bg-secondary text-foreground",
    Approved: "bg-green-500/15 text-green-500",
    Rejected: "bg-destructive/15 text-destructive",
    "Added To Valuation": "bg-primary/15 text-primary",
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
      <span className="text-foreground/80">{value}</span>
    </div>
  );
}
