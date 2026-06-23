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

import { ValuationsTab } from "@/components/project/ValuationsTab";
import { LoadingDot } from "@/components/ui/loading-dot";
import { DisplayMetric } from "@/components/ui/display-metric";
import { SiteWalksTab } from "@/components/project/SiteWalksTab";

import { ProjectDocumentsTab } from "@/components/project/ProjectDocumentsTab";

import { WorkPackagesTab } from "@/components/project/WorkPackagesTab";
import { InvoicesTab } from "@/components/project/InvoicesTab";
import { VariationsTab } from "@/components/project/VariationsTab";
import { ProcurementTab } from "@/components/project/ProcurementTab";

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

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p, error: pe }, { data: vars }, { data: procs }, { data: openVals }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("variations").select("status").eq("project_id", id),
        (supabase as any).from("procurement_items").select("status, estimated_cost").eq("project_id", id),
        (supabase as any)
          .from("valuations")
          .select("id, valuation_number, created_at, valuation_items(claimed_value), invoices(id)")
          .eq("project_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (pe) showError("Project", pe);
      setProject((p as Project) ?? null);
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
        <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-4">
          <ChevronLeft className="w-4 h-4" /> Back
        </Link>
        <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
          Project not found.
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-5 pb-20">
      <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-4">
        <ChevronLeft className="w-4 h-4" /> Back
      </Link>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-gold/70">{project.status}</p>
        <h1 className="text-2xl font-bold text-primary mt-1">{project.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
          {project.client && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{project.client}</span>}
          {project.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{project.location}</span>}
        </div>
        <PoNumberField
          projectId={project.id}
          initial={project.po_number}
          onSaved={(v) => setProject((p) => (p ? { ...p, po_number: v } : p))}
        />
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <DisplayMetric label="Contract Value" value={project.contract_value ? GBP.format(Number(project.contract_value)) : "—"} className="rounded-lg border border-border bg-card p-3" />
          <Metric label="Progress" value={`${project.progress ?? 0}%`} />
          <Metric label="Open Variations" value={String(stats.openVariations)} />
          <Metric label="Procurement Outstanding" value={String(stats.procurementOutstanding)} />
          <Metric label="Potential Claim" value={GBP.format(stats.potentialClaim)} />
        </div>
      </header>


      <Tabs value={activeTab} onValueChange={setActiveTab}>

        <TabsContent value="scope-documents" className="mt-4 space-y-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Understand the Job</p>
          <Section title="Work Packages">
            <WorkPackagesTab projectId={project.id} />
          </Section>
          <Section title="Project Documents">
            <ProjectDocumentsTab projectId={project.id} />
          </Section>
        </TabsContent>

        <TabsContent value="site-walks" className="mt-4 space-y-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Understand Progress</p>
          <SiteWalksTab projectId={project.id} />
        </TabsContent>

        <TabsContent value="procurement" className="mt-4 space-y-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Procurement</p>
          <ProcurementTab projectId={project.id} />
        </TabsContent>

        <TabsContent value="variations" className="mt-4 space-y-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Variations</p>
          <VariationsTab projectId={project.id} />
        </TabsContent>


        <TabsContent value="valuations" className="mt-4 space-y-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Get Paid Faster</p>
          <ValuationsTab projectId={project.id} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4 space-y-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Invoicing</p>
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

const PRIMARY_NAV: Array<{ value: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { value: "scope-documents", label: "Scope", Icon: FileText },
  { value: "site-walks", label: "Site Diary", Icon: ClipboardList },
  { value: "valuations", label: "Valuations", Icon: Receipt },
  { value: "variations", label: "Variations", Icon: GitBranch },
];

const MORE_NAV: Array<{ value: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
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
      className="fixed bottom-0 inset-x-0 z-30 bg-black border-t border-white/10"
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
                  "w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-[10px] font-medium transition-colors",
                  isActive ? "text-gold" : "text-white/60 hover:text-white",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon className="w-5 h-5" />
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
                  "w-full flex flex-col items-center justify-center gap-1 py-2 px-1 text-[10px] font-medium transition-colors",
                  moreActive ? "text-gold" : "text-white/60 hover:text-white",
                )}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span>More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="bg-black border-white/10 text-white">
              <SheetHeader>
                <SheetTitle className="text-white">More sections</SheetTitle>
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
                        "flex items-center gap-3 px-4 py-3 rounded-md border text-left transition-colors",
                        isActive
                          ? "border-gold/60 bg-gold/10 text-gold"
                          : "border-white/10 text-white/80 hover:bg-white/5",
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


function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-primary mt-0.5">{value}</div>
    </div>
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
        className="h-7 px-2 rounded border border-input bg-background text-xs flex-1 max-w-xs"
      />
    </div>
  );
}


function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-primary border-b border-border pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Placeholder({ message }: { message: string }) {
  return (
    <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
