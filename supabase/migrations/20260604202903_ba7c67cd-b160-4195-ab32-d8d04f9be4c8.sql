
CREATE POLICY "Owners read project doc files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid)
  );

CREATE POLICY "Owners upload project doc files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-documents'
    AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid)
  );

CREATE POLICY "Owners update project doc files"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid)
  );

CREATE POLICY "Owners delete project doc files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-documents'
    AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid)
  );
