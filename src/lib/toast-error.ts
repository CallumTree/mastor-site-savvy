import { toast } from "sonner";

/**
 * Extracts a clean "ErrorType: message" string from any thrown/returned error shape.
 * Handles Supabase PostgrestError, AuthError, FunctionsError, Error instances,
 * fetch Response errors, and plain strings/objects.
 */
export function describeError(err: unknown): { type: string; message: string } {
  if (err == null) return { type: "UnknownError", message: "Unknown error" };

  if (typeof err === "string") return { type: "Error", message: err };

  if (err instanceof Error) {
    // Supabase errors are plain objects but may be wrapped — fall through to object branch below first
    const type = err.name || err.constructor?.name || "Error";
    return { type, message: err.message || String(err) };
  }

  if (typeof err === "object") {
    const e = err as Record<string, unknown>;
    // Supabase PostgrestError: { message, details, hint, code }
    // Supabase AuthError: { name, message, status }
    // Lovable serverFn error envelope: { message, ... }
    const message =
      (typeof e.message === "string" && e.message) ||
      (typeof e.error_description === "string" && e.error_description) ||
      (typeof e.error === "string" && e.error) ||
      (typeof e.details === "string" && e.details) ||
      JSON.stringify(e).slice(0, 300);
    const code = typeof e.code === "string" ? e.code : undefined;
    const status = typeof e.status === "number" ? `HTTP ${e.status}` : undefined;
    const type =
      (typeof e.name === "string" && e.name) ||
      code ||
      status ||
      "Error";
    return { type, message: String(message) };
  }

  return { type: "UnknownError", message: String(err) };
}

/**
 * Shows a toast in the format: "[Context] ErrorType: message"
 * Also logs the original error to the console for full stack inspection.
 */
export function showError(context: string, err: unknown): void {
  const { type, message } = describeError(err);
  console.error(`[${context}]`, err);
  toast.error(`${context} — ${type}: ${message}`);
}

/**
 * Convenience: handle a Supabase `{ data, error }` response.
 * Returns data on success, shows a toast + returns null on error.
 */
export function handleSupabase<T>(
  context: string,
  res: { data: T | null; error: unknown },
): T | null {
  if (res.error) {
    showError(context, res.error);
    return null;
  }
  return res.data;
}
