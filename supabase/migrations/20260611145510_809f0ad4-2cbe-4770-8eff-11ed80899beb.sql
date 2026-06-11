
DROP POLICY IF EXISTS "dev_all" ON public.analysis_results;
CREATE POLICY "Owners manage analysis_results" ON public.analysis_results FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "dev_all" ON public.approved_findings;
CREATE POLICY "Owners manage approved_findings" ON public.approved_findings FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "dev_all" ON public.claim_opportunities;
CREATE POLICY "Owners manage claim_opportunities" ON public.claim_opportunities FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "dev_all" ON public.contract_items;
CREATE POLICY "Owners manage contract_items" ON public.contract_items FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "dev_all" ON public.procurement_items;
CREATE POLICY "Owners manage procurement_items" ON public.procurement_items FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "dev_all" ON public.progress_logs;
CREATE POLICY "Owners manage progress_logs" ON public.progress_logs FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "dev_all" ON public.projects;
CREATE POLICY "Users manage their own projects" ON public.projects FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dev_all" ON public.site_walks;
CREATE POLICY "Owners manage site_walks" ON public.site_walks FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "dev_all" ON public.usage_tracking;
CREATE POLICY "Users manage own usage_tracking" ON public.usage_tracking FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "dev_all" ON public.valuations;
CREATE POLICY "Owners manage valuations" ON public.valuations FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "dev_all" ON public.valuation_items;
CREATE POLICY "Owners manage valuation_items" ON public.valuation_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.valuations v WHERE v.id = valuation_id AND public.user_owns_project(v.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.valuations v WHERE v.id = valuation_id AND public.user_owns_project(v.project_id)));

DROP POLICY IF EXISTS "dev_all" ON public.variations;
CREATE POLICY "Owners manage variations" ON public.variations FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "site_walk_photos_all_anon" ON public.site_walk_photos;
DROP POLICY IF EXISTS "site_walk_photos_all_authenticated" ON public.site_walk_photos;
CREATE POLICY "Owners manage site_walk_photos" ON public.site_walk_photos FOR ALL TO authenticated USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));

DROP POLICY IF EXISTS "anon_all_claimable_elements_library" ON public.claimable_elements_library;
DROP POLICY IF EXISTS "authenticated_all_claimable_elements_library" ON public.claimable_elements_library;
DROP POLICY IF EXISTS "anon_all_labour_activities_library" ON public.labour_activities_library;
DROP POLICY IF EXISTS "authenticated_all_labour_activities_library" ON public.labour_activities_library;
DROP POLICY IF EXISTS "anon_all_materials_library" ON public.materials_library;
DROP POLICY IF EXISTS "authenticated_all_materials_library" ON public.materials_library;
DROP POLICY IF EXISTS "anon_all_tasks_library" ON public.tasks_library;
DROP POLICY IF EXISTS "authenticated_all_tasks_library" ON public.tasks_library;
DROP POLICY IF EXISTS "anon_all_task_material_mappings" ON public.task_material_mappings;
DROP POLICY IF EXISTS "authenticated_all_task_material_mappings" ON public.task_material_mappings;
DROP POLICY IF EXISTS "anon_all_task_claimable_mappings" ON public.task_claimable_mappings;
DROP POLICY IF EXISTS "authenticated_all_task_claimable_mappings" ON public.task_claimable_mappings;
DROP POLICY IF EXISTS "anon_all_procurement_register" ON public.procurement_register;
DROP POLICY IF EXISTS "authenticated_all_procurement_register" ON public.procurement_register;
DROP POLICY IF EXISTS "anon_all_material_requirements" ON public.material_requirements;
DROP POLICY IF EXISTS "authenticated_all_material_requirements" ON public.material_requirements;
DROP POLICY IF EXISTS "anon_all_scope_elements" ON public.scope_elements;
DROP POLICY IF EXISTS "authenticated_all_scope_elements" ON public.scope_elements;
DROP POLICY IF EXISTS "anon_all_project_documents" ON public.project_documents;
DROP POLICY IF EXISTS "authenticated_all_project_documents" ON public.project_documents;
DROP POLICY IF EXISTS "anon_all_work_packages" ON public.work_packages;
DROP POLICY IF EXISTS "authenticated_all_work_packages" ON public.work_packages;
DROP POLICY IF EXISTS "anon_all_work_package_tasks" ON public.work_package_tasks;
DROP POLICY IF EXISTS "authenticated_all_work_package_tasks" ON public.work_package_tasks;
DROP POLICY IF EXISTS "anon_all_work_package_materials" ON public.work_package_materials;
DROP POLICY IF EXISTS "authenticated_all_work_package_materials" ON public.work_package_materials;
DROP POLICY IF EXISTS "anon_all_work_package_activities" ON public.work_package_activities;
DROP POLICY IF EXISTS "authenticated_all_work_package_activities" ON public.work_package_activities;
DROP POLICY IF EXISTS "anon_all_work_package_claimables" ON public.work_package_claimables;
DROP POLICY IF EXISTS "authenticated_all_work_package_claimables" ON public.work_package_claimables;
DROP POLICY IF EXISTS "anon_all_work_package_procurement" ON public.work_package_procurement;
DROP POLICY IF EXISTS "authenticated_all_work_package_procurement" ON public.work_package_procurement;

DROP POLICY IF EXISTS "project_documents_anon_all" ON storage.objects;
DROP POLICY IF EXISTS "project_documents_anon_read" ON storage.objects;
DROP POLICY IF EXISTS "project_documents_auth_all" ON storage.objects;

DROP POLICY IF EXISTS "site_walk_photos_storage_select" ON storage.objects;
DROP POLICY IF EXISTS "site_walk_photos_storage_insert" ON storage.objects;
DROP POLICY IF EXISTS "site_walk_photos_storage_update" ON storage.objects;
DROP POLICY IF EXISTS "site_walk_photos_storage_delete" ON storage.objects;

CREATE POLICY "Owners read site walk photo files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'site-walk-photos' AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid));
CREATE POLICY "Owners upload site walk photo files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-walk-photos' AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid));
CREATE POLICY "Owners update site walk photo files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'site-walk-photos' AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid));
CREATE POLICY "Owners delete site walk photo files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-walk-photos' AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid));

DROP POLICY IF EXISTS "site_walk_videos_dev_all" ON storage.objects;
DROP POLICY IF EXISTS "site_walk_videos_anon_all" ON storage.objects;
DROP POLICY IF EXISTS "site_walk_videos_authenticated_all" ON storage.objects;

CREATE POLICY "Owners read site walk video files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'site-walk-videos' AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid));
CREATE POLICY "Owners upload site walk video files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'site-walk-videos' AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid));
CREATE POLICY "Owners update site walk video files" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'site-walk-videos' AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid));
CREATE POLICY "Owners delete site walk video files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'site-walk-videos' AND public.user_owns_project(((string_to_array(name, '/'))[1])::uuid));

REVOKE EXECUTE ON FUNCTION public.user_owns_project(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_owns_work_package(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_project(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_owns_work_package(uuid) TO authenticated;
