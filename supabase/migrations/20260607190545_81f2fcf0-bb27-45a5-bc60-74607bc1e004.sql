
CREATE POLICY "Owners read site-walk-photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'site-walk-photos'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.user_id = auth.uid()
        AND p.id::text = split_part(name, '/', 1)
    )
  );

CREATE POLICY "Owners upload site-walk-photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-walk-photos'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.user_id = auth.uid()
        AND p.id::text = split_part(name, '/', 1)
    )
  );

CREATE POLICY "Owners update site-walk-photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'site-walk-photos'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.user_id = auth.uid()
        AND p.id::text = split_part(name, '/', 1)
    )
  );

CREATE POLICY "Owners delete site-walk-photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'site-walk-photos'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.user_id = auth.uid()
        AND p.id::text = split_part(name, '/', 1)
    )
  );
