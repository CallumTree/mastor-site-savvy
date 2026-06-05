import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, FileText, Trash2, Sparkles, Eye, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { parseScopeDocument } from "@/lib/scope-parser.functions";

type Doc = {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_path: string;
  size_bytes: number | null;
  parsed_at: string | null;
  uploaded_at: string;
};

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
};

const ACCEPT = ".pdf,.docx,.xlsx,.xls,.csv,.txt";

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
  const parseFn = useServerFn(parseScopeDocument);

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

  const onPickFile = () => fileRef.current?.click();

  const onUpload = async (file: File) => {
    if (!file) return;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!["pdf", "docx", "xlsx", "xls", "csv", "txt"].includes(ext)) {
      toast.error("Unsupported file type");
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
    try {
      const { data: signed, error: signErr } = await supabase.storage.from("project-documents").createSignedUrl(doc.file_path, 120);
      if (signErr) throw signErr;
      const resp = await fetch(signed.signedUrl);
      const buf = await resp.arrayBuffer();
      const text = await extractText(buf, doc.file_type);
      if (!text.trim()) {
        toast.error("Could not extract any text from this document.");
        return;
      }
      const result: any = await parseFn({ data: { text, document_name: doc.file_name } });
      if (!result?.ok) {
        toast.error(result?.error || "Parse failed");
        return;
      }
      const parsed = result.parsed as Record<string, any[]>;
      const rows: any[] = [];
      const push = (type: ScopeElement["element_type"], list: any[]) => {
        for (const it of list ?? []) {
          rows.push({
            project_id: projectId,
            document_id: doc.id,
            element_type: type,
            title: String(it.title ?? "").slice(0, 500),
            description: it.description ? String(it.description).slice(0, 2000) : null,
            quantity: typeof it.quantity === "number" ? it.quantity : null,
            unit: it.unit ? String(it.unit).slice(0, 32) : null,
            source_reference: it.source_reference ? String(it.source_reference).slice(0, 200) : null,
            confidence: ["high", "medium", "low"].includes(it.confidence) ? it.confidence : "medium",
          });
        }
      };
      push("task", parsed.tasks);
      push("labour_activity", parsed.labour_activities);
      push("material", parsed.materials);
      push("claimable_element", parsed.claimable_elements);
      push("procurement_item", parsed.procurement_items);

      // Replace previous parse for this document
      await (supabase as any).from("scope_elements").delete().eq("document_id", doc.id);
      if (rows.length) {
        const { error: insErr } = await (supabase as any).from("scope_elements").insert(rows);
        if (insErr) throw insErr;
      }
      await (supabase as any).from("project_documents").update({ parsed_at: new Date().toISOString() }).eq("id", doc.id);

      // Feed Construction Knowledge Engine
      await learnFromParse(parsed, { project_id: projectId, document_id: doc.id, document_name: doc.file_name });

      toast.success(`Parsed: ${rows.length} item${rows.length === 1 ? "" : "s"} · Knowledge updated`);
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
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          No documents uploaded yet. Supported: PDF, DOCX, XLSX, CSV, TXT.
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
        <ConfidenceBadge value={item.confidence} />
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

async function learnFromParse(parsed: Record<string, any[]>, ctx: LearnCtx) {
  const { data: userRes } = await supabase.auth.getUser();
  const user_id = userRes.user?.id;
  if (!user_id) return;

  const taskByName: Record<string, string> = {};
  const matByName: Record<string, string> = {};

  await upsertLibrary({
    table: "tasks_library",
    nameCol: "task_name",
    items: (parsed.tasks ?? []).map((t) => ({
      name: t.title,
      description: t.description,
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
      source_reference: c.source_reference,
      confidence: c.confidence,
    })),
    user_id,
    ctx,
  });

  await upsertLibrary({
    table: "labour_activities_library",
    nameCol: "activity_name",
    items: (parsed.labour_activities ?? []).map((a) => ({
      name: a.title,
      description: a.description,
      source_reference: a.source_reference,
      confidence: a.confidence,
    })),
    user_id,
    ctx,
  });

  // Detect duplicate-name suggestions (simple alias heuristic) for materials
  await detectMergeSuggestions(user_id, "material", "materials_library", "material_name");
  await detectMergeSuggestions(user_id, "task", "tasks_library", "task_name");
}

async function upsertLibrary(opts: {
  table: string;
  nameCol: string;
  items: Array<{
    name: string;
    description?: string | null;
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
      await (supabase as any).from(table).update(update).eq("id", existing.id);
      if (cache) cache[norm] = existing.id;
    } else {
      const insert: any = {
        user_id,
        [nameCol]: name,
        confidence_score: conf,
        sources: [source],
      };
      if ("description" in (await getColumnsCheat(table))) insert.description = it.description ?? null;
      if (table === "materials_library") insert.unit_type = it.unit_type ?? null;
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
    // Disable worker to avoid bundling issues — runs on main thread for moderate-sized docs.
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    const loadingTask = pdfjs.getDocument({ data: buf, disableWorker: true, isEvalSupported: false });
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
