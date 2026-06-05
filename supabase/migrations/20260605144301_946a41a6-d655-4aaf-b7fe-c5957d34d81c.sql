
ALTER TABLE public.tasks_library ADD COLUMN IF NOT EXISTS procurement_package text;

CREATE TABLE IF NOT EXISTS public.task_claimable_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.tasks_library(id) ON DELETE CASCADE,
  claimable_id uuid NOT NULL REFERENCES public.claimable_elements_library(id) ON DELETE CASCADE,
  confidence_score numeric NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id, claimable_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_claimable_mappings TO authenticated;
GRANT ALL ON public.task_claimable_mappings TO service_role;

ALTER TABLE public.task_claimable_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own task_claimable_mappings"
  ON public.task_claimable_mappings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
