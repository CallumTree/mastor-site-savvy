
CREATE TABLE public.material_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  estimated_quantity NUMERIC NOT NULL DEFAULT 0,
  original_quantity NUMERIC,
  unit TEXT NOT NULL DEFAULT '',
  confidence_score TEXT NOT NULL DEFAULT 'medium',
  source_reference TEXT NOT NULL DEFAULT '',
  source_task TEXT NOT NULL DEFAULT '',
  source_document TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_requirements TO authenticated;
GRANT ALL ON public.material_requirements TO service_role;

ALTER TABLE public.material_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage material_requirements"
ON public.material_requirements FOR ALL
TO authenticated
USING (public.user_owns_project(project_id))
WITH CHECK (public.user_owns_project(project_id));

CREATE TRIGGER material_requirements_updated_at
BEFORE UPDATE ON public.material_requirements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_material_requirements_project ON public.material_requirements(project_id);
CREATE INDEX idx_material_requirements_wp ON public.material_requirements(work_package_id);
