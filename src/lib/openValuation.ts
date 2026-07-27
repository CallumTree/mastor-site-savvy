import { supabase } from "@/integrations/supabase/client";

export type OpenValuation = { id: string; valuation_number: number };

/**
 * Single source of truth for whether a valuation's line items can still be
 * edited. A valuation locks the moment it's Approved (that's what
 * "Finalise" means) — being invoiced on top of that is a stronger, also-
 * locked state, not a separate condition. Used by both the valuations list
 * and the valuation detail page so they never disagree again.
 */
export function isValuationLocked(status: string, hasInvoice: boolean): boolean {
  return hasInvoice || status === "Approved";
}

/**
 * The "open" valuation for a project = the Draft valuation, if one exists.
 * Approved valuations (invoiced or not) are locked, so a newly-approved
 * variation should never silently land in one — it should start a fresh
 * Draft instead.
 */
export async function findOpenValuation(
  projectId: string,
): Promise<OpenValuation | null> {
  const { data: val, error } = await supabase
    .from("valuations")
    .select("id, valuation_number")
    .eq("project_id", projectId)
    .eq("status", "Draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return val ? { id: val.id, valuation_number: val.valuation_number ?? 0 } : null;
}

export async function getOrCreateOpenValuation(
  projectId: string,
): Promise<OpenValuation> {
  const existing = await findOpenValuation(projectId);
  if (existing) return existing;

  const { data: nums, error: nErr } = await supabase
    .from("valuations")
    .select("valuation_number")
    .eq("project_id", projectId);
  if (nErr) throw nErr;
  const nextNum =
    (nums ?? []).reduce((m, v) => Math.max(m, v.valuation_number ?? 0), 0) + 1;

  const { data: created, error: cErr } = await supabase
    .from("valuations")
    .insert({
      project_id: projectId,
      status: "Draft",
      valuation_number: nextNum,
      valuation_date: new Date().toISOString().slice(0, 10),
    })
    .select("id, valuation_number")
    .single();
  if (cErr || !created) throw cErr ?? new Error("Failed to create valuation");
  return { id: created.id, valuation_number: created.valuation_number ?? nextNum };
}

export function formatValuationNumber(n: number) {
  return `IV-${String(n).padStart(2, "0")}`;
}
