import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Brain, Package, Hammer, Wrench, ListChecks, ChevronRight, X, GitMerge } from "lucide-react";
import { Button } from "@/components/ui/button";

type LibType = "material" | "task" | "activity" | "claimable";

type Row = {
  id: string;
  name: string;
  trade: string | null;
  description?: string | null;
  unit_type?: string | null;
  aliases?: string[] | null;
  procurement_package?: string | null;
  confidence_score: number;
  sources: any[] | null;
};


type MergeSuggestion = {
  id: string;
  library_type: LibType;
  primary_id: string;
  duplicate_id: string;
  reason: string | null;
  status: string;
};

const TABLE_BY_TYPE: Record<LibType, string> = {
  material: "materials_library",
  task: "tasks_library",
  activity: "labour_activities_library",
  claimable: "claimable_elements_library",
};

const NAME_BY_TYPE: Record<LibType, string> = {
  material: "material_name",
  task: "task_name",
  activity: "activity_name",
  claimable: "element_name",
};

const TABS: { key: LibType; label: string; icon: any }[] = [
  { key: "material", label: "Materials", icon: Package },
  { key: "task", label: "Tasks", icon: Hammer },
  { key: "claimable", label: "Claimable Elements", icon: ListChecks },
  { key: "activity", label: "Labour Activities", icon: Wrench },
];

export function ConstructionIntelligenceTab() {
  const [counts, setCounts] = useState<Record<LibType, number>>({ material: 0, task: 0, activity: 0, claimable: 0 });
  const [active, setActive] = useState<LibType>("material");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [merges, setMerges] = useState<MergeSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCounts = async () => {
    const entries = await Promise.all(
      (Object.entries(TABLE_BY_TYPE) as [LibType, string][]).map(async ([k, t]) => {
        const { count } = await (supabase as any).from(t).select("*", { count: "exact", head: true });
        return [k, count ?? 0] as const;
      })
    );
    setCounts(Object.fromEntries(entries) as any);
  };

  const loadRows = async (type: LibType) => {
    setLoading(true);
    const table = TABLE_BY_TYPE[type];
    const nameCol = NAME_BY_TYPE[type];
    const { data, error } = await (supabase as any)
      .from(table)
      .select("*")
      .order(nameCol, { ascending: true });
    if (error) toast.error(error.message);
    setRows(
      (data ?? []).map((r: any) => ({
        id: r.id,
        name: r[nameCol],
        trade: r.trade ?? null,
        description: r.description ?? null,
        unit_type: r.unit_type ?? null,
        aliases: r.aliases ?? [],
        procurement_package: r.procurement_package ?? null,
        confidence_score: Number(r.confidence_score ?? 0),
        sources: r.sources ?? [],
      }))
    );
    setLoading(false);
  };


  const loadMerges = async () => {
    const { data } = await (supabase as any)
      .from("knowledge_merge_suggestions")
      .select("*")
      .eq("status", "Pending");
    setMerges((data ?? []) as MergeSuggestion[]);
  };

  useEffect(() => {
    loadCounts();
    loadMerges();
  }, []);

  useEffect(() => {
    loadRows(active);
    setSelected(null);
  }, [active]);

  const approveMerge = async (m: MergeSuggestion) => {
    const table = TABLE_BY_TYPE[m.library_type];
    const nameCol = NAME_BY_TYPE[m.library_type];
    const { data: dup } = await (supabase as any).from(table).select("*").eq("id", m.duplicate_id).maybeSingle();
    const { data: pri } = await (supabase as any).from(table).select("*").eq("id", m.primary_id).maybeSingle();
    if (!dup || !pri) {
      await (supabase as any).from("knowledge_merge_suggestions").update({ status: "Rejected" }).eq("id", m.id);
      loadMerges();
      return;
    }
    const newAliases = Array.from(new Set([...(pri.aliases ?? []), dup[nameCol], ...(dup.aliases ?? [])])).filter(
      (a: string) => a && a.toLowerCase() !== String(pri[nameCol]).toLowerCase()
    );
    const newSources = [...(pri.sources ?? []), ...(dup.sources ?? [])];
    await (supabase as any).from(table).update({ aliases: newAliases, sources: newSources }).eq("id", m.primary_id);
    await (supabase as any).from(table).delete().eq("id", m.duplicate_id);
    await (supabase as any).from("knowledge_merge_suggestions").update({ status: "Merged" }).eq("id", m.id);
    toast.success("Merged");
    loadCounts();
    loadRows(active);
    loadMerges();
  };

  const rejectMerge = async (m: MergeSuggestion) => {
    await (supabase as any).from("knowledge_merge_suggestions").update({ status: "Rejected" }).eq("id", m.id);
    loadMerges();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Brain className="w-4 h-4 text-primary mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Every parsed document teaches Mastor. Materials, tasks, labour activities and claimable elements are stored
          here and reused across all your projects.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`text-left rounded-lg border p-3 transition ${
                isActive ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <Icon className="w-3 h-3 text-primary mb-1.5" />
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</div>
              <div className="text-xl font-semibold text-primary mt-0.5">{counts[t.key]}</div>
            </button>
          );
        })}
      </div>

      {merges.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
            <GitMerge className="w-3 h-3" /> Suggested Merges ({merges.length})
          </div>
          {merges.slice(0, 6).map((m) => (
            <MergeRow key={m.id} m={m} onApprove={approveMerge} onReject={rejectMerge} />
          ))}
        </div>
      )}

      <div className="rounded-md border border-border bg-card">
        <div className="px-3 py-2 border-b border-border text-xs font-semibold uppercase tracking-wider text-primary">
          {TABS.find((t) => t.key === active)?.label} ({rows.length})
        </div>
        {loading ? (
          <p className="p-3 text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            Nothing yet. Parse a scope document to start building knowledge.
          </p>
        ) : (
          <div className="divide-y divide-border max-h-[420px] overflow-auto">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-secondary/40 text-left"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                    {r.trade && <span>{r.trade}</span>}
                    {r.unit_type && <span>· {r.unit_type}</span>}
                    {r.aliases && r.aliases.length > 0 && <span>· {r.aliases.length} alias{r.aliases.length === 1 ? "" : "es"}</span>}
                    <span>· {(r.sources?.length ?? 0)} source{(r.sources?.length ?? 0) === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && <DetailDrawer row={selected} type={active} onClose={() => setSelected(null)} />}
    </div>
  );
}

function MergeRow({
  m,
  onApprove,
  onReject,
}: {
  m: MergeSuggestion;
  onApprove: (m: MergeSuggestion) => void;
  onReject: (m: MergeSuggestion) => void;
}) {
  const [names, setNames] = useState<{ primary: string; duplicate: string } | null>(null);
  useEffect(() => {
    (async () => {
      const table = TABLE_BY_TYPE[m.library_type];
      const nameCol = NAME_BY_TYPE[m.library_type];
      const { data } = await (supabase as any).from(table).select(`id, ${nameCol}`).in("id", [m.primary_id, m.duplicate_id]);
      const p = (data ?? []).find((r: any) => r.id === m.primary_id);
      const d = (data ?? []).find((r: any) => r.id === m.duplicate_id);
      setNames({ primary: p?.[nameCol] ?? "?", duplicate: d?.[nameCol] ?? "?" });
    })();
  }, [m.id]);
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <div className="min-w-0">
        <span className="text-foreground">{names?.duplicate ?? "…"}</span>
        <span className="text-muted-foreground"> → </span>
        <span className="text-primary font-medium">{names?.primary ?? "…"}</span>
        {m.reason && <div className="text-[10px] text-muted-foreground">{m.reason}</div>}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onApprove(m)}>
          Merge
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => onReject(m)}>
          Reject
        </Button>
      </div>
    </div>
  );
}

function DetailDrawer({ row, type, onClose }: { row: Row; type: LibType; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md h-full bg-background border-l border-border overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{TABS.find((t) => t.key === type)?.label}</div>
            <h3 className="text-base font-semibold text-primary mt-0.5">{row.name}</h3>
            <div className="text-[11px] text-muted-foreground mt-1">
              Confidence: {(row.confidence_score * 100).toFixed(0)}%
              {row.trade && <span> · {row.trade}</span>}
              {row.unit_type && <span> · {row.unit_type}</span>}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X className="w-3 h-3" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {row.description && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Description</div>
              <div className="text-sm text-foreground">{row.description}</div>
            </div>
          )}

          {row.aliases && row.aliases.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Aliases</div>
              <div className="flex flex-wrap gap-1">
                {row.aliases.map((a, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-secondary/40">
                    {a}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              Source Documents ({row.sources?.length ?? 0})
            </div>
            {!row.sources || row.sources.length === 0 ? (
              <div className="text-xs text-muted-foreground">No sources tracked.</div>
            ) : (
              <div className="space-y-1.5">
                {row.sources.map((s: any, i: number) => (
                  <div key={i} className="text-[11px] p-2 rounded border border-border bg-card">
                    <div className="text-foreground">{s.document_name || "Document"}</div>
                    <div className="text-muted-foreground mt-0.5">
                      {s.source_reference && <span>Ref: {s.source_reference}</span>}
                      {s.quantity != null && s.quantity > 0 && <span> · Qty: {s.quantity} {s.unit || ""}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
