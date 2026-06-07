import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { Plus, Trash2, Save, X } from "lucide-react";

type ContractItem = {
  id: string;
  project_id: string;
  code: string | null;
  description: string | null;
  total_qty: number | null;
  unit: string | null;
  unit_rate: number | null;
};

type Variation = {
  id: string;
  project_id: string;
  description: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  status: string;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

export function ScopeTab({ projectId }: { projectId: string }) {
  return (
    <div className="space-y-6">
      <ContractItemsSection projectId={projectId} />
      <VariationsSection projectId={projectId} />
    </div>
  );
}

function ContractItemsSection({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ContractItem> | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contract_items")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) showError("Scope", error);
    setItems((data ?? []) as ContractItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const save = async () => {
    if (!editing) return;
    const payload = {
      project_id: projectId,
      code: editing.code ?? null,
      description: editing.description ?? null,
      total_qty: editing.total_qty != null ? Number(editing.total_qty) : null,
      unit: editing.unit ?? null,
      unit_rate: editing.unit_rate != null ? Number(editing.unit_rate) : null,
    };
    const { error } = editing.id
      ? await supabase.from("contract_items").update(payload).eq("id", editing.id)
      : await supabase.from("contract_items").insert(payload);
    if (error) return showError("Scope", error);
    toast.success("Saved");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("contract_items").delete().eq("id", id);
    if (error) return showError("Scope", error);
    load();
  };

  return (
    <section className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Contract Items</h3>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing({})}>
            <Plus className="w-3 h-3 mr-1" /> Add item
          </Button>
        )}
      </div>

      {editing && (
        <div className="p-3 rounded-md bg-card border border-border space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Code" value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
            <Input placeholder="Unit" value={editing.unit ?? ""} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} />
          </div>
          <Input placeholder="Description" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Total qty" value={editing.total_qty ?? ""} onChange={(e) => setEditing({ ...editing, total_qty: e.target.value === "" ? null : Number(e.target.value) })} />
            <Input type="number" placeholder="Unit rate (£)" value={editing.unit_rate ?? ""} onChange={(e) => setEditing({ ...editing, unit_rate: e.target.value === "" ? null : Number(e.target.value) })} />
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
        <EmptyState message="No contract items yet. Add the first one above." />
      ) : (
        items.map((it) => {
          const total = (it.total_qty ?? 0) * (it.unit_rate ?? 0);
          return (
            <div key={it.id} className="p-3 rounded-md bg-card border border-border">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gold-foreground/80">{it.code || "—"}</div>
                  <div className="text-sm text-foreground mt-0.5">{it.description || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {it.total_qty ?? 0} {it.unit ?? ""} @ {it.unit_rate != null ? GBP.format(Number(it.unit_rate)) : "—"}
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                  <div className="text-sm font-semibold text-primary">{GBP.format(total)}</div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(it)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(it.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

function VariationsSection({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Variation> | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("variations")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) showError("Scope", error);
    setItems((data ?? []) as Variation[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const save = async () => {
    if (!editing) return;
    const payload = {
      project_id: projectId,
      description: editing.description ?? null,
      qty: editing.qty != null ? Number(editing.qty) : null,
      unit: editing.unit ?? null,
      rate: editing.rate != null ? Number(editing.rate) : null,
      status: editing.status ?? "Pending",
    };
    const { error } = editing.id
      ? await supabase.from("variations").update(payload).eq("id", editing.id)
      : await supabase.from("variations").insert(payload);
    if (error) return showError("Scope", error);
    toast.success("Saved");
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("variations").delete().eq("id", id);
    if (error) return showError("Scope", error);
    load();
  };

  return (
    <section className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Variations</h3>
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing({ status: "Pending" })}>
            <Plus className="w-3 h-3 mr-1" /> Add variation
          </Button>
        )}
      </div>

      {editing && (
        <div className="p-3 rounded-md bg-card border border-border space-y-2">
          <Input placeholder="Description" value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" placeholder="Qty" value={editing.qty ?? ""} onChange={(e) => setEditing({ ...editing, qty: e.target.value === "" ? null : Number(e.target.value) })} />
            <Input placeholder="Unit" value={editing.unit ?? ""} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} />
            <Input type="number" placeholder="Rate (£)" value={editing.rate ?? ""} onChange={(e) => setEditing({ ...editing, rate: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <select
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            value={editing.status ?? "Pending"}
            onChange={(e) => setEditing({ ...editing, status: e.target.value })}
          >
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="w-3 h-3 mr-1" />Cancel</Button>
            <Button size="sm" onClick={save}><Save className="w-3 h-3 mr-1" />Save</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState message="No variations yet. Add the first one above." />
      ) : (
        items.map((v) => {
          const amount = (v.qty ?? 0) * (v.rate ?? 0);
          return (
            <div key={v.id} className="p-3 rounded-md bg-card border border-border">
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm text-foreground">{v.description || "—"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {v.qty ?? 0} {v.unit ?? ""} @ {v.rate != null ? GBP.format(Number(v.rate)) : "—"}
                  </div>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-2">
                  <div className="text-sm font-semibold text-primary">{GBP.format(amount)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{v.status}</div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(v.id)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
