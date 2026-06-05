import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check,
  X,
  Pencil,
  Truck,
  PackageCheck,
  ShoppingCart,
  ChevronDown,
  ChevronRight,
  Info,
  Package,
  Sparkles,
  FileText,
} from "lucide-react";

type PackageStatus = "Suggested" | "Approved" | "Quoted" | "Ordered" | "Delivered" | "Rejected";

type ProcItem = {
  id: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  trade: string | null;
  source_document: string | null;
  source_scope_reference: string | null;
  status: string;
};

type PackageRow = {
  id: string;
  project_id: string;
  package_name: string;
  trade: string | null;
  description: string | null;
  confidence_score: number;
  status: PackageStatus;
  created_at: string;
};

type PackageItem = {
  id: string;
  package_id: string;
  procurement_item_id: string | null;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  source_task: string | null;
  source_scope_reference: string | null;
  source_document: string | null;
};

const STATUS_STYLES: Record<PackageStatus, string> = {
  Suggested: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Approved: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  Quoted: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  Ordered: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
  Delivered: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  Rejected: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

// Trade-to-package naming convention. Builders think in packages, not lists.
const TRADE_PACKAGE_NAMES: Record<string, string> = {
  Plastering: "Plastering Package",
  Joinery: "Stud Wall & Joinery Package",
  Electrical: "Electrical First-Fix Package",
  Plumbing: "Plumbing & Heating Package",
  Groundworks: "Groundworks Package",
  Brickwork: "Brickwork Package",
  Roofing: "Roofing Package",
  Painting: "Decoration Package",
  Decoration: "Decoration Package",
  Flooring: "Flooring Package",
  Kitchen: "Kitchen Package",
  Bathroom: "Bathroom Package",
  Insulation: "Insulation Package",
};

function packageNameFor(trade: string): string {
  return TRADE_PACKAGE_NAMES[trade] ?? `${trade} Package`;
}

export function ProcurementPackagesTab({ projectId }: { projectId: string }) {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [itemsByPackage, setItemsByPackage] = useState<Record<string, PackageItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [openPkg, setOpenPkg] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PackageRow>>({});

  const load = async () => {
    setLoading(true);
    const [{ data: pkgs, error: e1 }, { data: pis, error: e2 }] = await Promise.all([
      (supabase as any)
        .from("procurement_packages")
        .select("*")
        .eq("project_id", projectId)
        .order("trade", { ascending: true, nullsFirst: false })
        .order("package_name", { ascending: true }),
      (supabase as any)
        .from("procurement_package_items")
        .select("*")
        .eq("project_id", projectId),
    ]);
    if (e1) toast.error(e1.message);
    if (e2) toast.error(e2.message);
    const grouped: Record<string, PackageItem[]> = {};
    for (const row of (pis ?? []) as PackageItem[]) {
      (grouped[row.package_id] ||= []).push(row);
    }
    setPackages((pkgs ?? []) as PackageRow[]);
    setItemsByPackage(grouped);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const generatePackages = async () => {
    setGenerating(true);
    try {
      const { data: procItems, error } = await (supabase as any)
        .from("procurement_register")
        .select("id, material_name, quantity, unit, trade, source_document, source_scope_reference, status")
        .eq("project_id", projectId)
        .in("status", ["Suggested", "Approved"]);
      if (error) throw error;
      const items = (procItems ?? []) as ProcItem[];
      if (items.length === 0) {
        toast.info("No procurement materials found. Parse a scope document first.");
        return;
      }

      // Group materials by trade
      const byTrade: Record<string, ProcItem[]> = {};
      for (const it of items) {
        const t = it.trade || "Unassigned";
        (byTrade[t] ||= []).push(it);
      }

      // Skip trades that already have a package
      const existingTrades = new Set(packages.map((p) => p.trade || "Unassigned"));
      let createdPkgs = 0;
      let createdItems = 0;

      for (const [trade, list] of Object.entries(byTrade)) {
        if (existingTrades.has(trade)) continue;
        const name = packageNameFor(trade);
        const { data: pkg, error: pe } = await (supabase as any)
          .from("procurement_packages")
          .insert({
            project_id: projectId,
            package_name: name,
            trade: trade === "Unassigned" ? null : trade,
            description: `${list.length} material${list.length === 1 ? "" : "s"} grouped from parsed scope.`,
            confidence_score: 0.75,
            status: "Suggested",
          })
          .select("id")
          .single();
        if (pe || !pkg) {
          toast.error(pe?.message ?? "Could not create package");
          continue;
        }
        createdPkgs++;

        const rows = list.map((it) => ({
          package_id: pkg.id,
          project_id: projectId,
          procurement_item_id: it.id,
          material_name: it.material_name,
          quantity: it.quantity,
          unit: it.unit,
          source_task: it.source_scope_reference, // best available linkage in V1
          source_scope_reference: it.source_scope_reference,
          source_document: it.source_document,
        }));
        const { error: ie } = await (supabase as any).from("procurement_package_items").insert(rows);
        if (ie) toast.error(ie.message);
        else createdItems += rows.length;
      }

      if (createdPkgs === 0) {
        toast.info("All trades already have a package. Nothing new to suggest.");
      } else {
        toast.success(`Generated ${createdPkgs} package${createdPkgs === 1 ? "" : "s"} (${createdItems} materials).`);
      }
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate packages");
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (pkg: PackageRow, status: PackageStatus) => {
    const { error } = await (supabase as any)
      .from("procurement_packages")
      .update({ status })
      .eq("id", pkg.id);
    if (error) return toast.error(error.message);
    toast.success(`Package marked ${status}`);
    load();
  };

  const startEdit = (pkg: PackageRow) => {
    setEditId(pkg.id);
    setDraft({
      package_name: pkg.package_name,
      trade: pkg.trade,
      description: pkg.description,
    });
  };

  const saveEdit = async (pkg: PackageRow) => {
    const { error } = await (supabase as any)
      .from("procurement_packages")
      .update({
        package_name: String(draft.package_name ?? pkg.package_name).slice(0, 255),
        trade: draft.trade ? String(draft.trade).slice(0, 64) : null,
        description: draft.description ? String(draft.description).slice(0, 1000) : null,
      })
      .eq("id", pkg.id);
    if (error) return toast.error(error.message);
    toast.success("Package updated");
    setEditId(null);
    setDraft({});
    load();
  };

  const counts = {
    identified: packages.length,
    approved: packages.filter((p) => p.status === "Approved").length,
    ordered: packages.filter((p) => p.status === "Ordered").length,
    delivered: packages.filter((p) => p.status === "Delivered").length,
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Mastor groups parsed materials into logical buying packages — the way builders actually procure. Approved
        packages become the foundation for merchant pricing and TradeSqueeze.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard label="Identified" value={counts.identified} icon={<Package className="w-3 h-3" />} />
        <SummaryCard label="Approved" value={counts.approved} icon={<Check className="w-3 h-3" />} />
        <SummaryCard label="Ordered" value={counts.ordered} icon={<ShoppingCart className="w-3 h-3" />} />
        <SummaryCard label="Delivered" value={counts.delivered} icon={<PackageCheck className="w-3 h-3" />} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={generatePackages} disabled={generating} className="h-8 text-xs">
          <Sparkles className="w-3 h-3 mr-1" />
          {generating ? "Generating…" : "Generate Packages"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : packages.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No procurement packages yet. Click <strong>Generate Packages</strong> to group your approved materials.
        </div>
      ) : (
        <div className="space-y-2">
          {packages.map((pkg) => {
            const items = itemsByPackage[pkg.id] ?? [];
            const isOpen = !!openPkg[pkg.id];
            const isEditing = editId === pkg.id;
            return (
              <div key={pkg.id} className="rounded-md border border-border bg-card">
                <div className="px-3 py-2 flex justify-between gap-3">
                  <button
                    className="flex items-start gap-2 text-left min-w-0 flex-1"
                    onClick={() => setOpenPkg((o) => ({ ...o, [pkg.id]: !isOpen }))}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3 h-3 mt-1 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 mt-1 shrink-0" />
                    )}
                    <div className="min-w-0">
                      {isEditing ? (
                        <Input
                          className="h-7 text-xs"
                          value={String(draft.package_name ?? "")}
                          onChange={(e) => setDraft({ ...draft, package_name: e.target.value })}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div className="text-sm font-semibold text-primary">{pkg.package_name}</div>
                      )}
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                        {pkg.trade && <span>{pkg.trade}</span>}
                        <span>· {items.length} material{items.length === 1 ? "" : "s"}</span>
                        <span>· Confidence: {(pkg.confidence_score * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </button>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border h-fit ${STATUS_STYLES[pkg.status]}`}
                  >
                    {pkg.status}
                  </span>
                </div>

                {isOpen && (
                  <div className="border-t border-border px-3 py-3 space-y-3">
                    {isEditing && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <Input
                          className="h-7 text-xs"
                          placeholder="Trade"
                          value={String(draft.trade ?? "")}
                          onChange={(e) => setDraft({ ...draft, trade: e.target.value })}
                        />
                        <Input
                          className="h-7 text-xs"
                          placeholder="Description"
                          value={String(draft.description ?? "")}
                          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        />
                      </div>
                    )}

                    {pkg.description && !isEditing && (
                      <p className="text-xs text-muted-foreground">{pkg.description}</p>
                    )}

                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Materials in package
                      </div>
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No materials linked.</p>
                      ) : (
                        <ul className="divide-y divide-border rounded border border-border">
                          {items.map((it) => (
                            <li key={it.id} className="px-2 py-1.5">
                              <div className="text-xs text-foreground">{it.material_name}</div>
                              <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 mt-0.5">
                                {it.quantity != null && it.quantity > 0 && (
                                  <span>
                                    Qty: {it.quantity} {it.unit || ""}
                                  </span>
                                )}
                                {it.source_scope_reference && (
                                  <span className="flex items-center gap-1">
                                    <FileText className="w-2.5 h-2.5" />
                                    Scope: {it.source_scope_reference}
                                  </span>
                                )}
                                {it.source_document && <span>· Doc: {it.source_document}</span>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {isEditing ? (
                        <>
                          <Button size="sm" className="h-6 text-[10px]" onClick={() => saveEdit(pkg)}>
                            <Check className="w-3 h-3 mr-1" /> Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[10px]"
                            onClick={() => {
                              setEditId(null);
                              setDraft({});
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          {pkg.status === "Suggested" && (
                            <>
                              <Button
                                size="sm"
                                className="h-6 text-[10px]"
                                onClick={() => setStatus(pkg, "Approved")}
                              >
                                <Check className="w-3 h-3 mr-1" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px]"
                                onClick={() => startEdit(pkg)}
                              >
                                <Pencil className="w-3 h-3 mr-1" /> Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 text-[10px]"
                                onClick={() => setStatus(pkg, "Rejected")}
                              >
                                <X className="w-3 h-3 mr-1" /> Reject
                              </Button>
                            </>
                          )}
                          {pkg.status === "Approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px]"
                              onClick={() => setStatus(pkg, "Ordered")}
                            >
                              <ShoppingCart className="w-3 h-3 mr-1" /> Mark Ordered
                            </Button>
                          )}
                          {pkg.status === "Ordered" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px]"
                              onClick={() => setStatus(pkg, "Delivered")}
                            >
                              <Truck className="w-3 h-3 mr-1" /> Mark Delivered
                            </Button>
                          )}
                        </>
                      )}
                    </div>
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
