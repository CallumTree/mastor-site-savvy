import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, Save, X, ChevronDown, ChevronRight, Archive } from "lucide-react";

type ProcurementItem = {
  id: string;
  project_id: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  estimated_cost: number | null;
  supplier: string | null;
  status: string;
  created_at?: string;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const STATUSES = ["Required", "Quoted", "Ordered", "Delivered", "Dismissed"];
const ACTIVE = new Set(["Required", "Quoted", "Ordered"]);
const ARCHIVE = new Set(["Delivered", "Dismissed"]);

const STATUS_STYLES: Record<string, string> = {
  Required: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Quoted: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  Ordered: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
  Delivered: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  Dismissed: "bg-slate-500/15 text-slate-700 border-slate-500/30",
};

export function ProcurementTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ProcurementItem> | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("procurement_items")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as ProcurementItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const save = async () => {
    if (!editing || !editing.description?.trim()) {
      toast.error("Description is required");
      return;
    }
    const payload = {
      project_id: projectId,
      description: editing.description.trim(),
      quantity: editing.quantity != null ? Number(editing.quantity) : null,
      unit: editing.unit ?? null,
      estimated_cost: editing.estimated_cost != null ? Number(editing.estimated_cost) : null,
      supplier: editing.supplier ?? null,
      status: editing.status ?? "Required",
    };
    const { error } = editing.id
      ? await (supabase as any).from("procurement_items").update(payload).eq("id", editing.id)
      : await (supabase as any).from("procurement_items").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    setEditing(null);
    load();
  };

  const setStatus = async (id: string, status: string) => {
    const { error } = await (supabase as any).from("procurement_items").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("procurement_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const counts = {
    Required: items.filter((i) => i.status === "Required").length,
    Quoted: items.filter((i) => i.status === "Quoted").length,
    Ordered: items.filter((i) => i.status === "Ordered").length,
    Delivered: items.filter((i) => i.status === "Delivered").length,
  };

  const activeItems = items.filter((i) => ACTIVE.has(i.status));
  const archiveItems = items.filter((i) => ARCHIVE.has(i.status));
  const total = activeItems.reduce((s, i) => s + Number(i.estimated_cost ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Procurement Items</h3>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing({ status: "Required" })}>
            <Plus className="w-3 h-3 mr-1" /> Add item
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <CountCard label="Required" value={counts.Required} tone="amber" />
        <CountCard label="Quoted" value={counts.Quoted} tone="sky" />
        <CountCard label="Ordered" value={counts.Ordered} tone="indigo" />
        <CountCard label="Delivered" value={counts.Delivered} tone="emerald" />
      </div>

      <div className="p-3 rounded-md bg-secondary border border-border flex justify-between items-center">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Active Procurement Cost</span>
        <span className="text-base font-semibold text-primary">{GBP.format(total)}</span>
      </div>

      {editing && (
        <div className="p-3 rounded-md bg-card border border-border space-y-2">
          <Input placeholder="Description" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" placeholder="Quantity" value={editing.quantity ?? ""} onChange={(e) => setEditing({ ...editing, quantity: e.target.value === "" ? null : Number(e.target.value) })} />
            <Input placeholder="Unit" value={editing.unit ?? ""} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} />
            <Input type="number" placeholder="Est. cost (£)" value={editing.estimated_cost ?? ""} onChange={(e) => setEditing({ ...editing, estimated_cost: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Supplier" value={editing.supplier ?? ""} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} />
            <select
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
              value={editing.status ?? "Required"}
              onChange={(e) => setEditing({ ...editing, status: e.target.value })}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="w-3 h-3 mr-1" />Cancel</Button>
            <Button size="sm" onClick={save}><Save className="w-3 h-3 mr-1" />Save</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : activeItems.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No active procurement items.
        </div>
      ) : (
        <div className="space-y-2">
          {activeItems.map((p) => (
            <Row key={p.id} item={p} onEdit={() => setEditing(p)} onRemove={() => remove(p.id)} onStatus={(s) => setStatus(p.id, s)} />
          ))}
        </div>
      )}

      {archiveItems.length > 0 && (
        <div className="rounded-md border border-border bg-card">
          <button
            className="w-full px-3 py-2 flex items-center justify-between"
            onClick={() => setShowArchive((v) => !v)}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Archive className="w-3 h-3" />
              {showArchive ? "Hide Archive" : "Show Archive"}
              <span className="text-muted-foreground font-normal ml-1">({archiveItems.length})</span>
            </span>
            {showArchive ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {showArchive && (
            <div className="border-t border-border divide-y divide-border">
              {archiveItems.map((p) => (
                <div key={p.id} className="p-2">
                  <Row item={p} onEdit={() => setEditing(p)} onRemove={() => remove(p.id)} onStatus={(s) => setStatus(p.id, s)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CountCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneClass: Record<string, string> = {
    amber: "text-amber-700",
    sky: "text-sky-700",
    indigo: "text-indigo-700",
    emerald: "text-emerald-700",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${toneClass[tone] ?? "text-primary"}`}>{value}</div>
    </div>
  );
}

function Row({
  item,
  onEdit,
  onRemove,
  onStatus,
}: {
  item: ProcurementItem;
  onEdit: () => void;
  onRemove: () => void;
  onStatus: (s: string) => void;
}) {
  return (
    <div className="p-3 rounded-md bg-card border border-border">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{item.description}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {item.quantity ?? 0} {item.unit ?? ""} · {item.supplier || "No supplier"}
          </div>
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-2">
          <div className="text-sm font-semibold text-primary">
            {item.estimated_cost != null ? GBP.format(Number(item.estimated_cost)) : "—"}
          </div>
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${STATUS_STYLES[item.status] ?? ""}`}>
            {item.status}
          </Badge>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 justify-end">
        {item.status === "Required" && (
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onStatus("Quoted")}>Mark Quoted</Button>
        )}
        {item.status === "Quoted" && (
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onStatus("Ordered")}>Mark Ordered</Button>
        )}
        {item.status === "Ordered" && (
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onStatus("Delivered")}>Mark Delivered</Button>
        )}
        {ACTIVE.has(item.status) && (
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => onStatus("Dismissed")}>Dismiss</Button>
        )}
        {item.status === "Dismissed" && (
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onStatus("Required")}>Restore</Button>
        )}
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onRemove}><Trash2 className="w-3 h-3" /></Button>
      </div>
    </div>
  );
}
