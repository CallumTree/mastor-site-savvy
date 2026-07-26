import { supabase } from "@/integrations/supabase/client";

export const PROJECT_COVER_BUCKET = "project-covers";

/** Generate a fresh signed URL (1h) for a stored custom project cover. */
export async function signProjectCoverUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(PROJECT_COVER_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Bulk sign a list of project-id → cover-path pairs. Returns a projectId → url map. */
export async function signManyProjectCoverUrls(
  pathByProjectId: Record<string, string>,
): Promise<Record<string, string>> {
  const entries = Object.entries(pathByProjectId);
  if (entries.length === 0) return {};
  const out: Record<string, string> = {};
  await Promise.all(
    entries.map(async ([projectId, path]) => {
      const url = await signProjectCoverUrl(path);
      if (url) out[projectId] = url;
    }),
  );
  return out;
}
