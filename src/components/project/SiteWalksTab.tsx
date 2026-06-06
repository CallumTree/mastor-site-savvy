import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { analyseSiteWalk } from "@/lib/analysis.functions";
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
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Eye,
  Trash2,
  Plus,
  Sparkles,
  Check,
  X,
  Pencil,
  Loader2,
  ClipboardCheck,
  Video,
  FileVideo,
} from "lucide-react";
import { AnalysisReview } from "./AnalysisReview";

type RecordingMode = "audio" | "video";

type SiteWalk = {
  id: string;
  title: string | null;
  transcript: string | null;
  duration_seconds: number;
  created_at: string;
  recording_type?: string | null;
  video_path?: string | null;
};


type Confidence = "high" | "medium" | "low";

type ProgressItem = { description: string; location: string; confidence: Confidence };
type ProcurementItem = {
  description: string;
  quantity: number;
  unit: string;
  location: string;
  confidence: Confidence;
};
type VariationItem = { description: string; location: string; confidence: Confidence };
type RiskItem = { description: string; location: string; confidence: Confidence };

type Analysis = {
  progress_items: ProgressItem[];
  procurement_items: ProcurementItem[];
  variation_items: VariationItem[];
  risk_items: RiskItem[];
  site_diary_summary: string;
};

type AnalysisRow = {
  id: string;
  site_walk_id: string;
  project_id: string;
  created_at: string;
  analysis_json: Analysis;
};

type Status = "idle" | "recording" | "paused" | "finished";
type ItemState = "suggested" | "approved" | "rejected";

const QUICK_AREAS = ["Bedroom", "Bathroom", "Kitchen", "External"];

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
function formatMinutes(secs: number) {
  if (secs < 60) return `${secs}s`;
  const m = Math.round(secs / 60);
  return `${m} min${m === 1 ? "" : "s"}`;
}
function confidenceClass(c: Confidence) {
  if (c === "high") return "border-emerald-500/40 text-emerald-700 bg-emerald-500/10";
  if (c === "medium") return "border-amber-500/40 text-amber-700 bg-amber-500/10";
  return "border-rose-500/40 text-rose-700 bg-rose-500/10";
}

export function SiteWalksTab({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<RecordingMode>("audio");
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [walks, setWalks] = useState<SiteWalk[]>([]);
  const [loading, setLoading] = useState(true);
  const [micDenied, setMicDenied] = useState(false);

  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");

  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  // Video-only state
  const [videoConfirmOpen, setVideoConfirmOpen] = useState(false);
  const [chunksUploaded, setChunksUploaded] = useState(0);
  const [chunksUploading, setChunksUploading] = useState(0);

  const [viewing, setViewing] = useState<SiteWalk | null>(null);

  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [viewingAnalysis, setViewingAnalysis] = useState<AnalysisRow | null>(null);
  const [reviewingAnalysis, setReviewingAnalysis] = useState<AnalysisRow | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SR | null>(null);
  const shouldRestartRef = useRef(false);
  const transcriptRef = useRef("");
  const sessionBaseRef = useRef("");

  // Video recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoSessionPathRef = useRef<string>("");
  const videoChunkIndexRef = useRef(0);
  const videoMimeRef = useRef<string>("video/webm");

  const analyseFn = useServerFn(analyseSiteWalk);
  const speechSupported = !!getSpeechRecognition();


  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const loadAll = async () => {
    setLoading(true);
    const [{ data: walkData, error: we }, { data: anData, error: ae }] = await Promise.all([
      supabase
        .from("site_walks")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("analysis_results")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
    ]);
    if (we) toast.error(we.message);
    if (ae) toast.error(ae.message);
    setWalks((walkData ?? []) as SiteWalk[]);
    setAnalyses((anData ?? []) as unknown as AnalysisRow[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      shouldRestartRef.current = false;
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
    // Android Chrome emits cumulative final results (each new final extends
    // the previous text). Instead of dedup-by-index + append, we treat the
    // engine's current result set as authoritative for THIS session and
    // overwrite the session portion of the transcript on every event.
    rec.onresult = (event: any) => {
      let sessionFinal = "";
      let sessionInterim = "";
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        const text = (res[0]?.transcript ?? "").trim();
        if (!text) continue;
        if (res.isFinal) {
          sessionFinal += (sessionFinal ? " " : "") + text;
        } else {
          sessionInterim += (sessionInterim ? " " : "") + text;
        }
      }
      const base = sessionBaseRef.current;
      const sep = base && sessionFinal && !/\s$/.test(base) ? " " : "";
      const next = base + (sessionFinal ? sep + sessionFinal : "");
      transcriptRef.current = next;
      setTranscript(next);
      // Interim is preview-only — never written into the saved transcript.
      setInterim(sessionInterim);
    };
    rec.onerror = (e: any) => {
      const err = e?.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        setMicDenied(true);
        shouldRestartRef.current = false;
        toast.error("Microphone access required for voice recording.");
      } else if (err && err !== "no-speech" && err !== "aborted") {
        toast.error(`Mic error: ${err}`);
      }
    };
    rec.onend = () => {
      // Drop any uncommitted interim from the ended session.
      setInterim("");
      // Fold completed session into the base so the next session starts clean.
      sessionBaseRef.current = transcriptRef.current;
      if (shouldRestartRef.current) {
        try {
          rec.start();
        } catch {}
      }
    };
    return rec;
  };

  const startRecognition = () => {
    if (!speechSupported) return;
    const rec = createRecognition();
    if (!rec) return;
    recognitionRef.current = rec;
    shouldRestartRef.current = true;
    // New session: anchor to whatever is already in the transcript.
    sessionBaseRef.current = transcriptRef.current;
    try {
      rec.start();
    } catch {}
  };

  const stopRecognition = () => {
    shouldRestartRef.current = false;
    try {
      recognitionRef.current?.stop?.();
    } catch {}
    setInterim("");
  };

  const pickVideoMime = () => {
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "video/webm";
  };

  const startVideoRecorder = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera not supported in this browser.");
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });
    } catch (e: any) {
      setMicDenied(true);
      toast.error("Camera/microphone access required for video diary.");
      return false;
    }
    mediaStreamRef.current = stream;
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = stream;
      videoPreviewRef.current.muted = true;
      videoPreviewRef.current.play().catch(() => {});
    }

    const mime = pickVideoMime();
    videoMimeRef.current = mime;
    const ext = mime.includes("mp4") ? "mp4" : "webm";
    const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    videoSessionPathRef.current = `${projectId}/${sessionId}`;
    videoChunkIndexRef.current = 0;
    setChunksUploaded(0);
    setChunksUploading(0);

    const recorder = new MediaRecorder(stream, { mimeType: mime });
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = async (e: BlobEvent) => {
      if (!e.data || e.data.size === 0) return;
      const idx = videoChunkIndexRef.current++;
      const path = `${videoSessionPathRef.current}/part-${String(idx).padStart(4, "0")}.${ext}`;
      setChunksUploading((n) => n + 1);
      const { error } = await supabase.storage
        .from("site-walk-videos")
        .upload(path, e.data, { contentType: mime, upsert: true });
      setChunksUploading((n) => Math.max(0, n - 1));
      if (error) {
        console.error("Video chunk upload failed", error);
        toast.error(`Chunk upload failed: ${error.message}`);
      } else {
        setChunksUploaded((n) => n + 1);
      }
    };
    recorder.onerror = (ev: any) => {
      console.error("MediaRecorder error", ev);
      toast.error("Video recorder error");
    };
    // Emit a chunk every 30 seconds
    recorder.start(30000);
    return true;
  };

  const stopVideoRecorder = async () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      await new Promise<void>((resolve) => {
        rec.onstop = () => resolve();
        try { rec.stop(); } catch { resolve(); }
      });
    }
    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    // Wait briefly for outstanding chunk uploads to settle
    const deadline = Date.now() + 15000;
    while (chunksUploading > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const handleStart = async (selectedMode: RecordingMode) => {
    setMode(selectedMode);
    setTranscript("");
    transcriptRef.current = "";
    sessionBaseRef.current = "";
    setInterim("");
    setSeconds(0);
    setMicDenied(false);
    if (selectedMode === "video") {
      const ok = await startVideoRecorder();
      if (!ok) return;
    }
    startTimer();
    setStatus("recording");
    startRecognition();
  };
  const handlePause = () => {
    stopTimer();
    stopRecognition();
    if (mode === "video" && mediaRecorderRef.current?.state === "recording") {
      try { mediaRecorderRef.current.pause(); } catch {}
    }
    setStatus("paused");
  };
  const handleResume = () => {
    startTimer();
    setStatus("recording");
    startRecognition();
    if (mode === "video" && mediaRecorderRef.current?.state === "paused") {
      try { mediaRecorderRef.current.resume(); } catch {}
    }
  };
  const handleFinish = async () => {
    stopTimer();
    stopRecognition();
    if (mode === "video") {
      await stopVideoRecorder();
      setStatus("finished");
      setTitle(`Site diary – ${new Date().toLocaleDateString("en-GB")}`);
      setVideoConfirmOpen(true);
      return;
    }
    setStatus("finished");
    setTitle(`Site walk – ${new Date().toLocaleDateString("en-GB")}`);
    setSaveOpen(true);
  };


  const insertMarker = (name: string) => {
    const marker = `[${name}]\n`;
    const ta = textareaRef.current;
    const current = transcriptRef.current;
    if (!ta || document.activeElement !== ta) {
      const prefix = current && !current.endsWith("\n") ? "\n" : "";
      const next = current + prefix + marker;
      transcriptRef.current = next;
      sessionBaseRef.current = next;
      setTranscript(next);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const before = current.slice(0, start);
    const after = current.slice(end);
    const needsLeadingNl = before && !before.endsWith("\n") ? "\n" : "";
    const inserted = needsLeadingNl + marker;
    const next = before + inserted + after;
    transcriptRef.current = next;
    sessionBaseRef.current = next;
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
    transcriptRef.current = "";
    setInterim("");
    setSeconds(0);
    setTitle("");
    setMicDenied(false);
    loadAll();
  };

  const handleCancelSave = () => {
    setSaveOpen(false);
    setStatus("paused");
  };

  const deleteWalk = async (id: string) => {
    if (!confirm("Are you sure you want to delete this Site Walk?")) return;
    const { error } = await supabase.from("site_walks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    loadAll();
  };

  const analyseWalk = async (walk: SiteWalk) => {
    if (!walk.transcript || !walk.transcript.trim()) {
      toast.error("This site walk has no transcript to analyse.");
      return;
    }
    setAnalysingId(walk.id);
    try {
      const result = await analyseFn({ data: { transcript: walk.transcript } });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { data, error } = await supabase
        .from("analysis_results")
        .insert({
          project_id: projectId,
          site_walk_id: walk.id,
          analysis_json: result.analysis as any,
        })
        .select("*")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Analysis complete");
      const row = data as unknown as AnalysisRow;
      setAnalyses((prev) => [row, ...prev]);
      setReviewingAnalysis(row);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Analysis failed");
    } finally {
      setAnalysingId(null);
    }
  };

  const deleteAnalysis = async (id: string) => {
    if (!confirm("Delete this analysis?")) return;
    const { error } = await supabase.from("analysis_results").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setAnalyses((prev) => prev.filter((a) => a.id !== id));
    if (viewingAnalysis?.id === id) setViewingAnalysis(null);
    toast.success("Analysis deleted");
  };

  const analysesByWalk = analyses.reduce<Record<string, AnalysisRow[]>>((acc, a) => {
    (acc[a.site_walk_id] ||= []).push(a);
    return acc;
  }, {});
  const walkById = new Map(walks.map((w) => [w.id, w]));

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

  const voiceActive = status === "recording" && speechSupported && !micDenied;

  return (
    <div className="space-y-6">
      {/* Recorder */}
      <section className="rounded-xl border border-border bg-card p-5 space-y-5 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Site Walk Recorder
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Walk the site. Speak naturally — your words appear below.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <span
                className={`flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  voiceActive
                    ? "border-red-500/40 text-red-600 bg-red-500/10"
                    : "border-border text-muted-foreground"
                }`}
              >
                {voiceActive ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
                {voiceActive ? "Listening" : "Mic off"}
              </span>
            )}
            <span
              className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="text-center">
          <div className="font-mono text-5xl md:text-6xl font-semibold tabular-nums text-primary">
            {formatDuration(seconds)}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {status === "idle" && (
            <Button onClick={handleStart} size="lg" className="gap-2 h-14 px-8 text-base">
              <Mic className="w-5 h-5" /> Start Recording
            </Button>
          )}
          {status === "recording" && (
            <>
              <Button onClick={handlePause} size="lg" variant="secondary" className="gap-2 h-14 px-6 text-base">
                <Pause className="w-5 h-5" /> Pause
              </Button>
              <Button onClick={handleFinish} size="lg" variant="destructive" className="gap-2 h-14 px-6 text-base">
                <Square className="w-5 h-5" /> Finish
              </Button>
            </>
          )}
          {status === "paused" && (
            <>
              <Button onClick={handleResume} size="lg" className="gap-2 h-14 px-6 text-base">
                <Play className="w-5 h-5" /> Resume
              </Button>
              <Button onClick={handleFinish} size="lg" variant="destructive" className="gap-2 h-14 px-6 text-base">
                <Square className="w-5 h-5" /> Finish
              </Button>
            </>
          )}
        </div>

        {!speechSupported && (
          <p className="text-xs text-amber-600 text-center">
            Voice recognition not supported in this browser. Use Chrome on desktop or Android — you can still type notes manually.
          </p>
        )}
        {speechSupported && micDenied && isActive && (
          <p className="text-xs text-amber-600 text-center">
            Microphone access required for voice recording. You can continue using manual text entry.
          </p>
        )}

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
              Transcript {isActive && "· editable · final results only"}
            </div>
            <Textarea
              ref={textareaRef}
              value={transcript}
              onChange={(e) => {
                transcriptRef.current = e.target.value;
                sessionBaseRef.current = e.target.value;
                setTranscript(e.target.value);
              }}
              placeholder={
                voiceActive
                  ? "Listening… confirmed speech will appear here."
                  : "Type notes as you walk the site…"
              }
              rows={10}
              className="min-h-[220px] text-base leading-relaxed"
            />
            {voiceActive && (
              <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 min-h-[2.25rem]">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
                  Live preview (not saved)
                </div>
                <div className="text-sm italic text-muted-foreground">
                  {interim || "…"}
                </div>
              </div>
            )}
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
            {walks.map((w) => {
              const count = analysesByWalk[w.id]?.length ?? 0;
              const busy = analysingId === w.id;
              return (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg bg-card border border-border hover:border-primary/40 transition-colors"
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
                      {count > 0 && (
                        <span className="ml-2 text-primary">
                          · {count} analysis{count === 1 ? "" : "es"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => setViewing(w)}>
                      <Eye className="w-4 h-4" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-primary/30 text-primary hover:bg-primary/5"
                      disabled={busy}
                      onClick={() => analyseWalk(w)}
                    >
                      {busy ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {busy ? "Analysing…" : "Analyse Walk"}
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
              );
            })}
          </div>
        )}
      </section>

      {/* Previous Analyses */}
      {analyses.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Previous Analyses
          </h3>
          <div className="space-y-2">
            {analyses.map((a) => {
              const walk = walkById.get(a.site_walk_id);
              const aj = a.analysis_json;
              return (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-lg bg-card border border-border"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {walk?.title || "Site walk"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(a.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}{" "}
                      · Progress {aj.progress_items?.length ?? 0} · Procurement{" "}
                      {aj.procurement_items?.length ?? 0} · Variations{" "}
                      {aj.variation_items?.length ?? 0} · Risks {aj.risk_items?.length ?? 0}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-primary/30 text-primary hover:bg-primary/5"
                      onClick={() => setReviewingAnalysis(a)}
                    >
                      <ClipboardCheck className="w-4 h-4" /> Review
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      onClick={() => setViewingAnalysis(a)}
                    >
                      <Eye className="w-4 h-4" /> View Analysis
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-destructive hover:text-destructive"
                      onClick={() => deleteAnalysis(a.id)}
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

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

      {/* View transcript dialog */}
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
              <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border bg-background p-3 text-sm whitespace-pre-wrap leading-relaxed">
                {viewing.transcript || "(no notes recorded)"}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Analysis viewer */}
      <Dialog open={!!viewingAnalysis} onOpenChange={(o) => !o && setViewingAnalysis(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> AI Review Queue
            </DialogTitle>
          </DialogHeader>
          {viewingAnalysis && (
            <AnalysisViewer
              row={viewingAnalysis}
              projectId={projectId}
              walkTitle={walkById.get(viewingAnalysis.site_walk_id)?.title ?? "Site walk"}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Post-analysis review */}
      <Dialog
        open={!!reviewingAnalysis}
        onOpenChange={(o) => !o && setReviewingAnalysis(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" /> Review Findings
            </DialogTitle>
          </DialogHeader>
          {reviewingAnalysis && (
            <AnalysisReview
              analysisId={reviewingAnalysis.id}
              projectId={projectId}
              siteWalkId={reviewingAnalysis.site_walk_id}
              analysisJson={reviewingAnalysis.analysis_json}
              walkTitle={walkById.get(reviewingAnalysis.site_walk_id)?.title ?? "Site walk"}
              onDone={() => setReviewingAnalysis(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------- Analysis Viewer -------------------------- */

type FindingType = "progress" | "procurement" | "variation" | "risk";
type FindingRow = {
  id: string;
  finding_type: FindingType;
  original_text: string;
  finding_text: string;
  status: string;
};

function AnalysisViewer({
  row,
  projectId,
  walkTitle,
}: {
  row: AnalysisRow;
  projectId: string;
  walkTitle: string;
}) {
  const a = row.analysis_json;
  const [findings, setFindings] = useState<Record<string, FindingRow>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const keyOf = (type: FindingType, original: string) => `${type}|${original}`;

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("approved_findings")
        .select("*")
        .eq("analysis_id", row.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      const map: Record<string, FindingRow> = {};
      for (const f of (data ?? []) as FindingRow[]) {
        map[keyOf(f.finding_type, f.original_text)] = f;
      }
      setFindings(map);
    })();
  }, [row.id]);

  const upsertFinding = async (
    type: FindingType,
    originalText: string,
    findingText: string,
    confidence: string,
    status: "Approved" | "Rejected" | "Awaiting Review",
  ) => {
    const key = keyOf(type, originalText);
    setBusyKey(key);
    const existing = findings[key];
    const payload: any = {
      project_id: projectId,
      analysis_id: row.id,
      site_walk_id: row.site_walk_id,
      finding_type: type,
      original_text: originalText,
      finding_text: findingText,
      confidence,
      status,
      approved_at: status === "Approved" ? new Date().toISOString() : null,
    };
    let saved: FindingRow | null = null;
    if (existing) {
      const { data, error } = await (supabase as any)
        .from("approved_findings")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) {
        toast.error(error.message);
        setBusyKey(null);
        return;
      }
      saved = data as FindingRow;
    } else {
      const { data, error } = await (supabase as any)
        .from("approved_findings")
        .insert(payload)
        .select("*")
        .single();
      if (error) {
        toast.error(error.message);
        setBusyKey(null);
        return;
      }
      saved = data as FindingRow;
    }
    setFindings((p) => ({ ...p, [key]: saved! }));

    // Downstream records on approval
    if (status === "Approved") {
      if (type === "procurement") {
        const { error } = await (supabase as any).from("procurement_items").insert({
          project_id: projectId,
          description: findingText,
          status: "Required",
        });
        if (error) toast.error(`Procurement: ${error.message}`);
        else toast.success("Approved — Procurement item created");
      } else if (type === "variation") {
        const { error } = await (supabase as any).from("variations").insert({
          project_id: projectId,
          description: findingText,
          status: "Draft",
        });
        if (error) toast.error(`Variation: ${error.message}`);
        else toast.success("Approved — Variation created");
      } else {
        toast.success("Finding approved");
      }
    } else if (status === "Rejected") {
      toast.success("Finding rejected");
    }
    setBusyKey(null);
  };

  const renderRow = (
    type: FindingType,
    originalText: string,
    confidence: Confidence,
  ) => {
    const key = keyOf(type, originalText);
    const existing = findings[key];
    const currentText = drafts[key] ?? existing?.finding_text ?? originalText;
    const state: ItemState =
      existing?.status === "Approved"
        ? "approved"
        : existing?.status === "Rejected"
        ? "rejected"
        : "suggested";
    const editing = editingKey === key;
    return (
      <ReviewRow
        key={key}
        text={currentText}
        confidence={confidence}
        state={state}
        editing={editing}
        busy={busyKey === key}
        onEdit={() => {
          if (editing) {
            // Save edit if approved already, persist new text
            if (existing && existing.status === "Approved") {
              upsertFinding(type, originalText, currentText, confidence, "Approved");
            } else if (existing) {
              upsertFinding(type, originalText, currentText, confidence, existing.status as any);
            }
          } else {
            setDrafts((d) => ({ ...d, [key]: currentText }));
          }
          setEditingKey(editing ? null : key);
        }}
        onChange={(v) => setDrafts((d) => ({ ...d, [key]: v }))}
        onApprove={() => upsertFinding(type, originalText, currentText, confidence, "Approved")}
        onReject={() => upsertFinding(type, originalText, currentText, confidence, "Rejected")}
      />
    );
  };

  const counts = {
    progress: a.progress_items?.length ?? 0,
    procurement: a.procurement_items?.length ?? 0,
    variation: a.variation_items?.length ?? 0,
    risk: a.risk_items?.length ?? 0,
  };

  return (
    <div className="space-y-5 overflow-y-auto pr-1">
      <div className="text-[11px] text-muted-foreground">
        {walkTitle} ·{" "}
        {new Date(row.created_at).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard label="Progress" value={counts.progress} />
        <SummaryCard label="Procurement" value={counts.procurement} />
        <SummaryCard label="Variations" value={counts.variation} />
        <SummaryCard label="Risks" value={counts.risk} />
      </div>

      {a.site_diary_summary && (
        <Section title="Site Diary Summary">
          <div className="rounded-md border border-border bg-background p-3 text-sm leading-relaxed">
            {a.site_diary_summary}
          </div>
        </Section>
      )}

      <Section title="Progress Identified" empty={counts.progress === 0}>
        {a.progress_items?.map((p) => {
          const original = `${p.description}${p.location ? ` — ${p.location}` : ""}`;
          return renderRow("progress", original, p.confidence);
        })}
      </Section>

      <Section title="Procurement Requirements" empty={counts.procurement === 0}>
        {a.procurement_items?.map((p) => {
          const original = `${p.quantity ? `${p.quantity} ` : ""}${p.unit ? `${p.unit} ` : ""}${p.description}${
            p.location ? ` — ${p.location}` : ""
          }`.trim();
          return renderRow("procurement", original, p.confidence);
        })}
      </Section>

      <Section title="Potential Variations" empty={counts.variation === 0}>
        {a.variation_items?.map((p) => {
          const original = `${p.description}${p.location ? ` — ${p.location}` : ""}`;
          return renderRow("variation", original, p.confidence);
        })}
      </Section>

      <Section title="Risks & Delays" empty={counts.risk === 0}>
        {a.risk_items?.map((p) => {
          const original = `${p.description}${p.location ? ` — ${p.location}` : ""}`;
          return renderRow("risk", original, p.confidence);
        })}
      </Section>

      <p className="text-[11px] text-muted-foreground text-center pt-2">
        Approving a procurement or variation finding creates a real record. Progress &amp; risk approvals are stored for audit only.
      </p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-background p-3 text-center">
      <div className="text-2xl font-semibold text-primary tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}

function Section({
  title,
  badge,
  empty,
  children,
}: {
  title: string;
  badge?: string;
  empty?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</h4>
        {badge && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/5">
            {badge}
          </span>
        )}
      </div>
      {empty ? (
        <p className="text-xs text-muted-foreground italic">None identified.</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function ReviewRow({
  text,
  confidence,
  state,
  editing,
  busy,
  onEdit,
  onChange,
  onApprove,
  onReject,
}: {
  text: string;
  confidence: Confidence;
  state: ItemState;
  editing: boolean;
  busy?: boolean;
  onEdit: () => void;
  onChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const stateRing =
    state === "approved"
      ? "border-emerald-500/50 bg-emerald-500/5"
      : state === "rejected"
      ? "border-rose-500/40 bg-rose-500/5 opacity-70"
      : "border-border bg-background";
  return (
    <div className={`flex flex-wrap items-start gap-2 p-3 rounded-md border ${stateRing}`}>
      <div className="flex-1 min-w-0">
        {editing ? (
          <Input value={text} onChange={(e) => onChange(e.target.value)} className="text-sm" />
        ) : (
          <div className="text-sm break-words">{text}</div>
        )}
      </div>
      <span
        className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${confidenceClass(
          confidence,
        )}`}
      >
        {confidence}
      </span>
      <div className="flex gap-1 shrink-0">
        <Button
          size="sm"
          variant={state === "approved" ? "default" : "outline"}
          className="gap-1 h-8"
          disabled={busy}
          onClick={onApprove}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Approve
        </Button>
        <Button size="sm" variant="ghost" className="gap-1 h-8" onClick={onEdit} disabled={busy}>
          <Pencil className="w-3 h-3" /> {editing ? "Save" : "Edit"}
        </Button>
        <Button
          size="sm"
          variant={state === "rejected" ? "destructive" : "ghost"}
          className="gap-1 h-8"
          disabled={busy}
          onClick={onReject}
        >
          <X className="w-3 h-3" /> Reject
        </Button>
      </div>
    </div>
  );
}

