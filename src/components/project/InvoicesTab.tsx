import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { FileText } from "lucide-react";

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
      if (error) toast.error(error.message);
      setInvoices((data ?? []) as Invoice[]);
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (invoices.length === 0) {
    return (
      <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
        No invoices yet. Finalise a valuation to generate an invoice.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((inv) => (
        <div
          key={inv.id}
          className="rounded-md bg-card border border-border p-3 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="text-sm font-semibold text-primary">{inv.invoice_number}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(inv.created_at).toLocaleDateString("en-GB")}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{inv.status}</span>
            <span className="text-sm font-medium">{GBP.format(Number(inv.total_amount))}</span>
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
