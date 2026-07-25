import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { ChevronDown, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") ? s.next : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      if (search.next) throw redirect({ href: search.next });
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);

  // Login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Signup fields
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [town, setTown] = useState("");
  const [postcode, setPostcode] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);

  // If session appears (e.g. after sign in event), bounce to dashboard (or `next` if provided)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        if (next) window.location.href = next;
        else navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, next]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return showError("Sign in", error);
    toast.success("Welcome back");
    // Navigation to /dashboard is handled by the onAuthStateChange listener
    // above (SIGNED_IN) — the single source of truth for post-auth
    // navigation. Do not navigate() here too; that was the second of three
    // competing triggers behind the login race.
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !companyName.trim()) {
      return toast.error("Full Name and Company Name are required");
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${next ?? "/dashboard"}`,
          data: { full_name: fullName, company_name: companyName },
        },
      });
      if (error) throw error;
      const user = data.user;
      if (!user) {
        toast.success("Check your email to confirm your account");
        setBusy(false);
        return;
      }

      // Upload logo if present (requires an active session — true when email confirm is off)
      let logoPath: string | null = null;
      if (logoFile && data.session) {
        const ext = logoFile.name.split(".").pop() || "png";
        const path = `${user.id}/logo-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("company-logos")
          .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
        if (upErr) showError("Logo upload", upErr);
        else logoPath = path;
      }

      // The DB trigger already created the profile from user metadata.
      // Update it with the logo path (and ensure name/company are in sync).
      if (data.session) {
        const { error: pErr } = await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            company_name: companyName,
            company_address_line1: addressLine1 || null,
            company_address_line2: addressLine2 || null,
            company_town: town || null,
            company_postcode: postcode || null,
            ...(logoPath ? { company_logo_url: logoPath } : {}),
          })
          .eq("user_id", user.id);
        if (pErr) showError("Create profile", pErr);
        toast.success("Welcome to Mastor");
        if (next) window.location.href = next;
        else navigate({ to: "/dashboard", replace: true });
      } else {
        toast.success("Check your email to confirm your account");
      }
    } catch (err) {
      showError("Sign up", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 flex flex-col justify-center px-6 py-12">
        <div className="max-w-md mx-auto w-full">
          <div className="flex items-center gap-2.5 mb-8">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary shrink-0">
              <span className="font-semibold text-primary-foreground text-lg">M</span>
            </span>
            <span className="text-xl font-semibold tracking-tight text-foreground">Mastor</span>
          </div>

          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            {mode === "login"
              ? "Sign in to your Mastor dashboard."
              : "Start your 14-day trial — no credit card required."}
          </p>

          {/* Segmented mode toggle */}
          <div className="mt-6 inline-flex p-1 rounded-full bg-secondary w-full">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={cn(
                "flex-1 rounded-full py-2 text-sm font-medium transition-colors",
                mode === "login"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={cn(
                "flex-1 rounded-full py-2 text-sm font-medium transition-colors",
                mode === "signup"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Sign up
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="mt-6 space-y-4">
              <Field label="Email">
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button type="submit" size="lg" disabled={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              <Field label="Full Name">
                <Input
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Company Name">
                <Input
                  required
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </Field>

              <Collapsible open={addressOpen} onOpenChange={setAddressOpen}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    <span>Company address &amp; logo (optional)</span>
                    <ChevronDown className={cn("w-4 h-4 transition-transform", addressOpen && "rotate-180")} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-3">
                  <Field label="Address — Line 1">
                    <Input
                      autoComplete="address-line1"
                      placeholder="Street address"
                      value={addressLine1}
                      onChange={(e) => setAddressLine1(e.target.value)}
                    />
                  </Field>
                  <Field label="Address — Line 2">
                    <Input
                      autoComplete="address-line2"
                      placeholder="Apt, suite, building"
                      value={addressLine2}
                      onChange={(e) => setAddressLine2(e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Town">
                      <Input
                        autoComplete="address-level2"
                        value={town}
                        onChange={(e) => setTown(e.target.value)}
                      />
                    </Field>
                    <Field label="Postcode">
                      <Input
                        autoComplete="postal-code"
                        value={postcode}
                        onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                      />
                    </Field>
                  </div>
                  <div className="space-y-2">
                    <Label className="label-mono">Company Logo</Label>
                    <label className="flex items-center gap-3 rounded-lg border border-dashed border-input bg-card px-3 py-3 cursor-pointer hover:border-ring transition-colors">
                      <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm text-muted-foreground truncate">
                        {logoFile ? logoFile.name : "Tap to upload (PNG, JPG, SVG)"}
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Button type="submit" size="lg" disabled={busy} className="w-full">
                {busy ? "Creating account…" : "Start free trial"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                By signing up you agree to a 14-day free trial of Mastor.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="label-mono">{label}</Label>
      {children}
    </div>
  );
}
