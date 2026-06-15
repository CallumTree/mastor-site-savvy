import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, HardHat, ClipboardCheck, AlertTriangle, MapPin, Sparkles, Inbox, CheckCircle2, FileEdit, Package, ShieldAlert, FolderPlus, Footprints, TriangleAlert, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingDot } from "@/components/ui/loading-dot";
import { DisplayMetric } from "@/components/ui/display-metric";


type Project = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  contract_value: number | null;
  status: string;
  progress: number;
};

type ProjectHealth = {
  daysSinceWalk: number | null;
  draftVariations: number;
  staleProcurement: number;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Mastor" }] }),
  component: Dashboard,
});

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, ProjectHealth>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState({ awaiting: 0, approvedWeek: 0, variations: 0, procurement: 0, risks: 0 });

  const load = async () => {
    setLoading(true);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data, error }, { data: findings }, { data: walks }, { data: variationsData }, { data: procurementData }] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("approved_findings").select("finding_type, status, approved_at"),
      supabase.from("site_walks").select("project_id, created_at").order("created_at", { ascending: false }),
      supabase.from("variations").select("project_id, status, created_at"),
      supabase.from("procurement_items").select("project_id, status, created_at"),
    ]);
    if (error) showError("Dashboard", error);
    const projList = (data ?? []) as Project[];
    setProjects(projList);

    const f = (findings ?? []) as { finding_type: string; status: string; approved_at: string | null }[];
    setAi({
      awaiting: f.filter((x) => x.status === "Awaiting Review").length,
      approvedWeek: f.filter((x) => x.status === "Approved" && x.approved_at && x.approved_at >= weekAgo).length,
      variations: f.filter((x) => x.finding_type === "variation").length,
      procurement: f.filter((x) => x.finding_type === "procurement").length,
      risks: f.filter((x) => x.finding_type === "risk").length,
    });

    // Build health map per project
    const hm: Record<string, ProjectHealth> = {};
    for (const p of projList) {
      const walksForProject = ((walks ?? []) as { project_id: string; created_at: string }[])
        .filter((w) => w.project_id === p.id);
      const mostRecentWalk = walksForProject[0];
      const daysSinceWalk = mostRecentWalk
        ? Math.floor((Date.now() - new Date(mostRecentWalk.created_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const draftVars = ((variationsData ?? []) as { project_id: string; status: string }[])
        .filter((v) => v.project_id === p.id && v.status === "Draft").length;

      const staleProc = ((procurementData ?? []) as { project_id: string; status: string; created_at: string }[])
        .filter((pi) => pi.project_id === p.id && pi.status === "Required" && pi.created_at < weekAgo).length;

      hm[p.id] = { daysSinceWalk, draftVariations: draftVars, staleProcurement: staleProc };
    }
    setHealthMap(hm);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 pb-20">
      <section className="mb-6">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Site Overview</p>
        <h1 className="font-display text-4xl text-primary mt-2">Good day</h1>
      </section>

      {/* Quick Check */}
      <section className="mb-8">
        <div className="border border-border border-l-[2px] border-l-primary bg-card shadow-sm overflow-hidden">
          <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-gold" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em]">Quick Check</h2>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            <Stat icon={<HardHat className="w-4 h-4" />} label="Active Sites" value={projects.filter(p => p.status === "On Site").length} />
            <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Open RFIs" value={7} />
            <Stat icon={<ClipboardCheck className="w-4 h-4" />} label="Valuations Due" value={3} />
          </div>
        </div>
      </section>

      {/* AI Activity */}
      <section className="mb-8">
        <div className="border border-border border-l-[2px] border-l-primary bg-card shadow-sm overflow-hidden">
          <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-gold" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em]">AI Activity</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-border">
            <Stat icon={<Inbox className="w-4 h-4" />} label="Awaiting Review" value={ai.awaiting} />
            <Stat icon={<CheckCircle2 className="w-4 h-4" />} label="Approved (7d)" value={ai.approvedWeek} />
            <Stat icon={<FileEdit className="w-4 h-4" />} label="Variations" value={ai.variations} />
            <Stat icon={<Package className="w-4 h-4" />} label="Procurement" value={ai.procurement} />
            <Stat icon={<ShieldAlert className="w-4 h-4" />} label="Risks" value={ai.risks} />
          </div>
        </div>
      </section>


      {/* Projects header */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-2xl text-primary">Projects</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" /> New Project
              </Button>
            </DialogTrigger>
            <NewProjectDialog onCreated={() => { setOpen(false); load(); }} />
          </Dialog>
        </div>

        {loading ? (
          <LoadingDot label="Loading projects" />
        ) : projects.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="No projects yet"
            description="Create your first project to start tracking site activity, valuations and AI findings."
            actionLabel="New Project"
            onAction={() => setOpen(true)}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map(p => (
              <Link
                key={p.id}
                to="/projects/$id"
                params={{ id: p.id }}
                className="group block border border-border border-l-[2px] border-l-primary bg-card shadow-sm hover:border-l-gold transition overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg text-primary truncate">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.client ?? "—"}</p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] bg-accent text-accent-foreground px-3 py-1 rounded-full font-semibold">
                      {p.status}
                    </span>
                  </div>
                  {p.location && (
                    <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {p.location}
                    </p>
                  )}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="uppercase tracking-[0.2em] text-muted-foreground">Progress</span>
                      <span className="font-medium text-primary">{p.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-secondary overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border flex justify-between items-end">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Contract</span>
                    <span className="font-display text-primary leading-none" style={{ fontSize: "2.5rem" }}>
                      {p.contract_value ? GBP.format(Number(p.contract_value)) : "—"}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="p-4 text-center">
      <div className="flex justify-center text-gold mb-1.5">{icon}</div>
      <div className="font-display text-primary leading-none" style={{ fontSize: "2.5rem" }}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-2">{label}</div>
    </div>
  );
}

function NewProjectDialog({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      setBusy(false);
      toast.error("You must be signed in to create a project.");
      return;
    }
    const { error } = await supabase.from("projects").insert({
      user_id: userRes.user.id,
      name,
      client: client || null,
      location: location || null,
      contract_value: value ? Number(value) : null,
      status: "On Site",
      progress: 0,
    });
    setBusy(false);
    if (error) { showError("Dashboard", error); return; }
    toast.success("Project created");
    setName(""); setClient(""); setLocation(""); setValue(""); setNotes("");
    onCreated();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="font-display text-primary">New Project</DialogTitle>
      </DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="np-name">Project name</Label>
          <Input id="np-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marylebone Mews Refurbishment" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np-client">Client</Label>
          <Input id="np-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="e.g. Berkeley Homes" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np-loc">Site address</Label>
          <Input id="np-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. London NW1" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np-val">Contract value (£)</Label>
          <Input id="np-val" type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="1250000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="np-notes">Notes</Label>
          <Textarea id="np-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional" />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
