import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { Share2, Copy, Ban, Plus } from "lucide-react";

type ShareRow = {
  id: string;
  token: string;
  label: string | null;
  show_valuations: boolean;
  show_contract_value: boolean;
  revoked_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
};

export function ShareProjectSheet({ projectId, triggerClassName }: { projectId: string; triggerClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [label, setLabel] = useState("");
  const [showValuations, setShowValuations] = useState(false);
  const [showContractValue, setShowContractValue] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("project_shares")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) showError("Share", error);
    setShares((data ?? []) as ShareRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const { error } = await supabase.from("project_shares").insert({
      project_id: projectId,
      label: label.trim() || null,
      show_valuations: showValuations,
      show_contract_value: showContractValue,
    } as any);
    setCreating(false);
    if (error) return showError("Share", error);
    setLabel("");
    setShowValuations(false);
    setShowContractValue(false);
    toast.success("Share link created");
    load();
  };

  const revoke = async (id: string) => {
    const { error } = await supabase
      .from("project_shares")
      .update({ revoked_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) return showError("Share", error);
    toast.success("Link revoked");
    load();
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className={triggerClassName ?? "gap-1.5"}>
          <Share2 className="w-4 h-4" /> Share
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Share with client</SheetTitle>
        </SheetHeader>

        <form onSubmit={create} className="mt-4 space-y-3 rounded-2xl border border-border p-4">
          <div className="space-y-1.5">
            <Label>Label (optional)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. For Berkeley Homes" />
          </div>
          <label className="flex items-center justify-between text-sm py-1">
            <span>Show valuation status</span>
            <Switch checked={showValuations} onCheckedChange={setShowValuations} />
          </label>
          <label className="flex items-center justify-between text-sm py-1">
            <span>Show contract value</span>
            <Switch checked={showContractValue} onCheckedChange={setShowContractValue} />
          </label>
          <Button type="submit" disabled={creating} className="w-full gap-1.5">
            <Plus className="w-4 h-4" /> Create link
          </Button>
        </form>

        <div className="mt-4 space-y-2 pb-[env(safe-area-inset-bottom)]">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">No share links yet.</p>
          ) : (
            shares.map((s) => (
              <div key={s.id} className="rounded-xl border border-border p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.label || "Untitled link"}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.revoked_at
                      ? "Revoked"
                      : s.last_viewed_at
                        ? `Viewed ${new Date(s.last_viewed_at).toLocaleDateString("en-GB")}`
                        : "Not viewed yet"}
                  </p>
                </div>
                {!s.revoked_at && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button type="button" variant="ghost" size="icon" onClick={() => copyLink(s.token)} aria-label="Copy link">
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => revoke(s.id)} aria-label="Revoke link">
                      <Ban className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
