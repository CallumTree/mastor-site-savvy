import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, MapPin, Building2 } from "lucide-react";
import { toast } from "sonner";
import { ScopeTab } from "@/components/project/ScopeTab";
import { ProgressTab } from "@/components/project/ProgressTab";
import { ValuationsTab } from "@/components/project/ValuationsTab";
import { ProcurementTab } from "@/components/project/ProcurementTab";
import { SiteWalksTab } from "@/components/project/SiteWalksTab";
import { ReviewQueueTab } from "@/components/project/ReviewQueueTab";

type Project = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  contract_value: number | null;
  status: string;
  progress: number;
};

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Mastor" }] }),
  component: ProjectDetail,
});

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function ProjectDetail() {
  const { id } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) toast.error(error.message);
      setProject(data as Project | null);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return <main className="max-w-5xl mx-auto px-4 py-8 text-sm text-muted-foreground">Loading…</main>;
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
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Contract Value" value={project.contract_value ? GBP.format(Number(project.contract_value)) : "—"} />
          <Metric label="Progress" value={`${project.progress ?? 0}%`} />
        </div>
      </header>

      <Tabs defaultValue="scope">
        <TabsList className="w-full justify-start overflow-x-auto bg-secondary p-1 h-auto flex-wrap">
          <TabsTrigger value="scope" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Scope & Variations</TabsTrigger>
          <TabsTrigger value="progress" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Site Progress</TabsTrigger>
          <TabsTrigger value="valuations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Valuations</TabsTrigger>
          <TabsTrigger value="procurement" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Procurement</TabsTrigger>
          <TabsTrigger value="sitewalks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Site Walks</TabsTrigger>
          <TabsTrigger value="review" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">AI Review</TabsTrigger>
        </TabsList>

        <TabsContent value="scope" className="mt-4">
          <ScopeTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="progress" className="mt-4">
          <ProgressTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="valuations" className="mt-4">
          <ValuationsTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="procurement" className="mt-4">
          <ProcurementTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="sitewalks" className="mt-4">
          <SiteWalksTab projectId={project.id} />
        </TabsContent>
        <TabsContent value="review" className="mt-4">
          <ReviewQueueTab projectId={project.id} />
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
