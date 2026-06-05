import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Check, X, Pencil, Loader2, Package, FileText } from "lucide-react";

type Req = {
  id: string;
  project_id: string;
  work_package_id: string | null;
  material_name: string;
  estimated_quantity: number;
  original_quantity: number | null;
  unit: string;
  confidence_score: "high" | "medium" | "low";
  source_reference: string;
  source_task: string;
  source_document: string;
  status: "Suggested" | "Approved" | "Adjusted" | "Rejected";
  created_at: string;
};

type WP = { id: string; package_name: string; trade: string | null };

const STATUS_STYLES: Record<Req["status"], string> = {
  Suggested: "bg-muted text-foreground/80",
  Approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  Adjusted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const CONF_STYLES: Record<Req["confidence_score"], string> = {
  high: "text-emerald-600",
  medium: "text-amber-600",
  low: "text-red-600",
};

export function MaterialIntelligenceTab({ projectId }: { projectId: string }) {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [wps, setWps] = useState<WP[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [r, w] = await Promise.all([
      (supabase as any)
        .from("material_requirements")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("work_packages")
        .select("id, package_name, trade")
        .eq("project_id", projectId),
    ]);
    if (r.error) toast.error(r.error.message);
    setReqs((r.data as Req[]) ?? []);
    setWps((w.data as WP[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const wpName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const w of wps) m[w.id] = w.package_name;
    return m;
  }, [wps]);

  const summary = useMemo(() => {
    const s = { total: reqs.length, approved: 0, adjusted: 0, rejected: 0, suggested: 0 };
    for (const r of reqs) {
      if (r.status === "Approved") s.approved++;
      else if (r.status === "Adjusted") s.adjusted++;
      else if (r.status === "Rejected") s.rejected++;
      else s.suggested++;
    }
    return s;
  }, [reqs]);

  const grouped = useMemo(() => {
    const g: Record<string, Req[]> = {};
    for (const r of reqs) {
      const key = r.work_package_id ? wpName[r.work_package_id] || "Unassigned" : "Unassigned";
      (g[key] ||= []).push(r);
    }
    return g;
  }, [reqs, wpName]);

  const setStatus = async (id: string, status: Req["status"]) => {
    setBusyId(id);
    const { error } = await (supabase as any)
      .from("material_requirements")
      .update({ status })
      .eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    setReqs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  const saveAdjust = async (id: string) => {
    const qty = Number(editQty);
    if (!Number.isFinite(qty) || qty < 0) return toast.error("Enter a valid quantity");
    setBusyId(id);
    const { error } = await (supabase as any)
      .from("material_requirements")
      .update({ estimated_quantity: qty, status: "Adjusted" })
      .eq("id", id);
    setBusyId(null);
    if (error) return toast.error(error.message);
    setReqs((prev) =>
      prev.map((r) => (r.id === id ? { ...r, estimated_quantity: qty, status: "Adjusted" } : r))
    );
    setEditingId(null);
    setEditQty("");
    toast.success("Adjustment saved. Mastor will learn from this.");
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (reqs.length === 0) {
    return (
      <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
        No material requirements yet. Upload a scope or BoQ and parse it — Mastor will estimate the
        materials needed.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total" value={summary.total} />
        <Stat label="Approved" value={summary.approved} tone="emerald" />
        <Stat label="Adjusted" value={summary.adjusted} tone="amber" />
        <Stat label="Rejected" value={summary.rejected} tone="red" />
      </div>

      {Object.entries(grouped).map(([pkgName, items]) => (
        <section key={pkgName} className="rounded-lg border border-border bg-card">
          <header className="px-4 py-2 border-b border-border flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">{pkgName}</h3>
            <span className="text-xs text-muted-foreground">
              {items.length} material{items.length === 1 ? "" : "s"}
            </span>
          </header>
          <ul className="divide-y divide-border">
            {items.map((r) => (
              <li key={r.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{r.material_name}</p>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {r.source_task && <span>Task: {r.source_task}</span>}
                      {r.source_document && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {r.source_document}
                        </span>
                      )}
                      {r.source_reference && <span>Ref: {r.source_reference}</span>}
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_STYLES[r.status]}`}>
                    {r.status}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 text-sm">
                    {editingId === r.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={editQty}
                          onChange={(e) => setEditQty(e.target.value)}
                          className="h-8 w-24"
                          step="any"
                        />
                        <span className="text-muted-foreground">{r.unit}</span>
                        <Button size="sm" onClick={() => saveAdjust(r.id)} disabled={busyId === r.id}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditQty("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold">
                          {r.estimated_quantity} {r.unit}
                        </span>
                        {r.original_quantity != null &&
                          r.status === "Adjusted" &&
                          Number(r.original_quantity) !== Number(r.estimated_quantity) && (
                            <span className="text-xs text-muted-foreground line-through">
                              {r.original_quantity} {r.unit}
                            </span>
                          )}
                        <span className={`text-xs uppercase tracking-wider ${CONF_STYLES[r.confidence_score]}`}>
                          {r.confidence_score} confidence
                        </span>
                      </>
                    )}
                  </div>

                  {editingId !== r.id && (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(r.id, "Approved")}
                        disabled={busyId === r.id || r.status === "Approved"}
                      >
                        {busyId === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        <span className="ml-1">Approve</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(r.id);
                          setEditQty(String(r.estimated_quantity));
                        }}
                      >
                        <Pencil className="w-3 h-3 mr-1" /> Adjust
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(r.id, "Rejected")}
                        disabled={busyId === r.id || r.status === "Rejected"}
                      >
                        <X className="w-3 h-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "amber" | "red";
}) {
  const toneCls =
    tone === "emerald"
      ? "text-emerald-600"
      : tone === "amber"
      ? "text-amber-600"
      : tone === "red"
      ? "text-red-600"
      : "text-primary";
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${toneCls}`}>{value}</div>
    </div>
  );
}
