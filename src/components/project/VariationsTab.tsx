import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Trash2, FileEdit, ClipboardCheck } from "lucide-react";

type Variation = {
  id: string;
  project_id: string;
  description: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  status: string;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Approved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  Rejected: "bg-slate-500/15 text-slate-700 border-slate-500/30",
};

export function VariationsTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("variations")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Variation[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (v: Variation) => {
    setBusyId(v.id);
    // Insert into Ready To Claim (claim_opportunities) as Pending Review
    const { error: cErr } = await supabase.from("claim_opportunities").insert({
      project_id: projectId,
      work_package_name: "Variation",
      finding_text: v.description ?? "",
      status: "Pending Review",
    });
    if (cErr) {
      setBusyId(null);
      return toast.error(cErr.message);
    }
    const { error: uErr } = await supabase
      .from("variations")
      .update({ status: "Approved" })
      .eq("id", v.id);
    setBusyId(null);
    if (uErr) return toast.error(uErr.message);
    toast.success("Variation approved — moved to Ready To Claim");
    load();
  };

  const reject = async (id: string) => {
    const { error } = await supabase.from("variations").update({ status: "Rejected" }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this variation?")) return;
    const { error } = await supabase.from("variations").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const drafts = items.filter((i) => i.status === "Draft" || i.status === "Pending");
  const approved = items.filter((i) => i.status === "Approved");
  const rejected = items.filter((i) => i.status === "Rejected");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Draft" value={drafts.length} tone="amber" />
        <Stat label="Approved" value={approved.length} tone="emerald" />
        <Stat label="Rejected" value={rejected.length} tone="slate" />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          <FileEdit className="w-5 h-5 mx-auto mb-2 opacity-50" />
          No variations yet. They appear here automatically after analysing a site walk.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((v) => (
            <div key={v.id} className="p-3 rounded-md bg-card border border-border space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground leading-relaxed">{v.description ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {new Date(v.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </div>
                </div>
                <Badge variant="outline" className={`text-[10px] uppercase tracking-wider shrink-0 ${STATUS_STYLES[v.status] ?? ""}`}>
                  {v.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {(v.status === "Draft" || v.status === "Pending") && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => reject(v.id)}>
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-[11px] gap-1"
                      disabled={busyId === v.id}
                      onClick={() => approve(v)}
                    >
                      <ClipboardCheck className="w-3 h-3" />
                      {busyId === v.id ? "Approving…" : "Approve → Ready To Claim"}
                    </Button>
                  </>
                )}
                {v.status === "Approved" && (
                  <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" /> In Ready To Claim
                  </span>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive hover:text-destructive" onClick={() => remove(v.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneClass: Record<string, string> = {
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    slate: "text-slate-700",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${toneClass[tone] ?? "text-primary"}`}>{value}</div>
    </div>
  );
}
