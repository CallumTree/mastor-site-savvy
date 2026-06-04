CREATE TABLE public.site_walks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text,
  transcript text,
  duration_seconds integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_walks TO authenticated, anon;
GRANT ALL ON public.site_walks TO service_role;
ALTER TABLE public.site_walks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_all" ON public.site_walks FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE INDEX site_walks_project_id_idx ON public.site_walks(project_id, created_at DESC);