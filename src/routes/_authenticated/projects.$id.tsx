import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ChevronLeft,
  MapPin,
  Building2,
  FileText,
  ClipboardList,
  Receipt,
  GitBranch,
  
  MoreHorizontal,
  ShoppingCart,
  FileSpreadsheet,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { signPhotoUrl } from "@/lib/site-walk-photos";

import { ValuationsTab } from "@/components/project/ValuationsTab";
import { LoadingDot } from "@/components/ui/loading-dot";
import { SiteWalksTab } from "@/components/project/SiteWalksTab";

import { ProjectDocumentsTab } from "@/components/project/ProjectDocumentsTab";

import { WorkPackagesTab } from "@/components/project/WorkPackagesTab";
import { InvoicesTab } from "@/components/project/InvoicesTab";
import { VariationsTab } from "@/components/project/VariationsTab";
import { ProcurementTab } from "@/components/project/ProcurementTab";
import { ShareProjectSheet } from "@/components/project/ShareProjectSheet";

type Project = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  contract_value: number | null;
  status: string;
  progress: number;
  po_number: string | null;
};


type HeaderStats = {
  openVariations: number;
  procurementOutstanding: number;
  potentialClaim: number;
};

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Mastor" }] }),
  component: ProjectDetail,
});

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function ProjectDetail() {
  const { id } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<HeaderStats>({
    openVariations: 0,
    procurementOutstanding: 0,
    potentialClaim: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("scope-documents");
  const [moreOpen, setMoreOpen] = useState(false);
  const [coverPhoto, setCoverPhoto] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p, error: pe }, { data: vars }, { data: procs }, { data: openVals }, { data: latestPhoto }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("variations").select("status").eq("project_id", id),
        (supabase as any).from("procurement_items").select("status, estimated_cost").eq("project_id", id),
        (supabase as any)
          .from("valuations")
          .select("id, valuation_number, created_at, valuation_items(claimed_value), invoices(id)")
          .eq("project_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("site_walk_photos")
          .select("storage_path, annotated_storage_path")
          .eq("project_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (pe) showError("Project", pe);
      setProject((p as Project) ?? null);
      const photoRow = latestPhoto as { storage_path: string | null; annotated_storage_path: string | null } | null;
      const photoPath = photoRow?.annotated_storage_path || photoRow?.storage_path;
      setCoverPhoto(photoPath ? await signPhotoUrl(photoPath) : null);
      const openVariations = (vars ?? []).filter((v: any) => v.status !== "Approved" && v.status !== "Rejected").length;
      const procurementOutstanding = (procs ?? []).filter((x: any) => x.status === "Required" || x.status === "Quoted").length;
      const openVal = (openVals ?? []).find(
        (v: any) => !v.invoices || v.invoices.length === 0,
      );
      const potentialClaim = openVal
        ? (openVal.valuation_items ?? []).reduce(
            (s: number, it: any) => s + Number(it.claimed_value ?? 0),
            0,
          )
        : 0;
      setStats({
        openVariations,
        procurementOutstanding,
        potentialClaim,
      });
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return <main className="max-w-5xl mx-auto px-4 py-8"><LoadingDot label="Loading" /></main>;
  }

  if (!project) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-gold mb-4">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="p-6 rounded-2xl border border-dashed border-border text-center text-sm text-muted-foreground">
          Project not found.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-5 pb-20">
      <header className="mb-6">
        <div className="relative -mx-4 sm:mx-0 sm:rounded-3xl overflow-hidden aspect-[16/9] sm:aspect-[21/9] bg-secondary">
          {coverPhoto ? (
            <img src={coverPhoto} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-gold/20 via-secondary to-secondary flex items-center justify-center">
              <Building2 className="w-10 h-10 text-muted-foreground/40" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
          <Link
            to="/dashboard"
            className="absolute top-4 left-4 inline-flex items-center gap-1 text-sm text-white bg-black/35 backdrop-blur-sm rounded-full pl-2.5 pr-3.5 py-1.5 hover:bg-black/55 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </Link>
          <div className="absolute top-4 right-4">
            <ShareProjectSheet
              projectId={project.id}
              triggerClassName="gap-1.5 border-transparent bg-black/35 backdrop-blur-sm text-white hover:bg-black/55 hover:text-white"
            />
          </div>
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">{project.status}</p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-sm mt-1">{project.name}</h1>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/80">
              {project.client && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{project.client}</span>}
              {project.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{project.location}</span>}
            </div>
          </div>
        </div>
        <PoNumberField
          projectId={project.id}
          initial={project.po_number}
          onSaved={(v) => setProject((p) => (p ? { ...p, po_number: v } : p))}
        />
        <div className="mt-4 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="flex-1 p-4">
              <div className="label-mono">Contract Value</div>
              <div className="hero-number text-3xl mt-1">
                {project.contract_value ? GBP.format(Number(project.contract_value)) : "—"}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${project.progress ?? 0}%` }} />
                </div>
                <span className="text-xs font-medium text-foreground tabular-nums shrink-0">
                  {project.progress ?? 0}%
                </span>
              </div>
            </div>
            <div className="flex-1 p-4">
              <div className="label-mono">Potential Claim</div>
              <div className="hero-number text-3xl mt-1">{GBP.format(stats.potentialClaim)}</div>
              <div className="mt-3 flex gap-4 text-xs">
                <span
                  className={stats.openVariations > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"}
                >
                  {stats.openVariations} Variation{stats.openVariations === 1 ? "" : "s"}
                </span>
                <span
                  className={
                    stats.procurementOutstanding > 0 ? "text-amber-600 font-medium" : "text-muted-foreground"
                  }
                >
                  {stats.procurementOutstanding} Procurement
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>


      <Tabs value={activeTab} onValueChange={setActiveTab}>

        <TabsContent value="scope-documents" className="mt-4 space-y-8">
          <p className="label-mono">Understand the Job</p>
          <Section title="Work Packages">
            <WorkPackagesTab projectId={project.id} />
          </Section>
          <Section title="Project Documents">
            <ProjectDocumentsTab projectId={project.id} />
          </Section>
        </TabsContent>

        <TabsContent value="site-walks" className="mt-4 space-y-8">
          <p className="label-mono">Understand Progress</p>
          <SiteWalksTab projectId={project.id} />
        </TabsContent>

        <TabsContent value="procurement" className="mt-4 space-y-8">
          <p className="label-mono">Procurement</p>
          <ProcurementTab projectId={project.id} />
        </TabsContent>

        <TabsContent value="variations" className="mt-4 space-y-8">
          <p className="label-mono">Variations</p>
          <VariationsTab projectId={project.id} />
        </TabsContent>


        <TabsContent value="valuations" className="mt-4 space-y-8">
          <p className="label-mono">Get Paid Faster</p>
          <ValuationsTab projectId={project.id} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4 space-y-8">
          <p className="label-mono">Invoicing</p>
          <InvoicesTab projectId={project.id} />
        </TabsContent>
      </Tabs>

      <ProjectBottomNav
        active={activeTab}
        onSelect={setActiveTab}
        moreOpen={moreOpen}
        setMoreOpen={setMoreOpen}
      />
    </main>
  );
}

const PRIMARY_NAV: Array<{ value: string; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { value: "scope-documents", label: "Scope", Icon: FileText },
  { value: "site-walks", label: "Site Diary", Icon: ClipboardList },
  { value: "valuations", label: "Valuations", Icon: Receipt },
  { value: "variations", label: "Variations", Icon: GitBranch },
];

const MORE_NAV: Array<{ value: string; label: string; Icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = [
  { value: "procurement", label: "Procurement", Icon: ShoppingCart },
  { value: "invoices", label: "Invoices", Icon: FileSpreadsheet },
];

function ProjectBottomNav({
  active,
  onSelect,
  moreOpen,
  setMoreOpen,
}: {
  active: string;
  onSelect: (v: string) => void;
  moreOpen: boolean;
  setMoreOpen: (v: boolean) => void;
}) {
  const moreActive = MORE_NAV.some((i) => i.value === active);
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 bg-card/90 backdrop-blur-md border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Project sections"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_NAV.map(({ value, label, Icon }) => {
          const isActive = active === value;
          return (
            <li key={value}>
              <button
                type="button"
                onClick={() => onSelect(value)}
                className={cn(
                  "relative w-full flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[10px] font-medium transition-colors",
                  isActive ? "text-gold" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {isActive && <span className="absolute top-0 inset-x-3 h-0.5 bg-gold" />}
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 2} />
                <span className="truncate max-w-full">{label}</span>
              </button>
            </li>
          );
        })}
        <li>
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className={cn(
                  "relative w-full flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[10px] font-medium transition-colors",
                  moreActive ? "text-gold" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {moreActive && <span className="absolute top-0 inset-x-3 h-0.5 bg-gold" />}
                <MoreHorizontal className="w-5 h-5" strokeWidth={moreActive ? 2.25 : 2} />
                <span>More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-card border-border text-foreground">
              <SheetHeader>
                <SheetTitle className="text-foreground">More sections</SheetTitle>
              </SheetHeader>
              <div className="mt-4 grid gap-2 pb-[env(safe-area-inset-bottom)]">
                {MORE_NAV.map(({ value, label, Icon }) => {
                  const isActive = active === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        onSelect(value);
                        setMoreOpen(false);
                      }}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors",
                        isActive
                          ? "border-gold/40 bg-gold/10 text-gold"
                          : "border-border text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}

function PoNumberField({
  projectId,
  initial,
  onSaved,
}: {
  projectId: string;
  initial: string | null;
  onSaved: (v: string | null) => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const trimmed = value.trim() || null;
    if (trimmed === (initial ?? null)) return;
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .update({ po_number: trimmed } as any)
      .eq("id", projectId);
    setSaving(false);
    if (error) return showError("Project", error);
    onSaved(trimmed);
    toast.success("PO number saved");
  };
  return (
    <div className="mt-3 flex items-center gap-2 text-xs">
      <label className="text-muted-foreground uppercase tracking-wider">PO Number</label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        disabled={saving}
        placeholder="Optional — appears on invoices"
        className="h-7 px-2 rounded-md border border-input bg-card text-xs flex-1 max-w-xs"
      />
    </div>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground divider-heavy pt-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Placeholder({ message }: { message: string }) {
  return (
    <div className="p-6 rounded-2xl border border-dashed border-border text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
