import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, ChevronDown, ChevronRight, ShoppingBasket } from "lucide-react";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

type Item = {
  id: string;
  project_id: string;
  claim_id: string | null;
  title: string;
  description: string | null;
  value: number | null;
  status: "In Basket" | "Removed" | "Added To Valuation";
  created_at: string;
};

type ClaimTrace = {
  id: string;
  claim_title: string;
  scope_element_id: string | null;
  approved_finding_id: string | null;
};

type ScopeEl = { id: string; title: string; source_reference: string | null };
type Finding = { id: string; finding_text: string; site_walk_id: string | null };

export function ValuationBasketTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [claimMap, setClaimMap] = useState<Record<string, ClaimTrace>>({});
  const [scopeMap, setScopeMap] = useState<Record<string, ScopeEl>>({});
  const [findingMap, setFindingMap] = useState<Record<string, Finding>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("valuation_basket_items")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    const list = (data ?? []) as Item[];
    setItems(list);

    const claimIds = Array.from(new Set(list.map((i) => i.claim_id).filter(Boolean) as string[]));
    if (claimIds.length) {
      const { data: claims } = await supabase
        .from("potential_claims")
        .select("id, claim_title, scope_element_id, approved_finding_id")
        .in("id", claimIds);
      const cm: Record<string, ClaimTrace> = {};
      (claims ?? []).forEach((c: any) => (cm[c.id] = c));
      setClaimMap(cm);

      const scopeIds = Array.from(new Set((claims ?? []).map((c: any) => c.scope_element_id).filter(Boolean) as string[]));
      const findIds = Array.from(new Set((claims ?? []).map((c: any) => c.approved_finding_id).filter(Boolean) as string[]));
      const [{ data: scopes }, { data: finds }] = await Promise.all([
        scopeIds.length
          ? supabase.from("scope_elements").select("id, title, source_reference").in("id", scopeIds)
          : Promise.resolve({ data: [] as any[] }),
        findIds.length
          ? supabase.from("approved_findings").select("id, finding_text, site_walk_id").in("id", findIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const sm: Record<string, ScopeEl> = {};
      (scopes ?? []).forEach((s: any) => (sm[s.id] = s));
      setScopeMap(sm);
      const fm: Record<string, Finding> = {};
      (finds ?? []).forEach((f: any) => (fm[f.id] = f));
      setFindingMap(fm);
    } else {
      setClaimMap({});
      setScopeMap({});
      setFindingMap({});
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (item: Item) => {
    const { error } = await (supabase as any)
      .from("valuation_basket_items")
      .update({ status: "Removed" })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    if (item.claim_id) {
      await supabase
        .from("potential_claims")
        .update({ status: "Approved" })
        .eq("id", item.claim_id);
    }
    toast.success("Removed from basket");
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

  const inBasket = items.filter((i) => i.status === "In Basket");
  const total = inBasket.reduce((s, i) => s + Number(i.value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Items In Basket" value={String(inBasket.length)} />
        <SummaryCard label="Basket Value" value={GBP.format(total)} />
      </div>

      <p className="text-xs text-muted-foreground">
        Staging area for approved claim opportunities. Becomes the basis of a future valuation.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          <ShoppingBasket className="w-5 h-5 mx-auto mb-2 opacity-50" />
          Basket is empty. Approve a Claim Opportunity, then click <strong>Move to Basket</strong>.
        </div>
      ) : (
        items.map((item) => {
          const claim = item.claim_id ? claimMap[item.claim_id] : null;
          const scope = claim?.scope_element_id ? scopeMap[claim.scope_element_id] : null;
          const finding = claim?.approved_finding_id ? findingMap[claim.approved_finding_id] : null;
          const isExpanded = expanded.has(item.id);

          return (
            <div key={item.id} className="rounded-md bg-card border border-border">
              <div className="p-3 space-y-2">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-primary">{item.title}</div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground mt-1">{item.description}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-primary">
                      {item.value != null ? GBP.format(Number(item.value)) : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-1">
                  <button
                    onClick={() => toggleExpand(item.id)}
                    className="text-[11px] text-muted-foreground hover:text-primary inline-flex items-center"
                  >
                    {isExpanded ? <ChevronDown className="w-3 h-3 mr-1" /> : <ChevronRight className="w-3 h-3 mr-1" />}
                    View source
                  </button>
                  <StatusBadge status={item.status} />
                </div>

                {isExpanded && (
                  <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border mt-2">
                    <TraceRow label="Source claim" value={claim?.claim_title ?? "—"} />
                    <TraceRow label="Scope element" value={scope?.title ?? "—"} />
                    <TraceRow label="BoQ / source ref" value={scope?.source_reference || "—"} />
                    <TraceRow label="Progress finding" value={finding?.finding_text ?? "—"} />
                    <TraceRow label="Site walk ref" value={finding?.site_walk_id ?? "—"} />
                  </div>
                )}

                {item.status === "In Basket" && (
                  <div className="flex gap-2 justify-end pt-2 border-t border-border">
                    <Button size="sm" variant="ghost" onClick={() => remove(item)}>
                      <Trash2 className="w-3 h-3 mr-1" />Remove
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

function StatusBadge({ status }: { status: Item["status"] }) {
  const map: Record<Item["status"], string> = {
    "In Basket": "bg-gold-foreground/15 text-gold-foreground",
    Removed: "bg-muted text-muted-foreground",
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
      <span className="text-foreground/80 break-all">{value}</span>
    </div>
  );
}
