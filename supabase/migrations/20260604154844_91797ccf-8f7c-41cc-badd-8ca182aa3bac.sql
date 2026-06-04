CREATE TABLE public.analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  site_walk_id uuid NOT NULL,
  analysis_json jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_results TO anon, authenticated;
GRANT ALL ON public.analysis_results TO service_role;

ALTER TABLE public.analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_all" ON public.analysis_results FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_analysis_results_site_walk ON public.analysis_results(site_walk_id);
CREATE INDEX idx_analysis_results_project ON public.analysis_results(project_id);