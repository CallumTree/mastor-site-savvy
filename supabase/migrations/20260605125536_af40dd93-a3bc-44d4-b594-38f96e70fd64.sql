
CREATE TABLE public.procurement_packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_name TEXT NOT NULL,
  trade TEXT,
  description TEXT,
  confidence_score NUMERIC NOT NULL DEFAULT 0.7,
  status TEXT NOT NULL DEFAULT 'Suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT procurement_packages_status_check CHECK (status IN ('Suggested','Approved','Quoted','Ordered','Delivered','Rejected'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_packages TO authenticated;
GRANT ALL ON public.procurement_packages TO service_role;

ALTER TABLE public.procurement_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage procurement packages"
  ON public.procurement_packages
  FOR ALL
  TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE TRIGGER procurement_packages_set_updated_at
  BEFORE UPDATE ON public.procurement_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX procurement_packages_project_idx ON public.procurement_packages(project_id);

CREATE TABLE public.procurement_package_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  package_id UUID NOT NULL REFERENCES public.procurement_packages(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  procurement_item_id UUID REFERENCES public.procurement_register(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT,
  source_task TEXT,
  source_scope_reference TEXT,
  source_document TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_package_items TO authenticated;
GRANT ALL ON public.procurement_package_items TO service_role;

ALTER TABLE public.procurement_package_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage procurement package items"
  ON public.procurement_package_items
  FOR ALL
  TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE INDEX procurement_package_items_package_idx ON public.procurement_package_items(package_id);
CREATE INDEX procurement_package_items_project_idx ON public.procurement_package_items(project_id);
