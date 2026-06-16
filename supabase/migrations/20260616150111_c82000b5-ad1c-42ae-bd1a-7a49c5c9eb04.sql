
CREATE TABLE public.parse_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.project_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed')),
  document_text text,
  error text,
  result jsonb,
  stop_reason text,
  prompt_tokens int,
  completion_tokens int,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parse_jobs TO authenticated;
GRANT ALL ON public.parse_jobs TO service_role;

ALTER TABLE public.parse_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage parse_jobs"
  ON public.parse_jobs
  FOR ALL
  TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE TRIGGER parse_jobs_updated_at
  BEFORE UPDATE ON public.parse_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX parse_jobs_project_idx ON public.parse_jobs(project_id);
CREATE INDEX parse_jobs_document_idx ON public.parse_jobs(document_id);

ALTER TABLE public.project_documents
  ADD COLUMN parse_status text NOT NULL DEFAULT 'idle'
    CHECK (parse_status IN ('idle','queued','running','succeeded','failed')),
  ADD COLUMN last_parse_job_id uuid REFERENCES public.parse_jobs(id) ON DELETE SET NULL;
