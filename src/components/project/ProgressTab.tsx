import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Log = { id: string; transcript: string | null; created_at: string };

export function ProgressTab({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("progress_logs")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setLogs((data ?? []) as Log[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("progress_logs").insert({ project_id: projectId, transcript: text.trim() });
    setSaving(false);
    if (error) return toast.error(error.message);
    setText("");
    toast.success("Log added");
    load();
  };

  return (
    <div className="space-y-4">
      <section className="p-3 rounded-md bg-card border border-border space-y-2">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">New site log</h3>
        <Textarea
          placeholder="What happened on site today?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={add} disabled={saving || !text.trim()}>
            {saving ? "Saving…" : "Add log"}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Site Log History</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : logs.length === 0 ? (
          <div className="p-6 rounded-md border border-dashed border-border text-center text-sm text-muted-foreground">
            No site logs yet.
          </div>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="p-3 rounded-md bg-card border border-border">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {new Date(l.created_at).toLocaleString("en-GB")}
              </div>
              <div className="text-sm text-foreground mt-1 whitespace-pre-wrap">{l.transcript}</div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
