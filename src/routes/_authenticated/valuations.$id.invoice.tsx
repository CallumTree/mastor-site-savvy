import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ArrowLeft, Download, Trash2, Save } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCurrentProfile, getLogoSignedUrl, getLogoDataUrl, type Profile } from "@/lib/profile";


export const Route = createFileRoute("/_authenticated/valuations/$id/invoice")({
  component: InvoicePage,
});

type Project = {
  id: string;
  name: string;
  client: string | null;
  client_name: string | null;
  gross_value: number | null;
  contract_value: number | null;
  po_number: string | null;
};


type Valuation = {
  id: string;
  project_id: string;
  valuation_number: number | null;
  status: string;
};

type LineItem = {
  id: string;
  work_package_name: string | null;
  description: string | null;
  claimed_value: number | null;
};

type Invoice = {
  id: string;
  project_id: string;
  valuation_id: string;
  invoice_number: string;
  status: string;
  total_amount: number;
  created_at: string;
};

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

function InvoicePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [previouslyClaimed, setPreviouslyClaimed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const creatingRef = useRef(false);

  // Load company profile + signed logo URL for on-screen display
  useEffect(() => {
    (async () => {
      const p = await getCurrentProfile();
      setProfile(p);
      if (p?.company_logo_url) {
        setLogoUrl(await getLogoSignedUrl(p.company_logo_url));
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: val } = await supabase
      .from("valuations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!val) {
      toast.error("Valuation not found");
      setLoading(false);
      return;
    }
    setValuation(val as Valuation);

    const [{ data: proj }, { data: lines }, { data: priorVals }, { data: existingInv }] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id,name,client,client_name,gross_value,contract_value,po_number")
          .eq("id", val.project_id)
          .maybeSingle(),
        supabase
          .from("valuation_items")
          .select("id,work_package_name,description,claimed_value")
          .eq("valuation_id", id),
        supabase
          .from("valuations")
          .select("id")
          .eq("project_id", val.project_id)
          .eq("status", "Approved")
          .neq("id", id),
        supabase
          .from("invoices")
          .select("*")
          .eq("valuation_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    setProject((proj as Project) ?? null);
    const lineItems = (lines ?? []) as LineItem[];
    setItems(lineItems);

    const priorIds = (priorVals ?? []).map((v) => v.id);
    let prior = 0;
    if (priorIds.length) {
      const { data: priorItems } = await supabase
        .from("valuation_items")
        .select("claimed_value")
        .in("valuation_id", priorIds);
      prior = (priorItems ?? []).reduce(
        (s, r) => s + Number(r.claimed_value ?? 0),
        0,
      );
    }
    setPreviouslyClaimed(prior);

    if (existingInv) {
      setInvoice(existingInv as Invoice);
      setLoading(false);
      return;
    }

    // Create new invoice — guard against double-invocation in dev
    if (creatingRef.current) {
      setLoading(false);
      return;
    }
    creatingRef.current = true;

    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("project_id", val.project_id);

    const nextNum = (count ?? 0) + 1;
    const invoiceNumber = `INV-${String(nextNum).padStart(3, "0")}`;
    const totalAmount = lineItems.reduce(
      (s, r) => s + Number(r.claimed_value ?? 0),
      0,
    );

    const { data: created, error: cErr } = await supabase
      .from("invoices")
      .insert({
        project_id: val.project_id,
        valuation_id: val.id,
        invoice_number: invoiceNumber,
        status: "Draft",
        total_amount: totalAmount,
      })
      .select()
      .single();

    if (cErr || !created) {
      showError("Invoice", cErr ?? new Error("Failed to create invoice"));
    } else {
      setInvoice(created as Invoice);
      // Mark linked scope items as Invoiced
      const { data: viRows } = await supabase
        .from("valuation_items")
        .select("scope_element_id")
        .eq("valuation_id", val.id);
      const scopeIds = ((viRows ?? []) as any[])
        .map((r) => r.scope_element_id)
        .filter(Boolean) as string[];
      if (scopeIds.length > 0) {
        const { error: sErr } = await (supabase as any)
          .from("scope_elements")
          .update({ status: "Invoiced", invoiced_in: { id: created.id, number: invoiceNumber } })
          .in("id", scopeIds);
        if (sErr) showError("Invoice", sErr);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadPdf = async () => {
    if (!invoice || !project || !valuation) return;
    const doc = new jsPDF();
    const clientName = project.client_name ?? project.client ?? "—";
    const today = new Date().toLocaleDateString("en-GB");

    // Top-left: company logo (if any) + company name
    let cursorX = 14;
    if (profile?.company_logo_url) {
      const logo = await getLogoDataUrl(profile.company_logo_url);
      if (logo) {
        const fmt = logo.mime.includes("jpeg") ? "JPEG" : logo.mime.includes("svg") ? "PNG" : "PNG";
        try {
          doc.addImage(logo.dataUrl, fmt, 14, 12, 18, 18);
          cursorX = 36;
        } catch {
          /* fall through to text-only */
        }
      }
    }
    if (profile?.company_name) {
      doc.setFontSize(14);
      doc.text(profile.company_name, cursorX, 22);
    }

    // Top-right: invoice meta
    doc.setFontSize(20);
    doc.text("INVOICE", 196, 20, { align: "right" });
    doc.setFontSize(10);
    doc.text(`Invoice #: ${invoice.invoice_number}`, 196, 28, { align: "right" });
    doc.text(`Date: ${today}`, 196, 34, { align: "right" });
    if (project.po_number) {
      doc.text(`PO #: ${project.po_number}`, 196, 40, { align: "right" });
    }

    doc.setFontSize(12);
    doc.text(project.name, 14, 48);
    doc.setFontSize(10);
    doc.text(`Client: ${clientName}`, 14, 54);
    doc.text(
      `Valuation: IV-${String(valuation.valuation_number ?? 0).padStart(2, "0")}`,
      14,
      60,
    );


    autoTable(doc, {
      startY: 66,
      head: [["Work Package", "Description"]],
      body: items.map((it) => [
        it.work_package_name ?? "—",
        it.description ?? "—",
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [40, 40, 40] },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } })
      .lastAutoTable.finalY;
    let y = finalY + 10;
    const rows: Array<[string, string]> = [
      ["Previously Claimed", GBP.format(previouslyClaimed)],
      ["This Claim", String(items.length)],
      ["Total Claimed", String(previouslyClaimed + items.length)],
      ["Remaining Value", GBP.format(remaining)],
      ["Total Amount Due", GBP.format(Number(invoice.total_amount))],
    ];
    doc.setFontSize(10);
    rows.forEach(([label, value]) => {
      doc.text(label, 14, y);
      doc.text(value, 196, y, { align: "right" });
      y += 6;
    });

    doc.save(`${invoice.invoice_number}.pdf`);

    if (invoice.status !== "Sent") {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "Sent" })
        .eq("id", invoice.id);
      if (error) {
        showError("Invoice", error);
      } else {
        setInvoice({ ...invoice, status: "Sent" });
        toast.success("Invoice marked as sent");
      }
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!invoice || !project || !valuation) {
    return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;
  }

  const projectValue = Number(project.gross_value ?? project.contract_value ?? 0);
  const thisClaim = items.length;
  const totalClaimed = previouslyClaimed + thisClaim;
  const remaining = projectValue - totalClaimed;
  const clientName = project.client_name ?? project.client ?? "—";
  const today = new Date().toLocaleDateString("en-GB");

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            navigate({ to: "/valuations/$id", params: { id: valuation.id } })
          }
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to valuation
        </Button>
      </div>

      {/* Company brand row */}
      {(logoUrl || profile?.company_name) && (
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={profile?.company_name ?? "Company logo"}
              className="h-12 w-12 rounded object-contain border border-border bg-card"
            />
          ) : null}
          {profile?.company_name && (
            <div className="font-display text-xl font-semibold text-primary">
              {profile.company_name}
            </div>
          )}
        </div>
      )}

      <header className="space-y-2 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold text-primary">{project.name}</h1>
        <div className="text-sm text-muted-foreground">Client: {clientName}</div>
        {project.po_number && (
          <div className="text-xs text-muted-foreground">PO Number: <span className="text-foreground font-medium">{project.po_number}</span></div>
        )}
        <div className="flex justify-between items-end gap-3 pt-2 flex-wrap">
          <InvoiceNumberEditor invoice={invoice} onSaved={(num) => setInvoice({ ...invoice, invoice_number: num })} />
          <div className="text-xs text-muted-foreground">
            {today} ·{" "}
            <span className="text-foreground uppercase tracking-wider">
              {invoice.status}
            </span>
          </div>
        </div>
      </header>


      {/* Line items */}
      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Line Items ({items.length})
        </h2>
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-3">Work Package</th>
                <th className="text-left py-2 px-3">Description</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={2} className="py-4 px-3 text-center text-muted-foreground">
                    No line items.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-t border-border">
                    <td className="py-2 px-3 font-medium text-primary">
                      {it.work_package_name ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground leading-relaxed">
                      {it.description ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Summary */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Previously Claimed" value={GBP.format(previouslyClaimed)} />
        <SummaryCard label="This Claim" value={String(thisClaim)} />
        <SummaryCard label="Total Claimed" value={String(totalClaimed)} />
        <SummaryCard label="Remaining Value" value={GBP.format(remaining)} />
      </section>

      <section className="rounded-md border border-primary/30 bg-primary/5 p-4 flex justify-between items-center">
        <div className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
          Total Amount Due
        </div>
        <div className="text-2xl font-semibold text-primary">
          {GBP.format(Number(invoice.total_amount))}
        </div>
      </section>

      <div className="pt-2 space-y-2">
        <Button className="w-full" size="lg" onClick={downloadPdf}>
          <Download className="w-4 h-4 mr-2" />
          Download PDF
        </Button>
        <DeleteInvoiceButton
          invoice={invoice}
          onDeleted={() =>
            navigate({ to: "/valuations/$id", params: { id: invoice.valuation_id } })
          }
        />
      </div>
    </div>
  );
}

function InvoiceNumberEditor({
  invoice,
  onSaved,
}: {
  invoice: Invoice;
  onSaved: (num: string) => void;
}) {
  const [value, setValue] = useState(invoice.invoice_number);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(invoice.invoice_number), [invoice.invoice_number]);

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error("Invoice number cannot be empty");
      return;
    }
    if (trimmed === invoice.invoice_number) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("invoices")
      .update({ invoice_number: trimmed })
      .eq("id", invoice.id);
    setSaving(false);
    if (error) return showError("Invoice", error);
    onSaved(trimmed);
    setEditing(false);
    toast.success("Invoice number updated");
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="text-lg font-semibold text-foreground hover:text-primary underline-offset-4 hover:underline"
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        Invoice {invoice.invoice_number}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-9 w-44 text-sm font-semibold"
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") {
            setValue(invoice.invoice_number);
            setEditing(false);
          }
        }}
      />
      <Button size="sm" onClick={save} disabled={saving} className="h-9">
        <Save className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function DeleteInvoiceButton({
  invoice,
  onDeleted,
}: {
  invoice: Invoice;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    if (
      !confirm(
        "Delete this invoice?\n\nThe valuation and its line items will be kept and unlocked for editing. The invoice itself will be removed.",
      )
    )
      return;
    setBusy(true);
    // Revert valuation status back to Draft so the line items become editable again.
    await supabase.from("valuations").update({ status: "Draft" }).eq("id", invoice.valuation_id);
    // Reset any scope elements that were flipped to Invoiced for this invoice.
    await (supabase as any)
      .from("scope_elements")
      .update({ status: "Claimed", invoiced_in: null })
      .contains("invoiced_in", { id: invoice.id });
    const { error } = await supabase.from("invoices").delete().eq("id", invoice.id);
    setBusy(false);
    if (error) return showError("Invoice", error);
    toast.success("Invoice deleted — valuation unlocked");
    onDeleted();
  };
  return (
    <Button
      variant="outline"
      className="w-full text-destructive hover:text-destructive border-destructive/40"
      onClick={handle}
      disabled={busy}
    >
      <Trash2 className="w-4 h-4 mr-2" />
      {busy ? "Deleting…" : "Delete Invoice"}
    </Button>
  );
}


function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-lg font-semibold text-primary mt-1">{value}</div>
    </div>
  );
}
