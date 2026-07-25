import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
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
import { CircularProgress } from "@/components/ui/circular-progress";
import { getCurrentProfile, getLogoSignedUrl } from "@/lib/profile";
import { signManyPhotoUrls } from "@/lib/site-walk-photos";


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
  const [coverPhotos, setCoverPhotos] = useState<Record<string, string>>({});
  const [firstName, setFirstName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [ai, setAi] = useState({ awaiting: 0, approvedWeek: 0, variations: 0, procurement: 0, risks: 0 });

  const load = async () => {
    setLoading(true);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data, error }, { data: findings }, { data: walks }, { data: variationsData }, { data: procurementData }, { data: photos }] = await Promise.all([
      supabase.from("projects").select("*").order("created_at", { ascending: false }),
      (supabase as any).from("approved_findings").select("finding_type, status, approved_at"),
      supabase.from("site_walks").select("project_id, created_at").order("created_at", { ascending: false }),
      supabase.from("variations").select("project_id, status, created_at"),
      supabase.from("procurement_items").select("project_id, status, created_at"),
      supabase
        .from("site_walk_photos")
        .select("project_id, storage_path, annotated_storage_path, created_at")
        .order("created_at", { ascending: false })
        .limit(300),
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

    // One representative photo per project — the most recent site walk
    // snapshot (annotated version preferred), used as a card cover.
    const photoRows = (photos ?? []) as { project_id: string; storage_path: string | null; annotated_storage_path: string | null }[];
    const pathByProject: Record<string, string> = {};
    for (const row of photoRows) {
      if (pathByProject[row.project_id]) continue;
      const path = row.annotated_storage_path || row.storage_path;
      if (path) pathByProject[row.project_id] = path;
    }
    const signedByPath = await signManyPhotoUrls(Object.values(pathByProject));
    const coverByProject: Record<string, string> = {};
    for (const [projectId, path] of Object.entries(pathByProject)) {
      const url = signedByPath[path];
      if (url) coverByProject[projectId] = url;
    }
    setCoverPhotos(coverByProject);

    setLoading(false);
  };

  useEffect(() => {
    load();
    (async () => {
      const profile = await getCurrentProfile();
      if (!profile) return;
      setFirstName(profile.full_name?.split(" ")[0] ?? "");
      if (profile.company_logo_url) setAvatarUrl(await getLogoSignedUrl(profile.company_logo_url));
    })();
  }, []);

  const activeSites = projects.filter((p) => p.status === "On Site").length;
  const recentActivity = projects.filter((p) => {
    const h = healthMap[p.id];
    return h && h.daysSinceWalk !== null && h.daysSinceWalk <= 2;
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 pb-20">
      <section className="mb-8">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover border border-border shadow-sm" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gold/25 to-gold/5 flex items-center justify-center text-gold font-bold text-lg shrink-0">
              {(firstName || "M").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-base font-semibold text-foreground">
              {greeting}{firstName ? `, ${firstName}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE d MMMM")}</p>
          </div>
        </div>
        <h1 className="hero-number text-5xl sm:text-6xl mt-5">
          {activeSites} {activeSites === 1 ? "Site" : "Sites"} Live
        </h1>
      </section>

      {/* Quick Check */}
      <section className="mb-6">
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
            <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Check</h2>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            <Stat icon={<HardHat className="w-4 h-4" />} label="Active Sites" value={activeSites} />
            <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Open RFIs" value={7} />
            <Stat icon={<ClipboardCheck className="w-4 h-4" />} label="Valuations Due" value={3} />
          </div>
        </div>
      </section>

      {/* AI Activity */}
      <section className="mb-8">
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="px-4 py-3 flex items-center gap-2 border-b border-border">
            <Sparkles className="w-4 h-4 text-gold" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI Activity</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0 divide-border">
            <Stat icon={<Inbox className="w-4 h-4" />} label="Awaiting Review" value={ai.awaiting} />
            <Stat icon={<CheckCircle2 className="w-4 h-4" />} label="Approved (7d)" value={ai.approvedWeek} />
            <Stat icon={<FileEdit className="w-4 h-4" />} label="Variations" value={ai.variations} />
            <Stat icon={<Package className="w-4 h-4" />} label="Procurement" value={ai.procurement} />
            <Stat icon={<ShieldAlert className="w-4 h-4" />} label="Risks" value={ai.risks} />
          </div>
        </div>
      </section>

      {/* Recently active — horizontal scroll strip, only when there's something to show */}
      {!loading && recentActivity.length > 0 && (
        <section className="mb-8">
          <p className="label-mono mb-3">Walked in the last 48 hours</p>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
            {recentActivity.map((p) => (
              <Link
                key={p.id}
                to="/projects/$id"
                params={{ id: p.id }}
                className="shrink-0 w-56 rounded-2xl border border-border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all p-3 flex items-center gap-3"
              >
                {coverPhotos[p.id] ? (
                  <img src={coverPhotos[p.id]} alt="" className="w-11 h-11 rounded-full object-cover border border-border shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <HardHat className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">{p.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{p.client ?? "—"}</p>
                  <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-gold">
                    <Footprints className="w-3 h-3" />
                    {healthMap[p.id]?.daysSinceWalk === 0 ? "Today" : `${healthMap[p.id]?.daysSinceWalk}d ago`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Projects header */}
      <section>
        <div className="flex items-center justify-between mb-4 divider-heavy pt-4">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Projects</h2>
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
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.map(p => (
              <Link
                key={p.id}
                to="/projects/$id"
                params={{ id: p.id }}
                className="group block rounded-2xl border border-border bg-card hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                <div className="relative aspect-[16/10] bg-secondary overflow-hidden">
                  {coverPhotos[p.id] ? (
                    <img
                      src={coverPhotos[p.id]}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gold/15 via-secondary to-secondary flex items-center justify-center">
                      <HardHat className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/40 backdrop-blur-sm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                    {p.status}
                  </span>
                  <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-white font-semibold text-base leading-tight truncate drop-shadow-sm">{p.name}</h3>
                      <p className="text-white/80 text-xs mt-0.5 truncate">{p.client ?? "—"}</p>
                      {p.location && (
                        <p className="mt-1.5 text-[11px] text-white/70 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" /> {p.location}
                        </p>
                      )}
                    </div>
                    <CircularProgress
                      value={p.progress}
                      size={46}
                      strokeWidth={4}
                      trackClassName="stroke-white/25"
                      className="stroke-gold"
                    >
                      <span className="text-[10px] font-bold text-white">{p.progress}%</span>
                    </CircularProgress>
                  </div>
                </div>
                <div className="p-4">
                  {(() => {
                    const h = healthMap[p.id];
                    if (!h) return null;
                    const walkColor = h.daysSinceWalk === null || h.daysSinceWalk > 7 ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
                    const walkLabel = h.daysSinceWalk === null ? "No walk" : `${h.daysSinceWalk}d`;
                    const varColor = h.draftVariations > 0 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
                    const procColor = h.staleProcurement > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200";
                    return (
                      <div className="flex flex-wrap gap-2">
                        <HealthPill icon={<Footprints className="w-3 h-3" />} label={walkLabel} classes={walkColor} />
                        <HealthPill icon={<TriangleAlert className="w-3 h-3" />} label={`${h.draftVariations} draft`} classes={varColor} />
                        <HealthPill icon={<ShoppingCart className="w-3 h-3" />} label={`${h.staleProcurement} req`} classes={procColor} />
                      </div>
                    );
                  })()}
                  <div className="mt-3 pt-3 border-t border-border flex justify-between items-end">
                    <span className="label-mono">Contract</span>
                    <span className="hero-number text-3xl">
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
      <div className="hero-number text-3xl">{value}</div>
      <div className="label-mono mt-2">{label}</div>
    </div>
  );
}

function HealthPill({ icon, label, classes }: { icon: React.ReactNode; label: string; classes: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${classes}`}>
      {icon}
      {label}
    </span>
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
        <DialogTitle>New Project</DialogTitle>
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
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
