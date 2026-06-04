
CREATE TABLE public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  size_bytes BIGINT,
  parsed_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;
GRANT ALL ON public.project_documents TO service_role;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage project_documents"
  ON public.project_documents FOR ALL TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE INDEX idx_project_documents_project ON public.project_documents(project_id);

CREATE TABLE public.scope_elements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.project_documents(id) ON DELETE CASCADE,
  element_type TEXT NOT NULL CHECK (element_type IN ('task','material','claimable_element','labour_activity','procurement_item')),
  title TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC,
  unit TEXT,
  source_reference TEXT,
  confidence TEXT NOT NULL DEFAULT 'medium' CHECK (confidence IN ('high','medium','low')),
  parent_id UUID REFERENCES public.scope_elements(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scope_elements TO authenticated;
GRANT ALL ON public.scope_elements TO service_role;
ALTER TABLE public.scope_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage scope_elements"
  ON public.scope_elements FOR ALL TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE INDEX idx_scope_elements_project ON public.scope_elements(project_id);
CREATE INDEX idx_scope_elements_doc ON public.scope_elements(document_id);
