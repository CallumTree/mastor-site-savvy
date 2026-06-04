CREATE TABLE public.approved_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  analysis_id uuid,
  site_walk_id uuid,
  finding_type text NOT NULL,
  original_text text NOT NULL,
  finding_text text NOT NULL,
  confidence text,
  status text NOT NULL DEFAULT 'Awaiting Review',
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approved_findings TO anon, authenticated;
GRANT ALL ON public.approved_findings TO service_role;
ALTER TABLE public.approved_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY dev_all ON public.approved_findings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);