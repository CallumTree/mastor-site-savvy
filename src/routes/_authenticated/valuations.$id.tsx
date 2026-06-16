import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ArrowLeft, CheckCircle2, FileText, Pencil, Trash2, X, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getCurrentProfile, getLogoDataUrl, type Profile } from "@/lib/profile";

export const Route = createFileRoute("/_authenticated/valuations/$id")({
  component: ValuationPage,
});

type Valuation = {
  id: string;
  project_id: string;
  valuation_number: number | null;
  status: string;
  created_at: string;
  valuation_date: string | null;
};

type Project = {
  id: string;
  name: string;
  client: string | null;
  gross_value: number | null;
  contract_value: number | null;
};

type LineItem = {
  id: string;
  work_package_name: string | null;
  description: string | null;
  unit_rate: number | null;
  claimed_qty: number | null;
  claimed_value: number | null;
  scope_element_id: string | null;
};

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const REJECTION_REASONS = [
  "Not Complete",
  "Architect Query",
  "Client Dispute",
  "Measurement Disagreement",
  "Other",
] as const;

const BRG: [number, number, number] = [10, 10, 10]; // Black header
const GOLD: [number, number, number] = [191, 161, 74]; // Muted Gold

function ValuationPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [previouslyClaimed, setPreviouslyClaimed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finalising, setFinalising] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [removing, setRemoving] = useState<LineItem | null>(null);
  const [reason, setReason] = useState<string>("");
  const [reasonNotes, setReasonNotes] = useState("");
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data: val, error: vErr } = await supabase
      .from("valuations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (vErr || !val) {
      showError("Valuation", vErr ?? new Error("Valuation not found"));
      setLoading(false);
      return;
    }
    setValuation(val as Valuation);

    const [{ data: proj }, { data: lines }, { data: priorVals }, profileData] =
      await Promise.all([
        supabase
          .from("projects")
          .select("id,name,client,gross_value,contract_value")
          .eq("id", val.project_id)
          .maybeSingle(),
        supabase
          .from("valuation_items")
          .select("id,work_package_name,description,unit_rate,claimed_qty,claimed_value,scope_element_id")
          .eq("valuation_id", id),
        supabase
          .from("valuations")
          .select("id")
          .eq("project_id", val.project_id)
          .eq("status", "Approved")
          .neq("id", id),
        getCurrentProfile().catch(() => null),
      ]);

    setProject((proj as Project) ?? null);
    setItems((lines ?? []) as LineItem[]);
    setProfile(profileData as Profile | null);

    const priorIds = (priorVals ?? []).map((v) => v.id);
    if (priorIds.length) {
      const { data: priorItems } = await supabase
        .from("valuation_items")
        .select("claimed_value")
        .in("valuation_id", priorIds);
      const sum = (priorItems ?? []).reduce(
        (s, r) => s + Number(r.claimed_value ?? 0),
        0,
      );
      setPreviouslyClaimed(sum);
    } else {
      setPreviouslyClaimed(0);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const updateItem = (itemId: string, field: "unit_rate" | "claimed_qty", raw: string) => {
    const num = raw === "" ? null : Number(raw);
    if (raw !== "" && Number.isNaN(num)) return;

    setItems((prev) => {
      const next = prev.map((it) => {
        if (it.id !== itemId) return it;
        const updated = { ...it, [field]: num } as LineItem;
        const rate = field === "unit_rate" ? num : it.unit_rate;
        const qty = field === "claimed_qty" ? num : it.claimed_qty;
        updated.claimed_value =
          rate != null && qty != null ? Number(rate) * Number(qty) : null;
        return updated;
      });
      return next;
    });

    if (saveTimers.current[itemId]) clearTimeout(saveTimers.current[itemId]);
    saveTimers.current[itemId] = setTimeout(async () => {
      const current = (await new Promise<LineItem | undefined>((resolve) => {
        setItems((prev) => {
          resolve(prev.find((x) => x.id === itemId));
          return prev;
        });
      })) as LineItem | undefined;
      if (!current) return;
      const { error } = await supabase
        .from("valuation_items")
        .update({
          unit_rate: current.unit_rate,
          claimed_qty: current.claimed_qty,
          claimed_value: current.claimed_value,
        })
        .eq("id", itemId);
      if (error) showError("Valuation", error);
    }, 400);
  };

  const openRemove = (item: LineItem) => {
    setRemoving(item);
    setReason("");
    setReasonNotes("");
  };

  const closeRemove = () => {
    if (confirmingRemove) return;
    setRemoving(null);
    setReason("");
    setReasonNotes("");
  };

  const confirmRemove = async () => {
    if (!removing || !valuation || !project) return;
    if (!reason) {
      toast.error("Select a rejection reason");
      return;
    }
    setConfirmingRemove(true);

    // 1. Audit trail entry
    if (removing.scope_element_id) {
      const { error: hErr } = await (supabase as any)
        .from("scope_element_history")
        .insert({
          scope_element_id: removing.scope_element_id,
          project_id: project.id,
          event_type: "Rejected From Valuation",
          valuation_id: valuation.id,
          rejection_reason: reason,
          notes: reasonNotes || null,
        });
      if (hErr) {
        setConfirmingRemove(false);
        return showError("Valuation", hErr);
      }

      // 2. Reset scope element back to In Progress
      const { error: sErr } = await (supabase as any)
        .from("scope_elements")
        .update({ status: "In Progress", claimed_in_valuation: null })
        .eq("id", removing.scope_element_id);
      if (sErr) {
        setConfirmingRemove(false);
        return showError("Valuation", sErr);
      }
    }

    // 3. Remove from valuation
    const { error: dErr } = await supabase
      .from("valuation_items")
      .delete()
      .eq("id", removing.id);
    setConfirmingRemove(false);
    if (dErr) return showError("Valuation", dErr);

    setItems((prev) => prev.filter((it) => it.id !== removing.id));
    toast.success("Line item removed");
    setRemoving(null);
    setReason("");
    setReasonNotes("");
  };

  const finalise = async () => {
    setFinalising(true);
    const { error } = await supabase
      .from("valuations")
      .update({ status: "Approved" })
      .eq("id", id);
    setFinalising(false);
    if (error) return showError("Valuation", error);
    toast.success("Valuation finalised");
    setEditMode(false);
    load();
  };

  const exportPdf = async () => {
    if (!valuation || !project) return;
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const valNumber = `IV-${String(valuation.valuation_number ?? 0).padStart(2, "0")}`;
      const today = new Date().toLocaleDateString("en-GB");
      const valDate = valuation.valuation_date
        ? new Date(valuation.valuation_date).toLocaleDateString("en-GB")
        : today;

      // Green header band
      doc.setFillColor(...BRG);
      doc.rect(0, 0, pageWidth, 36, "F");

      // Logo + company name in header (white)
      let cursorX = 14;
      if (profile?.company_logo_url) {
        const logo = await getLogoDataUrl(profile.company_logo_url);
        if (logo) {
          const fmt = logo.mime.includes("jpeg") ? "JPEG" : "PNG";
          try {
            doc.addImage(logo.dataUrl, fmt, 14, 9, 18, 18);
            cursorX = 36;
          } catch {
            /* ignore */
          }
        }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      if (profile?.company_name) doc.text(profile.company_name, cursorX, 18);
      doc.setFontSize(20);
      doc.text("VALUATION", pageWidth - 14, 18, { align: "right" });
      doc.setFontSize(10);
      doc.text(valNumber, pageWidth - 14, 26, { align: "right" });
      doc.text(`Date: ${valDate}`, pageWidth - 14, 32, { align: "right" });

      // Gold accent line
      doc.setFillColor(...GOLD);
      doc.rect(0, 36, pageWidth, 1.5, "F");

      // Project block
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(12);
      doc.text(project.name, 14, 50);
      doc.setFontSize(10);
      doc.setTextColor(90, 90, 90);
      if (project.client) doc.text(`Client: ${project.client}`, 14, 56);

      // Line items table
      autoTable(doc, {
        startY: 64,
        head: [["Description", "Qty", "Rate", "Amount", "Status"]],
        body: items.map((it) => [
          [it.work_package_name, it.description].filter(Boolean).join(" — ") || "—",
          it.claimed_qty != null ? String(it.claimed_qty) : "—",
          it.unit_rate != null ? GBP.format(Number(it.unit_rate)) : "—",
          it.claimed_value != null ? GBP.format(Number(it.claimed_value)) : "—",
          "Included",
        ]),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: BRG, textColor: 255 },
        alternateRowStyles: { fillColor: [248, 246, 240] },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
        },
      });

      // Rejected items appendix
      const { data: rejected } = await (supabase as any)
        .from("scope_element_history")
        .select("rejection_reason, notes, created_at, scope_element_id")
        .eq("valuation_id", valuation.id)
        .eq("event_type", "Rejected From Valuation")
        .order("created_at", { ascending: true });

      let finalY =
        (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      if ((rejected ?? []).length > 0) {
        autoTable(doc, {
          startY: finalY + 6,
          head: [["Rejected Item", "Reason", "Notes"]],
          body: (rejected as any[]).map((r) => [
            r.scope_element_id ? r.scope_element_id.slice(0, 8) : "—",
            r.rejection_reason ?? "—",
            r.notes ?? "—",
          ]),
          styles: { fontSize: 8, cellPadding: 2.5, textColor: [110, 30, 30] },
          headStyles: { fillColor: [140, 40, 40], textColor: 255 },
        });
        finalY = (doc as unknown as { lastAutoTable: { finalY: number } })
          .lastAutoTable.finalY;
      }

      // Summary block
      const thisClaim = items.reduce((s, it) => s + Number(it.claimed_value ?? 0), 0);
      const projectValue = Number(project.gross_value ?? project.contract_value ?? 0);
      const totalClaimed = previouslyClaimed + thisClaim;
      const remaining = projectValue - totalClaimed;

      let y = finalY + 10;
      doc.setDrawColor(...GOLD);
      doc.setLineWidth(0.4);
      doc.line(120, y - 3, pageWidth - 14, y - 3);
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      const summary: Array<[string, string]> = [
        ["Previously Claimed", GBP.format(previouslyClaimed)],
        ["This Claim", GBP.format(thisClaim)],
        ["Total Claimed", GBP.format(totalClaimed)],
        ["Remaining Value", GBP.format(remaining)],
      ];
      summary.forEach(([label, value], i) => {
        const isTotal = i === 2;
        if (isTotal) doc.setFont("helvetica", "bold");
        else doc.setFont("helvetica", "normal");
        doc.text(label, 120, y);
        doc.text(value, pageWidth - 14, y, { align: "right" });
        y += 6;
      });
      doc.setFont("helvetica", "normal");

      // Signature block
      y += 14;
      if (y > 250) {
        doc.addPage();
        y = 30;
      }
      doc.setDrawColor(...BRG);
      doc.setLineWidth(0.6);
      doc.setFontSize(11);
      doc.setTextColor(...BRG);
      doc.text("Client Approval", 14, y);
      y += 8;
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(9);
      doc.text(
        "I confirm that the works valued above have been completed in accordance with the contract.",
        14,
        y,
      );
      y += 12;
      // Signature line
      doc.setDrawColor(120, 120, 120);
      doc.line(14, y + 14, 100, y + 14);
      doc.line(120, y + 14, pageWidth - 14, y + 14);
      doc.setFontSize(8);
      doc.setTextColor(110, 110, 110);
      doc.text("Signature", 14, y + 18);
      doc.text("Date", 120, y + 18);
      y += 26;
      doc.line(14, y + 10, 100, y + 10);
      doc.setFontSize(8);
      doc.text("Print name", 14, y + 14);

      doc.save(`${valNumber}.pdf`);
      toast.success("Valuation exported");
    } catch (e) {
      showError("Valuation Export", e as Error);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!valuation || !project) {
    return <div className="p-6 text-sm text-muted-foreground">Not found.</div>;
  }

  const isApproved = valuation.status === "Approved";
  const canRemove = !isApproved && editMode;
  const thisClaim = items.reduce((s, it) => s + Number(it.claimed_value ?? 0), 0);
  const projectValue = Number(project.gross_value ?? project.contract_value ?? 0);
  const totalClaimed = previouslyClaimed + thisClaim;
  const remaining = projectValue - totalClaimed;

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate({ to: "/projects/$id", params: { id: project.id } })}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to project
        </Button>
      </div>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {project.name}
          </div>
          <h1 className="text-2xl font-semibold text-primary">
            Valuation IV-{String(valuation.valuation_number ?? 0).padStart(2, "0")}
          </h1>
          <div className="text-xs text-muted-foreground">
            Status: <span className="text-foreground">{valuation.status}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {!isApproved && (
            <Button
              size="sm"
              variant={editMode ? "default" : "outline"}
              onClick={() => setEditMode((m) => !m)}
            >
              {editMode ? (
                <>
                  <X className="w-3.5 h-3.5 mr-1" /> Done Editing
                </>
              ) : (
                <>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> Edit Valuation
                </>
              )}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={exportPdf}>
            <Download className="w-3.5 h-3.5 mr-1" /> Export PDF
          </Button>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Line Items ({items.length})
        </h2>
        <div className="hidden md:block rounded-md border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="text-left py-2 px-3">Work Package</th>
                <th className="text-left py-2 px-3">Description</th>
                <th className="text-right py-2 px-3 w-28">Unit Rate</th>
                <th className="text-right py-2 px-3 w-24">Quantity</th>
                <th className="text-right py-2 px-3 w-28">Value</th>
                {canRemove && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={canRemove ? 6 : 5} className="py-4 px-3 text-center text-muted-foreground">
                    No line items.
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-t border-border align-top">
                    <td className="py-2 px-3 font-medium text-primary">
                      {it.work_package_name ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground leading-relaxed">
                      {it.description ?? "—"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {isApproved ? (
                        it.unit_rate != null ? GBP.format(Number(it.unit_rate)) : "—"
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-8 text-right text-xs"
                          value={it.unit_rate ?? ""}
                          onChange={(e) => updateItem(it.id, "unit_rate", e.target.value)}
                        />
                      )}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {isApproved ? (
                        it.claimed_qty != null ? String(it.claimed_qty) : "—"
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-8 text-right text-xs"
                          value={it.claimed_qty ?? ""}
                          onChange={(e) => updateItem(it.id, "claimed_qty", e.target.value)}
                        />
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-medium tabular-nums">
                      {it.claimed_value != null ? GBP.format(Number(it.claimed_value)) : "—"}
                    </td>
                    {canRemove && (
                      <td className="py-2 px-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-11 w-11 p-0 text-destructive hover:text-destructive"
                          onClick={() => openRemove(it)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot className="bg-secondary/30">
                <tr className="border-t border-border">
                  <td colSpan={canRemove ? 5 : 4} className="py-2 px-3 text-right text-muted-foreground uppercase tracking-wider text-[10px]">
                    Total
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-primary tabular-nums">
                    {GBP.format(thisClaim)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Mobile card stack */}
        <div className="md:hidden space-y-2">
          {items.length === 0 ? (
            <div className="rounded-md border border-border p-4 text-center text-xs text-muted-foreground">
              No line items.
            </div>
          ) : (
            <>
              {items.map((it) => (
                <div key={it.id} className="rounded-md border border-border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-primary truncate">
                        {it.work_package_name ?? "—"}
                      </div>
                      {it.description && (
                        <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                          {it.description}
                        </div>
                      )}
                    </div>
                    {canRemove && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-11 w-11 p-0 text-destructive hover:text-destructive shrink-0"
                        onClick={() => openRemove(it)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Unit Rate</div>
                      {isApproved ? (
                        <div className="text-xs tabular-nums mt-1">
                          {it.unit_rate != null ? GBP.format(Number(it.unit_rate)) : "—"}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-11 text-xs mt-1"
                          value={it.unit_rate ?? ""}
                          onChange={(e) => updateItem(it.id, "unit_rate", e.target.value)}
                        />
                      )}
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Quantity</div>
                      {isApproved ? (
                        <div className="text-xs tabular-nums mt-1">
                          {it.claimed_qty != null ? String(it.claimed_qty) : "—"}
                        </div>
                      ) : (
                        <Input
                          type="number"
                          inputMode="decimal"
                          className="h-11 text-xs mt-1"
                          value={it.claimed_qty ?? ""}
                          onChange={(e) => updateItem(it.id, "claimed_qty", e.target.value)}
                        />
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Value</div>
                      <div className="text-sm font-semibold text-primary tabular-nums mt-1">
                        {it.claimed_value != null ? GBP.format(Number(it.claimed_value)) : "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="rounded-md border border-border bg-secondary/30 p-3 flex justify-between items-center">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</span>
                <span className="text-sm font-semibold text-primary tabular-nums">{GBP.format(thisClaim)}</span>
              </div>
            </>
          )}
        </div>

      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Previously Claimed" value={GBP.format(previouslyClaimed)} />
        <SummaryCard label="This Claim" value={GBP.format(thisClaim)} />
        <SummaryCard label="Total Claimed" value={GBP.format(totalClaimed)} />
        <SummaryCard label="Remaining Value" value={GBP.format(remaining)} />
      </section>

      <div className="pt-2 space-y-2">
        <Button
          className="w-full"
          size="lg"
          onClick={finalise}
          disabled={finalising || isApproved || editMode}
        >
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {isApproved ? "Valuation Finalised" : finalising ? "Finalising…" : "Finalise Valuation"}
        </Button>
        {isApproved && (
          <Button
            className="w-full"
            size="lg"
            variant="secondary"
            onClick={() => navigate({ to: "/valuations/$id/invoice", params: { id: valuation.id } })}
          >
            <FileText className="w-4 h-4 mr-2" />
            Generate Invoice
          </Button>
        )}
      </div>

      <Dialog open={!!removing} onOpenChange={(o) => !o && closeRemove()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove line item</DialogTitle>
            <DialogDescription>
              Provide a rejection reason. The scope item will return to <strong>In Progress</strong> and a history entry will be recorded.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground rounded bg-muted/40 border border-border p-2">
              {removing?.work_package_name && (
                <div className="font-medium text-foreground">{removing.work_package_name}</div>
              )}
              <div>{removing?.description ?? "—"}</div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Rejection reason *</label>
              <div className="grid grid-cols-1 gap-1.5">
                {REJECTION_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
                    className={`text-left text-xs px-3 py-2 rounded-md border transition-colors ${
                      reason === r
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Notes (optional)</label>
              <Textarea
                value={reasonNotes}
                onChange={(e) => setReasonNotes(e.target.value.slice(0, 500))}
                placeholder="Additional context…"
                className="text-xs min-h-[60px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={closeRemove} disabled={confirmingRemove}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmRemove}
              disabled={!reason || confirmingRemove}
            >
              {confirmingRemove ? "Removing…" : "Confirm removal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
