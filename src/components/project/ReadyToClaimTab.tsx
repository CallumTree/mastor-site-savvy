import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ClipboardCheck, FileCheck, X, CircleDollarSign } from "lucide-react";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";

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
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("claim_opportunities")
      .select("*")
      .eq("project_id", projectId)
      .in("status", ["Pending Review", "Approved"])
      .order("created_at", { ascending: false });

    if (error) {
      showError("Ready To Claim", error);
    } else {
      const list = (data ?? []) as ClaimOpportunity[];
      setPending(list.filter((c) => c.status === "Pending Review"));
      setApproved(list.filter((c) => c.status === "Approved"));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (id: string, status: "Approved" | "Dismissed") => {
    const { data: updated, error } = await supabase
      .from("claim_opportunities")
      .update({ status })
      .eq("id", id)
      .select("scope_element_id")
      .maybeSingle();

    if (error) {
      showError("Ready To Claim", error);
      return;
    }

    if (status === "Approved" && (updated as any)?.scope_element_id) {
      const { error: sErr } = await (supabase as any)
        .from("scope_elements")
        .update({ status: "In Progress" })
        .eq("id", (updated as any).scope_element_id);
      if (sErr) showError("Ready To Claim", sErr);
    }

    toast.success(status === "Approved" ? "Claim approved" : "Claim dismissed");
    load();
  };

  const generateValuation = async () => {
    if (approved.length === 0) return;
    setGenerating(true);

    // Determine next valuation number for this project
    const { data: existing, error: exErr } = await supabase
      .from("valuations")
      .select("valuation_number")
      .eq("project_id", projectId);
    if (exErr) {
      setGenerating(false);
      return showError("Ready To Claim", exErr);
    }
    const nextNum =
      (existing ?? []).reduce((m, v) => Math.max(m, v.valuation_number ?? 0), 0) + 1;

    const { data: val, error: vErr } = await supabase
      .from("valuations")
      .insert({
        project_id: projectId,
        status: "Draft",
        valuation_number: nextNum,
        valuation_date: new Date().toISOString().slice(0, 10),
      })
      .select()
      .single();

    if (vErr || !val) {
      setGenerating(false);
      return showError("Ready To Claim", vErr ?? new Error("Failed to create valuation"));
    }

    const rows = approved.map((c) => ({
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
    }));


    const { error: iErr } = await supabase.from("valuation_items").insert(rows);
    setGenerating(false);
    if (iErr) return showError("Ready To Claim", iErr);

    const valNumber = `IV-${String(nextNum).padStart(2, "0")}`;
    const scopeIds = approved.map((c) => c.scope_element_id).filter(Boolean) as string[];
    if (scopeIds.length > 0) {
      const { error: scErr } = await (supabase as any)
        .from("scope_elements")
        .update({ status: "Claimed", claimed_in_valuation: { id: val.id, number: valNumber } })
        .in("id", scopeIds);
      if (scErr) showError("Ready To Claim", scErr);
    }

    toast.success(`Valuation ${valNumber} created`);
    navigate({ to: "/valuations/$id", params: { id: val.id } });
  };

  if (loading) {
    return <LoadingDot label="Loading" />;
  }

  return (
    <div className="space-y-8">
      {/* Pending Review */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-primary flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4" />
          Ready To Claim ({pending.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Review claim opportunities generated from site diary analysis. Approve to move to the Approved Claims list.
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
                    onClick={() => updateStatus(c.id, "Dismissed")}
                  >
                    <X className="w-3 h-3 mr-1" /> Dismiss
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => updateStatus(c.id, "Approved")}
                  >
                    <FileCheck className="w-3 h-3 mr-1" /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Approved Claims */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-green-500 flex items-center gap-2">
          <FileCheck className="w-4 h-4" />
          Approved Claims ({approved.length})
        </h3>
        <p className="text-xs text-muted-foreground">
          Claims that have been approved and are ready to be included in a valuation.
        </p>

        {approved.length === 0 ? (
          <EmptyState
            icon={FileCheck}
            title="No approved claims"
            description="Approve items above to add them to your next valuation."
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

            <div className="pt-4">
              <Button
                className="w-full"
                size="lg"
                disabled={generating || approved.length === 0}
                onClick={generateValuation}
              >
                <CircleDollarSign className="w-4 h-4 mr-2" />
                {generating ? "Generating…" : "Generate Valuation"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
