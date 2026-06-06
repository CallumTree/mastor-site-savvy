import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/valuations/$id")({
  component: ValuationPage,
});

type Valuation = {
  id: string;
  project_id: string;
  valuation_number: number | null;
  status: string;
  created_at: string;
};

type Project = {
  id: string;
  name: string;
  gross_value: number | null;
  contract_value: number | null;
};

type LineItem = {
  id: string;
  work_package_name: string | null;
  description: string | null;
  unit_rate: number | null;
  claimed_qty: number | null;
  claimed_value: number | null;
};

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function ValuationPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [previouslyClaimed, setPreviouslyClaimed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finalising, setFinalising] = useState(false);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data: val, error: vErr } = await supabase
      .from("valuations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (vErr || !val) {
      toast.error(vErr?.message ?? "Valuation not found");
      setLoading(false);
      return;
    }
    setValuation(val as Valuation);

    const [{ data: proj }, { data: lines }, { data: priorVals }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id,name,gross_value,contract_value")
          .eq("id", val.project_id)
          .maybeSingle(),
        supabase
          .from("valuation_items")
          .select("id,work_package_name,description,unit_rate,claimed_qty,claimed_value")
          .eq("valuation_id", id),
        supabase
          .from("valuations")
          .select("id")
          .eq("project_id", val.project_id)
          .eq("status", "Approved")
          .neq("id", id),
      ]);

    setProject((proj as Project) ?? null);
    setItems((lines ?? []) as LineItem[]);

    const priorIds = (priorVals ?? []).map((v) => v.id);
    if (priorIds.length) {
      const { data: priorItems } = await supabase
        .from("valuation_items")
        .select("claimed_value")
        .in("valuation_id", priorIds);
      const sum = (priorItems ?? []).reduce(
        (s, r) => s + Number(r.claimed_value ?? 0),
        0,
      );
      setPreviouslyClaimed(sum);
    } else {
      setPreviouslyClaimed(0);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const updateItem = (itemId: string, field: "unit_rate" | "claimed_qty", raw: string) => {
    const num = raw === "" ? null : Number(raw);
    if (raw !== "" && Number.isNaN(num)) return;

    setItems((prev) => {
      const next = prev.map((it) => {
        if (it.id !== itemId) return it;
        const updated = { ...it, [field]: num } as LineItem;
        const rate = field === "unit_rate" ? num : it.unit_rate;
        const qty = field === "claimed_qty" ? num : it.claimed_qty;
        updated.claimed_value =
          rate != null && qty != null ? Number(rate) * Number(qty) : null;
        return updated;
      });
      return next;
    });

    // Debounced autosave
    if (saveTimers.current[itemId]) clearTimeout(saveTimers.current[itemId]);
    saveTimers.current[itemId] = setTimeout(async () => {
      const current = (await new Promise<LineItem | undefined>((resolve) => {
        setItems((prev) => {
          resolve(prev.find((x) => x.id === itemId));
          return prev;
        });
      })) as LineItem | undefined;
      if (!current) return;
      const { error } = await supabase
        .from("valuation_items")
        .update({
          unit_rate: current.unit_rate,
          claimed_qty: current.claimed_qty,
          claimed_value: current.claimed_value,
        })
        .eq("id", itemId);
      if (error) toast.error(error.message);
    }, 400);
  };

  const finalise = async () => {
    setFinalising(true);
    const { error } = await supabase
      .from("valuations")
      .update({ status: "Approved" })
      .eq("id", id);
    setFinalising(false);
    if (error) return toast.error(error.message);
    toast.success("Valuation finalised");
    load();
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!valuation || !project) {
    return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;
  }

  const isApproved = valuation.status === "Approved";
  const thisClaim = items.reduce((s, it) => s + Number(it.claimed_value ?? 0), 0);
  const projectValue = Number(project.gross_value ?? project.contract_value ?? 0);
  const totalClaimed = previouslyClaimed + thisClaim;
  const remaining = projectValue - totalClaimed;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate({ to: "/projects/$id", params: { id: project.id } })}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to project
        </Button>
      </div>

      <header className="space-y-1">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {project.name}
        </div>
        <h1 className="text-2xl font-semibold text-primary">
          Valuation IV-{String(valuation.valuation_number ?? 0).padStart(2, "0")}
        </h1>
        <div className="text-xs text-muted-foreground">
          Status: <span className="text-foreground">{valuation.status}</span>
        </div>
      </header>

      {/* Line items */}
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Line Items ({items.length})
        </h2>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-3">Work Package</th>
                <th className="text-left py-2 px-3">Description</th>
                <th className="text-right py-2 px-3 w-28">Unit Rate</th>
                <th className="text-right py-2 px-3 w-24">Quantity</th>
                <th className="text-right py-2 px-3 w-28">Value</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 px-3 text-center text-muted-foreground">
                    No line items.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-t border-border align-top">
                    <td className="py-2 px-3 font-medium text-primary">
                      {it.work_package_name ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground leading-relaxed">
                      {it.description ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {isApproved ? (
                        it.unit_rate != null ? GBP.format(Number(it.unit_rate)) : "—"
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-8 text-right text-xs"
                          value={it.unit_rate ?? ""}
                          onChange={(e) => updateItem(it.id, "unit_rate", e.target.value)}
                        />
                      )}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {isApproved ? (
                        it.claimed_qty != null ? String(it.claimed_qty) : "—"
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-8 text-right text-xs"
                          value={it.claimed_qty ?? ""}
                          onChange={(e) => updateItem(it.id, "claimed_qty", e.target.value)}
                        />
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-medium tabular-nums">
                      {it.claimed_value != null ? GBP.format(Number(it.claimed_value)) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-secondary/30">
                <tr className="border-t border-border">
                  <td colSpan={4} className="py-2 px-3 text-right text-muted-foreground uppercase tracking-wider text-[10px]">
                    Total
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-primary tabular-nums">
                    {GBP.format(thisClaim)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Summary */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Previously Claimed" value={GBP.format(previouslyClaimed)} />
        <SummaryCard label="This Claim" value={GBP.format(thisClaim)} />
        <SummaryCard label="Total Claimed" value={GBP.format(totalClaimed)} />
        <SummaryCard label="Remaining Value" value={GBP.format(remaining)} />
      </section>

      <div className="pt-2 space-y-2">
        <Button
          className="w-full"
          size="lg"
          onClick={finalise}
          disabled={finalising || isApproved}
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {isApproved ? "Valuation Finalised" : finalising ? "Finalising…" : "Finalise Valuation"}
        </Button>
        {isApproved && (
          <Button
            className="w-full"
            size="lg"
            variant="secondary"
            onClick={() => navigate({ to: "/valuations/$id/invoice", params: { id: valuation.id } })}
          >
            <FileText className="w-4 h-4 mr-2" />
            Generate Invoice
          </Button>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold text-primary mt-1">{value}</div>
    </div>
  );
}
