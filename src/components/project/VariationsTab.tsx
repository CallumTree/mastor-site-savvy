import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { Check, Trash2, FileEdit, ClipboardCheck, FileDown, Loader2, Pencil, Lock } from "lucide-react";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";
import jsPDF from "jspdf";
import { getCurrentProfile, getLogoDataUrl } from "@/lib/profile";
import { getOrCreateOpenValuation, formatValuationNumber } from "@/lib/openValuation";

type Variation = {
  id: string;
  project_id: string;
  description: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  status: string;
  created_at: string;
  client_reference: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Pending: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  Approved: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  Rejected: "bg-slate-500/15 text-slate-700 border-slate-500/30",
};

async function fetchPhotoDataUrl(photoUrl: string, storagePath: string | null) {
  try {
    let url = photoUrl;
    if (storagePath) {
      const { data } = await supabase.storage
        .from("site-walk-photos")
        .createSignedUrl(storagePath, 60 * 10);
      if (data?.signedUrl) url = data.signedUrl;
    }
    const res = await fetch(url);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return { dataUrl, mime: blob.type || "image/jpeg" };
  } catch {
    return null;
  }
}

export function VariationsTab({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Variation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("variations")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) showError("Variations", error);
    const vars = (data ?? []) as Variation[];
    setItems(vars);

    // Determine which variations are locked because their containing valuation has been invoiced.
    if (vars.length > 0) {
      const variationIds = vars.map((v) => v.id);
      const { data: viRows } = await (supabase as any)
        .from("valuation_items")
        .select("variation_id, valuation_id")
        .in("variation_id", variationIds);
      const valuationIds = Array.from(
        new Set(((viRows ?? []) as any[]).map((r) => r.valuation_id).filter(Boolean)),
      );
      let invoicedValuations = new Set<string>();
      if (valuationIds.length > 0) {
        const { data: invs } = await supabase
          .from("invoices")
          .select("valuation_id")
          .in("valuation_id", valuationIds);
        invoicedValuations = new Set((invs ?? []).map((r) => r.valuation_id));
      }
      const locked = new Set<string>();
      for (const row of (viRows ?? []) as any[]) {
        if (row.variation_id && invoicedValuations.has(row.valuation_id)) {
          locked.add(row.variation_id);
        }
      }
      setLockedIds(locked);
    } else {
      setLockedIds(new Set());
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (v: Variation) => {
    setBusyId(v.id);
    try {
      const val = await getOrCreateOpenValuation(projectId);
      const valNumber = formatValuationNumber(val.valuation_number);
      const claimedValue =
        v.qty != null && v.rate != null ? Number(v.qty) * Number(v.rate) : null;

      const refLabel = v.client_reference ? ` [Ref: ${v.client_reference}]` : "";
      const { error: viErr } = await (supabase as any).from("valuation_items").insert({
        valuation_id: val.id,
        work_package_name: "Variation",
        description: (v.description ?? "") + refLabel,
        status: "Draft",
        unit_rate: v.rate,
        claimed_qty: v.qty,
        claimed_value: claimedValue,
        variation_id: v.id,
      });
      if (viErr) throw viErr;

      const { error: uErr } = await supabase
        .from("variations")
        .update({ status: "Approved" })
        .eq("id", v.id);
      if (uErr) throw uErr;

      toast.success(`Variation added to Valuation ${valNumber}`);
      load();
    } catch (e: any) {
      showError("Variations", e);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (id: string) => {
    const { error } = await supabase.from("variations").update({ status: "Rejected" }).eq("id", id);
    if (error) return showError("Variations", error);
    load();
  };

  const remove = async (v: Variation) => {
    if (lockedIds.has(v.id)) {
      toast.error("This variation has been invoiced and cannot be deleted.");
      return;
    }
    if (!confirm("Delete this variation?")) return;
    const { error } = await supabase.from("variations").delete().eq("id", v.id);
    if (error) return showError("Variations", error);
    load();
  };

  const saveEdit = async (patch: Partial<Variation>) => {
    if (!editing) return;
    if (lockedIds.has(editing.id)) {
      toast.error("This variation has been invoiced and cannot be edited.");
      return;
    }
    const { error } = await (supabase as any)
      .from("variations")
      .update({
        description: patch.description ?? null,
        qty: patch.qty ?? null,
        unit: patch.unit ?? null,
        rate: patch.rate ?? null,
        client_reference: patch.client_reference ?? null,
      })
      .eq("id", editing.id);
    if (error) return showError("Variations", error);

    // Mirror edit into any non-invoiced valuation_items rows linked to this variation.
    const newValue =
      patch.qty != null && patch.rate != null ? Number(patch.qty) * Number(patch.rate) : null;
    const refLabel = patch.client_reference ? ` [Ref: ${patch.client_reference}]` : "";
    await (supabase as any)
      .from("valuation_items")
      .update({
        description: (patch.description ?? "") + refLabel,
        unit_rate: patch.rate ?? null,
        claimed_qty: patch.qty ?? null,
        claimed_value: newValue,
      })
      .eq("variation_id", editing.id);

    toast.success("Variation updated");
    setEditing(null);
    load();
  };

  const generateEvidencePack = async () => {
    setGenerating(true);
    try {
      const approvedSorted = items
        .filter((i) => i.status === "Approved")
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

      if (approvedSorted.length === 0) {
        toast.error("No approved variations to compile.");
        return;
      }

      const variationIds = approvedSorted.map((v) => v.id);
      const [profileRes, projectRes, photosRes] = await Promise.all([
        getCurrentProfile(),
        supabase.from("projects").select("name, client_name, client").eq("id", projectId).maybeSingle(),
        (supabase as any)
          .from("site_walk_photos")
          .select("id, site_walk_id, photo_url, storage_path, annotated_photo_url, annotated_storage_path, timestamp_seconds, location_lat, location_lng, transcript_context, linked_variation_id")
          .in("linked_variation_id", variationIds),
      ]);
      const profile = profileRes;
      const project = projectRes.data as { name: string; client_name: string | null; client: string | null } | null;
      const photos = (photosRes.data ?? []) as Array<{
        id: string;
        site_walk_id: string;
        photo_url: string;
        storage_path: string | null;
        annotated_photo_url: string | null;
        annotated_storage_path: string | null;
        timestamp_seconds: number;
        location_lat: number | null;
        location_lng: number | null;
        transcript_context: string | null;
        linked_variation_id: string;
      }>;

      const walkIds = Array.from(new Set(photos.map((p) => p.site_walk_id)));
      const { data: walks } = walkIds.length
        ? await supabase.from("site_walks").select("id, title, created_at").in("id", walkIds)
        : { data: [] as any[] };
      const walkMap = new Map((walks ?? []).map((w: any) => [w.id, w]));

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      const rightX = pageWidth - margin;

      let cursorX = margin;
      if (profile?.company_logo_url) {
        const logo = await getLogoDataUrl(profile.company_logo_url);
        if (logo) {
          const fmt = logo.mime.includes("jpeg") ? "JPEG" : "PNG";
          try {
            doc.addImage(logo.dataUrl, fmt, margin, 12, 18, 18);
            cursorX = margin + 22;
          } catch { /* ignore */ }
        }
      }
      if (profile?.company_name) {
        doc.setFontSize(14);
        doc.text(profile.company_name, cursorX, 22);
      }

      doc.setFontSize(20);
      doc.text("EVIDENCE PACK", rightX, 20, { align: "right" });
      doc.setFontSize(10);
      doc.text(`Date: ${new Date().toLocaleDateString("en-GB")}`, rightX, 28, { align: "right" });
      doc.text(`Variations: ${approvedSorted.length}`, rightX, 34, { align: "right" });

      doc.setFontSize(12);
      doc.text(project?.name ?? "Project", margin, 48);
      doc.setFontSize(10);
      doc.text(`Client: ${project?.client_name ?? project?.client ?? "—"}`, margin, 54);
      doc.text("Dispute-proof record of every instructed extra.", margin, 60);

      let y = 72;

      const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin + 6;
        }
      };

      for (let i = 0; i < approvedSorted.length; i++) {
        const v = approvedSorted[i];
        const number = `V-${String(i + 1).padStart(2, "0")}`;
        const refSuffix = v.client_reference ? `  ·  CLIENT REF: ${v.client_reference}` : "";
        const variationPhotos = photos.filter((p) => p.linked_variation_id === v.id);
        const sourceWalk = variationPhotos.length
          ? walkMap.get(variationPhotos[0].site_walk_id)
          : null;

        ensureSpace(40);

        doc.setFillColor(40, 40, 40);
        doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.text(`${number}  ·  ${v.status.toUpperCase()}${refSuffix}`, margin + 2, y + 5.6);
        doc.setTextColor(0, 0, 0);
        y += 14;

        doc.setFontSize(10);
        const desc = doc.splitTextToSize(v.description ?? "—", pageWidth - margin * 2);
        ensureSpace(desc.length * 5 + 10);
        doc.text(desc, margin, y);
        y += desc.length * 5 + 4;

        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        const dateIdentified = new Date(v.created_at).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        });
        doc.text(`Date identified: ${dateIdentified}`, margin, y);
        y += 5;
        doc.text(
          `Source site diary: ${sourceWalk ? (sourceWalk.title ?? `Entry ${new Date(sourceWalk.created_at).toLocaleDateString("en-GB")}`) : "—"}`,
          margin,
          y,
        );
        y += 5;
        doc.text(`Linked photos: ${variationPhotos.length}`, margin, y);
        y += 8;
        doc.setTextColor(0, 0, 0);

        const photoW = 56;
        const photoH = 42;
        const gap = 6;
        const captionH = 14;
        let colX = margin;

        for (const p of variationPhotos) {
          ensureSpace(photoH + captionH + 4);
          if (colX + photoW > pageWidth - margin) {
            colX = margin;
            y += photoH + captionH + 4;
            ensureSpace(photoH + captionH + 4);
          }

          const img = await fetchPhotoDataUrl(
            p.annotated_photo_url ?? p.photo_url,
            p.annotated_storage_path ?? p.storage_path,
          );
          if (img) {
            const fmt = img.mime.includes("png") ? "PNG" : "JPEG";
            try {
              doc.addImage(img.dataUrl, fmt, colX, y, photoW, photoH);
            } catch {
              doc.setDrawColor(200);
              doc.rect(colX, y, photoW, photoH);
            }
          } else {
            doc.setDrawColor(200);
            doc.rect(colX, y, photoW, photoH);
          }

          doc.setFontSize(7);
          doc.setTextColor(90, 90, 90);
          const mm = String(Math.floor(p.timestamp_seconds / 60)).padStart(2, "0");
          const ss = String(p.timestamp_seconds % 60).padStart(2, "0");
          doc.text(`@ ${mm}:${ss}`, colX, y + photoH + 4);
          const geo =
            p.location_lat != null && p.location_lng != null
              ? `${p.location_lat.toFixed(5)}, ${p.location_lng.toFixed(5)}`
              : "No geotag";
          doc.text(geo, colX, y + photoH + 9);
          doc.setTextColor(0, 0, 0);

          colX += photoW + gap;
        }

        if (variationPhotos.length > 0) y += photoH + captionH + 4;
        y += 8;
      }

      doc.save(`evidence-pack-${(project?.name ?? "project").replace(/\s+/g, "-")}.pdf`);
      toast.success(`Evidence pack generated (${approvedSorted.length} variation${approvedSorted.length === 1 ? "" : "s"})`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to generate evidence pack");
    } finally {
      setGenerating(false);
    }
  };

  // Variations are numbered in chronological order (oldest = V-01).
  const sortedAscIds = items.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map((i) => i.id);
  const numberFor = (id: string) => `V-${String(sortedAscIds.indexOf(id) + 1).padStart(2, "0")}`;

  const drafts = items.filter((i) => i.status === "Draft" || i.status === "Pending");
  const approved = items.filter((i) => i.status === "Approved");
  const rejected = items.filter((i) => i.status === "Rejected");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Draft" value={drafts.length} tone="amber" />
        <Stat label="Approved" value={approved.length} tone="emerald" />
        <Stat label="Rejected" value={rejected.length} tone="slate" />
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={generateEvidencePack}
          disabled={generating || approved.length === 0}
          className="gap-1"
        >
          {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
          {generating ? "Generating…" : "Generate Evidence Pack"}
        </Button>
      </div>

      {loading ? (
        <LoadingDot label="Loading" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FileEdit}
          title="No variations yet"
          description="Variations are added automatically after you analyse a site diary entry and approve the findings."
        />
      ) : (
        <div className="space-y-2">
          {items.map((v) => {
            const locked = lockedIds.has(v.id);
            const number = numberFor(v.id);
            const value =
              v.qty != null && v.rate != null ? Number(v.qty) * Number(v.rate) : null;
            return (
              <div key={v.id} className="p-3 rounded-md bg-card border border-border space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">{number}</span>
                      {v.client_reference && (
                        <span className="text-[10px] text-muted-foreground">
                          Client Ref: <span className="text-foreground font-medium">{v.client_reference}</span>
                        </span>
                      )}
                      {locked && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <Lock className="w-3 h-3" /> Invoiced
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-foreground leading-relaxed">{v.description ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                      {v.qty != null && <span>Qty: {v.qty}{v.unit ? ` ${v.unit}` : ""}</span>}
                      {v.rate != null && <span>Rate: £{Number(v.rate).toLocaleString()}</span>}
                      {value != null && <span>Value: £{value.toLocaleString()}</span>}
                      <span>{new Date(v.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-[10px] uppercase tracking-wider shrink-0 ${STATUS_STYLES[v.status] ?? ""}`}>
                    {v.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {(v.status === "Draft" || v.status === "Pending") && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => reject(v.id)}>
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1"
                        disabled={busyId === v.id}
                        onClick={() => approve(v)}
                      >
                        <ClipboardCheck className="w-3 h-3" />
                        {busyId === v.id ? "Adding…" : "Approve → Add to Valuation"}
                      </Button>
                    </>
                  )}
                  {v.status === "Approved" && !locked && (
                    <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                      <Check className="w-3 h-3" /> In open valuation
                    </span>
                  )}
                  {!locked && (
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={() => setEditing(v)}>
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] text-destructive hover:text-destructive disabled:opacity-30"
                    onClick={() => remove(v)}
                    disabled={locked}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditVariationDialog
        variation={editing}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />
    </div>
  );
}

function EditVariationDialog({
  variation,
  onClose,
  onSave,
}: {
  variation: Variation | null;
  onClose: () => void;
  onSave: (patch: Partial<Variation>) => Promise<void>;
}) {
  const [description, setDescription] = useState("");
  const [qty, setQty] = useState<string>("");
  const [unit, setUnit] = useState("");
  const [rate, setRate] = useState<string>("");
  const [ref, setRef] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (variation) {
      setDescription(variation.description ?? "");
      setQty(variation.qty != null ? String(variation.qty) : "");
      setUnit(variation.unit ?? "");
      setRate(variation.rate != null ? String(variation.rate) : "");
      setRef(variation.client_reference ?? "");
    }
  }, [variation]);

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      description: description.trim() || null,
      qty: qty === "" ? null : Number(qty),
      unit: unit.trim() || null,
      rate: rate === "" ? null : Number(rate),
      client_reference: ref.trim() || null,
    });
    setSaving(false);
  };

  return (
    <Dialog open={!!variation} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit variation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[80px] text-sm" />
          </Field>
          <Field label="Client Reference">
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. CC-2451" />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Qty">
              <Input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Unit">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m², hr…" />
            </Field>
            <Field label="Rate (£)">
              <Input type="number" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const toneClass: Record<string, string> = {
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    slate: "text-slate-700",
  };
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${toneClass[tone] ?? "text-primary"}`}>{value}</div>
    </div>
  );
}
