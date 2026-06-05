import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Pencil, Truck, PackageCheck, ShoppingCart, ChevronDown, ChevronRight, Info } from "lucide-react";

type Status = "Suggested" | "Approved" | "Ordered" | "Delivered" | "Cancelled" | "Rejected";

type Item = {
  id: string;
  project_id: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  trade: string | null;
  source_document: string | null;
  source_scope_reference: string | null;
  confidence_score: number;
  status: Status;
  created_at: string;
};

const STATUS_FILTERS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Suggested", label: "Suggested" },
  { key: "Approved", label: "Approved" },
  { key: "Ordered", label: "Ordered" },
  { key: "Delivered", label: "Delivered" },
  { key: "Rejected", label: "Rejected" },
];

const STATUS_STYLES: Record<Status, string> = {
  Suggested: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Approved: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  Ordered: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
  Delivered: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  Cancelled: "bg-slate-500/15 text-slate-700 border-slate-500/30",
  Rejected: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

export function ProcurementRegisterTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [openTrade, setOpenTrade] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Item>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("procurement_register")
      .select("*")
      .eq("project_id", projectId)
      .order("trade", { ascending: true, nullsFirst: false })
      .order("material_name", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data ?? []) as Item[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const setStatus = async (item: Item, status: Status) => {
    const { error } = await (supabase as any).from("procurement_register").update({ status }).eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    load();
  };

  const startEdit = (item: Item) => {
    setEditId(item.id);
    setDraft({
      material_name: item.material_name,
      quantity: item.quantity,
      unit: item.unit,
      trade: item.trade,
    });
  };

  const saveEdit = async (item: Item) => {
    const { error } = await (supabase as any)
      .from("procurement_register")
      .update({
        material_name: String(draft.material_name ?? item.material_name).slice(0, 255),
        quantity: draft.quantity != null && draft.quantity !== ("" as any) ? Number(draft.quantity) : null,
        unit: draft.unit ? String(draft.unit).slice(0, 32) : null,
        trade: draft.trade ? String(draft.trade).slice(0, 64) : null,
      })
      .eq("id", item.id);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditId(null);
    setDraft({});
    load();
  };

  const counts = {
    Suggested: items.filter((i) => i.status === "Suggested").length,
    Approved: items.filter((i) => i.status === "Approved").length,
    Ordered: items.filter((i) => i.status === "Ordered").length,
    Delivered: items.filter((i) => i.status === "Delivered").length,
  };

  const visible = filter === "all" ? items : items.filter((i) => i.status === filter);
  const groupedByTrade = visible.reduce<Record<string, Item[]>>((acc, it) => {
    const t = it.trade || "Unassigned";
    (acc[t] ||= []).push(it);
    return acc;
  }, {});
  const tradeNames = Object.keys(groupedByTrade).sort();

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Mastor turns parsed scope materials into a structured procurement plan. Review, edit, and approve — nothing is
        ordered automatically.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard label="Suggested" value={counts.Suggested} icon={<Info className="w-3 h-3" />} />
        <SummaryCard label="Approved" value={counts.Approved} icon={<Check className="w-3 h-3" />} />
        <SummaryCard label="Ordered" value={counts.Ordered} icon={<ShoppingCart className="w-3 h-3" />} />
        <SummaryCard label="Delivered" value={counts.Delivered} icon={<PackageCheck className="w-3 h-3" />} />
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-[11px] px-2 py-1 rounded border ${
              filter === f.key ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No procurement items yet. Parse a scope document to generate suggestions.
        </div>
      ) : (
        <div className="space-y-2">
          {tradeNames.map((trade) => {
            const list = groupedByTrade[trade];
            const isOpen = openTrade[trade] !== false;
            return (
              <div key={trade} className="rounded-md border border-border bg-card">
                <button
                  className="w-full px-3 py-2 flex items-center justify-between"
                  onClick={() => setOpenTrade((o) => ({ ...o, [trade]: !isOpen }))}
                >
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {trade} <span className="text-muted-foreground font-normal ml-1">({list.length})</span>
                  </span>
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {list.map((it) => (
                      <ItemRow
                        key={it.id}
                        item={it}
                        isEditing={editId === it.id}
                        draft={draft}
                        setDraft={setDraft}
                        onEdit={() => startEdit(it)}
                        onCancelEdit={() => {
                          setEditId(null);
                          setDraft({});
                        }}
                        onSave={() => saveEdit(it)}
                        onStatus={(s) => setStatus(it, s)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold text-primary mt-0.5">{value}</div>
    </div>
  );
}

function ItemRow({
  item,
  isEditing,
  draft,
  setDraft,
  onEdit,
  onCancelEdit,
  onSave,
  onStatus,
}: {
  item: Item;
  isEditing: boolean;
  draft: Partial<Item>;
  setDraft: (d: Partial<Item>) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onStatus: (s: Status) => void;
}) {
  const [showSource, setShowSource] = useState(false);

  return (
    <div className="px-3 py-2">
      <div className="flex justify-between gap-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Input
                className="h-7 text-xs col-span-2"
                value={String(draft.material_name ?? "")}
                onChange={(e) => setDraft({ ...draft, material_name: e.target.value })}
                placeholder="Material"
              />
              <Input
                className="h-7 text-xs"
                type="number"
                step="0.01"
                value={draft.quantity == null ? "" : String(draft.quantity)}
                onChange={(e) => setDraft({ ...draft, quantity: e.target.value === "" ? null : (Number(e.target.value) as any) })}
                placeholder="Qty"
              />
              <Input
                className="h-7 text-xs"
                value={String(draft.unit ?? "")}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                placeholder="Unit"
              />
              <Input
                className="h-7 text-xs col-span-2"
                value={String(draft.trade ?? "")}
                onChange={(e) => setDraft({ ...draft, trade: e.target.value })}
                placeholder="Trade"
              />
            </div>
          ) : (
            <>
              <div className="text-sm text-foreground">{item.material_name}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                {item.quantity != null && item.quantity > 0 && (
                  <span>
                    Qty: {item.quantity} {item.unit || ""}
                  </span>
                )}
                {item.trade && <span>· {item.trade}</span>}
                <span>· Confidence: {(item.confidence_score * 100).toFixed(0)}%</span>
                {(item.source_document || item.source_scope_reference) && (
                  <button
                    className="text-primary hover:underline"
                    onClick={() => setShowSource((s) => !s)}
                  >
                    {showSource ? "Hide source" : "Show source"}
                  </button>
                )}
              </div>
              {showSource && (
                <div className="text-[10px] text-muted-foreground mt-1 p-2 rounded bg-secondary/40">
                  {item.source_document && <div>Doc: {item.source_document}</div>}
                  {item.source_scope_reference && <div>Ref: {item.source_scope_reference}</div>}
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span
            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_STYLES[item.status]}`}
          >
            {item.status}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {isEditing ? (
          <>
            <Button size="sm" variant="default" className="h-6 text-[10px]" onClick={onSave}>
              <Check className="w-3 h-3 mr-1" /> Save
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onCancelEdit}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {item.status === "Suggested" && (
              <>
                <Button size="sm" variant="default" className="h-6 text-[10px]" onClick={() => onStatus("Approved")}>
                  <Check className="w-3 h-3 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={onEdit}>
                  <Pencil className="w-3 h-3 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => onStatus("Rejected")}>
                  <X className="w-3 h-3 mr-1" /> Reject
                </Button>
              </>
            )}
            {item.status === "Approved" && (
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onStatus("Ordered")}>
                <ShoppingCart className="w-3 h-3 mr-1" /> Mark Ordered
              </Button>
            )}
            {item.status === "Ordered" && (
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onStatus("Delivered")}>
                <Truck className="w-3 h-3 mr-1" /> Mark Delivered
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
