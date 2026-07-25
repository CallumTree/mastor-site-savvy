import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSharedProject, type SharedProjectResult } from "@/lib/shareProject.functions";
import { CircularProgress } from "@/components/ui/circular-progress";
import { LoadingDot } from "@/components/ui/loading-dot";
import { Building2, MapPin } from "lucide-react";

export const Route = createFileRoute("/share/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Project Progress — Mastor" }] }),
  component: SharedProjectPage,
});

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

function SharedProjectPage() {
  const { token } = Route.useParams();
  const [result, setResult] = useState<SharedProjectResult | null>(null);

  useEffect(() => {
    getSharedProject({ data: { token } }).then(setResult);
  }, [token]);

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingDot label="Loading project" />
      </div>
    );
  }

  if (!result.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-foreground">Link unavailable</p>
          <p className="text-sm text-muted-foreground mt-2">{result.error}</p>
        </div>
      </div>
    );
  }

  const { project, photoUrls, valuations } = result;
  const hero = photoUrls[0];
  const gallery = photoUrls.slice(1);

  return (
    <div className="min-h-screen bg-background">
      <div className="relative aspect-[16/9] sm:aspect-[21/9] bg-secondary">
        {hero ? (
          <img src={hero} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gold/20 via-secondary to-secondary flex items-center justify-center">
            <Building2 className="w-10 h-10 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">{project.status}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow-sm mt-1">{project.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-white/80">
            {project.client && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{project.client}</span>}
            {project.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{project.location}</span>}
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        <div className="rounded-2xl border border-border bg-card shadow-sm p-5 flex items-center gap-4">
          <CircularProgress value={project.progress} size={72} strokeWidth={6}>
            <span className="text-lg font-bold text-foreground">{project.progress}%</span>
          </CircularProgress>
          <div>
            <p className="label-mono">Overall Progress</p>
            <p className="text-sm text-muted-foreground mt-1">Based on the latest site walk-through.</p>
          </div>
        </div>

        {project.contractValue != null && (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-5">
            <p className="label-mono">Contract Value</p>
            <p className="hero-number text-3xl mt-1">{GBP.format(project.contractValue)}</p>
          </div>
        )}

        {valuations && valuations.length > 0 && (
          <div className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-2">
            <p className="label-mono mb-1">Valuations</p>
            {valuations.map((v, i) => (
              <div key={i} className="flex items-center justify-between text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
                <span className="text-foreground">Valuation {v.valuationNumber ?? "—"}</span>
                <span className="text-muted-foreground">{v.status}</span>
              </div>
            ))}
          </div>
        )}

        {gallery.length > 0 && (
          <div>
            <p className="label-mono mb-3">Recent Site Photos</p>
            <div className="grid grid-cols-3 gap-2">
              {gallery.map((url, i) => (
                <img key={i} src={url} alt="" className="aspect-square object-cover rounded-xl border border-border" />
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="text-center py-8 text-xs text-muted-foreground">
        Powered by <span className="font-semibold text-foreground">Mastor</span>
      </footer>
    </div>
  );
}
