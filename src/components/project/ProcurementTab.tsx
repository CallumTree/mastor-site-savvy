import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, Save, X } from "lucide-react";

type ProcurementItem = {
  id: string;
  project_id: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  estimated_cost: number | null;
  supplier: string | null;
  status: string;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const STATUSES = ["Required", "Quoted", "Ordered", "Delivered"];

export function ProcurementTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ProcurementItem> | null>(null);

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

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("procurement_items").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const total = items.reduce((s, i) => s + Number(i.estimated_cost ?? 0), 0);

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

      <div className="p-3 rounded-md bg-secondary border border-border flex justify-between items-center">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Total Estimated Procurement Cost</span>
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
      ) : items.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No procurement items yet.
        </div>
      ) : (
        items.map((p) => (
          <div key={p.id} className="p-3 rounded-md bg-card border border-border">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{p.description}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {p.quantity ?? 0} {p.unit ?? ""} · {p.supplier || "No supplier"}
                </div>
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-2">
                <div className="text-sm font-semibold text-primary">
                  {p.estimated_cost != null ? GBP.format(Number(p.estimated_cost)) : "—"}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{p.status}</div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
