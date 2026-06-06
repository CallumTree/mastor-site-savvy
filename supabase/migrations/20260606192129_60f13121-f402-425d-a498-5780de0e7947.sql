CREATE TABLE public.claim_opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE SET NULL,
  work_package_name TEXT NOT NULL,
  finding_text TEXT NOT NULL,
  approved_finding_id UUID REFERENCES public.approved_findings(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Pending Review',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX claim_opportunities_project_idx ON public.claim_opportunities(project_id, created_at DESC);
CREATE INDEX claim_opportunities_wp_idx ON public.claim_opportunities(work_package_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_opportunities TO authenticated;
GRANT ALL ON public.claim_opportunities TO service_role;

ALTER TABLE public.claim_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_all" ON public.claim_opportunities
  FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_claim_opportunities_updated_at
  BEFORE UPDATE ON public.claim_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();