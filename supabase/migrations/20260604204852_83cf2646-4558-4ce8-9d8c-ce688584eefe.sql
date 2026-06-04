CREATE TABLE public.potential_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope_element_id uuid REFERENCES public.scope_elements(id) ON DELETE SET NULL,
  approved_finding_id uuid REFERENCES public.approved_findings(id) ON DELETE SET NULL,
  claim_title text NOT NULL,
  claim_description text,
  contract_value numeric,
  confidence_score text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'Suggested',
  approved_at timestamp with time zone,
  rejected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT potential_claims_confidence_check CHECK (confidence_score = ANY (ARRAY['high','medium','low'])),
  CONSTRAINT potential_claims_status_check CHECK (status = ANY (ARRAY['Suggested','Approved','Rejected','Added To Valuation']))
);

CREATE INDEX idx_potential_claims_project ON public.potential_claims(project_id);
CREATE INDEX idx_potential_claims_scope ON public.potential_claims(scope_element_id);
CREATE INDEX idx_potential_claims_finding ON public.potential_claims(approved_finding_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.potential_claims TO authenticated;
GRANT ALL ON public.potential_claims TO service_role;

ALTER TABLE public.potential_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage potential_claims" ON public.potential_claims
  FOR ALL TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE TRIGGER update_potential_claims_updated_at
  BEFORE UPDATE ON public.potential_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();