-- calendar_tasks: lightweight to-do/planner items for the global calendar.
-- Named distinctly from the existing tasks_library / task_*_mappings tables,
-- which are a construction-task reference library for the AI scope engine —
-- an unrelated concept. project_id is nullable so an item can be a general
-- to-do or tagged to a specific job.
CREATE TABLE public.calendar_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_tasks TO authenticated;
GRANT ALL ON public.calendar_tasks TO service_role;
ALTER TABLE public.calendar_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own calendar_tasks" ON public.calendar_tasks
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_calendar_tasks_user ON public.calendar_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_project ON public.calendar_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_tasks_due_date ON public.calendar_tasks(due_date);
