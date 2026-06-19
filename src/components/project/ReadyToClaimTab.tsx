import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ClipboardCheck, FileCheck, X, ArrowRight } from "lucide-react";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";
import {
  findOpenValuation,
  getOrCreateOpenValuation,
  formatValuationNumber,
  type OpenValuation,
} from "@/lib/openValuation";

type ClaimOpportunity = {
  id: string;
  project_id: string;
  work_package_id: string | null;
  work_package_name: string;
  finding_text: string;
  approved_finding_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  unit_rate: number | null;
  quantity: number | null;
  claimed_value: number | null;
  scope_element_id: string | null;
};


export function ReadyToClaimTab({ projectId }: { projectId: string }) {
  const [pending, setPending] = useState<ClaimOpportunity[]>([]);
  const [approved, setApproved] = useState<ClaimOpportunity[]>([]);
  const [openVal, setOpenVal] = useState<OpenValuation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, ov] = await Promise.all([
      supabase
        .from("claim_opportunities")
        .select("*")
        .eq("project_id", projectId)
        .in("status", ["Pending Review", "Approved"])
        .order("created_at", { ascending: false }),
      findOpenValuation(projectId).catch(() => null),
    ]);

    if (error) {
      showError("Ready To Claim", error);
    } else {
      const list = (data ?? []) as ClaimOpportunity[];
      setPending(list.filter((c) => c.status === "Pending Review"));
      setApproved(list.filter((c) => c.status === "Approved"));
    }
    setOpenVal(ov);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id: string) => {
    const { error } = await supabase
      .from("claim_opportunities")
      .update({ status: "Dismissed" })
      .eq("id", id);
    if (error) return showError("Ready To Claim", error);
    toast.success("Claim dismissed");
    load();
  };

  const approve = async (c: ClaimOpportunity) => {
    setBusyId(c.id);
    try {
      const val = await getOrCreateOpenValuation(projectId);
      const valNumber = formatValuationNumber(val.valuation_number);

      // Add to the rolling open valuation
      const { error: viErr } = await supabase.from("valuation_items").insert({
        valuation_id: val.id,
        work_package_id: c.work_package_id,
        work_package_name: c.work_package_name,
        description: c.finding_text,
        status: "Draft",
        claim_opportunity_id: c.id,
        unit_rate: c.unit_rate,
        claimed_qty: c.quantity,
        claimed_value: c.claimed_value,
        scope_element_id: c.scope_element_id,
      });
      if (viErr) throw viErr;

      // Mark the opportunity approved
      const { error: uErr } = await supabase
        .from("claim_opportunities")
        .update({ status: "Approved" })
        .eq("id", c.id);
      if (uErr) throw uErr;

      // Sync linked scope element
      if (c.scope_element_id) {
        const { error: sErr } = await (supabase as any)
          .from("scope_elements")
          .update({
            status: "In Progress",
            claimed_in_valuation: { id: val.id, number: valNumber },
          })
          .eq("id", c.scope_element_id);
        if (sErr) showError("Ready To Claim", sErr);
      }

      toast.success(`Added to Valuation ${valNumber}`);
      load();
    } catch (e: any) {
      showError("Ready To Claim", e);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <LoadingDot label="Loading" />;
  }

  return (
    <div className="space-y-8">
      {/* Open valuation banner */}
      {openVal && (
        <button
          onClick={() =>
            navigate({ to: "/valuations/$id", params: { id: openVal.id } })
          }
          className="w-full rounded-md border border-primary/30 bg-primary/5 p-4 flex items-center justify-between hover:bg-primary/10 transition-colors text-left"
        >
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Current open valuation
            </div>
            <div className="text-lg font-semibold text-primary mt-0.5">
              {formatValuationNumber(openVal.valuation_number)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              New approvals are added here until you generate an invoice.
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-primary" />
        </button>
      )}

      {/* Pending Review */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-primary flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          Ready To Claim ({pending.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Review claim opportunities generated from site diary analysis. Approving adds the line directly to the current open valuation.
        </p>

        {pending.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Nothing to review"
            description="New claim opportunities will appear here after you analyse a site diary entry."
          />
        ) : (
          <div className="space-y-3">
            {pending.map((c) => (
              <div
                key={c.id}
                className="rounded-md bg-card border border-border p-4 space-y-3"
              >
                <div>
                  <div className="text-sm font-semibold text-primary">
                    {c.work_package_name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {c.finding_text}
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2 border-t border-border">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dismiss(c.id)}
                    disabled={busyId === c.id}
                  >
                    <X className="w-3 h-3 mr-1" /> Dismiss
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => approve(c)}
                    disabled={busyId === c.id}
                  >
                    <FileCheck className="w-3 h-3 mr-1" />
                    {busyId === c.id ? "Adding…" : "Approve → Add to Valuation"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Approved (already added to a valuation) */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-green-500 flex items-center gap-2">
          <FileCheck className="w-4 h-4" />
          Approved ({approved.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Already added to a valuation. View the open valuation above to invoice.
        </p>

        {approved.length === 0 ? (
          <EmptyState
            icon={FileCheck}
            title="No approved claims yet"
            description="Approve items above to add them to your open valuation."
          />
        ) : (
          <div className="space-y-3">
            {approved.map((c) => (
              <div
                key={c.id}
                className="rounded-md bg-card border border-green-500/20 p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider bg-green-500/15 text-green-500">
                    Approved
                  </span>
                </div>
                <div className="text-sm font-semibold text-primary">
                  {c.work_package_name}
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  {c.finding_text}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
