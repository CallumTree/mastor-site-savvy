CREATE TABLE public.package_price_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.procurement_packages(id) ON DELETE CASCADE,
  supplier_name TEXT NOT NULL,
  quoted_price NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Requested','Received','Rejected','Accepted')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ppr_project ON public.package_price_requests(project_id);
CREATE INDEX idx_ppr_package ON public.package_price_requests(package_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_price_requests TO authenticated;
GRANT ALL ON public.package_price_requests TO service_role;

ALTER TABLE public.package_price_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage price requests for own projects"
  ON public.package_price_requests
  FOR ALL
  TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE TRIGGER update_ppr_updated_at
  BEFORE UPDATE ON public.package_price_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();