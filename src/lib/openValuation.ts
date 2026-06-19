import { supabase } from "@/integrations/supabase/client";

export type OpenValuation = { id: string; valuation_number: number };

/**
 * The "open" valuation for a project = most recent valuation with NO row
 * in `invoices` referencing it. Status is informational; the authoritative
 * signal is whether an invoice has been generated.
 */
export async function findOpenValuation(
  projectId: string,
): Promise<OpenValuation | null> {
  const { data: vals, error } = await supabase
    .from("valuations")
    .select("id, valuation_number, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!vals || vals.length === 0) return null;

  const ids = vals.map((v) => v.id);
  const { data: invs, error: iErr } = await supabase
    .from("invoices")
    .select("valuation_id")
    .in("valuation_id", ids);
  if (iErr) throw iErr;

  const invoiced = new Set((invs ?? []).map((r) => r.valuation_id));
  const open = vals.find((v) => !invoiced.has(v.id));
  return open
    ? { id: open.id, valuation_number: open.valuation_number ?? 0 }
    : null;
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
