DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'scope_elements','work_packages','work_package_tasks','work_package_materials',
    'work_package_activities','work_package_claimables','work_package_procurement',
    'procurement_register','material_requirements','tasks_library','materials_library',
    'labour_activities_library','claimable_elements_library','task_material_mappings',
    'task_claimable_mappings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "anon_all_%1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "anon_all_%1$s" ON public.%1$I FOR ALL TO anon USING (true) WITH CHECK (true)', t);

    EXECUTE format('DROP POLICY IF EXISTS "authenticated_all_%1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "authenticated_all_%1$s" ON public.%1$I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;

-- Ensure anon can read project-documents storage (auth policy already exists)
DROP POLICY IF EXISTS "project_documents_anon_read" ON storage.objects;
CREATE POLICY "project_documents_anon_read" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'project-documents');
