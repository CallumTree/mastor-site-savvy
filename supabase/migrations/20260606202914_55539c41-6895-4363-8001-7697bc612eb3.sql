-- Allow anon (dev mode) and authenticated full access to project_documents
DROP POLICY IF EXISTS "anon_all_project_documents" ON public.project_documents;
CREATE POLICY "anon_all_project_documents" ON public.project_documents
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_project_documents" ON public.project_documents;
CREATE POLICY "authenticated_all_project_documents" ON public.project_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;

-- Storage policies for project-documents bucket
DROP POLICY IF EXISTS "project_documents_anon_all" ON storage.objects;
CREATE POLICY "project_documents_anon_all" ON storage.objects
  FOR ALL TO anon
  USING (bucket_id = 'project-documents')
  WITH CHECK (bucket_id = 'project-documents');

DROP POLICY IF EXISTS "project_documents_auth_all" ON storage.objects;
CREATE POLICY "project_documents_auth_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'project-documents')
  WITH CHECK (bucket_id = 'project-documents');
