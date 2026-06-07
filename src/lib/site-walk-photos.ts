import { supabase } from "@/integrations/supabase/client";

export const SITE_WALK_PHOTO_BUCKET = "site-walk-photos";

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

/** Take a transcript timeline and return the slice covering the last `windowSeconds`. */
export function transcriptContextAt(
  timeline: Array<{ t: number; text: string }>,
  atSecond: number,
  windowSeconds = 15,
): string {
  if (timeline.length === 0) return "";
  const cutoff = atSecond - windowSeconds;
  // Find the last entry recorded at or before cutoff; what came after is "the last 15s"
  let baseLen = 0;
  for (const e of timeline) {
    if (e.t <= cutoff) baseLen = e.text.length;
    else break;
  }
  // Latest transcript known at atSecond
  let latest = "";
  for (const e of timeline) {
    if (e.t <= atSecond) latest = e.text;
    else break;
  }
  return latest.slice(baseLen).trim();
}
