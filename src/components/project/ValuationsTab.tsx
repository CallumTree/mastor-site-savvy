import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { Receipt, ChevronRight, Lock } from "lucide-react";
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

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function ValuationsTab({ projectId }: { projectId: string }) {
  const [vals, setVals] = useState<Valuation[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [invoicedIds, setInvoicedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("valuations")
        .select("*")
        .eq("project_id", projectId)
        .order("valuation_number", { ascending: false, nullsFirst: false });
      if (error) showError("Valuations", error);
      const rows = (data ?? []) as Valuation[];
      setVals(rows);

      if (rows.length > 0) {
        const ids = rows.map((v) => v.id);
        const [{ data: itemRows }, { data: invRows }] = await Promise.all([
          supabase.from("valuation_items").select("valuation_id, claimed_value").in("valuation_id", ids),
          supabase.from("invoices").select("valuation_id").in("valuation_id", ids),
        ]);
        const sums: Record<string, number> = {};
        for (const r of (itemRows ?? []) as any[]) {
          sums[r.valuation_id] = (sums[r.valuation_id] ?? 0) + Number(r.claimed_value ?? 0);
        }
        setTotals(sums);
        setInvoicedIds(new Set(((invRows ?? []) as any[]).map((r) => r.valuation_id)));
      } else {
        setTotals({});
        setInvoicedIds(new Set());
      }
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) return <LoadingDot label="Loading" />;

  if (vals.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No valuations yet"
        description="The rolling Draft valuation is created automatically as soon as a variation is approved or a site diary finding is logged."
      />
    );
  }

  return (
    <div className="space-y-2">
      {vals.map((v) => {
        const invoiced = invoicedIds.has(v.id);
        return (
          <Link
            key={v.id}
            to="/valuations/$id"
            params={{ id: v.id }}
            className="flex items-center justify-between gap-3 p-3 rounded-md bg-card border border-border hover:border-primary/40 transition-colors"
          >
            <div className="min-w-0">
              <div className="text-xs font-semibold text-primary flex items-center gap-2">
                IV-{String(v.valuation_number ?? 0).padStart(2, "0")}
                {invoiced && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                    <Lock className="w-3 h-3" /> Invoiced
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {v.valuation_date ? new Date(v.valuation_date).toLocaleDateString("en-GB") : "—"} · {v.status}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold text-primary tabular-nums">
                {GBP.format(totals[v.id] ?? 0)}
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
