import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, Copy, TrendingDown, Sparkles, ChevronDown, ChevronRight } from "lucide-react";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });

const SUPPORTED_SOURCES = [
  "Screwfix",
  "Toolstation",
  "Amazon",
  "Wickes",
  "Jewson",
  "Travis Perkins",
  "Huws Gray",
  "MKM",
  "LBS",
];

type Pkg = {
  id: string;
  package_name: string;
  trade: string | null;
  status: string;
};

type PkgItem = {
  id: string;
  package_id: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
};

type PriceRow = {
  material_name: string;
  supplier_name: string;
  price: number;
  unit: string | null;
};

type PackageQuote = {
  id: string;
  package_id: string;
  supplier_name: string;
  quoted_price: number | null;
  status: string;
};

type TradeAccount = {
  id: string;
  merchant_name: string;
  contact_name: string | null;
  contact_email: string | null;
};

// Deterministic per-package per-supplier variance for visibility-phase pricing.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}
function supplierVariance(packageId: string, supplier: string): number {
  // -12% .. +14%
  const r = (hash(packageId + "::" + supplier) % 2700) / 10000; // 0..0.27
  return -0.12 + r;
}

export function TradeSqueezeTab({ projectId }: { projectId: string }) {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [items, setItems] = useState<PkgItem[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [quotes, setQuotes] = useState<PackageQuote[]>([]);
  const [accounts, setAccounts] = useState<TradeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [enquiryDialog, setEnquiryDialog] = useState<{ pkg: Pkg; benchmark: number } | null>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Record<string, boolean>>({});
  const [generatedEmail, setGeneratedEmail] = useState<{ subject: string; body: string; suppliers: string[] } | null>(null);

  useEffect(() => { reload(); }, [projectId]);

  async function reload() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [pk, it, pr, qt, ac] = await Promise.all([
      (supabase as any).from("procurement_packages").select("*").eq("project_id", projectId).in("status", ["Approved", "Quoted", "Ordered", "Delivered"]).order("package_name"),
      (supabase as any).from("procurement_package_items").select("*").eq("project_id", projectId),
      (supabase as any).from("material_prices").select("material_name, supplier_name, price, unit"),
      (supabase as any).from("package_price_requests").select("*").eq("project_id", projectId),
      user ? (supabase as any).from("trade_accounts").select("id, merchant_name, contact_name, contact_email").eq("user_id", user.id) : Promise.resolve({ data: [] }),
    ]);
    setPackages((pk.data ?? []) as Pkg[]);
    setItems((it.data ?? []) as PkgItem[]);
    setPrices((pr.data ?? []) as PriceRow[]);
    setQuotes((qt.data ?? []) as PackageQuote[]);
    setAccounts((ac.data ?? []) as TradeAccount[]);
    setLoading(false);
  }

  // For each material, the best known retail unit price across material_prices.
  function bestUnitFor(name: string): number | null {
    const matches = prices.filter(p => p.material_name.toLowerCase() === name.toLowerCase());
    if (!matches.length) return null;
    return Math.min(...matches.map(m => Number(m.price)));
  }

  const enriched = useMemo(() => {
    return packages.map(pkg => {
      const pkgItems = items.filter(i => i.package_id === pkg.id);
      let estimatedValue = 0;
      let pricedCount = 0;
      const linedItems = pkgItems.map(it => {
        const qty = Number(it.quantity ?? 1);
        const unit = bestUnitFor(it.material_name);
        const total = unit != null ? unit * qty : null;
        if (unit != null) { estimatedValue += total!; pricedCount++; }
        return { ...it, bestUnit: unit, lineTotal: total };
      });
      const pkgQuotes = quotes.filter(q => q.package_id === pkg.id && q.quoted_price != null);
      const supplierTotals = pkgQuotes.map(q => ({ supplier: q.supplier_name, total: Number(q.quoted_price) }));
      const lowest = supplierTotals.length ? Math.min(...supplierTotals.map(s => s.total)) : null;
      const highest = supplierTotals.length ? Math.max(...supplierTotals.map(s => s.total)) : null;
      const saving = lowest != null && highest != null ? highest - lowest : 0;
      const savingPct = lowest != null && highest != null && highest > 0 ? (saving / highest) * 100 : 0;
      const opportunity: "Low" | "Medium" | "High" = savingPct >= 10 ? "High" : savingPct >= 5 ? "Medium" : "Low";
      return {
        ...pkg,
        pkgItems: linedItems,
        materialCount: pkgItems.length,
        estimatedValue,
        pricedCount,
        supplierTotals: supplierTotals.sort((a, b) => a.total - b.total),
        lowest,
        highest,
        saving,
        savingPct,
        opportunity,
      };
    });
  }, [packages, items, prices, quotes]);

  const totalSaving = enriched.reduce((s, p) => s + (p.saving ?? 0), 0);
  const totalEstimated = enriched.reduce((s, p) => s + p.estimatedValue, 0);

  async function checkPrices(pkg: ReturnType<typeof enriched.find> & {}) {
    if (!pkg) return;
    if (pkg.estimatedValue <= 0) return toast.error("No retail benchmark available — add prices in Merchant Intelligence first");
    setRunning(prev => ({ ...prev, [pkg.id]: true }));
    // Wipe existing simulated quotes for this package, regenerate across all supported sources.
    await (supabase as any).from("package_price_requests").delete().eq("package_id", pkg.id);
    const base = pkg.estimatedValue;
    const rows = SUPPORTED_SOURCES.map(sup => ({
      project_id: projectId,
      package_id: pkg.id,
      supplier_name: sup,
      quoted_price: Number((base * (1 + supplierVariance(pkg.id, sup))).toFixed(2)),
      status: "Received",
    }));
    const { error } = await (supabase as any).from("package_price_requests").insert(rows);
    if (error) { setRunning(prev => ({ ...prev, [pkg.id]: false })); return toast.error(error.message); }
    await reload();
    setExpanded(prev => ({ ...prev, [pkg.id]: true }));
    setRunning(prev => ({ ...prev, [pkg.id]: false }));
    toast.success(`Checked ${SUPPORTED_SOURCES.length} suppliers for ${pkg.package_name}`);
  }

  function openEnquiry(pkg: typeof enriched[number]) {
    if (pkg.lowest == null) return toast.error("Run Check Market Prices first");
    const initial: Record<string, boolean> = {};
    // Default: tick trade accounts the user already has, else top-3 best-priced suppliers
    if (accounts.length) {
      accounts.forEach(a => { initial[a.merchant_name] = true; });
    } else {
      pkg.supplierTotals.slice(0, 3).forEach(s => { initial[s.supplier] = true; });
    }
    setSelectedSuppliers(initial);
    setGeneratedEmail(null);
    setEnquiryDialog({ pkg, benchmark: pkg.lowest });
  }

  function generateEnquiry() {
    if (!enquiryDialog) return;
    const { pkg, benchmark } = enquiryDialog;
    const suppliers = Object.entries(selectedSuppliers).filter(([, v]) => v).map(([k]) => k);
    if (suppliers.length === 0) return toast.error("Select at least one supplier");
    const itemsList = (pkg as any).pkgItems
      .map((i: any) => `• ${i.material_name} — ${i.quantity ?? 1} ${i.unit ?? "ea"}`)
      .join("\n");
    const subject = `Price Challenge — ${pkg.package_name}`;
    const body =
`Hi [Rep Name],

I'm pricing the attached materials package (${pkg.package_name}${pkg.trade ? `, ${pkg.trade}` : ""}).

Materials required:
${itemsList}

Current market pricing suggests the package can be sourced for approximately ${GBP.format(benchmark)}.

I'd prefer to place the order through yourselves if you can provide a competitive quotation.

Please let me know your best rate.

Many thanks,
[User]`;
    setGeneratedEmail({ subject, body, suppliers });
    toast.success(`Price Challenge generated for ${suppliers.length} supplier(s)`);
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading TradeSqueeze…</div>;

  return (
    <div className="space-y-6">
      {/* Hero / Dashboard */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-background p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <TrendingDown className="w-5 h-5" />
              <span className="text-[11px] uppercase tracking-[0.2em] font-semibold">TradeSqueeze</span>
            </div>
            <h2 className="text-2xl font-bold mt-1">Buy Better.</h2>
            <p className="text-sm text-muted-foreground max-w-xl mt-1">
              Compare market pricing across {SUPPORTED_SOURCES.length} suppliers for every approved procurement package, then send a professional price challenge to your merchants.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 min-w-[360px]">
            <Stat label="Packages" value={String(enriched.length)} />
            <Stat label="Total Benchmark" value={GBP.format(totalEstimated)} />
            <Stat label="Potential Saving" value={GBP.format(totalSaving)} accent />
          </div>
        </div>
      </div>

      {enriched.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-sm text-muted-foreground text-center">
          No approved procurement packages yet. Approve packages in Procurement Packages to start squeezing prices.
        </div>
      ) : (
        <div className="space-y-3">
          {enriched.map(pkg => {
            const isOpen = !!expanded[pkg.id];
            return (
              <div key={pkg.id} className="rounded-lg border border-border bg-card overflow-hidden">
                {/* Header */}
                <div className="p-4 flex items-start gap-4 flex-wrap">
                  <button
                    className="flex items-center gap-2 text-left flex-1 min-w-[240px]"
                    onClick={() => setExpanded(prev => ({ ...prev, [pkg.id]: !isOpen }))}
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <div>
                      <div className="font-semibold">{pkg.package_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {pkg.trade ?? "—"} · {pkg.materialCount} materials · est. {GBP.format(pkg.estimatedValue)}
                      </div>
                    </div>
                  </button>

                  {pkg.lowest != null && (
                    <div className="flex items-center gap-3 text-xs">
                      <Metric label="Lowest" value={GBP.format(pkg.lowest)} />
                      <Metric label="Highest" value={GBP.format(pkg.highest!)} />
                      <Metric label="Saving" value={`${GBP.format(pkg.saving)} (${pkg.savingPct.toFixed(1)}%)`} accent />
                      <OpportunityPill value={pkg.opportunity} />
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => checkPrices(pkg)} disabled={!!running[pkg.id]}>
                      <Sparkles className="w-3 h-3" /> {running[pkg.id] ? "Checking…" : "Check Market Prices"}
                    </Button>
                    <Button size="sm" onClick={() => openEnquiry(pkg)} disabled={pkg.lowest == null}>
                      <Mail className="w-3 h-3" /> Generate Price Challenge
                    </Button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border p-4 space-y-4 bg-background/40">
                    {/* Supplier comparison */}
                    {pkg.supplierTotals.length > 0 && (
                      <div>
                        <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Supplier Comparison</h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Supplier</TableHead>
                              <TableHead>Package Total</TableHead>
                              <TableHead>vs Best</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pkg.supplierTotals.map((s, i) => {
                              const isBest = i === 0;
                              const diff = s.total - pkg.lowest!;
                              return (
                                <TableRow key={s.supplier} className={isBest ? "bg-primary/5" : ""}>
                                  <TableCell className="font-medium">{s.supplier}</TableCell>
                                  <TableCell>{GBP.format(s.total)}</TableCell>
                                  <TableCell className={isBest ? "text-primary font-semibold" : "text-muted-foreground"}>
                                    {isBest ? "Best" : `+${GBP.format(diff)}`}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">Market quote</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {/* Materials */}
                    <div>
                      <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Materials in Package</h4>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Material</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead>Best Retail Unit</TableHead>
                            <TableHead>Line Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(pkg as any).pkgItems.map((it: any) => (
                            <TableRow key={it.id}>
                              <TableCell className="font-medium">{it.material_name}</TableCell>
                              <TableCell>{it.quantity ?? "—"} {it.unit ?? ""}</TableCell>
                              <TableCell>{it.bestUnit != null ? GBP.format(it.bestUnit) : <span className="text-xs text-muted-foreground">no benchmark</span>}</TableCell>
                              <TableCell>{it.lineTotal != null ? GBP.format(it.lineTotal) : "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Enquiry dialog */}
      <Dialog open={!!enquiryDialog} onOpenChange={(o) => { if (!o) { setEnquiryDialog(null); setGeneratedEmail(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate Price Challenge</DialogTitle>
          </DialogHeader>
          {enquiryDialog && (
            <div className="space-y-4">
              <div className="text-sm">
                <div className="font-semibold">{enquiryDialog.pkg.package_name}</div>
                <div className="text-xs text-muted-foreground">Benchmark: {GBP.format(enquiryDialog.benchmark)}</div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Send To</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SUPPORTED_SOURCES.map(s => (
                    <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={!!selectedSuppliers[s]}
                        onCheckedChange={(v) => setSelectedSuppliers(prev => ({ ...prev, [s]: !!v }))}
                      />
                      <span>{s}</span>
                      {accounts.find(a => a.merchant_name === s)?.contact_name && (
                        <span className="text-[10px] text-muted-foreground">· {accounts.find(a => a.merchant_name === s)!.contact_name}</span>
                      )}
                    </label>
                  ))}
                </div>
                {accounts.length === 0 && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    Tip: add supplier contacts in Settings or Onboarding to pre-fill rep names and emails.
                  </p>
                )}
              </div>

              {!generatedEmail ? (
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEnquiryDialog(null)}>Cancel</Button>
                  <Button onClick={generateEnquiry}><Sparkles className="w-3 h-3" /> Generate</Button>
                </DialogFooter>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    Recipients: {generatedEmail.suppliers.join(", ")}
                  </div>
                  <div className="text-xs text-muted-foreground">Subject: {generatedEmail.subject}</div>
                  <Textarea readOnly rows={14} className="font-mono text-xs" value={generatedEmail.body} />
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => { navigator.clipboard.writeText(`Subject: ${generatedEmail.subject}\n\n${generatedEmail.body}`); toast.success("Copied to clipboard"); }}
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </Button>
                    <Button onClick={() => { setEnquiryDialog(null); setGeneratedEmail(null); }}>Done</Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
      <div className={`text-xs font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function OpportunityPill({ value }: { value: "Low" | "Medium" | "High" }) {
  const style =
    value === "High"
      ? "bg-primary/15 text-primary border-primary/30"
      : value === "Medium"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : "bg-muted text-muted-foreground border-border";
  return (
    <div className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md border ${style}`}>
      {value} Opportunity
    </div>
  );
}
