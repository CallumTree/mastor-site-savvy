import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Package, Loader2 } from "lucide-react";

type WorkPackage = {
  id: string;
  project_id: string;
  package_name: string;
  trade: string | null;
  description: string | null;
  status: string;
  confidence_score: number;
  source_documents: any;
  created_at: string;
};

type LinkedItem = { id: string; name: string };

type PackageDetail = {
  tasks: LinkedItem[];
  materials: LinkedItem[];
  activities: LinkedItem[];
  claimables: LinkedItem[];
  procurement: LinkedItem[];
};

const STATUSES = [
  "Identified",
  "Approved",
  "In Progress",
  "Substantially Complete",
  "Complete",
  "Claimed",
] as const;

const STATUS_PROGRESS: Record<string, number> = {
  Identified: 5,
  Approved: 15,
  "In Progress": 45,
  "Substantially Complete": 80,
  Complete: 100,
  Claimed: 100,
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  Identified: "outline",
  Approved: "secondary",
  "In Progress": "secondary",
  "Substantially Complete": "default",
  Complete: "default",
  Claimed: "default",
};

export function WorkPackagesTab({ projectId }: { projectId: string }) {
  const [packages, setPackages] = useState<WorkPackage[]>([]);
  const [counts, setCounts] = useState<Record<string, { tasks: number; materials: number; claimables: number }>>({});
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, PackageDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("work_packages")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    const list = (data ?? []) as WorkPackage[];
    setPackages(list);

    if (list.length) {
      const ids = list.map((p) => p.id);
      const [{ data: t }, { data: m }, { data: c }] = await Promise.all([
        (supabase as any).from("work_package_tasks").select("work_package_id").in("work_package_id", ids),
        (supabase as any).from("work_package_materials").select("work_package_id").in("work_package_id", ids),
        (supabase as any).from("work_package_claimables").select("work_package_id").in("work_package_id", ids),
      ]);
      const cnt: Record<string, { tasks: number; materials: number; claimables: number }> = {};
      for (const id of ids) cnt[id] = { tasks: 0, materials: 0, claimables: 0 };
      for (const r of (t ?? []) as any[]) cnt[r.work_package_id].tasks += 1;
      for (const r of (m ?? []) as any[]) cnt[r.work_package_id].materials += 1;
      for (const r of (c ?? []) as any[]) cnt[r.work_package_id].claimables += 1;
      setCounts(cnt);
    } else {
      setCounts({});
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const onUpdateStatus = async (pkg: WorkPackage, status: string) => {
    const { error } = await (supabase as any).from("work_packages").update({ status }).eq("id", pkg.id);
    if (error) return toast.error(error.message);
    setPackages((ps) => ps.map((p) => (p.id === pkg.id ? { ...p, status } : p)));
  };

  const onToggle = async (pkg: WorkPackage) => {
    if (openId === pkg.id) {
      setOpenId(null);
      return;
    }
    setOpenId(pkg.id);
    if (details[pkg.id]) return;
    setDetailLoading(pkg.id);
    const [tasks, materials, activities, claimables, procurement] = await Promise.all([
      (supabase as any)
        .from("work_package_tasks")
        .select("task_id, tasks_library(id, task_name)")
        .eq("work_package_id", pkg.id),
      (supabase as any)
        .from("work_package_materials")
        .select("material_id, materials_library(id, material_name)")
        .eq("work_package_id", pkg.id),
      (supabase as any)
        .from("work_package_activities")
        .select("activity_id, labour_activities_library(id, activity_name)")
        .eq("work_package_id", pkg.id),
      (supabase as any)
        .from("work_package_claimables")
        .select("claimable_id, claimable_elements_library(id, element_name)")
        .eq("work_package_id", pkg.id),
      (supabase as any)
        .from("work_package_procurement")
        .select("procurement_package_id, procurement_packages(id, package_name)")
        .eq("work_package_id", pkg.id),
    ]);
    setDetails((d) => ({
      ...d,
      [pkg.id]: {
        tasks: ((tasks.data ?? []) as any[]).map((r) => ({ id: r.tasks_library?.id, name: r.tasks_library?.task_name })).filter((x) => x.id),
        materials: ((materials.data ?? []) as any[]).map((r) => ({ id: r.materials_library?.id, name: r.materials_library?.material_name })).filter((x) => x.id),
        activities: ((activities.data ?? []) as any[]).map((r) => ({ id: r.labour_activities_library?.id, name: r.labour_activities_library?.activity_name })).filter((x) => x.id),
        claimables: ((claimables.data ?? []) as any[]).map((r) => ({ id: r.claimable_elements_library?.id, name: r.claimable_elements_library?.element_name })).filter((x) => x.id),
        procurement: ((procurement.data ?? []) as any[]).map((r) => ({ id: r.procurement_packages?.id, name: r.procurement_packages?.package_name })).filter((x) => x.id),
      },
    }));
    setDetailLoading(null);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  if (packages.length === 0) {
    return (
      <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
        No work packages yet. Upload a scope document and click <span className="font-medium">Parse Scope</span> — Mastor will group tasks into commercial packages.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Work Packages are the commercial units that drive procurement, progress and valuations.
      </p>
      <div className="space-y-2">
        {packages.map((pkg) => {
          const c = counts[pkg.id] ?? { tasks: 0, materials: 0, claimables: 0 };
          const isOpen = openId === pkg.id;
          const detail = details[pkg.id];
          const progress = STATUS_PROGRESS[pkg.status] ?? 0;
          return (
            <div key={pkg.id} className="rounded-md bg-card border border-border">
              <button
                className="w-full px-3 py-3 flex items-start justify-between text-left gap-3"
                onClick={() => onToggle(pkg)}
              >
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <Package className="w-4 h-4 mt-0.5 shrink-0 text-gold-foreground/70" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{pkg.package_name}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {pkg.trade && <span>{pkg.trade}</span>}
                      <span>{c.tasks} tasks</span>
                      <span>{c.materials} materials</span>
                      <span>{c.claimables} claimables</span>
                      <span>Confidence {Math.round(Number(pkg.confidence_score) * 100)}%</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={progress} className="h-1.5 w-32" />
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {progress}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={STATUS_VARIANT[pkg.status] ?? "outline"} className="text-[10px]">
                    {pkg.status}
                  </Badge>
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-border p-3 space-y-3">
                  {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}

                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Status:</span>
                    {STATUSES.map((s) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={pkg.status === s ? "default" : "outline"}
                        className="h-6 text-[10px] px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUpdateStatus(pkg, s);
                        }}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>

                  {detailLoading === pkg.id || !detail ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading package detail…
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-3">
                      <DetailList title="Tasks" items={detail.tasks} />
                      <DetailList title="Materials" items={detail.materials} />
                      <DetailList title="Labour Activities" items={detail.activities} />
                      <DetailList title="Claimable Elements" items={detail.claimables} />
                      <DetailList title="Procurement Packages" items={detail.procurement} />
                      <DetailList
                        title="Source Documents"
                        items={(Array.isArray(pkg.source_documents) ? pkg.source_documents : [])
                          .map((s: any, i: number) => ({ id: `${s?.document_id ?? i}`, name: s?.document_name ?? "—" }))}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: LinkedItem[] }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        {title} <span className="text-foreground/60">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <div className="text-[11px] text-muted-foreground italic">None</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it) => (
            <li key={it.id} className="text-xs text-foreground">• {it.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
