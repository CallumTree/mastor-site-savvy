import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutGrid, CalendarDays } from "lucide-react";
import { showError } from "@/lib/toast-error";
import { getCurrentProfile, getLogoSignedUrl } from "@/lib/profile";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      // The session check itself failed — a real problem, not just "logged
      // out" — so it's worth surfacing rather than a silent bounce.
      showError("Session check", error);
      throw redirect({ to: "/auth" });
    }
    if (!data.session) throw redirect({ to: "/auth" });
    return { user: data.session.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const profile = await getCurrentProfile();
      if (!active || !profile) return;
      setCompanyName(profile.company_name);
      if (profile.company_logo_url) {
        const url = await getLogoSignedUrl(profile.company_logo_url);
        if (active) setLogoUrl(url);
      }
    })();
    return () => { active = false; };
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) return showError("Sign out", error);
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-md text-foreground border-b border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-primary shadow-sm">
              <span className="font-bold text-primary-foreground text-lg">M</span>
            </span>
            <span className="text-xl font-bold tracking-tight">
              Mastor
            </span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Primary">
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
              activeProps={{ className: "!text-foreground !bg-secondary" }}
            >
              <LayoutGrid className="w-4 h-4" /> <span className="hidden sm:inline">Dashboard</span>
            </Link>
            <Link
              to="/calendar"
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-secondary"
              activeProps={{ className: "!text-foreground !bg-secondary" }}
            >
              <CalendarDays className="w-4 h-4" /> <span className="hidden sm:inline">Calendar</span>
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {companyName && <span className="label-mono hidden md:inline">{companyName}</span>}
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName || "Company logo"}
                className="w-10 h-10 rounded-full object-cover border border-border shadow-sm"
              />
            ) : companyName ? (
              <span className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-sm font-semibold text-foreground shrink-0">
                {companyName.charAt(0).toUpperCase()}
              </span>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSignOut}
              className="text-foreground"
            >
              <LogOut className="w-4 h-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
