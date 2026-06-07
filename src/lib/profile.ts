import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  user_id: string;
  full_name: string;
  company_name: string;
  company_logo_url: string | null;
  trial_ends_at: string;
  created_at: string;
};

export async function getCurrentProfile(): Promise<Profile | null> {
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

/**
 * Resolve a stored company_logo_url (a path inside the private company-logos
 * bucket) to a usable signed URL. Returns null when no logo.
 */
export async function getLogoSignedUrl(
  path: string | null | undefined,
  expiresInSec = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("company-logos")
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Fetch the signed URL and return a data URL — needed for embedding in jsPDF. */
export async function getLogoDataUrl(
  path: string | null | undefined,
): Promise<{ dataUrl: string; mime: string } | null> {
  const signed = await getLogoSignedUrl(path);
  if (!signed) return null;
  try {
    const res = await fetch(signed);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    return { dataUrl, mime: blob.type || "image/png" };
  } catch {
    return null;
  }
}
