import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { PROJECT_COVER_BUCKET, signProjectCoverUrl } from "@/lib/projectCover";
import { Settings, Upload, X } from "lucide-react";

const STATUS_OPTIONS = ["On Site", "Snagging", "On Hold", "Complete"];

export type SettingsProject = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  contract_value: number | null;
  status: string;
  progress: number;
  po_number: string | null;
  cover_photo_path: string | null;
};

export function ProjectSettingsSheet({
  project,
  fallbackCoverUrl,
  triggerClassName,
  onSaved,
}: {
  project: SettingsProject;
  fallbackCoverUrl: string | null;
  triggerClassName?: string;
  onSaved: (patch: Partial<SettingsProject>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [client, setClient] = useState(project.client ?? "");
  const [location, setLocation] = useState(project.location ?? "");
  const [contractValue, setContractValue] = useState(project.contract_value?.toString() ?? "");
  const [status, setStatus] = useState(project.status);
  const [progress, setProgress] = useState(project.progress?.toString() ?? "0");
  const [poNumber, setPoNumber] = useState(project.po_number ?? "");
  const [coverPath, setCoverPath] = useState(project.cover_photo_path);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(!!project.cover_photo_path);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sign the existing custom cover (if any) once, when the sheet mounts.
  useEffect(() => {
    if (!project.cover_photo_path) return;
    signProjectCoverUrl(project.cover_photo_path).then((url) => {
      setCoverPreview(url);
      setCoverLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveCoverUrl = coverPath ? coverPreview : fallbackCoverUrl;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes.user) {
      toast.error("You must be signed in to upload a cover photo.");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${userRes.user.id}/${project.id}.${ext}`;
    const { error } = await supabase.storage
      .from(PROJECT_COVER_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) {
      setUploading(false);
      return showError("Cover photo", error);
    }
    const { error: updateErr } = await supabase
      .from("projects")
      .update({ cover_photo_path: path } as any)
      .eq("id", project.id);
    setUploading(false);
    if (updateErr) return showError("Cover photo", updateErr);
    setCoverPath(path);
    setCoverPreview(await signProjectCoverUrl(path));
    onSaved({ cover_photo_path: path });
    toast.success("Cover photo updated");
  };

  const removeCover = async () => {
    const { error } = await supabase
      .from("projects")
      .update({ cover_photo_path: null } as any)
      .eq("id", project.id);
    if (error) return showError("Cover photo", error);
    setCoverPath(null);
    setCoverPreview(null);
    onSaved({ cover_photo_path: null });
    toast.success("Cover photo removed");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Project name is required");
      return;
    }
    setSaving(true);
    const patch = {
      name: name.trim(),
      client: client.trim() || null,
      location: location.trim() || null,
      contract_value: contractValue ? Number(contractValue) : null,
      status,
      progress: progress ? Math.max(0, Math.min(100, Number(progress))) : 0,
      po_number: poNumber.trim() || null,
    };
    const { error } = await supabase.from("projects").update(patch as any).eq("id", project.id);
    setSaving(false);
    if (error) return showError("Project settings", error);
    onSaved(patch);
    toast.success("Project updated");
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className={triggerClassName} aria-label="Project settings">
          <Settings className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Project settings</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-2">
          <Label className="label-mono">Cover photo</Label>
          <div className="relative aspect-[16/9] rounded-xl overflow-hidden bg-secondary border border-border">
            {effectiveCoverUrl ? (
              <img src={effectiveCoverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                {coverLoading ? "Loading…" : "No photo yet — take a site walk snapshot or upload one"}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading…" : "Upload photo"}
            </Button>
            {coverPath && (
              <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={removeCover}>
                <X className="w-3.5 h-3.5" /> Remove custom photo
              </Button>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </div>

        <form onSubmit={save} className="mt-5 space-y-3 pb-[env(safe-area-inset-bottom)]">
          <div className="space-y-1.5">
            <Label>Project name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Client</Label>
            <Input value={client} onChange={(e) => setClient(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Site address</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contract value (£)</Label>
              <Input type="number" inputMode="decimal" value={contractValue} onChange={(e) => setContractValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Progress (%)</Label>
              <Input type="number" inputMode="numeric" min={0} max={100} value={progress} onChange={(e) => setProgress(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...STATUS_OPTIONS, project.status])].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>PO number</Label>
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="Optional — appears on invoices" />
          </div>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
