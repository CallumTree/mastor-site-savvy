import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search,
  TrendingDown,
  TrendingUp,
  Minus,
  Store,
  Info,
  ChevronDown,
  ChevronRight,
  Award,
} from "lucide-react";

const SUPPLIERS = [
  { name: "Screwfix", type: "Retail", confidence: "High" },
  { name: "Toolstation", type: "Retail", confidence: "High" },
  { name: "Amazon", type: "Retail", confidence: "Medium" },
  { name: "Wickes", type: "Retail", confidence: "High" },
  { name: "Travis Perkins", type: "Trade", confidence: "High" },
  { name: "Jewson", type: "Trade", confidence: "High" },
  { name: "Huws Gray", type: "Trade", confidence: "Medium" },
  { name: "MKM", type: "Trade", confidence: "Medium" },
  { name: "LBS", type: "Trade", confidence: "Medium" },
] as const;

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

type ProcItem = {
  id: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  status: string;
};

type PriceRow = {
  id: string;
  material_name: string;
  material_key: string;
  supplier_name: string;
  price: number;
  unit: string | null;
  source_type: string;
  confidence: string;
  last_checked: string;
};

const materialKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Deterministic pseudo-random based on string — gives stable mock prices per material/supplier
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function basePriceFor(name: string): number {
  const k = materialKey(name);
  const seed = hash(k);
  // Base between £2 and £80
  return 2 + (seed % 7800) / 100;
}

function generateQuote(material: string, supplier: string, salt = "") {
  const base = basePriceFor(material);
  const variance = (hash(materialKey(material) + supplier + salt) % 3000) / 10000; // 0–0.30
  const sign = hash(supplier + salt) % 2 === 0 ? -1 : 1;
  const price = Math.max(0.5, base * (1 + sign * variance));
  return Number(price.toFixed(2));
}

export function MerchantIntelligenceTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<ProcItem[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [openRow, setOpenRow] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data: procs, error: e1 } = await (supabase as any)
      .from("procurement_register")
      .select("id, material_name, quantity, unit, status")
      .eq("project_id", projectId)
      .in("status", ["Approved", "Ordered", "Delivered"]);
    if (e1) toast.error(e1.message);

    const approved = (procs ?? []) as ProcItem[];
    setItems(approved);

    if (approved.length > 0) {
      const keys = Array.from(new Set(approved.map((i) => materialKey(i.material_name))));
      const { data: pr } = await (supabase as any)
        .from("material_prices")
        .select("*")
        .in("material_key", keys)
        .order("last_checked", { ascending: false });
      setPrices((pr ?? []) as PriceRow[]);
    } else {
      setPrices([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const checkPrices = async (targets: ProcItem[]) => {
    if (targets.length === 0) {
      toast.info("Nothing to check");
      return;
    }
    setChecking(true);
    const rows = targets.flatMap((item) =>
      SUPPLIERS.map((s) => ({
        material_name: item.material_name,
        material_key: materialKey(item.material_name),
        supplier_name: s.name,
        price: generateQuote(item.material_name, s.name, new Date().toISOString().slice(0, 10)),
        unit: item.unit ?? "ea",
        source_type: s.type,
        confidence: s.confidence,
      })),
    );
    const { error } = await (supabase as any).from("material_prices").insert(rows);
    setChecking(false);
    if (error) return toast.error(error.message);
    toast.success(`Checked ${targets.length} material${targets.length === 1 ? "" : "s"}`);
    setSelected({});
    load();
  };

  // Latest price per supplier+material, plus previous price for movement
  const byMaterial = useMemo(() => {
    const map = new Map<string, { latest: PriceRow[]; previous: Map<string, number> }>();
    for (const it of items) {
      const k = materialKey(it.material_name);
      const rows = prices.filter((p) => p.material_key === k);
      const latestPerSupplier = new Map<string, PriceRow>();
      const previousPerSupplier = new Map<string, number>();
      for (const r of rows) {
        if (!latestPerSupplier.has(r.supplier_name)) {
          latestPerSupplier.set(r.supplier_name, r);
        } else if (!previousPerSupplier.has(r.supplier_name)) {
          previousPerSupplier.set(r.supplier_name, Number(r.price));
        }
      }
      map.set(it.id, {
        latest: Array.from(latestPerSupplier.values()).sort((a, b) => Number(a.price) - Number(b.price)),
        previous: previousPerSupplier,
      });
    }
    return map;
  }, [items, prices]);

  const summary = useMemo(() => {
    let total = 0;
    let best = 0;
    let priced = 0;
    for (const it of items) {
      const qty = Number(it.quantity ?? 1) || 1;
      const data = byMaterial.get(it.id);
      if (!data || data.latest.length === 0) continue;
      priced++;
      const minPrice = Number(data.latest[0].price);
      const avgPrice =
        data.latest.reduce((s, r) => s + Number(r.price), 0) / data.latest.length;
      total += avgPrice * qty;
      best += minPrice * qty;
    }
    return { total, best, saving: total - best, priced };
  }, [items, byMaterial]);

  const selectedItems = items.filter((i) => selected[i.id]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3 h-3 mt-0.5 shrink-0" />
        Pricing visibility only — Mastor compares supplier prices across {SUPPLIERS.length} merchants.
        Nothing is ordered.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <SummaryCard label="Procurement Total" value={GBP.format(summary.total)} />
        <SummaryCard label="Best Available" value={GBP.format(summary.best)} accent />
        <SummaryCard
          label="Potential Saving"
          value={GBP.format(summary.saving)}
          tone={summary.saving > 0 ? "good" : "muted"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-7 text-[11px]"
          disabled={checking || items.length === 0}
          onClick={() => checkPrices(items)}
        >
          <Search className="w-3 h-3 mr-1" />
          {checking ? "Checking…" : "Check All Prices"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={checking || selectedItems.length === 0}
          onClick={() => checkPrices(selectedItems)}
        >
          <Search className="w-3 h-3 mr-1" />
          Check Selected ({selectedItems.length})
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          Approve materials in the Procurement Register to compare prices.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const data = byMaterial.get(it.id);
            const latest = data?.latest ?? [];
            const qty = Number(it.quantity ?? 1) || 1;
            const isOpen = openRow[it.id] !== false;
            const bestRow = latest[0];

            return (
              <div key={it.id} className="rounded-md border border-border bg-card">
                <div className="px-3 py-2 flex items-center gap-2">
                  <Checkbox
                    checked={!!selected[it.id]}
                    onCheckedChange={(v) =>
                      setSelected((s) => ({ ...s, [it.id]: !!v }))
                    }
                  />
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => setOpenRow((o) => ({ ...o, [it.id]: !isOpen }))}
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3 h-3 shrink-0" />
                      )}
                      <span className="text-sm text-foreground truncate">
                        {qty} × {it.material_name}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 pl-5">
                      {bestRow ? (
                        <>
                          <Award className="w-3 h-3 inline mr-1 text-amber-600" />
                          Best: {bestRow.supplier_name} · {GBP.format(Number(bestRow.price))}
                          {it.unit ? `/${it.unit}` : ""} · Total{" "}
                          {GBP.format(Number(bestRow.price) * qty)}
                        </>
                      ) : (
                        <span className="italic">No prices yet — run Check Prices</span>
                      )}
                    </div>
                  </button>
                </div>

                {isOpen && latest.length > 0 && (
                  <div className="border-t border-border">
                    <table className="w-full text-[11px]">
                      <thead className="bg-secondary/40 text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-1 font-medium">Supplier</th>
                          <th className="text-left px-3 py-1 font-medium">Type</th>
                          <th className="text-right px-3 py-1 font-medium">Unit</th>
                          <th className="text-right px-3 py-1 font-medium">Total</th>
                          <th className="text-right px-3 py-1 font-medium">Movement</th>
                          <th className="text-right px-3 py-1 font-medium">Confidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latest.map((r, idx) => {
                          const prev = data?.previous.get(r.supplier_name);
                          const change = prev != null ? Number(r.price) - prev : null;
                          const isBest = idx === 0;
                          return (
                            <tr
                              key={r.id}
                              className={`border-t border-border ${
                                isBest ? "bg-emerald-500/5" : ""
                              }`}
                            >
                              <td className="px-3 py-1 text-foreground">
                                <Store className="w-3 h-3 inline mr-1 text-muted-foreground" />
                                {r.supplier_name}
                                {isBest && (
                                  <span className="ml-1 text-[9px] uppercase tracking-wider text-emerald-700">
                                    best
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1 text-muted-foreground">{r.source_type}</td>
                              <td className="px-3 py-1 text-right">{GBP.format(Number(r.price))}</td>
                              <td className="px-3 py-1 text-right text-foreground">
                                {GBP.format(Number(r.price) * qty)}
                              </td>
                              <td className="px-3 py-1 text-right">
                                {change == null ? (
                                  <span className="text-muted-foreground">—</span>
                                ) : change < 0 ? (
                                  <span className="text-emerald-700">
                                    <TrendingDown className="w-3 h-3 inline" />{" "}
                                    {GBP.format(change)}
                                  </span>
                                ) : change > 0 ? (
                                  <span className="text-rose-700">
                                    <TrendingUp className="w-3 h-3 inline" />{" "}
                                    +{GBP.format(change)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">
                                    <Minus className="w-3 h-3 inline" /> 0
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-1 text-right">
                                <ConfidenceBadge level={r.confidence} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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

function SummaryCard({
  label,
  value,
  accent,
  tone,
}: {
  label: string;
  value: string;
  accent?: boolean;
  tone?: "good" | "muted";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`text-lg font-semibold mt-0.5 ${
          tone === "good"
            ? "text-emerald-700"
            : accent
              ? "text-emerald-700"
              : "text-primary"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const styles =
    level === "High"
      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
      : level === "Low"
        ? "bg-rose-500/15 text-rose-700 border-rose-500/30"
        : "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return (
    <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${styles}`}>
      {level}
    </span>
  );
}
