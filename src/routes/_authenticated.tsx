import { createFileRoute, Outlet, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <div className="min-h-screen bg-background">
      <div className="bg-gold text-primary text-center text-xs font-semibold tracking-wider uppercase py-1.5 px-3">
        Development Mode — Authentication Disabled
      </div>
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground border-b border-primary/20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded bg-gold/95">
              <span className="font-display font-bold text-primary">M</span>
            </span>
            <span className="font-display text-lg font-semibold tracking-wide">Mastor</span>
          </Link>
          <span className="text-xs uppercase tracking-wider opacity-80">Dev User</span>
        </div>
      </header>
      <Outlet />
    </div>
  );
}
