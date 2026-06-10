import { supabase } from "@/integrations/supabase/client";

export const SITE_WALK_PHOTO_BUCKET = "site-walk-photos";

export type AnnotationShape =
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string }
  | { kind: "circle"; cx: number; cy: number; r: number; color: string }
  | { kind: "text"; x: number; y: number; text: string; color: string };

export type SiteWalkPhoto = {
  id: string;
  site_walk_id: string;
  project_id: string;
  photo_url: string;
  storage_path: string | null;
  timestamp_seconds: number;
  transcript_context: string | null;
  ai_tags: unknown;
  linked_variation_id: string | null;
  linked_procurement_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  annotations: AnnotationShape[] | null;
  annotated_photo_url: string | null;
  annotated_storage_path: string | null;
  created_at: string;
};

/** Generate a fresh signed URL (1h) for a stored photo. */
export async function signPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(SITE_WALK_PHOTO_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Bulk sign a list of paths. Returns a path → url map. */
export async function signManyPhotoUrls(
  paths: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const clean = Array.from(new Set(paths.filter((p): p is string => !!p)));
  if (clean.length === 0) return {};
  const out: Record<string, string> = {};
  await Promise.all(
    clean.map(async (p) => {
      const url = await signPhotoUrl(p);
      if (url) out[p] = url;
    }),
  );
  return out;
}

/** Capture a JPEG blob from a live <video> element via canvas. */
export async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  return await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
  );
}

/**
 * Capture a composed JPEG of a back-camera video with a front-camera PiP
 * overlay (top right). Both args are live <video> elements.
 */
export async function captureDualCameraFrame(
  back: HTMLVideoElement,
  front: HTMLVideoElement | null,
): Promise<Blob | null> {
  const w = back.videoWidth;
  const h = back.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(back, 0, 0, w, h);
  if (front && front.videoWidth && front.videoHeight) {
    const pipW = Math.round(w * 0.28);
    const pipH = Math.round((pipW * front.videoHeight) / front.videoWidth);
    const margin = Math.round(w * 0.025);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(w - pipW - margin - 4, margin - 4, pipW + 8, pipH + 8);
    ctx.drawImage(front, w - pipW - margin, margin, pipW, pipH);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(w - pipW - margin, margin, pipW, pipH);
    ctx.restore();
  }
  return await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
  );
}

/** Take a transcript timeline and return the slice covering the last `windowSeconds`. */
export function transcriptContextAt(
  timeline: Array<{ t: number; text: string }>,
  atSecond: number,
  windowSeconds = 15,
): string {
  if (timeline.length === 0) return "";
  const cutoff = atSecond - windowSeconds;
  let baseLen = 0;
  for (const e of timeline) {
    if (e.t <= cutoff) baseLen = e.text.length;
    else break;
  }
  let latest = "";
  for (const e of timeline) {
    if (e.t <= atSecond) latest = e.text;
    else break;
  }
  return latest.slice(baseLen).trim();
}

/** Best-effort device geolocation, returns null if denied or unavailable. */
export async function getDeviceLocation(
  timeoutMs = 4000,
): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return await new Promise((resolve) => {
    let done = false;
    const finish = (v: { lat: number; lng: number } | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const t = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        finish({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(t);
        finish(null);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs },
    );
  });
}

/** Render an image blob with annotation shapes drawn on top, returns a new JPEG blob. */
export async function flattenAnnotations(
  source: Blob,
  shapes: AnnotationShape[],
  displayWidth: number,
  displayHeight: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.drawImage(bitmap, 0, 0);

  const sx = bitmap.width / Math.max(1, displayWidth);
  const sy = bitmap.height / Math.max(1, displayHeight);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const s of shapes) {
    ctx.strokeStyle = s.kind === "text" ? "transparent" : s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = Math.max(3, Math.round(4 * Math.max(sx, sy)));
    if (s.kind === "arrow") {
      const x1 = s.x1 * sx, y1 = s.y1 * sy, x2 = s.x2 * sx, y2 = s.y2 * sy;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = ctx.lineWidth * 3.5;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 7), y2 - head * Math.sin(angle - Math.PI / 7));
      ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 7), y2 - head * Math.sin(angle + Math.PI / 7));
      ctx.closePath();
      ctx.fill();
    } else if (s.kind === "circle") {
      ctx.beginPath();
      ctx.arc(s.cx * sx, s.cy * sy, s.r * Math.max(sx, sy), 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.kind === "text") {
      const size = Math.round(22 * Math.max(sx, sy));
      ctx.font = `bold ${size}px ui-sans-serif, system-ui, -apple-system`;
      const metrics = ctx.measureText(s.text);
      const pad = Math.round(size * 0.3);
      const tx = s.x * sx;
      const ty = s.y * sy;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(tx - pad, ty - size - pad, metrics.width + pad * 2, size + pad * 2);
      ctx.fillStyle = s.color;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(s.text, tx, ty);
    }
  }
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? source), "image/jpeg", 0.85),
  );
}
