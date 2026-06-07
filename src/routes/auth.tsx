import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import { Upload } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
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

  // If session appears (e.g. after sign in event), bounce to dashboard
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        navigate({ to: "/dashboard", replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return showError("Sign in", error);
    toast.success("Welcome back");
    navigate({ to: "/dashboard", replace: true });
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
          emailRedirectTo: `${window.location.origin}/dashboard`,
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
        navigate({ to: "/dashboard", replace: true });
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
      {/* Header band */}
      <header className="bg-primary text-primary-foreground">
        <div className="max-w-md mx-auto px-4 py-5 flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded bg-gold">
            <span className="font-display font-bold text-primary text-lg">M</span>
          </span>
          <span className="font-display text-xl font-semibold tracking-wide">Mastor</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 md:py-14">
        <div className="max-w-md mx-auto">
          <h1 className="font-display text-3xl font-semibold text-primary">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login"
              ? "Sign in to your Mastor dashboard."
              : "Start your 14-day free trial. No credit card required."}
          </p>

          {/* Tab toggle */}
          <div className="mt-6 inline-flex rounded-md bg-secondary p-1 text-sm">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`px-4 py-1.5 rounded ${
                mode === "login" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`px-4 py-1.5 rounded ${
                mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
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
              <Button
                type="submit"
                size="lg"
                disabled={busy}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
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
              <Field label="Company Address — Line 1">
                <Input
                  autoComplete="address-line1"
                  placeholder="Street address"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                />
              </Field>
              <Field label="Company Address — Line 2">
                <Input
                  autoComplete="address-line2"
                  placeholder="Apt, suite, building (optional)"
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
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Company Logo <span className="normal-case text-[10px]">(optional)</span>
                </Label>
                <label className="flex items-center gap-3 rounded-md border border-dashed border-input px-3 py-3 cursor-pointer hover:border-gold transition-colors">
                  <Upload className="w-4 h-4 text-muted-foreground" />
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

              <Button
                type="submit"
                size="lg"
                disabled={busy}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
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
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
