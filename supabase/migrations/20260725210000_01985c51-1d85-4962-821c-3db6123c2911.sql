-- project_shares: unguessable public read-only links for the client-facing
-- progress portal. No anon grants here — the public page is served by a
-- trusted server route (supabaseAdmin, service role) that validates the
-- token and hand-picks which fields to return, so this table itself stays
-- exactly as private as every other project-scoped table.
CREATE TABLE public.project_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  label TEXT,
  show_valuations BOOLEAN NOT NULL DEFAULT false,
  show_contract_value BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_shares TO authenticated;
GRANT ALL ON public.project_shares TO service_role;
ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage shares of own projects" ON public.project_shares
  FOR ALL USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

CREATE INDEX IF NOT EXISTS idx_project_shares_project ON public.project_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_project_shares_token ON public.project_shares(token);
