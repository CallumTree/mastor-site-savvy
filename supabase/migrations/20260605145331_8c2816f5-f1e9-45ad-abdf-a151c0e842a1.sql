
CREATE TABLE public.work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  trade text,
  description text,
  status text NOT NULL DEFAULT 'Identified',
  confidence_score numeric NOT NULL DEFAULT 0.5,
  source_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_packages_project_idx ON public.work_packages(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_packages TO authenticated;
GRANT ALL ON public.work_packages TO service_role;
ALTER TABLE public.work_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage work packages on owned projects" ON public.work_packages
  FOR ALL TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE OR REPLACE FUNCTION public.user_owns_work_package(_wp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.work_packages wp
    JOIN public.projects p ON p.id = wp.project_id
    WHERE wp.id = _wp_id AND p.user_id = auth.uid()
  )
$$;

CREATE TABLE public.work_package_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  task_id uuid NOT NULL REFERENCES public.tasks_library(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, task_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_package_tasks TO authenticated;
GRANT ALL ON public.work_package_tasks TO service_role;
ALTER TABLE public.work_package_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage wp_tasks via owned wp" ON public.work_package_tasks
  FOR ALL TO authenticated
  USING (public.user_owns_work_package(work_package_id))
  WITH CHECK (public.user_owns_work_package(work_package_id));

CREATE TABLE public.work_package_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  material_id uuid NOT NULL REFERENCES public.materials_library(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, material_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_package_materials TO authenticated;
GRANT ALL ON public.work_package_materials TO service_role;
ALTER TABLE public.work_package_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage wp_materials via owned wp" ON public.work_package_materials
  FOR ALL TO authenticated
  USING (public.user_owns_work_package(work_package_id))
  WITH CHECK (public.user_owns_work_package(work_package_id));

CREATE TABLE public.work_package_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.labour_activities_library(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, activity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_package_activities TO authenticated;
GRANT ALL ON public.work_package_activities TO service_role;
ALTER TABLE public.work_package_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage wp_activities via owned wp" ON public.work_package_activities
  FOR ALL TO authenticated
  USING (public.user_owns_work_package(work_package_id))
  WITH CHECK (public.user_owns_work_package(work_package_id));

CREATE TABLE public.work_package_claimables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  claimable_id uuid NOT NULL REFERENCES public.claimable_elements_library(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, claimable_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_package_claimables TO authenticated;
GRANT ALL ON public.work_package_claimables TO service_role;
ALTER TABLE public.work_package_claimables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage wp_claimables via owned wp" ON public.work_package_claimables
  FOR ALL TO authenticated
  USING (public.user_owns_work_package(work_package_id))
  WITH CHECK (public.user_owns_work_package(work_package_id));

CREATE TABLE public.work_package_procurement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  procurement_package_id uuid NOT NULL REFERENCES public.procurement_packages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, procurement_package_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_package_procurement TO authenticated;
GRANT ALL ON public.work_package_procurement TO service_role;
ALTER TABLE public.work_package_procurement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage wp_procurement via owned wp" ON public.work_package_procurement
  FOR ALL TO authenticated
  USING (public.user_owns_work_package(work_package_id))
  WITH CHECK (public.user_owns_work_package(work_package_id));

CREATE TRIGGER update_work_packages_updated_at BEFORE UPDATE ON public.work_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
