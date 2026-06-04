import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mic, Pause, Play, Square, Eye, Trash2, Plus } from "lucide-react";

type SiteWalk = {
  id: string;
  title: string | null;
  transcript: string | null;
  duration_seconds: number;
  created_at: string;
};

type Status = "idle" | "recording" | "paused" | "finished";

const QUICK_AREAS = ["Bedroom", "Bathroom", "Kitchen", "External"];

function formatDuration(total: number) {
  const h = Math.floor(total / 3600).toString().padStart(2, "0");
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(total % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatMinutes(secs: number) {
  if (secs < 60) return `${secs}s`;
  const m = Math.round(secs / 60);
  return `${m} min${m === 1 ? "" : "s"}`;
}

export function SiteWalksTab({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [walks, setWalks] = useState<SiteWalk[]>([]);
  const [loading, setLoading] = useState(true);

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");

  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const [viewing, setViewing] = useState<SiteWalk | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const loadWalks = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_walks")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setWalks((data ?? []) as SiteWalk[]);
    setLoading(false);
  };

  useEffect(() => {
    loadWalks();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleStart = () => {
    setTranscript("");
    setSeconds(0);
    startTimer();
    setStatus("recording");
  };
  const handlePause = () => {
    stopTimer();
    setStatus("paused");
  };
  const handleResume = () => {
    startTimer();
    setStatus("recording");
  };
  const handleFinish = () => {
    stopTimer();
    setStatus("finished");
    setTitle(`Site walk – ${new Date().toLocaleDateString("en-GB")}`);
    setSaveOpen(true);
  };

  const insertMarker = (name: string) => {
    const marker = `[${name}]\n`;
    const ta = textareaRef.current;
    const current = transcript;
    if (!ta) {
      const prefix = current && !current.endsWith("\n") ? "\n\n" : current ? "\n" : "";
      setTranscript(current + prefix + marker);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const needsLeadingNl = before && !before.endsWith("\n") ? "\n" : "";
    const inserted = needsLeadingNl + marker;
    const next = before + inserted + after;
    setTranscript(next);
    requestAnimationFrame(() => {
      const pos = (before + inserted).length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleCustomArea = () => {
    const name = customName.trim();
    if (!name) return;
    insertMarker(name);
    setCustomName("");
    setCustomOpen(false);
  };

  const handleSave = async () => {
    const t = title.trim();
    if (!t) {
      toast.error("Please enter a title");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("site_walks").insert({
      project_id: projectId,
      title: t,
      transcript: transcript.trim(),
      duration_seconds: seconds,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Site walk saved");
    setSaveOpen(false);
    setStatus("idle");
    setTranscript("");
    setSeconds(0);
    setTitle("");
    loadWalks();
  };

  const handleCancelSave = () => {
    setSaveOpen(false);
    // keep transcript so user can finish later
    setStatus("paused");
  };

  const deleteWalk = async (id: string) => {
    if (!confirm("Are you sure you want to delete this Site Walk?")) return;
    const { error } = await supabase.from("site_walks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    loadWalks();
  };

  const isActive = status === "recording" || status === "paused";
  const statusLabel =
    status === "idle" ? "Ready" : status.charAt(0).toUpperCase() + status.slice(1);
  const statusColor =
    status === "recording"
      ? "border-red-500/40 text-red-600 bg-red-500/10 animate-pulse"
      : status === "paused"
      ? "border-amber-500/40 text-amber-600 bg-amber-500/10"
      : status === "finished"
      ? "border-primary/40 text-primary bg-primary/5"
      : "border-border text-muted-foreground";

  return (
    <div className="space-y-6">
      {/* Recorder */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Site Walk Recorder
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Walk the site. Capture what you see.
            </p>
          </div>
          <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        <div className="text-center">
          <div className="font-mono text-4xl md:text-5xl font-semibold tabular-nums text-primary">
            {formatDuration(seconds)}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {status === "idle" && (
            <Button onClick={handleStart} size="lg" className="gap-2">
              <Mic className="w-4 h-4" /> Start Recording
            </Button>
          )}
          {status === "recording" && (
            <>
              <Button onClick={handlePause} size="lg" variant="secondary" className="gap-2">
                <Pause className="w-4 h-4" /> Pause
              </Button>
              <Button onClick={handleFinish} size="lg" variant="destructive" className="gap-2">
                <Square className="w-4 h-4" /> Finish
              </Button>
            </>
          )}
          {status === "paused" && (
            <>
              <Button onClick={handleResume} size="lg" className="gap-2">
                <Play className="w-4 h-4" /> Resume
              </Button>
              <Button onClick={handleFinish} size="lg" variant="destructive" className="gap-2">
                <Square className="w-4 h-4" /> Finish
              </Button>
            </>
          )}
        </div>

        {/* Area markers */}
        {isActive && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Insert area
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_AREAS.map((a) => (
                <Button
                  key={a}
                  size="sm"
                  variant="outline"
                  className="gap-1 border-primary/30 text-primary hover:bg-primary/5"
                  onClick={() => insertMarker(a)}
                >
                  <Plus className="w-3 h-3" /> {a}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="gap-1 border-[#D4AF37]/40 text-[#9c7e1f] hover:bg-[#D4AF37]/10"
                onClick={() => setCustomOpen(true)}
              >
                <Plus className="w-3 h-3" /> Custom Area
              </Button>
            </div>
          </div>
        )}

        {/* Transcript */}
        {(isActive || transcript) && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Site Notes / Transcript
            </div>
            <Textarea
              ref={textareaRef}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Type notes as you walk the site…"
              rows={8}
              className="min-h-[180px] font-mono text-sm leading-relaxed"
            />
          </div>
        )}
      </section>

      {/* History */}
      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Previous Site Walks
        </h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : walks.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-border text-center">
            <p className="text-sm font-medium text-foreground">No Site Walks Recorded Yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start your first site walk to begin building project records.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {walks.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 p-4 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {w.title || "Untitled site walk"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(w.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    · {formatMinutes(w.duration_seconds)}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="gap-1" onClick={() => setViewing(w)}>
                    <Eye className="w-4 h-4" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-destructive hover:text-destructive"
                    onClick={() => deleteWalk(w.id)}
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Custom area dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom Area</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Bedroom 3, Loft, Rear Garden"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCustomArea();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCustomArea} disabled={!customName.trim()}>
              Insert marker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={(o) => (!o ? handleCancelSave() : setSaveOpen(true))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Site Walk</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Title
              </label>
              <Input
                autoFocus
                placeholder="Weekly Progress Walk"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Duration: {formatDuration(seconds)}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleCancelSave} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Save site walk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.title ?? "Site walk"}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {new Date(viewing.created_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                · {formatMinutes(viewing.duration_seconds)}
              </div>
              <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-background p-3 text-sm whitespace-pre-wrap font-mono leading-relaxed">
                {viewing.transcript || "(no notes recorded)"}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
