import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

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
          .select("id,work_package_name,description,claimed_value")
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

  const thisClaim = items.length;
  const projectValue = Number(project.gross_value ?? project.contract_value ?? 0);
  const totalClaimed = previouslyClaimed + thisClaim;
  const remaining = projectValue - totalClaimed;
  const isApproved = valuation.status === "Approved";

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
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
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-4 px-3 text-center text-muted-foreground">
                    No line items.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="py-2 px-3 font-medium text-primary">
                      {it.work_package_name ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground leading-relaxed">
                      {it.description ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Summary */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Previously Claimed" value={GBP.format(previouslyClaimed)} />
        <SummaryCard label="This Claim" value={String(thisClaim)} />
        <SummaryCard label="Total Claimed" value={String(totalClaimed)} />
        <SummaryCard label="Remaining Value" value={GBP.format(remaining)} />
      </section>

      <div className="pt-2">
        <Button
          className="w-full"
          size="lg"
          onClick={finalise}
          disabled={finalising || isApproved}
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {isApproved ? "Valuation Finalised" : finalising ? "Finalising…" : "Finalise Valuation"}
        </Button>
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
