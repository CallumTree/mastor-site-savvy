import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ChevronRight, FileText, Receipt } from "lucide-react";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";

type Invoice = {
  id: string;
  project_id: string;
  valuation_id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  created_at: string;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function InvoicesTab({ projectId }: { projectId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (error) showError("Invoices", error);
      setInvoices((data ?? []) as Invoice[]);
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) {
    return <LoadingDot label="Loading" />;
  }

  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No invoices yet"
        description="Finalise a valuation to generate an invoice from the agreed claim."
      />
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => {
        const isVoid = inv.status === "Void";
        const content = (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className={`font-mono text-sm font-semibold truncate ${isVoid ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {inv.invoice_number}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(inv.created_at).toLocaleDateString("en-GB")}
                  {isVoid && " · number retained, not reused"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col items-end gap-1">
                <span className="label-mono">{inv.status}</span>
                {!isVoid && <span className="hero-number text-xl">{GBP.format(Number(inv.total_amount))}</span>}
              </div>
              {!isVoid && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          </>
        );
        if (isVoid) {
          return (
            <div
              key={inv.id}
              className="rounded-2xl border border-dashed border-border bg-card/60 p-4 flex items-center justify-between gap-4 opacity-70"
            >
              {content}
            </div>
          );
        }
        return (
          <Link
            key={inv.id}
            to="/valuations/$id/invoice"
            params={{ id: inv.valuation_id }}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center justify-between gap-4"
          >
            {content}
          </Link>
        );
      })}
    </div>
  );
}
