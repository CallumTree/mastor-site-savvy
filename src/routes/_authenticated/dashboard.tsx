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
import { Plus, HardHat, ClipboardCheck, AlertTriangle, MapPin, Sparkles, Inbox, CheckCircle2, FileEdit, Package, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { DEV_USER } from "@/lib/dev-user";

type Project = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  contract_value: number | null;
  status: string;
  progress: number;
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Mastor" }] }),
  component: Dashboard,
});

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setProjects((data ?? []) as Project[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 pb-20">
      <section className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Site Overview</p>
        <h1 className="text-3xl font-bold text-primary mt-1">Good day</h1>
      </section>

      {/* Quick Check */}
      <section className="mb-8">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-gold" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Quick Check</h2>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border">
            <Stat icon={<HardHat className="w-4 h-4" />} label="Active Sites" value={projects.filter(p => p.status === "On Site").length} />
            <Stat icon={<AlertTriangle className="w-4 h-4" />} label="Open RFIs" value={7} />
            <Stat icon={<ClipboardCheck className="w-4 h-4" />} label="Valuations Due" value={3} />
          </div>
        </div>
      </section>

      {/* Projects header */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-primary">Projects</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Plus className="w-4 h-4 mr-1" /> New Project
              </Button>
            </DialogTrigger>
            <NewProjectDialog onCreated={() => { setOpen(false); load(); }} />
          </Dialog>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-border rounded-lg p-10 text-center">
            <p className="text-sm text-muted-foreground">No projects yet. Tap <strong>New Project</strong> to begin.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map(p => (
              <Link
                key={p.id}
                to="/projects/$id"
                params={{ id: p.id }}
                className="group block rounded-lg border border-border bg-card hover:border-gold transition overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-primary truncate">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.client ?? "—"}</p>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider bg-accent text-accent-foreground px-2 py-0.5 rounded">
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
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium text-primary">{p.progress}%</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-gold" style={{ width: `${p.progress}%` }} />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Contract</span>
                    <span className="text-sm font-semibold text-primary">
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
      <div className="flex justify-center text-primary mb-1.5">{icon}</div>
      <div className="text-2xl font-bold text-primary">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
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
    const { error } = await supabase.from("projects").insert({
      user_id: DEV_USER.id,
      name,
      client: client || null,
      location: location || null,
      contract_value: value ? Number(value) : null,
      status: "On Site",
      progress: 0,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
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
