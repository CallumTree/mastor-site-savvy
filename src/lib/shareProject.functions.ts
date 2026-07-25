import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z.object({ token: z.string().min(1) });

export type SharedProjectResult =
  | { ok: true; project: SharedProjectData; photoUrls: string[]; valuations: SharedValuation[] | null }
  | { ok: false; error: string };

type SharedProjectData = {
  name: string;
  client: string | null;
  location: string | null;
  status: string;
  progress: number;
  contractValue: number | null;
};

type SharedValuation = { valuationNumber: number | null; status: string };

/**
 * Public, unauthenticated read for the client-facing share link. Runs with
 * the service-role client (bypasses RLS) because the visiting client has no
 * Supabase session at all — the token itself, checked against
 * project_shares, is the only gate. Hand-picks exactly which project fields
 * come back so a leaked/guessed token can never surface more than this
 * function explicitly returns.
 */
export const getSharedProject = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<SharedProjectResult> => {
    const { data: share } = await supabaseAdmin
      .from("project_shares")
      .select("id, project_id, show_valuations, show_contract_value, revoked_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!share || share.revoked_at) {
      return { ok: false, error: "This link is no longer valid." };
    }

    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("name, client, location, status, progress, contract_value")
      .eq("id", share.project_id)
      .maybeSingle();
    if (!project) {
      return { ok: false, error: "This project is no longer available." };
    }

    const { data: photoRows } = await supabaseAdmin
      .from("site_walk_photos")
      .select("storage_path, annotated_storage_path")
      .eq("project_id", share.project_id)
      .order("created_at", { ascending: false })
      .limit(12);

    const photoUrls: string[] = [];
    for (const row of photoRows ?? []) {
      const path = row.annotated_storage_path || row.storage_path;
      if (!path) continue;
      const { data: signed } = await supabaseAdmin.storage
        .from("site-walk-photos")
        .createSignedUrl(path, 60 * 60);
      if (signed?.signedUrl) photoUrls.push(signed.signedUrl);
    }

    let valuations: SharedValuation[] | null = null;
    if (share.show_valuations) {
      const { data: valData } = await supabaseAdmin
        .from("valuations")
        .select("valuation_number, status")
        .eq("project_id", share.project_id)
        .order("created_at", { ascending: false });
      valuations = (valData ?? []).map((v) => ({ valuationNumber: v.valuation_number, status: v.status }));
    }

    // Best-effort "last viewed" — never block the response on it.
    void supabaseAdmin
      .from("project_shares")
      .update({ last_viewed_at: new Date().toISOString() })
      .eq("id", share.id)
      .then(() => {});

    return {
      ok: true,
      project: {
        name: project.name,
        client: project.client,
        location: project.location,
        status: project.status,
        progress: project.progress,
        contractValue: share.show_contract_value ? (project.contract_value as number | null) : null,
      },
      photoUrls,
      valuations,
    };
  });
