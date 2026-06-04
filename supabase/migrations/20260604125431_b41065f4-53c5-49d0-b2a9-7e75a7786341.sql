
-- Add new columns to projects to match Mastor schema (keeping existing columns)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS site_address TEXT,
  ADD COLUMN IF NOT EXISTS gross_value NUMERIC;

-- Helper: check if current user owns a project
CREATE OR REPLACE FUNCTION public.user_owns_project(_project_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project_id AND user_id = auth.uid())
$$;

-- contract_items
CREATE TABLE public.contract_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code TEXT,
  description TEXT,
  total_qty NUMERIC,
  unit TEXT,
  unit_rate NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_items TO authenticated;
GRANT ALL ON public.contract_items TO service_role;
ALTER TABLE public.contract_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage contract_items of own projects" ON public.contract_items
  FOR ALL USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

-- variations
CREATE TABLE public.variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description TEXT,
  qty NUMERIC,
  unit TEXT,
  rate NUMERIC,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.variations TO authenticated;
GRANT ALL ON public.variations TO service_role;
ALTER TABLE public.variations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage variations of own projects" ON public.variations
  FOR ALL USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

-- progress_logs
CREATE TABLE public.progress_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  transcript TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.progress_logs TO authenticated;
GRANT ALL ON public.progress_logs TO service_role;
ALTER TABLE public.progress_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage progress_logs of own projects" ON public.progress_logs
  FOR ALL USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

-- valuations
CREATE TABLE public.valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  valuation_number INTEGER,
  status TEXT NOT NULL DEFAULT 'Draft',
  valuation_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.valuations TO authenticated;
GRANT ALL ON public.valuations TO service_role;
ALTER TABLE public.valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage valuations of own projects" ON public.valuations
  FOR ALL USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

-- valuation_items
CREATE TABLE public.valuation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_id UUID NOT NULL REFERENCES public.valuations(id) ON DELETE CASCADE,
  contract_item_id UUID NOT NULL REFERENCES public.contract_items(id) ON DELETE CASCADE,
  claimed_qty NUMERIC,
  claimed_value NUMERIC
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.valuation_items TO authenticated;
GRANT ALL ON public.valuation_items TO service_role;
ALTER TABLE public.valuation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage valuation_items of own projects" ON public.valuation_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.valuations v WHERE v.id = valuation_id AND public.user_owns_project(v.project_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.valuations v WHERE v.id = valuation_id AND public.user_owns_project(v.project_id))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contract_items_project ON public.contract_items(project_id);
CREATE INDEX IF NOT EXISTS idx_variations_project ON public.variations(project_id);
CREATE INDEX IF NOT EXISTS idx_progress_logs_project ON public.progress_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_valuations_project ON public.valuations(project_id);
CREATE INDEX IF NOT EXISTS idx_valuation_items_valuation ON public.valuation_items(valuation_id);
CREATE INDEX IF NOT EXISTS idx_valuation_items_contract_item ON public.valuation_items(contract_item_id);
