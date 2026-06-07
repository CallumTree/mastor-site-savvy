
CREATE TABLE public.site_walk_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_walk_id uuid NOT NULL REFERENCES public.site_walks(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  storage_path text,
  timestamp_seconds integer NOT NULL DEFAULT 0,
  transcript_context text,
  ai_tags jsonb DEFAULT '[]'::jsonb,
  linked_variation_id uuid REFERENCES public.variations(id) ON DELETE SET NULL,
  linked_procurement_id uuid REFERENCES public.procurement_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_walk_photos_walk ON public.site_walk_photos(site_walk_id);
CREATE INDEX idx_site_walk_photos_project ON public.site_walk_photos(project_id);
CREATE INDEX idx_site_walk_photos_variation ON public.site_walk_photos(linked_variation_id);
CREATE INDEX idx_site_walk_photos_procurement ON public.site_walk_photos(linked_procurement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_walk_photos TO authenticated;
GRANT ALL ON public.site_walk_photos TO service_role;

ALTER TABLE public.site_walk_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their site walk photos"
  ON public.site_walk_photos
  FOR ALL
  TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));
