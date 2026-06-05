import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Mail, Plus, Trash2, Copy } from "lucide-react";

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 });

const DEFAULT_MERCHANTS = ["Jewson", "MKM", "Huws Gray", "LBS", "Travis Perkins"];

type TradeAccount = {
  id: string;
  merchant_name: string;
  branch_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  account_reference: string | null;
};

type MerchantQuote = {
  id: string;
  merchant_name: string;
  quote_value: number | null;
  status: string;
  notes: string | null;
};

type ProcurementItem = {
  id: string;
  material_name: string;
  quantity: number | null;
  unit: string | null;
  status: string;
};

type PriceRow = {
  material_name: string;
  supplier_name: string;
  price: number;
};

export function TradeSqueezeTab({ projectId }: { projectId: string }) {
  const [accounts, setAccounts] = useState<TradeAccount[]>([]);
  const [quotes, setQuotes] = useState<MerchantQuote[]>([]);
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAccount, setNewAccount] = useState<Partial<TradeAccount>>({ merchant_name: "" });
  const [generated, setGenerated] = useState<{ merchant: string; subject: string; body: string }[]>([]);

  useEffect(() => { reload(); }, [projectId]);

  async function reload() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const [a, q, p, pr] = await Promise.all([
      user ? (supabase as any).from("trade_accounts").select("*").eq("user_id", user.id).order("merchant_name") : Promise.resolve({ data: [] }),
      (supabase as any).from("merchant_quotes").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      (supabase as any).from("procurement_register").select("id, material_name, quantity, unit, status").eq("project_id", projectId).eq("status", "Approved"),
      (supabase as any).from("material_prices").select("material_name, supplier_name, price"),
    ]);
    setAccounts((a.data ?? []) as TradeAccount[]);
    setQuotes((q.data ?? []) as MerchantQuote[]);
    setItems((p.data ?? []) as ProcurementItem[]);
    setPrices((pr.data ?? []) as PriceRow[]);
    setLoading(false);
  }

  const benchmark = useMemo(() => {
    // for each item, find best retail price across all suppliers in material_prices
    return items.map(it => {
      const matches = prices.filter(pr => pr.material_name.toLowerCase() === it.material_name.toLowerCase());
      const best = matches.length ? Math.min(...matches.map(m => Number(m.price))) : null;
      const qty = Number(it.quantity ?? 1);
      return {
        ...it,
        bestUnit: best,
        bestTotal: best != null ? best * qty : null,
        suppliers: matches,
      };
    });
  }, [items, prices]);

  const retailTotal = useMemo(
    () => benchmark.reduce((s, b) => s + (b.bestTotal ?? 0), 0),
    [benchmark]
  );

  const bestTradeQuote = useMemo(() => {
    const received = quotes.filter(q => q.status === "Received" || q.status === "Accepted").map(q => Number(q.quote_value ?? 0)).filter(v => v > 0);
    return received.length ? Math.min(...received) : null;
  }, [quotes]);

  const saving = bestTradeQuote != null ? retailTotal - bestTradeQuote : 0;
  const savingPct = retailTotal > 0 && bestTradeQuote != null ? (saving / retailTotal) * 100 : 0;

  async function addAccount() {
    if (!newAccount.merchant_name?.trim()) return toast.error("Merchant name required");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Not authenticated");
    const { error } = await (supabase as any).from("trade_accounts").insert({ ...newAccount, user_id: user.id });
    if (error) return toast.error(error.message);
    setNewAccount({ merchant_name: "" });
    toast.success("Trade account added");
    reload();
  }

  async function deleteAccount(id: string) {
    const { error } = await (supabase as any).from("trade_accounts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  async function setQuoteStatus(id: string, status: string) {
    const { error } = await (supabase as any).from("merchant_quotes").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  async function deleteQuote(id: string) {
    const { error } = await (supabase as any).from("merchant_quotes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  }

  function buildEmail(merchant: string, repName?: string | null) {
    const lines = benchmark.map(b => {
      const qty = b.quantity ?? 1;
      const unit = b.unit ?? "ea";
      const bench = b.bestUnit != null ? ` (benchmark ${GBP.format(b.bestUnit)}/${unit})` : "";
      return `• ${b.material_name} — ${qty} ${unit}${bench}`;
    }).join("\n");
    const subject = "Price Check / Material Enquiry";
    const body =
`Hi ${repName || "[Rep Name]"},

I need the following materials for an upcoming project.

I have benchmarked current market pricing and can currently obtain several items at the rates below.

I would prefer to place the order through my trade account with ${merchant} if you can provide a competitive quotation.

Please provide your best price for the following:

${lines || "[No approved procurement items yet]"}

Many thanks,
[User]`;
    return { merchant, subject, body };
  }

  async function generateForMerchant(merchant: string, repName?: string | null) {
    if (items.length === 0) return toast.error("No approved procurement items to enquire about");
    setGenerated([buildEmail(merchant, repName)]);
    // create a Requested quote record
    await (supabase as any).from("merchant_quotes").insert({ project_id: projectId, merchant_name: merchant, status: "Requested" });
    reload();
    toast.success(`Enquiry generated for ${merchant}`);
  }

  async function generateForAll() {
    if (items.length === 0) return toast.error("No approved procurement items to enquire about");
    const merchants = accounts.length ? accounts.map(a => ({ name: a.merchant_name, rep: a.contact_name })) : DEFAULT_MERCHANTS.map(m => ({ name: m, rep: null }));
    const emails = merchants.map(m => buildEmail(m.name, m.rep));
    setGenerated(emails);
    const rows = merchants.map(m => ({ project_id: projectId, merchant_name: m.name, status: "Requested" }));
    await (supabase as any).from("merchant_quotes").insert(rows);
    reload();
    toast.success(`Generated ${emails.length} enquiries`);
  }

  async function recordQuote(merchant: string, value: number) {
    const { error } = await (supabase as any).from("merchant_quotes").insert({ project_id: projectId, merchant_name: merchant, quote_value: value, status: "Received" });
    if (error) return toast.error(error.message);
    reload();
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading TradeSqueeze…</div>;

  return (
    <div className="space-y-8">
      {/* Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Retail Benchmark Total" value={GBP.format(retailTotal)} />
        <Stat label="Best Trade Quote" value={bestTradeQuote != null ? GBP.format(bestTradeQuote) : "—"} />
        <Stat label="Potential Saving" value={bestTradeQuote != null ? GBP.format(saving) : "—"} />
        <Stat label="Saving %" value={bestTradeQuote != null ? `${savingPct.toFixed(1)}%` : "—"} />
      </div>

      {/* Approved items + benchmark */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Approved Procurement & Best Retail Price</h3>
        {benchmark.length === 0 ? (
          <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">No approved procurement items. Approve items in the Procurement Register first.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Best Retail Unit</TableHead>
                <TableHead>Line Total</TableHead>
                <TableHead>Suppliers Checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {benchmark.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.material_name}</TableCell>
                  <TableCell>{b.quantity ?? "—"} {b.unit ?? ""}</TableCell>
                  <TableCell>{b.bestUnit != null ? GBP.format(b.bestUnit) : "—"}</TableCell>
                  <TableCell>{b.bestTotal != null ? GBP.format(b.bestTotal) : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{b.suppliers.length}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Trade Accounts */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trade Accounts</h3>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
          <div><Label className="text-xs">Merchant</Label><Input placeholder="e.g. Jewson" value={newAccount.merchant_name ?? ""} onChange={e => setNewAccount({ ...newAccount, merchant_name: e.target.value })} /></div>
          <div><Label className="text-xs">Branch</Label><Input value={newAccount.branch_name ?? ""} onChange={e => setNewAccount({ ...newAccount, branch_name: e.target.value })} /></div>
          <div><Label className="text-xs">Rep Name</Label><Input value={newAccount.contact_name ?? ""} onChange={e => setNewAccount({ ...newAccount, contact_name: e.target.value })} /></div>
          <div><Label className="text-xs">Email</Label><Input type="email" value={newAccount.contact_email ?? ""} onChange={e => setNewAccount({ ...newAccount, contact_email: e.target.value })} /></div>
          <div><Label className="text-xs">Phone</Label><Input value={newAccount.contact_phone ?? ""} onChange={e => setNewAccount({ ...newAccount, contact_phone: e.target.value })} /></div>
          <Button onClick={addAccount} size="sm"><Plus className="w-4 h-4" /> Add</Button>
        </div>
        {accounts.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.merchant_name}</TableCell>
                  <TableCell>{a.branch_name ?? "—"}</TableCell>
                  <TableCell>{a.contact_name ?? "—"}</TableCell>
                  <TableCell>{a.contact_email ?? "—"}</TableCell>
                  <TableCell>{a.contact_phone ?? "—"}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => generateForMerchant(a.merchant_name, a.contact_name)}><Mail className="w-3 h-3" /> Enquire</Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteAccount(a.id)}><Trash2 className="w-3 h-3" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {/* Generate */}
      <section className="space-y-2">
        <div className="flex gap-2 flex-wrap">
          <Button onClick={generateForAll}><Mail className="w-4 h-4" /> Generate For All Merchants</Button>
          {DEFAULT_MERCHANTS.map(m => (
            <Button key={m} variant="outline" size="sm" onClick={() => generateForMerchant(m)}>{m}</Button>
          ))}
        </div>
        {generated.length > 0 && (
          <div className="space-y-3 mt-3">
            {generated.map((g, i) => (
              <div key={i} className="rounded-md border border-border p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{g.merchant}</div>
                  <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(`Subject: ${g.subject}\n\n${g.body}`); toast.success("Copied"); }}><Copy className="w-3 h-3" /> Copy</Button>
                </div>
                <div className="text-xs text-muted-foreground">Subject: {g.subject}</div>
                <Textarea readOnly value={g.body} rows={10} className="font-mono text-xs" />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Merchant Quotes */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Merchant Quotes</h3>
        {quotes.length === 0 ? (
          <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">No quotes yet. Generate enquiries above.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Quote Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map(q => (
                <QuoteRow key={q.id} quote={q} onSetStatus={setQuoteStatus} onDelete={deleteQuote} onRecordValue={(v) => recordQuote(q.merchant_name, v)} />
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

function QuoteRow({ quote, onSetStatus, onDelete, onRecordValue }: {
  quote: MerchantQuote;
  onSetStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onRecordValue: (v: number) => void;
}) {
  const [val, setVal] = useState<string>(quote.quote_value != null ? String(quote.quote_value) : "");
  async function saveValue() {
    const n = Number(val);
    if (!isFinite(n) || n <= 0) return toast.error("Enter a valid amount");
    const { error } = await (supabase as any).from("merchant_quotes").update({ quote_value: n, status: quote.status === "Requested" ? "Received" : quote.status }).eq("id", quote.id);
    if (error) return toast.error(error.message);
    toast.success("Quote saved");
    onRecordValue(0); // triggers reload via parent
  }
  return (
    <TableRow>
      <TableCell className="font-medium">{quote.merchant_name}</TableCell>
      <TableCell>
        <div className="flex gap-1 items-center">
          <Input className="h-8 w-28" type="number" step="0.01" value={val} onChange={e => setVal(e.target.value)} />
          <Button size="sm" variant="outline" onClick={saveValue}>Save</Button>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-xs px-2 py-1 rounded-md bg-secondary">{quote.status}</span>
      </TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => onSetStatus(quote.id, "Accepted")}>Accept</Button>
        <Button size="sm" variant="outline" onClick={() => onSetStatus(quote.id, "Rejected")}>Reject</Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(quote.id)}><Trash2 className="w-3 h-3" /></Button>
      </TableCell>
    </TableRow>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-primary mt-0.5">{value}</div>
    </div>
  );
}
