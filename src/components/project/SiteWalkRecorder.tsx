import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mic, Pause, Play, Square, MapPin, Trash2, Eye } from "lucide-react";

type SiteWalk = {
  id: string;
  title: string | null;
  transcript: string | null;
  duration_seconds: number;
  created_at: string;
};

type Status = "idle" | "recording" | "paused" | "finished";

// Minimal SpeechRecognition typing
type SR = any;

function getSpeechRecognition(): SR | null {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function formatDuration(total: number) {
  const h = Math.floor(total / 3600).toString().padStart(2, "0");
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, "0");
  const s = Math.floor(total % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function SiteWalkRecorder({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [walks, setWalks] = useState<SiteWalk[]>([]);
  const [loading, setLoading] = useState(true);
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaName, setAreaName] = useState("");
  const [viewing, setViewing] = useState<SiteWalk | null>(null);
  const [saving, setSaving] = useState(false);

  const recognitionRef = useRef<SR | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef("");
  const shouldRestartRef = useRef(false);
  const supported = !!getSpeechRecognition();

  // Keep ref in sync for callbacks
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

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
      try {
        recognitionRef.current?.stop?.();
      } catch {}
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

  const createRecognition = (): SR | null => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) return null;
    const rec: SR = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-GB";
    rec.onresult = (event: any) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalChunk += res[0].transcript;
        else interimChunk += res[0].transcript;
      }
      if (finalChunk) {
        const sep = transcriptRef.current && !/\s$/.test(transcriptRef.current) ? " " : "";
        const next = transcriptRef.current + sep + finalChunk.trim();
        transcriptRef.current = next;
        setTranscript(next);
      }
      setInterim(interimChunk);
    };
    rec.onerror = (e: any) => {
      if (e?.error && e.error !== "no-speech" && e.error !== "aborted") {
        toast.error(`Mic error: ${e.error}`);
      }
    };
    rec.onend = () => {
      // Browser auto-stops periodically; restart if we're still recording
      if (shouldRestartRef.current) {
        try {
          rec.start();
        } catch {}
      }
    };
    return rec;
  };

  const handleStart = () => {
    if (!supported) {
      toast.error("Speech recognition not supported in this browser. Try Chrome.");
      return;
    }
    setTranscript("");
    transcriptRef.current = "";
    setInterim("");
    setSeconds(0);
    const rec = createRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    shouldRestartRef.current = true;
    try {
      rec.start();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to start recording");
      return;
    }
    startTimer();
    setStatus("recording");
  };

  const handlePause = () => {
    shouldRestartRef.current = false;
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    stopTimer();
    setInterim("");
    setStatus("paused");
  };

  const handleResume = () => {
    const rec = createRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    shouldRestartRef.current = true;
    try {
      rec.start();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to resume");
      return;
    }
    startTimer();
    setStatus("recording");
  };

  const handleFinish = async () => {
    shouldRestartRef.current = false;
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    stopTimer();
    setInterim("");
    const finalTranscript = transcriptRef.current.trim();
    const duration = seconds;
    if (!finalTranscript) {
      toast.error("Nothing recorded yet");
      setStatus("idle");
      return;
    }
    setSaving(true);
    const title = `Site walk – ${new Date().toLocaleString("en-GB")}`;
    const { error } = await supabase.from("site_walks").insert({
      project_id: projectId,
      title,
      transcript: finalTranscript,
      duration_seconds: duration,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Site walk saved");
    setStatus("idle");
    setTranscript("");
    transcriptRef.current = "";
    setSeconds(0);
    loadWalks();
  };

  const handleAddArea = () => {
    const name = areaName.trim();
    if (!name) return;
    const prefix = transcriptRef.current && !transcriptRef.current.endsWith("\n") ? "\n\n" : "";
    const next = `${transcriptRef.current}${prefix}[${name}]\n`;
    transcriptRef.current = next;
    setTranscript(next);
    setAreaName("");
    setAreaOpen(false);
  };

  const deleteWalk = async (id: string) => {
    if (!confirm("Delete this site walk?")) return;
    const { error } = await supabase.from("site_walks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    loadWalks();
  };

  const isActive = status === "recording" || status === "paused";

  return (
    <div className="space-y-6">
      {/* Recorder */}
      <section className="p-4 rounded-lg bg-card border border-border space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Site Walk Recorder</h3>
          <span
            className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              status === "recording"
                ? "border-red-500/40 text-red-500 bg-red-500/10 animate-pulse"
                : status === "paused"
                ? "border-amber-500/40 text-amber-500 bg-amber-500/10"
                : "border-border text-muted-foreground"
            }`}
          >
            {status === "idle" ? "Ready" : status}
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
              <Button onClick={handleFinish} size="lg" variant="destructive" className="gap-2" disabled={saving}>
                <Square className="w-4 h-4" /> Finish
              </Button>
            </>
          )}
          {status === "paused" && (
            <>
              <Button onClick={handleResume} size="lg" className="gap-2">
                <Play className="w-4 h-4" /> Resume
              </Button>
              <Button onClick={handleFinish} size="lg" variant="destructive" className="gap-2" disabled={saving}>
                <Square className="w-4 h-4" /> Finish
              </Button>
            </>
          )}
          {isActive && (
            <Button onClick={() => setAreaOpen(true)} size="lg" variant="outline" className="gap-2">
              <MapPin className="w-4 h-4" /> New Area
            </Button>
          )}
        </div>

        {!supported && (
          <p className="text-xs text-amber-500 text-center">
            Speech recognition not supported in this browser. Use Chrome on desktop or Android.
          </p>
        )}

        {(isActive || transcript) && (
          <div className="rounded-md border border-border bg-background p-3 min-h-[120px] max-h-[300px] overflow-y-auto">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Live Transcript</div>
            <div className="text-sm whitespace-pre-wrap text-foreground">
              {transcript}
              {interim && <span className="text-muted-foreground italic"> {interim}</span>}
              {!transcript && !interim && (
                <span className="text-muted-foreground italic">Listening…</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* History */}
      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Site Walk History</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : walks.length === 0 ? (
          <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
            No site walks recorded yet.
          </div>
        ) : (
          walks.map((w) => (
            <div key={w.id} className="p-3 rounded-md bg-card border border-border space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {new Date(w.created_at).toLocaleString("en-GB")} · {formatDuration(w.duration_seconds)}
                  </div>
                  <div className="text-sm text-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                    {w.transcript || "(empty)"}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => setViewing(w)} aria-label="View">
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteWalk(w.id)} aria-label="Delete">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* New area dialog */}
      <Dialog open={areaOpen} onOpenChange={setAreaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Area</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Bedroom 1, Kitchen, External Works"
            value={areaName}
            onChange={(e) => setAreaName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddArea();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAreaOpen(false)}>Cancel</Button>
            <Button onClick={handleAddArea} disabled={!areaName.trim()}>Add marker</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View transcript dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{viewing?.title ?? "Site walk"}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {new Date(viewing.created_at).toLocaleString("en-GB")} · {formatDuration(viewing.duration_seconds)}
              </div>
              <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-background p-3 text-sm whitespace-pre-wrap">
                {viewing.transcript}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
