import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ChevronDown, ChevronRight, Plus, Save, Receipt } from "lucide-react";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { DisplayMetric } from "@/components/ui/display-metric";

type Valuation = {
  id: string;
  project_id: string;
  valuation_number: number | null;
  status: string;
  valuation_date: string | null;
  created_at: string;
};

type ContractItem = {
  id: string;
  code: string | null;
  description: string | null;
  unit: string | null;
  total_qty: number | null;
  unit_rate: number | null;
};

type ValuationItem = {
  id: string;
  valuation_id: string;
  contract_item_id: string;
  claimed_qty: number | null;
  claimed_value: number | null;
};

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const num = (n: unknown) => (n == null ? 0 : Number(n));

export function ValuationsTab({ projectId }: { projectId: string }) {
  const [vals, setVals] = useState<Valuation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("valuations")
      .select("*")
      .eq("project_id", projectId)
      .order("valuation_number", { ascending: false, nullsFirst: false });
    if (error) showError("Valuations", error);
    setVals((data ?? []) as Valuation[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const hasDraft = vals.some((v) => v.status === "Draft");

  const createDraft = async () => {
    if (hasDraft) {
      toast.error("A draft valuation already exists. Open it to continue claiming.");
      return;
    }
    const next = (vals.reduce((m, v) => Math.max(m, v.valuation_number ?? 0), 0) || 0) + 1;
    const { error } = await supabase.from("valuations").insert({
      project_id: projectId,
      valuation_number: next,
      status: "Draft",
      valuation_date: new Date().toISOString().slice(0, 10),
    });
    if (error) return showError("Valuations", error);
    toast.success(`Draft IV-${String(next).padStart(2, "0")} created`);
    load();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Interim Valuations</h3>
        <Button size="sm" variant="outline" onClick={createDraft} disabled={hasDraft}>
          <Plus className="w-3 h-3 mr-1" /> New draft
        </Button>
      </div>

      {loading ? (
        <LoadingDot label="Loading" />
      ) : vals.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No valuations yet"
          description="Start a draft to begin claiming progress against your contract."
          actionLabel="New draft"
          onAction={createDraft}
        />
      ) : (
        vals.map((v) => {
          const isOpen = expanded === v.id;
          return (
            <div key={v.id} className="rounded-md bg-card border border-border">
              <button
                className="w-full p-3 flex justify-between items-start text-left"
                onClick={() => setExpanded(isOpen ? null : v.id)}
              >
                <div className="flex items-start gap-2">
                  {isOpen ? <ChevronDown className="w-4 h-4 mt-0.5" /> : <ChevronRight className="w-4 h-4 mt-0.5" />}
                  <div>
                    <div className="text-xs font-semibold text-primary">
                      IV-{String(v.valuation_number ?? 0).padStart(2, "0")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {v.valuation_date ? `Period ending ${new Date(v.valuation_date).toLocaleDateString("en-GB")}` : "—"}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{v.status}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 border-t border-border pt-3">
                  <ClaimProgressTable
                    projectId={projectId}
                    valuationId={v.id}
                    readOnly={v.status !== "Draft"}
                  />
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function ClaimProgressTable({
  projectId,
  valuationId,
  readOnly,
}: {
  projectId: string;
  valuationId: string;
  readOnly: boolean;
}) {
  const [items, setItems] = useState<ContractItem[]>([]);
  const [allClaims, setAllClaims] = useState<ValuationItem[]>([]);
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [ci, vi] = await Promise.all([
      supabase
        .from("contract_items")
        .select("*")
        .eq("project_id", projectId)
        .order("code", { ascending: true }),
      supabase
        .from("valuation_items")
        .select("*, valuations!inner(project_id)")
        .eq("valuations.project_id", projectId),
    ]);
    if (ci.error) showError("Valuations", ci.error);
    if (vi.error) showError("Valuations", vi.error);
    const contractItems = (ci.data ?? []) as ContractItem[];
    const claims = (vi.data ?? []) as ValuationItem[];
    setItems(contractItems);
    setAllClaims(claims);
    // Seed draft input with current claim qty for this valuation
    const seed: Record<string, string> = {};
    contractItems.forEach((c) => {
      const existing = claims.find(
        (x) => x.valuation_id === valuationId && x.contract_item_id === c.id,
      );
      seed[c.id] = existing?.claimed_qty != null ? String(existing.claimed_qty) : "";
    });
    setDraftInputs(seed);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, valuationId]);

  const rows = useMemo(() => {
    return items.map((c) => {
      const total = num(c.total_qty);
      const rate = num(c.unit_rate);
      const currentRow = allClaims.find(
        (x) => x.valuation_id === valuationId && x.contract_item_id === c.id,
      );
      const thisClaim = num(currentRow?.claimed_qty);
      const previously = allClaims
        .filter((x) => x.contract_item_id === c.id && x.valuation_id !== valuationId)
        .reduce((s, x) => s + num(x.claimed_qty), 0);
      const totalClaimed = previously + thisClaim;
      const remaining = total - totalClaimed;
      const pct = total > 0 ? (totalClaimed / total) * 100 : 0;
      const valueClaimed = totalClaimed * rate;
      return { c, total, rate, previously, thisClaim, totalClaimed, remaining, pct, valueClaimed };
    });
  }, [items, allClaims, valuationId]);

  const totals = useMemo(() => {
    const thisDraftValue = rows.reduce((s, r) => s + r.thisClaim * r.rate, 0);
    const cumulativeValue = rows.reduce((s, r) => s + r.valueClaimed, 0);
    return { thisDraftValue, cumulativeValue };
  }, [rows]);

  const save = async (c: ContractItem) => {
    const raw = draftInputs[c.id];
    const qty = raw === "" || raw == null ? 0 : Number(raw);
    if (Number.isNaN(qty) || qty < 0) {
      toast.error("Enter a non-negative quantity.");
      return;
    }
    const rate = num(c.unit_rate);
    setSavingId(c.id);
    const existing = allClaims.find(
      (x) => x.valuation_id === valuationId && x.contract_item_id === c.id,
    );
    let error;
    if (existing) {
      ({ error } = await supabase
        .from("valuation_items")
        .update({ claimed_qty: qty, claimed_value: qty * rate })
        .eq("id", existing.id));
    } else {
      ({ error } = await supabase.from("valuation_items").insert({
        valuation_id: valuationId,
        contract_item_id: c.id,
        claimed_qty: qty,
        claimed_value: qty * rate,
      }));
    }
    setSavingId(null);
    if (error) return showError("Valuations", error);
    toast.success("Claim saved");
    load();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading claim progress…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No contract items on this project yet. Add items in the Scope tab to start claiming.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Claim Progress</h4>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground border-b border-border">
            <tr>
              <th className="py-2 pr-3">Code</th>
              <th className="py-2 pr-3">Description</th>
              <th className="py-2 pr-3 text-right">Total Qty</th>
              <th className="py-2 pr-3 text-right">Unit Rate</th>
              <th className="py-2 pr-3 text-right">Prev.</th>
              <th className="py-2 pr-3 text-right">This Claim</th>
              <th className="py-2 pr-3 text-right">Total Claimed</th>
              <th className="py-2 pr-3 text-right">Remaining</th>
              <th className="py-2 pr-3 text-right">% Complete</th>
              <th className="py-2 pr-3 text-right">Value Claimed</th>
              {!readOnly && <th className="py-2"></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const inputVal = draftInputs[r.c.id] ?? "";
              const dirty = num(inputVal === "" ? 0 : Number(inputVal)) !== r.thisClaim;
              return (
                <tr key={r.c.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-mono">{r.c.code ?? "—"}</td>
                  <td className="py-2 pr-3">{r.c.description ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">{r.total}</td>
                  <td className="py-2 pr-3 text-right">{GBP.format(r.rate)}</td>
                  <td className="py-2 pr-3 text-right">{r.previously}</td>
                  <td className="py-2 pr-3 text-right">
                    {readOnly ? (
                      r.thisClaim
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={inputVal}
                        onChange={(e) =>
                          setDraftInputs((m) => ({ ...m, [r.c.id]: e.target.value }))
                        }
                        className="h-8 w-24 ml-auto text-right"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-medium">{r.totalClaimed}</td>
                  <td className="py-2 pr-3 text-right">{r.remaining}</td>
                  <td className="py-2 pr-3 text-right">{r.pct.toFixed(1)}%</td>
                  <td className="py-2 pr-3 text-right font-medium text-primary">
                    {GBP.format(r.valueClaimed)}
                  </td>
                  {!readOnly && (
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!dirty || savingId === r.c.id}
                        onClick={() => save(r.c)}
                      >
                        <Save className="w-3 h-3 mr-1" />
                        {savingId === r.c.id ? "Saving…" : "Save"}
                      </Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td colSpan={9} className="py-2 pr-3 text-right">
                This draft value
              </td>
              <td className="py-2 pr-3 text-right text-primary">
                {GBP.format(totals.thisDraftValue)}
              </td>
              {!readOnly && <td />}
            </tr>
            <tr className="font-semibold">
              <td colSpan={9} className="py-2 pr-3 text-right">
                Cumulative claimed
              </td>
              <td className="py-2 pr-3 text-right text-primary">
                {GBP.format(totals.cumulativeValue)}
              </td>
              {!readOnly && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((r) => {
          const inputVal = draftInputs[r.c.id] ?? "";
          const dirty = num(inputVal === "" ? 0 : Number(inputVal)) !== r.thisClaim;
          return (
            <div key={r.c.id} className="rounded border border-border p-3 text-xs space-y-2">
              <div className="flex justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-[10px] text-muted-foreground">{r.c.code ?? "—"}</div>
                  <div className="text-foreground">{r.c.description ?? "—"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">Value</div>
                  <div className="font-semibold text-primary">{GBP.format(r.valueClaimed)}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Cell label="Total" value={String(r.total)} />
                <Cell label="Rate" value={GBP.format(r.rate)} />
                <Cell label="Prev." value={String(r.previously)} />
                <Cell label="Claimed" value={String(r.totalClaimed)} />
                <Cell label="Remaining" value={String(r.remaining)} />
                <Cell label="% Complete" value={`${r.pct.toFixed(1)}%`} />
              </div>
              {!readOnly && (
                <div className="flex items-end gap-2 pt-1">
                  <div className="flex-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      This Claim Qty
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={inputVal}
                      onChange={(e) =>
                        setDraftInputs((m) => ({ ...m, [r.c.id]: e.target.value }))
                      }
                      className="h-9"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!dirty || savingId === r.c.id}
                    onClick={() => save(r.c)}
                  >
                    <Save className="w-3 h-3 mr-1" />
                    {savingId === r.c.id ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        <div className="rounded border border-border p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">This draft value</span>
            <span className="font-semibold text-primary">{GBP.format(totals.thisDraftValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Cumulative claimed</span>
            <span className="font-semibold text-primary">{GBP.format(totals.cumulativeValue)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-secondary/50 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
