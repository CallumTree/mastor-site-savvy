import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { showError } from "@/lib/toast-error";

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

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select("company_name")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (active && data) setCompanyName((data as { company_name: string }).company_name);
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
      <header className="sticky top-0 z-30 bg-card text-foreground border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-sm bg-gold">
              <span className="font-display font-bold text-gold-foreground">M</span>
            </span>
            <span className="font-display text-lg font-semibold tracking-[0.08em] uppercase">
              Mastor
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {companyName && <span className="label-mono hidden sm:inline">{companyName}</span>}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSignOut}
              className="text-foreground hover:bg-white/5"
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
