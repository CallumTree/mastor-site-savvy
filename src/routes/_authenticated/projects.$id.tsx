import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronLeft, MapPin, Building2 } from "lucide-react";
import { toast } from "sonner";

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
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).single();
      if (error) toast.error(error.message);
      setProject(data as Project | null);
      setLoading(false);
    })();
  }, [id]);

  const demoProject: Project = {
    id,
    name: "Demo Project — Marylebone Mews Refurbishment",
    client: "Berkeley Homes",
    location: "London NW1",
    contract_value: 2840000,
    status: "On Site",
    progress: 64,
  };

  const displayProject = project ?? demoProject;

  if (loading) return <main className="max-w-5xl mx-auto px-4 py-8 text-sm text-muted-foreground">Loading…</main>;

  return (
    <main className="max-w-5xl mx-auto px-4 py-5 pb-20">
      <Link to="/dashboard" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-4">
        <ChevronLeft className="w-4 h-4" /> Back
      </Link>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.18em] text-gold-foreground/70">{displayProject.status}</p>
        <h1 className="text-2xl font-bold text-primary mt-1">{displayProject.name}</h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
          {displayProject.client && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{displayProject.client}</span>}
          {displayProject.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{displayProject.location}</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label="Contract Value" value={displayProject.contract_value ? GBP.format(Number(displayProject.contract_value)) : "—"} />
          <Metric label="Progress" value={`${displayProject.progress}%`} />
        </div>
      </header>

      <Tabs defaultValue="scope">
        <TabsList className="w-full justify-start overflow-x-auto bg-secondary p-1 h-auto flex-wrap">
          <TabsTrigger value="scope" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Scope & Variations</TabsTrigger>
          <TabsTrigger value="progress" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Site Progress</TabsTrigger>
          <TabsTrigger value="valuations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Valuations</TabsTrigger>
          <TabsTrigger value="procurement" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-xs">Procurement</TabsTrigger>
        </TabsList>

        <TabsContent value="scope" className="mt-4 space-y-3">
          <SectionTitle>Contract Scope</SectionTitle>
          <Row label="Strip-out & enabling works" right="Included" />
          <Row label="Structural alterations — RC frame" right="Included" />
          <Row label="Cat A fit-out, L1–L4" right="Included" />
          <Row label="MEP — primary distribution" right="Included" />

          <SectionTitle className="pt-4">Variations</SectionTitle>
          <VarRow ref="VO-001" desc="Additional steelwork to atrium opening" amount="+£24,500" status="Approved" />
          <VarRow ref="VO-002" desc="Upgraded sanitaryware to client spec" amount="+£8,750" status="Approved" />
          <VarRow ref="VO-003" desc="Reroute of chilled water risers" amount="+£17,200" status="Pending" />
          <VarRow ref="VO-004" desc="Omission of feature joinery to reception" amount="−£12,400" status="Pending" />
        </TabsContent>

        <TabsContent value="progress" className="mt-4 space-y-3">
          <SectionTitle>Programme Status</SectionTitle>
          <Progress label="Demolition & strip-out" value={100} />
          <Progress label="Substructure" value={100} />
          <Progress label="Superstructure" value={82} />
          <Progress label="Envelope & cladding" value={64} />
          <Progress label="MEP first fix" value={45} />
          <Progress label="Internal partitions" value={28} />
          <Progress label="Finishes & snagging" value={6} />

          <SectionTitle className="pt-4">Recent Site Notes</SectionTitle>
          <NoteRow date="14 Mar" text="Concrete pour to Level 5 slab completed — strength tests scheduled." />
          <NoteRow date="12 Mar" text="Scaffold inspection passed. Permit reissued for week commencing." />
          <NoteRow date="09 Mar" text="Delivery of curtain walling units, bay 4–6, signed off by site manager." />
        </TabsContent>

        <TabsContent value="valuations" className="mt-4 space-y-3">
          <SectionTitle>Interim Valuations</SectionTitle>
          <ValRow no="IV-08" period="28 Feb" gross="£1,124,000" cert="£1,068,000" status="Certified" />
          <ValRow no="IV-09" period="31 Mar" gross="£1,342,500" cert="£1,275,300" status="Certified" />
          <ValRow no="IV-10" period="30 Apr" gross="£1,498,200" cert="—" status="Pending QS" />

          <SectionTitle className="pt-4">Retention</SectionTitle>
          <Row label="Retention held (5%)" right="£67,200" />
          <Row label="Anticipated release at PC" right="£33,600" />
        </TabsContent>

        <TabsContent value="procurement" className="mt-4 space-y-3">
          <SectionTitle>Subcontractor Packages</SectionTitle>
          <PackRow pkg="Groundworks & RC frame" sub="Hartshorn Civils Ltd" status="Let" value="£412,000" />
          <PackRow pkg="Structural steel" sub="Caledonian Steelwork" status="Let" value="£186,500" />
          <PackRow pkg="Mechanical services" sub="Briggs MEP" status="Let" value="£298,000" />
          <PackRow pkg="Electrical services" sub="Westgate Electrical" status="Tendering" value="£245,000 (est.)" />
          <PackRow pkg="Curtain walling" sub="Pilkington Façades" status="Let" value="£187,400" />
          <PackRow pkg="Joinery & second fix" sub="—" status="Out to tender" value="—" />

          <SectionTitle className="pt-4">Material Orders</SectionTitle>
          <Row label="Rebar — 26t (Schedule 04)" right="Delivered" />
          <Row label="Brickwork — 48,000 facing bricks" right="Delivery 22 Mar" />
          <Row label="VRF condensers ×6" right="On order — 8 week lead" />
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

function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-xs uppercase tracking-[0.18em] text-muted-foreground ${className}`}>{children}</h3>;
}

function Row({ label, right }: { label: string; right: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 px-3 rounded-md bg-card border border-border">
      <span className="text-sm text-foreground">{label}</span>
      <span className="text-sm font-medium text-primary">{right}</span>
    </div>
  );
}

function VarRow({ ref, desc, amount, status }: { ref: string; desc: string; amount: string; status: string }) {
  const approved = status === "Approved";
  return (
    <div className="p-3 rounded-md bg-card border border-border">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-gold-foreground/80">{ref}</div>
          <div className="text-sm text-foreground mt-0.5">{desc}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-primary">{amount}</div>
          <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${approved ? "text-primary" : "text-muted-foreground"}`}>{status}</div>
        </div>
      </div>
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 rounded-md bg-card border border-border">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-foreground">{label}</span>
        <span className="font-medium text-primary">{value}%</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-gold" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function NoteRow({ date, text }: { date: string; text: string }) {
  return (
    <div className="flex gap-3 py-2 px-3 rounded-md bg-card border border-border">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground w-12 shrink-0 pt-0.5">{date}</div>
      <div className="text-sm text-foreground">{text}</div>
    </div>
  );
}

function ValRow({ no, period, gross, cert, status }: { no: string; period: string; gross: string; cert: string; status: string }) {
  return (
    <div className="p-3 rounded-md bg-card border border-border">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-xs font-semibold text-gold-foreground/80">{no}</div>
          <div className="text-xs text-muted-foreground mt-0.5">Period ending {period}</div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{status}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Gross</div>
          <div className="text-sm font-medium text-primary">{gross}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Certified</div>
          <div className="text-sm font-medium text-primary">{cert}</div>
        </div>
      </div>
    </div>
  );
}

function PackRow({ pkg, sub, status, value }: { pkg: string; sub: string; status: string; value: string }) {
  const letBadge = status === "Let";
  return (
    <div className="p-3 rounded-md bg-card border border-border">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{pkg}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-semibold text-primary">{value}</div>
          <div className={`text-[10px] uppercase tracking-wider mt-0.5 ${letBadge ? "text-primary" : "text-muted-foreground"}`}>{status}</div>
        </div>
      </div>
    </div>
  );
}
