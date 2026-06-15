import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { Check, Trash2, FileEdit, ClipboardCheck, FileDown, Loader2 } from "lucide-react";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";
import jsPDF from "jspdf";
import { getCurrentProfile, getLogoDataUrl } from "@/lib/profile";

type Variation = {
  id: string;
  project_id: string;
  description: string | null;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  status: string;
  created_at: string;
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

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("variations")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) showError("Variations", error);
    setItems((data ?? []) as Variation[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (v: Variation) => {
    setBusyId(v.id);
    const { error: cErr } = await supabase.from("claim_opportunities").insert({
      project_id: projectId,
      work_package_name: "Variation",
      finding_text: v.description ?? "",
      status: "Pending Review",
    });
    if (cErr) {
      setBusyId(null);
      return showError("Variations", cErr);
    }
    const { error: uErr } = await supabase
      .from("variations")
      .update({ status: "Approved" })
      .eq("id", v.id);
    setBusyId(null);
    if (uErr) return showError("Variations", uErr);
    toast.success("Variation approved — moved to Ready To Claim");
    load();
  };

  const reject = async (id: string) => {
    const { error } = await supabase.from("variations").update({ status: "Rejected" }).eq("id", id);
    if (error) return showError("Variations", error);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this variation?")) return;
    const { error } = await supabase.from("variations").delete().eq("id", id);
    if (error) return showError("Variations", error);
    load();
  };

  const generateEvidencePack = async () => {
    setGenerating(true);
    try {
      // Approved variations, oldest first so numbering reads naturally
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

      // Header — matches invoice style
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
        const variationPhotos = photos.filter((p) => p.linked_variation_id === v.id);
        const sourceWalk = variationPhotos.length
          ? walkMap.get(variationPhotos[0].site_walk_id)
          : null;

        ensureSpace(40);

        // Section heading bar
        doc.setFillColor(40, 40, 40);
        doc.rect(margin, y, pageWidth - margin * 2, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.text(`${number}  ·  ${v.status.toUpperCase()}`, margin + 2, y + 5.6);
        doc.setTextColor(0, 0, 0);
        y += 14;

        // Description
        doc.setFontSize(10);
        const desc = doc.splitTextToSize(v.description ?? "—", pageWidth - margin * 2);
        ensureSpace(desc.length * 5 + 10);
        doc.text(desc, margin, y);
        y += desc.length * 5 + 4;

        // Meta lines
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        const dateIdentified = new Date(v.created_at).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        });
        doc.text(`Date identified: ${dateIdentified}`, margin, y);
        y += 5;
        doc.text(
          `Source site walk: ${sourceWalk ? (sourceWalk.title ?? `Walk ${new Date(sourceWalk.created_at).toLocaleDateString("en-GB")}`) : "—"}`,
          margin,
          y,
        );
        y += 5;
        doc.text(`Linked photos: ${variationPhotos.length}`, margin, y);
        y += 8;
        doc.setTextColor(0, 0, 0);

        // Photos
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

          // Caption: timestamp + geo
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
          description="Variations are added automatically after you analyse a site walk and approve the findings."
        />
      ) : (
        <div className="space-y-2">
          {items.map((v) => (
            <div key={v.id} className="p-3 rounded-md bg-card border border-border space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground leading-relaxed">{v.description ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {new Date(v.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
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
                      {busyId === v.id ? "Approving…" : "Approve → Ready To Claim"}
                    </Button>
                  </>
                )}
                {v.status === "Approved" && (
                  <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                    <Check className="w-3 h-3" /> In Ready To Claim
                  </span>
                )}
                <Button size="sm" variant="ghost" className="h-7 text-[11px] text-destructive hover:text-destructive" onClick={() => remove(v.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
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
