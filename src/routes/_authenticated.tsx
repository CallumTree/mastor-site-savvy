import { createFileRoute, Outlet, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { showError } from "@/lib/toast-error";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
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
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground border-b border-primary/20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-gold/95">
              <span className="font-display font-bold text-primary">M</span>
            </span>
            <span className="font-display text-lg font-semibold tracking-wide">Mastor</span>
          </Link>
          <div className="flex items-center gap-3">
            {companyName && (
              <span className="text-xs uppercase tracking-wider opacity-80 hidden sm:inline">
                {companyName}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSignOut}
              className="text-primary-foreground hover:bg-primary-foreground/10"
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
