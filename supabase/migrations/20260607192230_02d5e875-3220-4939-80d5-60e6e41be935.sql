
-- Drop existing storage policies on site-walk-photos bucket
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%site-walk-photos%' OR with_check ILIKE '%site-walk-photos%' OR policyname ILIKE '%site-walk-photo%' OR policyname ILIKE '%site_walk_photo%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "site_walk_photos_storage_select"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'site-walk-photos');

CREATE POLICY "site_walk_photos_storage_insert"
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'site-walk-photos');

CREATE POLICY "site_walk_photos_storage_update"
  ON storage.objects FOR UPDATE
  TO authenticated, anon
  USING (bucket_id = 'site-walk-photos')
  WITH CHECK (bucket_id = 'site-walk-photos');

CREATE POLICY "site_walk_photos_storage_delete"
  ON storage.objects FOR DELETE
  TO authenticated, anon
  USING (bucket_id = 'site-walk-photos');

-- Replace table policies on public.site_walk_photos
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'site_walk_photos'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.site_walk_photos', pol.policyname);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_walk_photos TO authenticated, anon;
GRANT ALL ON public.site_walk_photos TO service_role;

ALTER TABLE public.site_walk_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "site_walk_photos_all_authenticated"
  ON public.site_walk_photos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "site_walk_photos_all_anon"
  ON public.site_walk_photos FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
