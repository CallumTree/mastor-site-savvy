import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
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
          <button onClick={signOut} className="text-xs uppercase tracking-wider opacity-80 hover:opacity-100 flex items-center gap-1.5">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
