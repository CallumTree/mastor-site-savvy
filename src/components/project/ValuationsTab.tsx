import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";

type Valuation = {
  id: string;
  project_id: string;
  valuation_number: number | null;
  status: string;
  valuation_date: string | null;
  created_at: string;
};

type ValuationItem = {
  id: string;
  valuation_id: string;
  contract_item_id: string;
  claimed_qty: number | null;
  claimed_value: number | null;
  contract_items?: { code: string | null; description: string | null } | null;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function ValuationsTab({ projectId }: { projectId: string }) {
  const [vals, setVals] = useState<Valuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [itemsByVal, setItemsByVal] = useState<Record<string, ValuationItem[]>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("valuations")
      .select("*")
      .eq("project_id", projectId)
      .order("valuation_number", { ascending: false, nullsFirst: false });
    if (error) toast.error(error.message);
    setVals((data ?? []) as Valuation[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const createDraft = async () => {
    const next = (vals.reduce((m, v) => Math.max(m, v.valuation_number ?? 0), 0) || 0) + 1;
    const { error } = await supabase.from("valuations").insert({
      project_id: projectId,
      valuation_number: next,
      status: "Draft",
      valuation_date: new Date().toISOString().slice(0, 10),
    });
    if (error) return toast.error(error.message);
    toast.success(`Draft IV-${String(next).padStart(2, "0")} created`);
    load();
  };

  const toggle = async (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!itemsByVal[id]) {
      const { data, error } = await supabase
        .from("valuation_items")
        .select("*, contract_items(code, description)")
        .eq("valuation_id", id);
      if (error) return toast.error(error.message);
      setItemsByVal((m) => ({ ...m, [id]: (data ?? []) as ValuationItem[] }));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Interim Valuations</h3>
        <Button size="sm" variant="outline" onClick={createDraft}>
          <Plus className="w-3 h-3 mr-1" /> New draft
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : vals.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No valuations yet. Create your first draft.
        </div>
      ) : (
        vals.map((v) => {
          const isOpen = expanded === v.id;
          const items = itemsByVal[v.id] ?? [];
          const total = items.reduce((s, i) => s + Number(i.claimed_value ?? 0), 0);
          return (
            <div key={v.id} className="rounded-md bg-card border border-border">
              <button
                className="w-full p-3 flex justify-between items-start text-left"
                onClick={() => toggle(v.id)}
              >
                <div className="flex items-start gap-2">
                  {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5" /> : <ChevronRight className="w-4 h-4 mt-0.5" />}
                  <div>
                    <div className="text-xs font-semibold text-gold-foreground/80">
                      IV-{String(v.valuation_number ?? 0).padStart(2, "0")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {v.valuation_date ? `Period ending ${new Date(v.valuation_date).toLocaleDateString("en-GB")}` : "—"}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{v.status}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 border-t border-border pt-3 space-y-2">
                  {items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No line items.</p>
                  ) : (
                    <>
                      {items.map((i) => (
                        <div key={i.id} className="flex justify-between text-sm py-1.5 border-b border-border/50">
                          <div className="min-w-0">
                            <div className="text-foreground">{i.contract_items?.description || "—"}</div>
                            <div className="text-xs text-muted-foreground">{i.contract_items?.code} · qty {i.claimed_qty ?? 0}</div>
                          </div>
                          <div className="font-medium text-primary">{GBP.format(Number(i.claimed_value ?? 0))}</div>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm pt-2 font-semibold">
                        <span>Total claimed</span>
                        <span className="text-primary">{GBP.format(total)}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
