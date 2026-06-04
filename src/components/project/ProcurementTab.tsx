import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Trash2, Save, X } from "lucide-react";

type ProcurementItem = {
  id: string;
  project_id: string;
  package_name: string;
  supplier: string | null;
  status: string;
  value: number | null;
  notes: string | null;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

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
    if (!editing || !editing.package_name?.trim()) {
      toast.error("Package name is required");
      return;
    }
    const payload = {
      project_id: projectId,
      package_name: editing.package_name.trim(),
      supplier: editing.supplier ?? null,
      status: editing.status ?? "Out to tender",
      value: editing.value != null ? Number(editing.value) : null,
      notes: editing.notes ?? null,
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

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Procurement Packages</h3>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing({ status: "Out to tender" })}>
            <Plus className="w-3 h-3 mr-1" /> Add package
          </Button>
        )}
      </div>

      {editing && (
        <div className="p-3 rounded-md bg-card border border-border space-y-2">
          <Input placeholder="Package name" value={editing.package_name ?? ""} onChange={(e) => setEditing({ ...editing, package_name: e.target.value })} />
          <Input placeholder="Supplier / subcontractor" value={editing.supplier ?? ""} onChange={(e) => setEditing({ ...editing, supplier: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="h-9 px-3 rounded-md border border-input bg-background text-sm"
              value={editing.status ?? "Out to tender"}
              onChange={(e) => setEditing({ ...editing, status: e.target.value })}
            >
              <option value="Out to tender">Out to tender</option>
              <option value="Tendering">Tendering</option>
              <option value="Let">Let</option>
              <option value="Delivered">Delivered</option>
              <option value="On order">On order</option>
            </select>
            <Input type="number" placeholder="Value (£)" value={editing.value ?? ""} onChange={(e) => setEditing({ ...editing, value: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <Input placeholder="Notes" value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
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
          No procurement packages yet.
        </div>
      ) : (
        items.map((p) => (
          <div key={p.id} className="p-3 rounded-md bg-card border border-border">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{p.package_name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{p.supplier || "—"}</div>
                {p.notes && <div className="text-xs text-muted-foreground mt-1">{p.notes}</div>}
              </div>
              <div className="text-right shrink-0 flex flex-col items-end gap-2">
                <div className="text-sm font-semibold text-primary">
                  {p.value != null ? GBP.format(Number(p.value)) : "—"}
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
