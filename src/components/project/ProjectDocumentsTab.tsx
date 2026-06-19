import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Sparkles, Eye, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { startParseJob, getParseJob } from "@/lib/parseDocument.functions";
import { LoadingDot } from "@/components/ui/loading-dot";

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
  source_reference: string | null;
  confidence: "high" | "medium" | "low";
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
        confidence: "high",
      }));

      // Replace previous parse for this document
      await (supabase as any).from("scope_elements").delete().eq("document_id", doc.id);
      if (rows.length) {
        const { error: insErr } = await (supabase as any).from("scope_elements").insert(rows);
        if (insErr) throw insErr;
      }

      // Mirror to contract_items so claim/valuation pricing has real £ figures.
      const ciRows = items
        .filter((item) => item.description)
        .map((item) => ({
          project_id: projectId,
          code: item.code || null,
          description: item.description,
          total_qty: item.quantity ?? null,
          unit: item.unit || null,
          unit_rate: item.rate ?? null,
        }));
      const codes = ciRows.map((r) => r.code).filter(Boolean) as string[];
      if (codes.length) {
        await (supabase as any)
          .from("contract_items")
          .delete()
          .eq("project_id", projectId)
          .in("code", codes);
      }
      if (ciRows.length) {
        const { error: ciErr } = await (supabase as any).from("contract_items").insert(ciRows);
        if (ciErr) throw ciErr;
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
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No documents uploaded yet. Accepted formats: {ACCEPTED_LABEL}.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="p-3 rounded-md bg-card border border-border">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 shrink-0 text-gold-foreground/70" />
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">{d.file_name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {d.file_type.toUpperCase()} · {new Date(d.uploaded_at).toLocaleDateString()}
                      {d.parsed_at && <span className="ml-2 text-primary">Parsed</span>}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 shrink-0 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => onView(d)}>
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
                  <Button size="sm" variant="ghost" onClick={() => onDelete(d)}>
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
    <section className="space-y-3 pt-4 border-t border-border">
      <div className="flex justify-between items-center gap-2">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Parsed Scope</h3>
        {docs.length > 0 && (
          <select
            className="h-8 px-2 rounded-md border border-input bg-background text-xs"
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
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          Nothing parsed yet. Upload a document and click "Parse Scope".
        </div>
      ) : (
        TYPE_ORDER.map((t) => {
          const items = elements.filter((e) => e.element_type === t);
          if (items.length === 0) return null;
          const isOpen = open[t] !== false;
          return (
            <div key={t} className="rounded-md bg-card border border-border">
              <button
                className="w-full px-3 py-2 flex items-center justify-between text-left"
                onClick={() => setOpen((o) => ({ ...o, [t]: !isOpen }))}
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">
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

function ScopeStatusBadge({ item }: { item: ScopeElement }) {
  const status = (item.status ?? "Not Started") as ScopeStatus;
  const styles: Record<ScopeStatus, string> = {
    "Not Started": "bg-muted text-muted-foreground border-border",
    "In Progress": "bg-blue-500/15 text-blue-600 border-blue-500/30",
    Claimed: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    Disputed: "bg-red-500/15 text-red-600 border-red-500/30",
    Invoiced: "bg-green-500/15 text-green-600 border-green-500/30",
  };
  const ref =
    status === "Invoiced"
      ? item.invoiced_in?.number
      : status === "Claimed"
        ? item.claimed_in_valuation?.number
        : null;
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${styles[status]}`}
      >
        {status}
      </span>
      {ref && (
        <span className="text-[10px] text-muted-foreground font-medium">{ref}</span>
      )}
    </div>
  );
}

function ScopeElementRow({ item, docs }: { item: ScopeElement; docs: Doc[] }) {
  const docName = docs.find((d) => d.id === item.document_id)?.file_name;
  return (
    <div className="px-3 py-2">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-foreground">{item.title}</div>
          {item.description && (
            <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
          )}
          <div className="text-[10px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {item.quantity != null && item.quantity > 0 && (
              <span>
                Qty: {item.quantity} {item.unit || ""}
              </span>
            )}
            {item.source_reference && <span>Ref: {item.source_reference}</span>}
            {docName && <span>Doc: {docName}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ScopeStatusBadge item={item} />
          <ConfidenceBadge value={item.confidence} />
        </div>
      </div>
    </div>
  );
}

function ConfidenceBadge({ value }: { value: "high" | "medium" | "low" }) {
  const styles: Record<string, string> = {
    high: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    medium: "bg-amber-500/15 text-amber-600 border-amber-500/30",
    low: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  };
  return (
    <span className={`shrink-0 h-fit text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${styles[value]}`}>
      {value}
    </span>
  );
}

const CONF_SCORE: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };

type LearnCtx = { project_id: string; document_id: string; document_name: string };

async function generateProcurementSuggestions(parsed: Record<string, any[]>, ctx: LearnCtx): Promise<number> {
  const materials = (parsed.materials ?? []).filter((m) => String(m?.title ?? "").trim());
  if (materials.length === 0) return 0;

  // Pull existing suggestions for this document to avoid duplicates on re-parse
  const { data: existing } = await (supabase as any)
    .from("procurement_register")
    .select("id, material_name, source_scope_reference")
    .eq("project_id", ctx.project_id)
    .eq("source_document", ctx.document_name);
  const seen = new Set(
    ((existing ?? []) as any[]).map(
      (r) => `${String(r.material_name).toLowerCase()}|${String(r.source_scope_reference ?? "").toLowerCase()}`
    )
  );

  const rows: any[] = [];
  for (const m of materials) {
    const name = String(m.title).trim().slice(0, 255);
    const ref = String(m.source_reference ?? "").trim().slice(0, 200);
    const key = `${name.toLowerCase()}|${ref.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      project_id: ctx.project_id,
      material_name: name,
      quantity: typeof m.quantity === "number" && m.quantity > 0 ? m.quantity : null,
      unit: m.unit ? String(m.unit).slice(0, 32) : null,
      trade: m.trade ? String(m.trade).slice(0, 64) : inferTradeFromMaterial(name),
      source_document: ctx.document_name,
      source_scope_reference: ref || null,
      source_document_id: ctx.document_id,
      confidence_score: CONF_SCORE[m.confidence ?? "medium"] ?? 0.5,
      status: "Suggested",
    });
  }

  if (rows.length === 0) return 0;
  const { error } = await (supabase as any).from("procurement_register").insert(rows);
  if (error) {
    console.warn("procurement insert failed", error.message);
    return 0;
  }
  return rows.length;
}

function inferTradeFromMaterial(name: string): string | null {
  const n = name.toLowerCase();
  if (/plasterboard|skim|plaster|board|tape|joint compound/.test(n)) return "Plastering";
  if (/timber|stud|cls|joist|batten|ply|osb|mdf|skirting|architrave|kitchen|door/.test(n)) return "Joinery";
  if (/tile|grout|adhesive|bath|shower|basin|wc|toilet/.test(n)) return "Bathrooms";
  if (/paint|primer|undercoat|emulsion|filler|sandpaper/.test(n)) return "Painting";
  if (/cable|socket|switch|consumer unit|conduit|lighting|spotlight/.test(n)) return "Electrical";
  if (/pipe|copper|fitting|valve|boiler|radiator|cylinder|waste|soil/.test(n)) return "Plumbing";
  if (/concrete|cement|sand|aggregate|rebar|membrane|dpc|dpm|hardcore/.test(n)) return "Groundworks";
  if (/slate|tile felt|ridge|underlay|lead flashing|guttering|fascia|soffit/.test(n)) return "Roofing";
  if (/insulation|rockwool|celotex|kingspan|pir/.test(n)) return "Insulation";
  return null;
}



async function learnFromParse(parsed: Record<string, any[]>, ctx: LearnCtx) {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) return;

  const taskByName: Record<string, string> = {};
  const matByName: Record<string, string> = {};
  const claimByName: Record<string, string> = {};
  const activityByName: Record<string, string> = {};

  await upsertLibrary({
    table: "tasks_library",
    nameCol: "task_name",
    items: (parsed.tasks ?? []).map((t) => ({
      name: t.title,
      description: t.description,
      trade: t.trade,
      procurement_package: t.procurement_package,
      source_reference: t.source_reference,
      confidence: t.confidence,
    })),
    user_id,
    ctx,
    cache: taskByName,
  });

  await upsertLibrary({
    table: "materials_library",
    nameCol: "material_name",
    items: (parsed.materials ?? []).map((m) => ({
      name: m.title,
      description: m.description,
      trade: m.trade,
      unit_type: m.unit,
      quantity: m.quantity,
      source_reference: m.source_reference,
      confidence: m.confidence,
    })),
    user_id,
    ctx,
    cache: matByName,
  });

  await upsertLibrary({
    table: "claimable_elements_library",
    nameCol: "element_name",
    items: (parsed.claimable_elements ?? []).map((c) => ({
      name: c.title,
      description: c.description,
      trade: c.trade,
      source_reference: c.source_reference,
      confidence: c.confidence,
    })),
    user_id,
    ctx,
    cache: claimByName,
  });

  await upsertLibrary({
    table: "labour_activities_library",
    nameCol: "activity_name",
    items: (parsed.labour_activities ?? []).map((a) => ({
      name: a.title,
      description: a.description,
      trade: a.trade,
      source_reference: a.source_reference,
      confidence: a.confidence,
    })),
    user_id,
    ctx,
    cache: activityByName,
  });

  // Build the knowledge graph: task <-> materials / claimable / labour activities
  for (const t of parsed.tasks ?? []) {
    const taskName = String(t?.title ?? "").trim().toLowerCase();
    const taskId = taskByName[taskName];
    if (!taskId) continue;

    for (const mn of (t.related_materials ?? []) as string[]) {
      const id = matByName[String(mn ?? "").trim().toLowerCase()];
      if (!id) continue;
      await (supabase as any)
        .from("task_material_mappings")
        .upsert(
          { user_id, task_id: taskId, material_id: id, confidence_score: CONF_SCORE[t.confidence ?? "medium"] ?? 0.5 },
          { onConflict: "user_id,task_id,material_id" }
        );
    }

    for (const cn of (t.related_claimable_elements ?? []) as string[]) {
      const id = claimByName[String(cn ?? "").trim().toLowerCase()];
      if (!id) continue;
      await (supabase as any)
        .from("task_claimable_mappings")
        .upsert(
          { user_id, task_id: taskId, claimable_id: id, confidence_score: CONF_SCORE[t.confidence ?? "medium"] ?? 0.5 },
          { onConflict: "user_id,task_id,claimable_id" }
        );
    }

    for (const an of (t.related_labour_activities ?? []) as string[]) {
      const id = activityByName[String(an ?? "").trim().toLowerCase()];
      if (!id) continue;
      await (supabase as any).from("labour_activities_library").update({ task_id: taskId }).eq("id", id);
    }
  }

  // Persist Work Packages and their links
  await persistWorkPackages(parsed, ctx, { taskByName, matByName, claimByName, activityByName });

  // Detect duplicate-name suggestions (simple alias heuristic) for materials
  await detectMergeSuggestions(user_id, "material", "materials_library", "material_name");
  await detectMergeSuggestions(user_id, "task", "tasks_library", "task_name");
}

async function persistWorkPackages(
  parsed: Record<string, any[]>,
  ctx: LearnCtx,
  caches: {
    taskByName: Record<string, string>;
    matByName: Record<string, string>;
    claimByName: Record<string, string>;
    activityByName: Record<string, string>;
  }
) {
  const packages = (parsed.work_packages ?? []).filter((p) => String(p?.package_name ?? "").trim());
  if (packages.length === 0) return;

  // Pull existing for this project so we upsert by package_name
  const { data: existing } = await (supabase as any)
    .from("work_packages")
    .select("id, package_name")
    .eq("project_id", ctx.project_id);
  const byName: Record<string, string> = {};
  for (const r of (existing ?? []) as any[]) byName[String(r.package_name).toLowerCase().trim()] = r.id;

  for (const pkg of packages) {
    const name = String(pkg.package_name).trim().slice(0, 255);
    const key = name.toLowerCase();
    const conf = CONF_SCORE[pkg.confidence ?? "medium"] ?? 0.5;
    let wpId = byName[key];

    if (!wpId) {
      const { data: created, error } = await (supabase as any)
        .from("work_packages")
        .insert({
          project_id: ctx.project_id,
          package_name: name,
          trade: pkg.trade ? String(pkg.trade).slice(0, 64) : null,
          description: pkg.description ? String(pkg.description).slice(0, 2000) : null,
          confidence_score: conf,
          status: "Identified",
          source_documents: [{ document_id: ctx.document_id, document_name: ctx.document_name }],
        })
        .select("id")
        .maybeSingle();
      if (error) {
        console.warn("work_package insert failed", name, error.message);
        continue;
      }
      wpId = created?.id;
      if (wpId) byName[key] = wpId;
    } else {
      // Merge source documents and bump confidence
      const { data: cur } = await (supabase as any)
        .from("work_packages")
        .select("source_documents, confidence_score, trade, description")
        .eq("id", wpId)
        .maybeSingle();
      const sources = Array.isArray(cur?.source_documents) ? cur.source_documents : [];
      const hasDoc = sources.some((s: any) => s?.document_id === ctx.document_id);
      const update: any = {};
      if (!hasDoc) update.source_documents = [...sources, { document_id: ctx.document_id, document_name: ctx.document_name }];
      if (conf > Number(cur?.confidence_score ?? 0)) update.confidence_score = conf;
      if (pkg.trade && !cur?.trade) update.trade = String(pkg.trade).slice(0, 64);
      if (pkg.description && !cur?.description) update.description = String(pkg.description).slice(0, 2000);
      if (Object.keys(update).length) await (supabase as any).from("work_packages").update(update).eq("id", wpId);
    }
    if (!wpId) continue;

    const linkPairs: Array<[string, string, Record<string, string>, string]> = [
      ["work_package_tasks", "task_id", caches.taskByName, "related_tasks"],
      ["work_package_materials", "material_id", caches.matByName, "related_materials"],
      ["work_package_activities", "activity_id", caches.activityByName, "related_labour_activities"],
      ["work_package_claimables", "claimable_id", caches.claimByName, "related_claimable_elements"],
    ];
    for (const [table, col, cache, field] of linkPairs) {
      const names: string[] = (pkg as any)[field] ?? [];
      for (const n of names) {
        const id = cache[String(n ?? "").trim().toLowerCase()];
        if (!id) continue;
        await (supabase as any)
          .from(table)
          .upsert({ work_package_id: wpId, [col]: id }, { onConflict: `work_package_id,${col}` });
      }
    }
  }
}


async function upsertLibrary(opts: {
  table: string;
  nameCol: string;
  items: Array<{
    name: string;
    description?: string | null;
    trade?: string | null;
    procurement_package?: string | null;
    unit_type?: string | null;
    quantity?: number | null;
    source_reference?: string | null;
    confidence?: "high" | "medium" | "low";
  }>;
  user_id: string;
  ctx: LearnCtx;
  cache?: Record<string, string>;
}) {
  const { table, nameCol, items, user_id, ctx, cache } = opts;
  for (const it of items) {
    const name = String(it.name || "").trim();
    if (!name) continue;
    const norm = name.toLowerCase();
    const conf = CONF_SCORE[it.confidence ?? "medium"] ?? 0.5;
    const source = {
      project_id: ctx.project_id,
      document_id: ctx.document_id,
      document_name: ctx.document_name,
      source_reference: it.source_reference || null,
      quantity: it.quantity ?? null,
      unit: it.unit_type ?? null,
    };

    // Look up existing by normalized name
    const { data: existing } = await (supabase as any)
      .from(table)
      .select("*")
      .eq("user_id", user_id)
      .eq("name_normalized", norm)
      .maybeSingle();

    if (existing) {
      const newSources = [...(existing.sources ?? []), source];
      const update: any = { sources: newSources };
      if (conf > Number(existing.confidence_score)) update.confidence_score = conf;
      if (it.unit_type && !existing.unit_type) update.unit_type = it.unit_type;
      if (it.description && !existing.description) update.description = it.description;
      if (it.trade && !existing.trade) update.trade = it.trade;
      if (table === "tasks_library" && it.procurement_package && !existing.procurement_package) {
        update.procurement_package = it.procurement_package;
      }
      await (supabase as any).from(table).update(update).eq("id", existing.id);
      if (cache) cache[norm] = existing.id;
    } else {
      const cols = await getColumnsCheat(table);
      const insert: any = {
        user_id,
        [nameCol]: name,
        confidence_score: conf,
        sources: [source],
      };
      if ("description" in cols) insert.description = it.description ?? null;
      if (it.trade) insert.trade = it.trade;
      if (table === "materials_library") insert.unit_type = it.unit_type ?? null;
      if (table === "tasks_library" && it.procurement_package) insert.procurement_package = it.procurement_package;
      const { data: created, error } = await (supabase as any).from(table).insert(insert).select("id").maybeSingle();
      if (error) {
        console.warn("learn insert failed", table, name, error.message);
        continue;
      }
      if (created && cache) cache[norm] = created.id;
    }
  }
}


// Tiny helper to know which tables accept description (avoids a per-row SELECT)
async function getColumnsCheat(table: string): Promise<Record<string, true>> {
  const map: Record<string, Record<string, true>> = {
    materials_library: { description: true },
    tasks_library: { description: true },
    labour_activities_library: {},
    claimable_elements_library: { description: true },
  };
  return map[table] ?? {};
}

async function detectMergeSuggestions(user_id: string, library_type: string, table: string, nameCol: string) {
  const { data } = await (supabase as any).from(table).select(`id, ${nameCol}, name_normalized, aliases`).eq("user_id", user_id);
  const rows = (data ?? []) as any[];
  if (rows.length < 2) return;
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (!isLikelyDuplicate(a[nameCol], b[nameCol], a.aliases ?? [], b.aliases ?? [])) continue;
      const [primary, duplicate] = a[nameCol].length >= b[nameCol].length ? [a, b] : [b, a];
      // Insert suggestion if none pending/merged/rejected already exists for this pair
      const { data: existing } = await (supabase as any)
        .from("knowledge_merge_suggestions")
        .select("id")
        .eq("user_id", user_id)
        .eq("library_type", library_type)
        .or(`and(primary_id.eq.${primary.id},duplicate_id.eq.${duplicate.id}),and(primary_id.eq.${duplicate.id},duplicate_id.eq.${primary.id})`)
        .maybeSingle();
      if (existing) continue;
      await (supabase as any).from("knowledge_merge_suggestions").insert({
        user_id,
        library_type,
        primary_id: primary.id,
        duplicate_id: duplicate.id,
        reason: `Names look similar: "${primary[nameCol]}" / "${duplicate[nameCol]}"`,
      });
    }
  }
}

function isLikelyDuplicate(a: string, b: string, aAliases: string[], bAliases: string[]): boolean {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return false;
  const aTerms = [na, ...aAliases.map((x) => x.toLowerCase())];
  const bTerms = [nb, ...bAliases.map((x) => x.toLowerCase())];
  for (const x of aTerms) for (const y of bTerms) {
    if (x === y) return true;
    if (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x))) return true;
  }
  return false;
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

async function persistMaterialRequirements(
  parsed: Record<string, any[]>,
  ctx: { project_id: string; document_id: string; document_name: string }
): Promise<number> {
  const reqs = (parsed.material_requirements ?? []).filter(
    (r) => String(r?.material_name ?? "").trim() && Number(r?.estimated_quantity) > 0
  );
  if (!reqs.length) return 0;

  // Map work_package name -> id for this project
  const { data: wps } = await (supabase as any)
    .from("work_packages")
    .select("id, package_name")
    .eq("project_id", ctx.project_id);
  const wpByName: Record<string, string> = {};
  for (const w of (wps ?? []) as any[]) wpByName[String(w.package_name).toLowerCase().trim()] = w.id;

  const rows = reqs.map((r) => ({
    project_id: ctx.project_id,
    work_package_id: wpByName[String(r.work_package ?? "").toLowerCase().trim()] ?? null,
    material_name: String(r.material_name).slice(0, 255),
    estimated_quantity: Number(r.estimated_quantity) || 0,
    original_quantity: Number(r.estimated_quantity) || 0,
    unit: String(r.unit ?? "").slice(0, 32),
    confidence_score: ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "medium",
    source_reference: String(r.source_reference ?? "").slice(0, 200),
    source_task: String(r.source_task ?? "").slice(0, 255),
    source_document: ctx.document_name.slice(0, 255),
    status: "Suggested",
  }));

  const { error } = await (supabase as any).from("material_requirements").insert(rows);
  if (error) {
    console.warn("material_requirements insert failed", error.message);
    return 0;
  }
  return rows.length;
}
