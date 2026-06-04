import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Pencil, Sparkles, Loader2, Inbox } from "lucide-react";

type FindingType = "progress" | "procurement" | "variation" | "risk";

type Finding = {
  id: string;
  project_id: string;
  analysis_id: string | null;
  site_walk_id: string | null;
  finding_type: FindingType;
  original_text: string;
  finding_text: string;
  confidence: string | null;
  status: string; // Awaiting Review | Approved | Rejected
  approved_at: string | null;
  created_at: string;
};

type Filter =
  | "all"
  | "awaiting"
  | "approved"
  | "rejected"
  | FindingType;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting", label: "Awaiting Review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "progress", label: "Progress" },
  { key: "procurement", label: "Procurement" },
  { key: "variation", label: "Variations" },
  { key: "risk", label: "Risks" },
];

const TYPE_LABEL: Record<FindingType, string> = {
  progress: "Progress",
  procurement: "Procurement",
  variation: "Variation",
  risk: "Risk",
};

const TYPE_TONE: Record<FindingType, string> = {
  progress: "border-sky-500/40 text-sky-700 bg-sky-500/10",
  procurement: "border-emerald-500/40 text-emerald-700 bg-emerald-500/10",
  variation: "border-amber-500/40 text-amber-700 bg-amber-500/10",
  risk: "border-rose-500/40 text-rose-700 bg-rose-500/10",
};

export function ReviewQueueTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Finding[]>([]);
  const [walks, setWalks] = useState<Record<string, { title: string | null; created_at: string }>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: f, error: fe }, { data: w }] = await Promise.all([
      (supabase as any)
        .from("approved_findings")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase.from("site_walks").select("id, title, created_at").eq("project_id", projectId),
    ]);
    if (fe) toast.error(fe.message);
    setItems((f ?? []) as Finding[]);
    const map: Record<string, { title: string | null; created_at: string }> = {};
    for (const row of (w ?? []) as any[]) map[row.id] = { title: row.title, created_at: row.created_at };
    setWalks(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (filter === "all") return true;
      if (filter === "awaiting") return i.status === "Awaiting Review";
      if (filter === "approved") return i.status === "Approved";
      if (filter === "rejected") return i.status === "Rejected";
      return i.finding_type === filter;
    });
  }, [items, filter]);

  const grouped = useMemo(() => {
    const g: Record<FindingType, Finding[]> = {
      progress: [], procurement: [], variation: [], risk: [],
    };
    for (const i of filtered) g[i.finding_type].push(i);
    return g;
  }, [filtered]);

  const counts = useMemo(() => {
    const c = {
      awaiting: 0, approved: 0, rejected: 0,
      progress: 0, procurement: 0, variation: 0, risk: 0,
    };
    for (const i of items) {
      if (i.status === "Awaiting Review") c.awaiting++;
      else if (i.status === "Approved") c.approved++;
      else if (i.status === "Rejected") c.rejected++;
      (c as any)[i.finding_type]++;
    }
    return c;
  }, [items]);

  const updateStatus = async (f: Finding, status: "Approved" | "Rejected", textOverride?: string) => {
    setBusyId(f.id);
    const finding_text = textOverride ?? f.finding_text;
    const { data, error } = await (supabase as any)
      .from("approved_findings")
      .update({
        status,
        finding_text,
        approved_at: status === "Approved" ? new Date().toISOString() : null,
      })
      .eq("id", f.id)
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      setBusyId(null);
      return;
    }
    const saved = data as Finding;
    setItems((prev) => prev.map((p) => (p.id === f.id ? saved : p)));

    if (status === "Approved") {
      if (f.finding_type === "procurement") {
        const { error: pe } = await (supabase as any).from("procurement_items").insert({
          project_id: projectId,
          description: finding_text,
          status: "Required",
        });
        if (pe) toast.error(`Procurement: ${pe.message}`);
        else toast.success("Approved — Procurement item created");
      } else if (f.finding_type === "variation") {
        const { error: ve } = await (supabase as any).from("variations").insert({
          project_id: projectId,
          description: finding_text,
          status: "Draft",
        });
        if (ve) toast.error(`Variation: ${ve.message}`);
        else toast.success("Approved — Variation created");
      } else {
        toast.success("Finding approved");
      }
    } else {
      toast.success("Finding rejected");
    }
    setBusyId(null);
  };

  const saveEdit = async (f: Finding) => {
    const newText = (drafts[f.id] ?? f.finding_text).trim();
    if (!newText) {
      toast.error("Text cannot be empty");
      return;
    }
    setBusyId(f.id);
    const { data, error } = await (supabase as any)
      .from("approved_findings")
      .update({ finding_text: newText })
      .eq("id", f.id)
      .select("*")
      .single();
    setBusyId(null);
    if (error) return toast.error(error.message);
    setItems((prev) => prev.map((p) => (p.id === f.id ? (data as Finding) : p)));
    setEditingId(null);
    toast.success("Edit saved");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-primary" /> AI Review Queue
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Approve, edit, or reject AI suggestions. Records are only created after you approve.
          </p>
        </div>
        <div className="flex gap-2 text-[11px]">
          <Stat label="Awaiting" value={counts.awaiting} tone="bg-amber-500/10 text-amber-700 border-amber-500/40" />
          <Stat label="Approved" value={counts.approved} tone="bg-emerald-500/10 text-emerald-700 border-emerald-500/40" />
          <Stat label="Rejected" value={counts.rejected} tone="bg-rose-500/10 text-rose-700 border-rose-500/40" />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            className="h-7 px-2.5 text-xs"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="p-8 rounded-xl border border-dashed border-border text-center">
          <Inbox className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground">Nothing in this view</p>
          <p className="text-xs text-muted-foreground mt-1">
            Run an AI Analyse Walk from Site Walks to generate findings.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {(Object.keys(grouped) as FindingType[]).map((type) => {
            const list = grouped[type];
            if (list.length === 0) return null;
            return (
              <section key={type} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${TYPE_TONE[type]}`}>
                    {TYPE_LABEL[type]}
                  </span>
                  <span className="text-xs text-muted-foreground">{list.length}</span>
                </div>
                <div className="space-y-2">
                  {list.map((f) => {
                    const walk = f.site_walk_id ? walks[f.site_walk_id] : null;
                    const editing = editingId === f.id;
                    const draft = drafts[f.id] ?? f.finding_text;
                    const tone =
                      f.status === "Approved"
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : f.status === "Rejected"
                        ? "border-rose-500/40 bg-rose-500/5 opacity-70"
                        : "border-border bg-card";
                    return (
                      <div key={f.id} className={`p-3 rounded-md border ${tone} space-y-2`}>
                        <div className="flex items-start gap-2 flex-wrap">
                          <div className="flex-1 min-w-0">
                            {editing ? (
                              <Input
                                value={draft}
                                onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value }))}
                                className="text-sm"
                              />
                            ) : (
                              <div className="text-sm break-words">{f.finding_text}</div>
                            )}
                            {f.finding_text !== f.original_text && !editing && (
                              <div className="text-[10px] text-muted-foreground mt-1 italic">
                                Original: {f.original_text}
                              </div>
                            )}
                          </div>
                          <Badge variant="outline" className="shrink-0 text-[10px]">{f.status}</Badge>
                          {f.confidence && (
                            <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                              {f.confidence}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-[10px] text-muted-foreground">
                            {walk?.title || "Site walk"} ·{" "}
                            {new Date(f.created_at).toLocaleDateString("en-GB", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                            {f.approved_at && (
                              <> · approved {new Date(f.approved_at).toLocaleDateString("en-GB")}</>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {editing ? (
                              <>
                                <Button size="sm" variant="default" className="h-7 gap-1" disabled={busyId === f.id} onClick={() => saveEdit(f)}>
                                  <Check className="w-3 h-3" /> Save
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingId(null)}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant={f.status === "Approved" ? "default" : "outline"}
                                  className="h-7 gap-1"
                                  disabled={busyId === f.id || f.status === "Approved"}
                                  onClick={() => updateStatus(f, "Approved")}
                                >
                                  {busyId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 gap-1"
                                  disabled={busyId === f.id}
                                  onClick={() => {
                                    setDrafts((d) => ({ ...d, [f.id]: f.finding_text }));
                                    setEditingId(f.id);
                                  }}
                                >
                                  <Pencil className="w-3 h-3" /> Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant={f.status === "Rejected" ? "destructive" : "ghost"}
                                  className="h-7 gap-1"
                                  disabled={busyId === f.id || f.status === "Rejected"}
                                  onClick={() => updateStatus(f, "Rejected")}
                                >
                                  <X className="w-3 h-3" /> Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`px-2.5 py-1 rounded-md border ${tone} flex items-center gap-1.5`}>
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="uppercase tracking-wider text-[10px]">{label}</span>
    </div>
  );
}
