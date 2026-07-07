import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ChevronDown, ChevronRight, Plus, Receipt, Trash2 } from "lucide-react";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";

type Valuation = {
  id: string;
  project_id: string;
  valuation_number: number | null;
  status: string;
  valuation_date: string | null;
  created_at: string;
};

type ValuationLineItem = {
  id: string;
  work_package_name: string | null;
  description: string | null;
  unit_rate: number | null;
  claimed_qty: number | null;
  claimed_value: number | null;
  status: string;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const num = (n: unknown) => (n == null ? 0 : Number(n));

export function ValuationsTab({ projectId }: { projectId: string }) {
  const [vals, setVals] = useState<Valuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("valuations")
      .select("*")
      .eq("project_id", projectId)
      .order("valuation_number", { ascending: false, nullsFirst: false });
    if (error) showError("Valuations", error);
    setVals((data ?? []) as Valuation[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const hasDraft = vals.some((v) => v.status === "Draft");

  const createDraft = async () => {
    if (hasDraft) {
      toast.error("A draft valuation already exists. Open it to continue claiming.");
      return;
    }
    const next = (vals.reduce((m, v) => Math.max(m, v.valuation_number ?? 0), 0) || 0) + 1;
    const { error } = await supabase.from("valuations").insert({
      project_id: projectId,
      valuation_number: next,
      status: "Draft",
      valuation_date: new Date().toISOString().slice(0, 10),
    });
    if (error) return showError("Valuations", error);
    toast.success(`Draft IV-${String(next).padStart(2, "0")} created`);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="label-mono">Interim Valuations</h3>
        <Button size="sm" variant="outline" onClick={createDraft} disabled={hasDraft}>
          <Plus className="w-3 h-3 mr-1" /> New draft
        </Button>
      </div>

      {loading ? (
        <LoadingDot label="Loading" />
      ) : vals.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No valuations yet"
          description="Start a draft to begin claiming progress against your contract."
          actionLabel="New draft"
          onAction={createDraft}
        />
      ) : (
        vals.map((v) => {
          const isOpen = expanded === v.id;
          return (
            <div key={v.id} className="rounded-sm bg-card border border-border">
              <button
                className="w-full p-3 flex justify-between items-start text-left"
                onClick={() => setExpanded(isOpen ? null : v.id)}
              >
                <div className="flex items-start gap-2">
                  {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5" /> : <ChevronRight className="w-4 h-4 mt-0.5" />}
                  <div>
                    <div className="font-mono text-sm font-semibold text-foreground">
                      IV-{String(v.valuation_number ?? 0).padStart(2, "0")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {v.valuation_date ? `Period ending ${new Date(v.valuation_date).toLocaleDateString("en-GB")}` : "—"}
                    </div>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 label-mono">
                  <span className={`w-1.5 h-1.5 rounded-full ${v.status === "Draft" ? "bg-gold" : "bg-emerald-400"}`} />
                  {v.status}
                </span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 border-t border-border pt-3">
                  <ValuationItemsList valuationId={v.id} readOnly={v.status !== "Draft"} />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function ValuationItemsList({ valuationId, readOnly }: { valuationId: string; readOnly: boolean }) {
  const [items, setItems] = useState<ValuationLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("valuation_items")
      .select("id, work_package_name, description, unit_rate, claimed_qty, claimed_value, status")
      .eq("valuation_id", valuationId)
      .order("created_at", { ascending: true });
    if (error) showError("Valuations", error);
    setItems((data ?? []) as ValuationLineItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valuationId]);

  const total = useMemo(
    () => items.reduce((s, it) => s + num(it.claimed_value), 0),
    [items],
  );

  const remove = async (itemId: string) => {
    if (!confirm("Remove this item from the valuation?")) return;
    setRemovingId(itemId);
    const { error } = await supabase.from("valuation_items").delete().eq("id", itemId);
    setRemovingId(null);
    if (error) return showError("Valuations", error);
    toast.success("Item removed");
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  };

  if (loading) {
    return <LoadingDot label="Loading items" />;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No items yet — approve site diary findings or variations to populate this valuation
      </p>
    );
  }

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      <div className="divide-y divide-border">
        {items.map((it) => (
          <div key={it.id} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-sm text-foreground">{it.description ?? "—"}</div>
              <div className="text-[11px] text-muted-foreground">
                {it.work_package_name ?? "—"}
              </div>
              <div className="flex gap-3 text-[11px] text-muted-foreground tabular-nums">
                <span>Qty {it.claimed_qty ?? "—"}</span>
                <span>@ {it.unit_rate != null ? GBP.format(num(it.unit_rate)) : "—"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-sm font-semibold text-foreground tabular-nums">
                {GBP.format(num(it.claimed_value))}
              </div>
              {!readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={removingId === it.id}
                  onClick={() => remove(it.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between items-center bg-gold/5 border-t-2 border-gold/40 p-3">
        <div className="label-mono">Total claimed</div>
        <div className="hero-number text-2xl">{GBP.format(total)}</div>
      </div>
    </div>
  );
}
