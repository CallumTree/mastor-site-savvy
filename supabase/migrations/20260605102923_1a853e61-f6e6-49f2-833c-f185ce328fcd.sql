
-- MATERIALS
CREATE TABLE public.materials_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  material_name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(trim(material_name))) STORED,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  trade TEXT,
  unit_type TEXT,
  category TEXT,
  confidence_score NUMERIC NOT NULL DEFAULT 0.5,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name_normalized)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials_library TO authenticated;
GRANT ALL ON public.materials_library TO service_role;
ALTER TABLE public.materials_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own materials" ON public.materials_library FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TASKS
CREATE TABLE public.tasks_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(trim(task_name))) STORED,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  trade TEXT,
  description TEXT,
  confidence_score NUMERIC NOT NULL DEFAULT 0.5,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name_normalized)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks_library TO authenticated;
GRANT ALL ON public.tasks_library TO service_role;
ALTER TABLE public.tasks_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own tasks" ON public.tasks_library FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- LABOUR ACTIVITIES
CREATE TABLE public.labour_activities_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  activity_name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(trim(activity_name))) STORED,
  task_id UUID REFERENCES public.tasks_library(id) ON DELETE SET NULL,
  trade TEXT,
  confidence_score NUMERIC NOT NULL DEFAULT 0.5,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name_normalized)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labour_activities_library TO authenticated;
GRANT ALL ON public.labour_activities_library TO service_role;
ALTER TABLE public.labour_activities_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own activities" ON public.labour_activities_library FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- CLAIMABLE ELEMENTS
CREATE TABLE public.claimable_elements_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  element_name TEXT NOT NULL,
  name_normalized TEXT GENERATED ALWAYS AS (lower(trim(element_name))) STORED,
  trade TEXT,
  description TEXT,
  confidence_score NUMERIC NOT NULL DEFAULT 0.5,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name_normalized)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claimable_elements_library TO authenticated;
GRANT ALL ON public.claimable_elements_library TO service_role;
ALTER TABLE public.claimable_elements_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own claimable" ON public.claimable_elements_library FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TASK MATERIAL MAPPINGS
CREATE TABLE public.task_material_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task_id UUID NOT NULL REFERENCES public.tasks_library(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials_library(id) ON DELETE CASCADE,
  confidence_score NUMERIC NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id, material_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_material_mappings TO authenticated;
GRANT ALL ON public.task_material_mappings TO service_role;
ALTER TABLE public.task_material_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own mappings" ON public.task_material_mappings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- MERGE SUGGESTIONS
CREATE TABLE public.knowledge_merge_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  library_type TEXT NOT NULL CHECK (library_type IN ('material','task','activity','claimable')),
  primary_id UUID NOT NULL,
  duplicate_id UUID NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Merged','Rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_merge_suggestions TO authenticated;
GRANT ALL ON public.knowledge_merge_suggestions TO service_role;
ALTER TABLE public.knowledge_merge_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own merge" ON public.knowledge_merge_suggestions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at triggers
CREATE TRIGGER trg_materials_updated BEFORE UPDATE ON public.materials_library FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks_library FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_activities_updated BEFORE UPDATE ON public.labour_activities_library FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_claimable_updated BEFORE UPDATE ON public.claimable_elements_library FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
