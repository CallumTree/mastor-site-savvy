import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronRight,
  Info,
  PoundSterling,
  Sparkles,
  Trophy,
  FileText,
  Package,
} from "lucide-react";

type PackageRow = {
  id: string;
  project_id: string;
  package_name: string;
  trade: string | null;
  status: string;
};

type PackageItem = {
  id: string;
  package_id: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  source_scope_reference: string | null;
  source_document: string | null;
  source_task: string | null;
};

type MaterialPrice = {
  material_name: string;
  price: number;
};

type PriceRequest = {
  id: string;
  project_id: string;
  package_id: string;
  supplier_name: string;
  quoted_price: number | null;
  status: "Draft" | "Requested" | "Received" | "Rejected" | "Accepted";
  notes: string | null;
  created_at: string;
};

const DEFAULT_SUPPLIERS = ["Jewson", "LBS", "MKM", "Huws Gray", "Travis Perkins", "Selco"];

const STATUS_STYLES: Record<PriceRequest["status"], string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  Requested: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Received: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  Accepted: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  Rejected: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

// Deterministic supplier price simulation (V1 — pricing visibility only)
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function simulatedQuote(baseTotal: number, supplier: string, packageId: string): number {
  if (baseTotal <= 0) return 0;
  const variance = (hash(supplier + packageId) % 1800) / 10000; // 0–18%
  const sign = hash(supplier + packageId + "s") % 2 === 0 ? -1 : 1;
  const v = Math.max(50, baseTotal * (1 + sign * variance));
  return Number(v.toFixed(2));
}

export function PackagePricingTab({ projectId }: { projectId: string }) {
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [itemsByPackage, setItemsByPackage] = useState<Record<string, PackageItem[]>>({});
  const [prices, setPrices] = useState<MaterialPrice[]>([]);
  const [requests, setRequests] = useState<PriceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dialogPkg, setDialogPkg] = useState<PackageRow | null>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, boolean>>({});
  const [customSupplier, setCustomSupplier] = useState("");
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: pkgs }, { data: pis }, { data: pr }, { data: ppr }] = await Promise.all([
      (supabase as any)
        .from("procurement_packages")
        .select("id, project_id, package_name, trade, status")
        .eq("project_id", projectId)
        .in("status", ["Approved", "Quoted", "Ordered", "Delivered"])
        .order("package_name", { ascending: true }),
      (supabase as any)
        .from("procurement_package_items")
        .select("id, package_id, material_name, quantity, unit, source_scope_reference, source_document, source_task")
        .eq("project_id", projectId),
      (supabase as any)
        .from("material_prices")
        .select("material_name, price")
        .order("price", { ascending: true }),
      (supabase as any)
        .from("package_price_requests")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
    ]);
    const grouped: Record<string, PackageItem[]> = {};
    for (const row of (pis ?? []) as PackageItem[]) (grouped[row.package_id] ||= []).push(row);
    setPackages((pkgs ?? []) as PackageRow[]);
    setItemsByPackage(grouped);
    setPrices((pr ?? []) as MaterialPrice[]);
    setRequests((ppr ?? []) as PriceRequest[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  // Estimated package value from cheapest known material price × qty
  const estimatedValue = (pkgId: string): number => {
    const items = itemsByPackage[pkgId] ?? [];
    let total = 0;
    for (const it of items) {
      const matches = prices.filter(
        (p) => p.material_name.toLowerCase() === it.material_name.toLowerCase(),
      );
      const best = matches.length ? Math.min(...matches.map((m) => Number(m.price))) : 0;
      const qty = Number(it.quantity ?? 1) || 1;
      total += best * qty;
    }
    return Number(total.toFixed(2));
  };

  const openDialog = (pkg: PackageRow) => {
    setDialogPkg(pkg);
    const init: Record<string, boolean> = {};
    DEFAULT_SUPPLIERS.slice(0, 4).forEach((s) => (init[s] = true));
    setSelectedSuppliers(init);
    setCustomSupplier("");
  };

  const generateRequests = async () => {
    if (!dialogPkg) return;
    const suppliers = Object.entries(selectedSuppliers).filter(([, v]) => v).map(([k]) => k);
    const extra = customSupplier.trim();
    if (extra) suppliers.push(extra);
    if (suppliers.length === 0) {
      toast.error("Select at least one supplier");
      return;
    }
    setGenerating(true);
    try {
      const existing = new Set(
        requests
          .filter((r) => r.package_id === dialogPkg.id)
          .map((r) => r.supplier_name.toLowerCase()),
      );
      const baseTotal = estimatedValue(dialogPkg.id);
      const rows = suppliers
        .filter((s) => !existing.has(s.toLowerCase()))
        .map((s) => ({
          project_id: projectId,
          package_id: dialogPkg.id,
          supplier_name: s.slice(0, 120),
          quoted_price: simulatedQuote(baseTotal, s, dialogPkg.id),
          status: "Received" as const, // V1: simulated quotes returned immediately
        }));
      if (rows.length === 0) {
        toast.info("All selected suppliers already have a quote for this package.");
      } else {
        const { error } = await (supabase as any).from("package_price_requests").insert(rows);
        if (error) throw error;
        toast.success(`Generated ${rows.length} price request${rows.length === 1 ? "" : "s"}`);
      }
      setDialogPkg(null);
      await load();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate price requests");
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (req: PriceRequest, status: PriceRequest["status"]) => {
    const { error } = await (supabase as any)
      .from("package_price_requests")
      .update({ status })
      .eq("id", req.id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`);
    load();
  };

  const requestsByPackage = useMemo(() => {
    const m: Record<string, PriceRequest[]> = {};
    for (const r of requests) (m[r.package_id] ||= []).push(r);
    return m;
  }, [requests]);

  const fmt = (v: number | null | undefined) =>
    v == null ? "—" : `£${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Builders buy packages, not lines. Get supplier prices for each approved Procurement Package and compare them
        side-by-side. Pricing visibility only — no orders are placed.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : packages.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No approved procurement packages yet. Approve packages in the Procurement Packages section to start pricing.
        </div>
      ) : (
        <div className="space-y-2">
          {packages.map((pkg) => {
            const items = itemsByPackage[pkg.id] ?? [];
            const pkgRequests = requestsByPackage[pkg.id] ?? [];
            const isOpen = !!open[pkg.id];
            const estVal = estimatedValue(pkg.id);
            const received = pkgRequests.filter((r) => r.quoted_price != null);
            const lowest = received.length ? Math.min(...received.map((r) => Number(r.quoted_price))) : null;
            const highest = received.length ? Math.max(...received.map((r) => Number(r.quoted_price))) : null;
            const avg = received.length
              ? received.reduce((s, r) => s + Number(r.quoted_price), 0) / received.length
              : null;
            const saving = lowest != null && highest != null ? highest - lowest : null;

            const priceStatus =
              received.length === 0
                ? pkgRequests.length === 0
                  ? "No Quotes"
                  : "Awaiting"
                : `${received.length} Quote${received.length === 1 ? "" : "s"}`;

            return (
              <div key={pkg.id} className="rounded-md border border-border bg-card">
                <div className="px-3 py-2 flex justify-between gap-3 items-start">
                  <button
                    className="flex items-start gap-2 text-left min-w-0 flex-1"
                    onClick={() => setOpen((o) => ({ ...o, [pkg.id]: !isOpen }))}
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3 h-3 mt-1 shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 mt-1 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-primary">{pkg.package_name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                        {pkg.trade && <span>{pkg.trade}</span>}
                        <span>· {items.length} material{items.length === 1 ? "" : "s"}</span>
                        <span>· Est. {fmt(estVal)}</span>
                        <span>· {priceStatus}</span>
                      </div>
                    </div>
                  </button>
                  <Button size="sm" className="h-7 text-[10px]" onClick={() => openDialog(pkg)}>
                    <PoundSterling className="w-3 h-3 mr-1" /> Get Prices
                  </Button>
                </div>

                {isOpen && (
                  <div className="border-t border-border px-3 py-3 space-y-4">
                    {/* Summary */}
                    {received.length > 0 && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <Stat label="Lowest" value={fmt(lowest)} accent="text-emerald-700" />
                        <Stat label="Highest" value={fmt(highest)} />
                        <Stat label="Average" value={fmt(avg)} />
                        <Stat label="Potential Saving" value={fmt(saving)} accent="text-emerald-700" />
                      </div>
                    )}

                    {/* Comparison table */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                        Supplier Comparison
                      </div>
                      {pkgRequests.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">
                          No price requests yet. Click <strong>Get Prices</strong> to request supplier quotes.
                        </p>
                      ) : (
                        <div className="rounded border border-border overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-muted/40">
                              <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                                <th className="px-2 py-1.5">Supplier</th>
                                <th className="px-2 py-1.5 text-right">Quoted</th>
                                <th className="px-2 py-1.5 text-right">vs Best</th>
                                <th className="px-2 py-1.5">Status</th>
                                <th className="px-2 py-1.5 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pkgRequests
                                .slice()
                                .sort((a, b) => (Number(a.quoted_price ?? Infinity) - Number(b.quoted_price ?? Infinity)))
                                .map((r) => {
                                  const isBest = lowest != null && Number(r.quoted_price) === lowest;
                                  const diff =
                                    lowest != null && r.quoted_price != null
                                      ? Number(r.quoted_price) - lowest
                                      : null;
                                  return (
                                    <tr key={r.id} className="border-t border-border">
                                      <td className="px-2 py-1.5 font-medium flex items-center gap-1">
                                        {isBest && <Trophy className="w-3 h-3 text-emerald-600" />}
                                        {r.supplier_name}
                                      </td>
                                      <td className="px-2 py-1.5 text-right">{fmt(r.quoted_price)}</td>
                                      <td className="px-2 py-1.5 text-right">
                                        {diff == null ? "—" : diff === 0 ? "Best" : `+${fmt(diff)}`}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        <span
                                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${STATUS_STYLES[r.status]}`}
                                        >
                                          {r.status}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 text-right space-x-1">
                                        {r.status !== "Accepted" && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 text-[10px]"
                                            onClick={() => setStatus(r, "Accepted")}
                                          >
                                            Accept
                                          </Button>
                                        )}
                                        {r.status !== "Rejected" && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 text-[10px]"
                                            onClick={() => setStatus(r, "Rejected")}
                                          >
                                            Reject
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Traceability */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                        <Package className="w-3 h-3" /> Materials & Source Traceability
                      </div>
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No materials linked.</p>
                      ) : (
                        <ul className="divide-y divide-border rounded border border-border">
                          {items.map((it) => (
                            <li key={it.id} className="px-2 py-1.5">
                              <div className="text-xs">{it.material_name}</div>
                              <div className="text-[10px] text-muted-foreground flex flex-wrap gap-x-3 mt-0.5">
                                {it.quantity != null && it.quantity > 0 && (
                                  <span>Qty: {it.quantity} {it.unit || ""}</span>
                                )}
                                {it.source_scope_reference && (
                                  <span className="flex items-center gap-1">
                                    <FileText className="w-2.5 h-2.5" />
                                    Scope: {it.source_scope_reference}
                                  </span>
                                )}
                                {it.source_task && <span>· Task: {it.source_task}</span>}
                                {it.source_document && <span>· Doc: {it.source_document}</span>}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* History */}
                    {pkgRequests.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                          Price History
                        </div>
                        <ul className="divide-y divide-border rounded border border-border">
                          {pkgRequests.map((r) => (
                            <li key={r.id} className="px-2 py-1.5 text-[11px] flex justify-between gap-2">
                              <span className="text-muted-foreground">
                                {new Date(r.created_at).toLocaleDateString()}
                              </span>
                              <span className="font-medium flex-1">{r.supplier_name}</span>
                              <span>{fmt(r.quoted_price)}</span>
                              <span className="text-muted-foreground">{r.status}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!dialogPkg} onOpenChange={(o) => !o && setDialogPkg(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Get Prices — {dialogPkg?.package_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Select suppliers to request quotes from.</p>
            <div className="grid grid-cols-2 gap-2">
              {DEFAULT_SUPPLIERS.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!selectedSuppliers[s]}
                    onCheckedChange={(c) =>
                      setSelectedSuppliers((p) => ({ ...p, [s]: !!c }))
                    }
                  />
                  {s}
                </label>
              ))}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Other supplier
              </label>
              <Input
                className="h-8 text-xs mt-1"
                placeholder="Custom supplier name"
                value={customSupplier}
                onChange={(e) => setCustomSupplier(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogPkg(null)}>Cancel</Button>
            <Button onClick={generateRequests} disabled={generating}>
              {generating ? "Generating…" : "Generate Price Requests"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${accent ?? "text-primary"}`}>{value}</div>
    </div>
  );
}
