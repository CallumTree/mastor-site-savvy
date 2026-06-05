
CREATE TABLE public.procurement_register (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  material_name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  trade TEXT,
  source_document TEXT,
  source_scope_reference TEXT,
  source_document_id UUID,
  source_scope_element_id UUID,
  confidence_score NUMERIC NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'Suggested' CHECK (status IN ('Suggested','Approved','Ordered','Delivered','Cancelled','Rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_register TO authenticated;
GRANT ALL ON public.procurement_register TO service_role;

ALTER TABLE public.procurement_register ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own procurement register"
  ON public.procurement_register
  FOR ALL
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE TRIGGER trg_procurement_register_updated
  BEFORE UPDATE ON public.procurement_register
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_procurement_register_project ON public.procurement_register(project_id);
CREATE INDEX idx_procurement_register_status ON public.procurement_register(project_id, status);
