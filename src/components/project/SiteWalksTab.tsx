import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { analyseSiteWalk } from "@/lib/analyseSiteWalk.functions";
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
  Loader2,
  Video,
  FileVideo,
} from "lucide-react";


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




type RoomAnalysis = {
  room: string;
  progress: string[];
  next_tasks: string[];
  materials_needed: string[];
  health_and_safety: string[];
  valuation_notes: string[];
};

type Analysis = {
  summary: string;
  rooms: RoomAnalysis[];
  all_procurement: string[];
  all_variations: string[];
  all_health_and_safety: string[];
};

type AnalysisRow = {
  id: string;
  site_walk_id: string;
  project_id: string;
  created_at: string;
  analysis_json: Analysis;
};

type Status = "idle" | "recording" | "paused" | "finished";


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
    // Outstanding chunk uploads continue in the background;
    // the confirmation dialog disables Save while any are in flight.
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
      recording_type: mode,
      video_path: mode === "video" ? videoSessionPathRef.current || null : null,
    } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(mode === "video" ? "Site diary saved" : "Site walk saved");
    setSaveOpen(false);
    setVideoConfirmOpen(false);
    setStatus("idle");
    setMode("audio");
    setTranscript("");
    transcriptRef.current = "";
    setInterim("");
    setSeconds(0);
    setTitle("");
    setMicDenied(false);
    videoSessionPathRef.current = "";
    videoChunkIndexRef.current = 0;
    setChunksUploaded(0);
    loadAll();
  };

  const handleCancelSave = () => {
    setSaveOpen(false);
    setStatus("paused");
  };

  const handleDiscardVideo = async () => {
    // Best-effort cleanup of uploaded chunks
    const prefix = videoSessionPathRef.current;
    if (prefix) {
      try {
        const { data: files } = await supabase.storage
          .from("site-walk-videos")
          .list(prefix);
        if (files && files.length) {
          await supabase.storage
            .from("site-walk-videos")
            .remove(files.map((f) => `${prefix}/${f.name}`));
        }
      } catch (e) {
        console.warn("Failed to clean up video chunks", e);
      }
    }
    setVideoConfirmOpen(false);
    setStatus("idle");
    setMode("audio");
    setTranscript("");
    transcriptRef.current = "";
    setSeconds(0);
    setTitle("");
    videoSessionPathRef.current = "";
    videoChunkIndexRef.current = 0;
    setChunksUploaded(0);
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
      const result = await analyseFn({
        data: {
          transcript: walk.transcript,
          projectId,
          siteWalkId: walk.id,
          userId: DEV_USER.id,
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Analysis complete");
      const row = result.row as unknown as AnalysisRow;
      setAnalyses((prev) => [row, ...prev]);
      setViewingAnalysis(row);
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
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto justify-center">
              <Button
                onClick={() => handleStart("audio")}
                size="lg"
                className="gap-2 h-14 px-6 text-base"
              >
                <Mic className="w-5 h-5" /> Audio Site Walk
              </Button>
              <Button
                onClick={() => handleStart("video")}
                size="lg"
                variant="secondary"
                className="gap-2 h-14 px-6 text-base"
              >
                <Video className="w-5 h-5" /> Video Site Diary
              </Button>
            </div>
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

        {/* Video preview */}
        {mode === "video" && isActive && (
          <div className="space-y-2">
            <video
              ref={videoPreviewRef}
              className="w-full max-h-[320px] rounded-md bg-black object-cover"
              playsInline
              muted
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileVideo className="w-3 h-3" /> Auto-saving every 30s
              </span>
              <span>
                {chunksUploaded} chunk{chunksUploaded === 1 ? "" : "s"} saved
                {chunksUploading > 0 ? ` · ${chunksUploading} uploading…` : ""}
              </span>
            </div>
          </div>
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
                    <div className="text-sm font-medium text-foreground truncate flex items-center gap-2">
                      {w.recording_type === "video" ? (
                        <FileVideo className="w-3.5 h-3.5 text-primary shrink-0" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{w.title || "Untitled site walk"}</span>
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
                      · Rooms {aj.rooms?.length ?? 0} · Procurement{" "}
                      {aj.all_procurement?.length ?? 0} · Variations{" "}
                      {aj.all_variations?.length ?? 0} · H&amp;S {aj.all_health_and_safety?.length ?? 0}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 border-primary/30 text-primary hover:bg-primary/5"
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

      {/* Video Site Diary confirmation */}
      <Dialog
        open={videoConfirmOpen}
        onOpenChange={(o) => {
          if (!o && !saving) setVideoConfirmOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileVideo className="w-4 h-4 text-primary" /> Save Video Site Diary
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground space-y-1">
              <div>Duration: <span className="text-foreground font-medium">{formatDuration(seconds)}</span></div>
              <div>Chunks saved: <span className="text-foreground font-medium">{chunksUploaded}</span>{chunksUploading > 0 && ` (${chunksUploading} still uploading…)`}</div>
              <div>Transcript: <span className="text-foreground font-medium">{transcript.trim().length} chars</span></div>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Title
              </label>
              <Input
                autoFocus
                placeholder="Video Site Diary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saving stores the video in the project's secure storage and keeps the transcript for AI analysis.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={handleDiscardVideo} disabled={saving}>
              Discard
            </Button>
            <Button onClick={handleSave} disabled={saving || !title.trim() || chunksUploading > 0}>
              {saving ? "Saving…" : "Save site diary"}
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

    </div>
  );
}

/* -------------------------- Analysis Viewer -------------------------- */

function AnalysisViewer({
  row,
  projectId,
  walkTitle,
}: {
  row: AnalysisRow;
  projectId: string;
  walkTitle: string;
}) {
  const a = row.analysis_json ?? ({} as Analysis);
  const [addedVariations, setAddedVariations] = useState<Set<string>>(new Set());
  const [addedProcurement, setAddedProcurement] = useState<Set<string>>(new Set());
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const addVariation = async (text: string) => {
    setBusyKey(`v:${text}`);
    const { error } = await supabase.from("variations").insert({
      project_id: projectId,
      description: text,
      status: "Draft",
    });
    setBusyKey(null);
    if (error) return toast.error(error.message);
    setAddedVariations((s) => new Set(s).add(text));
    toast.success("Variation created");
  };

  const addProcurement = async (text: string) => {
    setBusyKey(`p:${text}`);
    // Dedupe: skip if a similar active item already exists for this project.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const target = norm(text);
    const { data: existing } = await (supabase as any)
      .from("procurement_items")
      .select("description, status")
      .eq("project_id", projectId)
      .in("status", ["Required", "Quoted", "Ordered"]);
    const dup = (existing ?? []).some((r: any) => {
      const e = norm(String(r.description ?? ""));
      if (!e || !target) return false;
      return e === target || e.includes(target) || target.includes(e);
    });
    if (dup) {
      setBusyKey(null);
      setAddedProcurement((s) => new Set(s).add(text));
      toast.info("Already in procurement list — skipped");
      return;
    }
    const { error } = await supabase.from("procurement_items").insert({
      project_id: projectId,
      description: text,
      status: "Required",
    });
    setBusyKey(null);
    if (error) return toast.error(error.message);
    setAddedProcurement((s) => new Set(s).add(text));
    toast.success("Procurement item added");
  };

  const rooms = a.rooms ?? [];
  const procurement = a.all_procurement ?? [];
  const variations = a.all_variations ?? [];
  const hs = a.all_health_and_safety ?? [];

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

      {a.summary && (
        <Section title="Site Summary">
          <div className="rounded-md border border-border bg-background p-3 text-sm leading-relaxed">
            {a.summary}
          </div>
        </Section>
      )}

      <Section title="Rooms & Areas" empty={rooms.length === 0}>
        <div className="space-y-3">
          {rooms.map((r, i) => (
            <RoomCard key={`${r.room}-${i}`} room={r} />
          ))}
        </div>
      </Section>

      <Section title="Procurement" empty={procurement.length === 0}>
        <ul className="space-y-1.5">
          {procurement.map((item, i) => {
            const added = addedProcurement.has(item);
            const busy = busyKey === `p:${item}`;
            return (
              <li
                key={`proc-${i}`}
                className="flex items-start justify-between gap-2 rounded-md border border-border bg-background p-2.5 text-sm"
              >
                <span className="flex-1">{item}</span>
                <Button
                  size="sm"
                  variant={added ? "secondary" : "outline"}
                  className="gap-1 h-7 text-xs"
                  disabled={added || busy}
                  onClick={() => addProcurement(item)}
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : added ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                  {added ? "Added" : "Add to Procurement"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Potential Variations" empty={variations.length === 0}>
        <ul className="space-y-1.5">
          {variations.map((item, i) => {
            const added = addedVariations.has(item);
            const busy = busyKey === `v:${item}`;
            return (
              <li
                key={`var-${i}`}
                className="flex items-start justify-between gap-2 rounded-md border border-border bg-background p-2.5 text-sm"
              >
                <span className="flex-1">{item}</span>
                <Button
                  size="sm"
                  variant={added ? "secondary" : "outline"}
                  className="gap-1 h-7 text-xs"
                  disabled={added || busy}
                  onClick={() => addVariation(item)}
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : added ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                  {added ? "Added" : "Add as Variation"}
                </Button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Health & Safety" empty={hs.length === 0}>
        <ul className="space-y-1.5">
          {hs.map((item, i) => (
            <li
              key={`hs-${i}`}
              className="rounded-md border border-rose-500/30 bg-rose-500/5 p-2.5 text-sm text-rose-900 dark:text-rose-200"
            >
              {item}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function RoomCard({ room }: { room: RoomAnalysis }) {
  const sections: Array<{ label: string; items: string[]; tone?: string }> = [
    { label: "Progress", items: room.progress ?? [] },
    { label: "Next Tasks", items: room.next_tasks ?? [] },
    { label: "Materials Needed", items: room.materials_needed ?? [] },
    {
      label: "Health & Safety",
      items: room.health_and_safety ?? [],
      tone: "text-rose-700 dark:text-rose-300",
    },
    { label: "Valuation Notes", items: room.valuation_notes ?? [] },
  ];
  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="font-semibold text-sm">{room.room}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {sections.map((s) => (
          <div key={s.label}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {s.label}
            </div>
            {s.items.length === 0 ? (
              <div className="text-xs text-muted-foreground italic">—</div>
            ) : (
              <ul className={`text-xs space-y-0.5 list-disc list-inside ${s.tone ?? ""}`}>
                {s.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
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


