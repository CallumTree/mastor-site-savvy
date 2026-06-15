import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { FileText, Receipt } from "lucide-react";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { DisplayMetric } from "@/components/ui/display-metric";

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
      {invoices.map((inv) => (
        <div
          key={inv.id}
          className="rounded-md bg-card border border-border p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-primary truncate">{inv.invoice_number}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(inv.created_at).toLocaleDateString("en-GB")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{inv.status}</span>
            <DisplayMetric value={GBP.format(Number(inv.total_amount))} className="items-end" />
            <Link
              to="/valuations/$id/invoice"
              params={{ id: inv.valuation_id }}
              className="text-xs text-primary hover:underline"
            >
              View
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
