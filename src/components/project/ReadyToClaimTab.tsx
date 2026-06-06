import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ClipboardCheck, FileCheck, X, CircleDollarSign } from "lucide-react";

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
      toast.error(error.message);
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
    const { error } = await supabase
      .from("claim_opportunities")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(status === "Approved" ? "Claim approved" : "Claim dismissed");
    load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
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
          Review claim opportunities generated from site walk analysis. Approve to move to the Approved Claims list.
        </p>

        {pending.length === 0 ? (
          <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
            <ClipboardCheck className="w-5 h-5 mx-auto mb-2 opacity-50" />
            No claim opportunities awaiting review.
          </div>
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
          <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
            No approved claims yet. Approve items above to populate this list.
          </div>
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
                onClick={() => {
                  toast.info("Generate Valuation — coming in the next phase.");
                }}
              >
                <CircleDollarSign className="w-4 h-4 mr-2" />
                Generate Valuation
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
