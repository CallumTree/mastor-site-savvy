import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, MapPin, Building2 } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";

import { ValuationsTab } from "@/components/project/ValuationsTab";
import { LoadingDot } from "@/components/ui/loading-dot";
import { DisplayMetric } from "@/components/ui/display-metric";
import { SiteWalksTab } from "@/components/project/SiteWalksTab";

import { ProjectDocumentsTab } from "@/components/project/ProjectDocumentsTab";
import { ReadyToClaimTab } from "@/components/project/ReadyToClaimTab";
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
};

type HeaderStats = {
  openVariations: number;
  procurementOutstanding: number;
  potentialClaim: number;
  approvedClaim: number;
  readyToClaim: number;
  includedInValuation: number;
  paid: number;
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
    approvedClaim: 0,
    readyToClaim: 0,
    includedInValuation: 0,
    paid: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p, error: pe }, { data: vars }, { data: procs }, { data: pcs }] = await Promise.all([
        supabase.from("projects").select("*").eq("id", id).maybeSingle(),
        supabase.from("variations").select("status").eq("project_id", id),
        (supabase as any).from("procurement_items").select("status, estimated_cost").eq("project_id", id),
        (supabase as any).from("claim_opportunities").select("status, contract_value").eq("project_id", id),
      ]);
      if (pe) showError("Project", pe);
      setProject((p as Project) ?? null);
      const openVariations = (vars ?? []).filter((v: any) => v.status !== "Approved" && v.status !== "Rejected").length;
      const procurementOutstanding = (procs ?? []).filter((x: any) => x.status === "Required" || x.status === "Quoted").length;
      const sumBy = (status: string) =>
        (pcs ?? [])
          .filter((c: any) => c.status === status)
          .reduce((s: number, c: any) => s + Number(c.contract_value ?? 0), 0);
      setStats({
        openVariations,
        procurementOutstanding,
        potentialClaim: sumBy("Suggested"),
        approvedClaim: sumBy("Approved"),
        readyToClaim: sumBy("Ready To Claim"),
        includedInValuation: sumBy("Included In Valuation"),
        paid: sumBy("Paid"),
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
        <p className="text-xs uppercase tracking-[0.18em] text-gold-foreground/70">{project.status}</p>
        <h1 className="text-2xl font-bold text-primary mt-1">{project.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
          {project.client && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{project.client}</span>}
          {project.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{project.location}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          <DisplayMetric label="Contract Value" value={project.contract_value ? GBP.format(Number(project.contract_value)) : "—"} className="rounded-lg border border-border bg-card p-3" />
          <Metric label="Progress" value={`${project.progress ?? 0}%`} />
          <Metric label="Open Variations" value={String(stats.openVariations)} />
          <Metric label="Procurement Outstanding" value={String(stats.procurementOutstanding)} />
          <Metric label="Potential Claim" value={GBP.format(stats.potentialClaim)} />
        </div>
      </header>

      <Tabs defaultValue="scope-documents">
        <TabsList className="w-full flex flex-nowrap gap-2 overflow-x-auto bg-transparent p-0 h-auto scrollbar-hide">
          <TabsTrigger value="scope-documents" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 min-h-11 text-xs font-medium border border-border bg-card text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary hover:bg-muted/50">
            Scope & Documents
          </TabsTrigger>
          <TabsTrigger value="site-walks" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 min-h-11 text-xs font-medium border border-border bg-card text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary hover:bg-muted/50">
            Site Walks
          </TabsTrigger>
          <TabsTrigger value="procurement" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 min-h-11 text-xs font-medium border border-border bg-card text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary hover:bg-muted/50">
            Procurement
          </TabsTrigger>
          <TabsTrigger value="variations" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 min-h-11 text-xs font-medium border border-border bg-card text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary hover:bg-muted/50">
            Variations
          </TabsTrigger>
          <TabsTrigger value="ready-to-claim" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 min-h-11 text-xs font-medium border border-border bg-card text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary hover:bg-muted/50">
            Ready To Claim
          </TabsTrigger>
          <TabsTrigger value="valuations" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 min-h-11 text-xs font-medium border border-border bg-card text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary hover:bg-muted/50">
            Valuations
          </TabsTrigger>
          <TabsTrigger value="invoices" className="shrink-0 whitespace-nowrap rounded-full px-4 py-2 min-h-11 text-xs font-medium border border-border bg-card text-muted-foreground transition-colors data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary hover:bg-muted/50">
            Invoices
          </TabsTrigger>
        </TabsList>

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

        <TabsContent value="ready-to-claim" className="mt-4 space-y-8">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Recover Revenue</p>
          <ReadyToClaimTab projectId={project.id} />
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
    </main>
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
