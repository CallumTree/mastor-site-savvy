import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Sparkles, Eye, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { startParseJob, getParseJob } from "@/lib/parseDocument.functions";
import { LoadingDot } from "@/components/ui/loading-dot";
import { EmptyState } from "@/components/ui/empty-state";

type Doc = {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  size_bytes: number | null;
  parsed_at: string | null;
  uploaded_at: string;
  parse_status?: "idle" | "queued" | "running" | "succeeded" | "failed" | null;
  last_parse_job_id?: string | null;
};

type ScopeStatus = "Not Started" | "In Progress" | "Claimed" | "Disputed" | "Invoiced";

type ScopeElement = {
  id: string;
  project_id: string;
  document_id: string | null;
  element_type: "task" | "material" | "claimable_element" | "labour_activity" | "procurement_item";
  title: string;
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unit_rate?: number | null;
  source_reference: string | null;
  confidence: "high" | "medium" | "low";
  location?: string | null;
  status?: ScopeStatus | null;
  claimed_in_valuation?: { id?: string; number?: string } | null;
  invoiced_in?: { id?: string; number?: string } | null;
};


const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";
const SUPPORTED_EXTS = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt"] as const;
const ACCEPTED_LABEL = "PDF, Word (.doc, .docx), Excel (.xls, .xlsx), CSV, or TXT";

const TYPE_LABEL: Record<ScopeElement["element_type"], string> = {
  task: "Tasks",
  labour_activity: "Labour Activities",
  material: "Materials",
  claimable_element: "Claimable Elements",
  procurement_item: "Procurement Items",
};

const TYPE_ORDER: ScopeElement["element_type"][] = [
  "task",
  "labour_activity",
  "material",
  "claimable_element",
  "procurement_item",
];

export function ProjectDocumentsTab({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [elements, setElements] = useState<ScopeElement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [parsingId, setParsingId] = useState<string | null>(null);
  const [filterDocId, setFilterDocId] = useState<string | "all">("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const startFn = useServerFn(startParseJob);
  const getFn = useServerFn(getParseJob);

  const load = async () => {
    setLoading(true);
    const [{ data: d, error: de }, { data: e, error: ee }] = await Promise.all([
      (supabase as any).from("project_documents").select("*").eq("project_id", projectId).order("uploaded_at", { ascending: false }),
      (supabase as any).from("scope_elements").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
    ]);
    if (de) toast.error(de.message);
    if (ee) toast.error(ee.message);
    setDocs((d ?? []) as Doc[]);
    setElements((e ?? []) as ScopeElement[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  // Resume polling for any in-flight parse jobs after page load / navigation.
  useEffect(() => {
    const active = docs.filter((d) => (d.parse_status === "queued" || d.parse_status === "running") && d.last_parse_job_id);
    if (active.length === 0) return;
    let cancelled = false;
    (async () => {
      const deadline = Date.now() + 5 * 60 * 1000;
      while (!cancelled && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        if (cancelled) return;
        let stillActive = false;
        for (const d of active) {
          const poll: any = await getFn({ data: { jobId: d.last_parse_job_id as string } });
          if (poll?.ok && (poll.job.status === "queued" || poll.job.status === "running")) {
            stillActive = true;
          }
        }
        if (!stillActive) {
          load();
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs.map((d) => `${d.id}:${d.parse_status}`).join(",")]);


  const onPickFile = () => fileRef.current?.click();

  const onUpload = async (file: File) => {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!SUPPORTED_EXTS.includes(ext as any)) {
      toast.error(`Unsupported file type ".${ext}". Accepted formats: ${ACCEPTED_LABEL}.`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File exceeds 20MB limit");
      return;
    }
    setUploading(true);
    try {
      const path = `${projectId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("project-documents").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("project_documents").insert({
        project_id: projectId,
        file_name: file.name,
        file_type: ext,
        file_path: path,
        size_bytes: file.size,
      });
      if (insErr) throw insErr;
      toast.success("Uploaded");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onView = async (doc: Doc) => {
    const { data, error } = await supabase.storage.from("project-documents").createSignedUrl(doc.file_path, 60 * 10);
    if (error) return toast.error(error.message);
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const onDelete = async (doc: Doc) => {
    if (!confirm(`Delete "${doc.file_name}"? Parsed scope from this document will also be removed.`)) return;
    await supabase.storage.from("project-documents").remove([doc.file_path]);
    const { error } = await (supabase as any).from("project_documents").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const onParse = async (doc: Doc) => {
    setParsingId(doc.id);
    const startedAt = Date.now();
    console.log("[onParse] start", doc.file_name);
    try {
      const { data: signed, error: signErr } = await supabase.storage
        .from("project-documents")
        .createSignedUrl(doc.file_path, 120);
      if (signErr) throw signErr;
      const resp = await fetch(signed.signedUrl);
      const buf = await resp.arrayBuffer();
      const text = await extractText(buf, doc.file_type);
      console.log("[onParse] extracted text length:", text.length);
      if (!text.trim()) {
        toast.error("Could not extract any text from this document.");
        return;
      }

      console.log("[onParse] enqueuing parse job...");
      const start: any = await startFn({ data: { documentId: doc.id, documentText: text } });
      if (!start?.ok) {
        toast.error(start?.error ? `Parse failed: ${start.error}` : "Parse failed to enqueue");
        return;
      }
      const jobId = start.jobId as string;
      console.log("[onParse] job enqueued", jobId, "— polling...");

      // Poll every 4s until terminal.
      const deadline = Date.now() + 5 * 60 * 1000; // 5 min cap
      let job: any = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        const poll: any = await getFn({ data: { jobId } });
        if (!poll?.ok) {
          toast.error(poll?.error || "Could not read job status");
          return;
        }
        job = poll.job;
        console.log("[onParse] poll status:", job.status);
        if (job.status === "succeeded" || job.status === "failed") break;
      }
      if (!job || (job.status !== "succeeded" && job.status !== "failed")) {
        toast.error("Parse is taking longer than expected. It will continue in the background — refresh later.");
        return;
      }
      if (job.status === "failed") {
        toast.error(job.error ? `Parse failed: ${job.error}` : "Parse failed");
        return;
      }
      console.log("[onParse] succeeded in", Date.now() - startedAt, "ms");
      const result = { parsed: job.result };



      const items: any[] = result.parsed?.items ?? [];
      const rows = items.map((item) => ({
        project_id: projectId,
        document_id: doc.id,
        element_type: "claimable_element",
        title: item.description,
        description: item.comments || null,
        quantity: item.quantity,
        unit: item.unit || null,
        unit_rate: item.rate,
        total_cost: item.cost,
        source_reference: item.code || null,
        location: item.location || null,
        confidence: "high",
      }));

      // Replace previous parse for this document
      await (supabase as any).from("scope_elements").delete().eq("document_id", doc.id);
      if (rows.length) {
        const { error: insErr } = await (supabase as any).from("scope_elements").insert(rows);
        if (insErr) throw insErr;
      }

      await (supabase as any)
        .from("project_documents")
        .update({ parsed_at: new Date().toISOString() })
        .eq("id", doc.id);

      toast.success(`Parsed ${rows.length} item${rows.length === 1 ? "" : "s"}`);
      setFilterDocId(doc.id);
      load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Parse failed");
    } finally {
      setParsingId(null);
    }
  };


  const filteredElements = filterDocId === "all" ? elements : elements.filter((e) => e.document_id === filterDocId);

  return (
    <div className="space-y-6">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
      />

      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          Upload BoQs, schedules, specs, tenders or scope documents. Mastor will read and break them down.
        </p>
        <Button size="sm" onClick={onPickFile} disabled={uploading}>
          {uploading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
          Upload
        </Button>
      </div>

      {loading ? (
        <LoadingDot label="Loading" />
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description={`Accepted formats: ${ACCEPTED_LABEL}.`}
          actionLabel="Upload a document"
          onAction={onPickFile}
        />
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="p-4 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">{d.file_name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {d.file_type.toUpperCase()} · {new Date(d.uploaded_at).toLocaleDateString()}
                      {d.parsed_at && <span className="ml-2 text-gold">Parsed</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => onView(d)} title="View">
                    <Eye className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onParse(d)} disabled={parsingId === d.id}>
                    {parsingId === d.id ? (
                      <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3 mr-1" />
                    )}
                    Parse Scope
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDelete(d)}
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ParsedScopeView
        elements={filteredElements}
        docs={docs}
        filterDocId={filterDocId}
        setFilterDocId={setFilterDocId}
      />
    </div>
  );
}

function ParsedScopeView({
  elements,
  docs,
  filterDocId,
  setFilterDocId,
}: {
  elements: ScopeElement[];
  docs: Doc[];
  filterDocId: string;
  setFilterDocId: (v: string | "all") => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (elements.length === 0 && docs.length === 0) return null;

  return (
    <section className="space-y-3 divider-heavy pt-4">
      <div className="flex justify-between items-center gap-2">
        <h3 className="label-mono">Parsed Scope</h3>
        {docs.length > 0 && (
          <select
            className="h-8 px-2 rounded-lg border border-input bg-card text-xs shadow-sm"
            value={filterDocId}
            onChange={(e) => setFilterDocId(e.target.value as any)}
          >
            <option value="all">All documents</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.file_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {elements.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nothing parsed yet"
          description='Upload a document above and click "Parse Scope" to break it down.'
        />
      ) : (
        TYPE_ORDER.map((t) => {
          const items = elements.filter((e) => e.element_type === t);
          if (items.length === 0) return null;
          const isOpen = open[t] !== false;
          return (
            <div key={t} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <button
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-secondary transition-colors"
                onClick={() => setOpen((o) => ({ ...o, [t]: !isOpen }))}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-gold">
                  {TYPE_LABEL[t]} <span className="text-muted-foreground font-normal ml-1">({items.length})</span>
                </span>
                {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {isOpen && (
                <div className="border-t border-border divide-y divide-border">
                  {items.map((it) => (
                    <ScopeElementRow key={it.id} item={it} docs={docs} />
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}


function ClaimedInBadge({ item }: { item: ScopeElement }) {
  const number = item.claimed_in_valuation?.number;
  if (!number) return null;
  return (
    <span className="shrink-0 h-fit text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-gold/40 bg-gold/10 text-gold">
      {number}
    </span>
  );
}

function ScopeElementRow({ item, docs }: { item: ScopeElement; docs: Doc[] }) {
  const docName = docs.find((d) => d.id === item.document_id)?.file_name;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [quantity, setQuantity] = useState<string>(item.quantity != null ? String(item.quantity) : "");
  const [unit, setUnit] = useState(item.unit ?? "");
  const [unitRate, setUnitRate] = useState<string>(item.unit_rate != null ? String(item.unit_rate) : "");
  const [saving, setSaving] = useState(false);
  const [deleted, setDeleted] = useState(false);

  if (deleted) return null;

  const save = async () => {
    setSaving(true);
    const patch = {
      title: title.trim() || item.title,
      description: description.trim() || null,
      quantity: quantity === "" ? null : Number(quantity),
      unit: unit.trim() || null,
      unit_rate: unitRate === "" ? null : Number(unitRate),
    };
    const total =
      patch.quantity != null && patch.unit_rate != null ? patch.quantity * patch.unit_rate : null;
    const { error } = await (supabase as any)
      .from("scope_elements")
      .update({ ...patch, total_cost: total })
      .eq("id", item.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    // Mutate in place so the parent list reflects the change without a full reload.
    item.title = patch.title;
    item.description = patch.description;
    item.quantity = patch.quantity;
    item.unit = patch.unit;
    item.unit_rate = patch.unit_rate;
    toast.success("Scope item updated");
    setEditing(false);
  };

  const remove = async () => {
    if (!confirm(`Delete "${item.title}"?`)) return;
    // Refuse if referenced by an invoiced valuation_item.
    const { data: refs } = await (supabase as any)
      .from("valuation_items")
      .select("valuation_id")
      .eq("scope_element_id", item.id);
    const valuationIds = Array.from(new Set(((refs ?? []) as any[]).map((r) => r.valuation_id).filter(Boolean)));
    if (valuationIds.length > 0) {
      const { data: invs } = await supabase
        .from("invoices")
        .select("valuation_id")
        .in("valuation_id", valuationIds);
      if ((invs ?? []).length > 0) {
        toast.error("This item has been claimed in an invoiced valuation and cannot be deleted.");
        return;
      }
      // Detach from any open (non-invoiced) valuation items first.
      await (supabase as any)
        .from("valuation_items")
        .delete()
        .eq("scope_element_id", item.id);
    }
    const { error } = await (supabase as any).from("scope_elements").delete().eq("id", item.id);
    if (error) return toast.error(error.message);
    setDeleted(true);
    toast.success("Scope item deleted");
  };

  if (editing) {
    return (
      <div className="px-4 py-3 bg-secondary/50 space-y-2">
        <input
          className="w-full h-9 px-3 text-sm rounded-lg border border-input bg-card shadow-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
        />
        <textarea
          className="w-full px-3 py-2 text-xs rounded-lg border border-input bg-card shadow-sm min-h-[50px]"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
        />
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Qty</span>
            <input
              type="number"
              inputMode="decimal"
              className="w-full h-10 px-3 text-sm rounded-lg border border-input bg-card shadow-sm"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Unit</span>
            <input
              className="w-full h-10 px-3 text-sm rounded-lg border border-input bg-card shadow-sm"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. SM"
            />
          </label>
          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">Rate (£)</span>
            <input
              type="number"
              inputMode="decimal"
              className="w-full h-10 px-3 text-sm rounded-lg border border-input bg-card shadow-sm"
              value={unitRate}
              onChange={(e) => setUnitRate(e.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 text-[11px]" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    );
  }

  const hasQty = item.quantity != null && item.quantity > 0;
  const hasRate = item.unit_rate != null;
  const total = hasQty && hasRate ? Number(item.quantity) * Number(item.unit_rate) : null;

  return (
    <div className="px-4 py-3 group hover:bg-secondary/50 transition-colors">
      <div className="flex justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground">{item.title}</div>
          {item.description && (
            <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
          )}

          {(hasQty || hasRate) && (
            <div className="mt-2 flex items-center gap-4 rounded-lg bg-secondary/70 px-3 py-2">
              {hasQty && (
                <div>
                  <div className="label-mono">Qty</div>
                  <div className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
                    {item.quantity} {item.unit || ""}
                  </div>
                </div>
              )}
              {hasRate && (
                <div>
                  <div className="label-mono">Rate</div>
                  <div className="text-sm font-semibold text-foreground tabular-nums mt-0.5">
                    £{Number(item.unit_rate).toLocaleString()}
                  </div>
                </div>
              )}
              {total != null && (
                <div className="ml-auto text-right">
                  <div className="label-mono">Total</div>
                  <div className="text-sm font-bold text-gold tabular-nums mt-0.5">
                    £{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              )}
            </div>
          )}

          {(item.location || item.source_reference || docName) && (
            <div className="text-[10px] text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
              {item.location && <span>{item.location}</span>}
              {item.source_reference && <span>Ref: {item.source_reference}</span>}
              {docName && <span className="truncate">Doc: {docName}</span>}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ClaimedInBadge item={item} />
          <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)} title="Edit">
              <FileText className="w-3 h-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={remove} title="Delete">
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function extractText(buf: ArrayBuffer, ext: string): Promise<string> {
  const e = ext.toLowerCase();
  if (e === "txt" || e === "csv") {
    return new TextDecoder().decode(buf);
  }
  if (e === "docx") {
    const mammoth = await import("mammoth/mammoth.browser");
    const { value } = await (mammoth as any).extractRawText({ arrayBuffer: buf });
    return value || "";
  }
  if (e === "doc") {
    // Legacy binary .doc isn't supported by mammoth. Try as a last resort, otherwise advise conversion.
    try {
      const mammoth = await import("mammoth/mammoth.browser");
      const { value } = await (mammoth as any).extractRawText({ arrayBuffer: buf });
      if (value && value.trim()) return value;
    } catch {}
    throw new Error("Legacy .doc files can't be read in the browser. Please re-save the file as .docx and upload again.");
  }
  if (e === "xlsx" || e === "xls") {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "array" });
    const parts: string[] = [];
    for (const name of wb.SheetNames) {
      parts.push(`# Sheet: ${name}`);
      parts.push(XLSX.utils.sheet_to_csv(wb.Sheets[name]));
    }
    return parts.join("\n\n");
  }
  if (e === "pdf") {
    const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const loadingTask = pdfjs.getDocument({ data: buf, isEvalSupported: false });
    const pdf = await loadingTask.promise;
    const out: string[] = [];
    const maxPages = Math.min(pdf.numPages, 100);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strs = content.items.map((it: any) => it.str);
      out.push(strs.join(" "));
    }
    return out.join("\n\n");
  }
  return "";
}

