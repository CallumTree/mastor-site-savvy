
CREATE TABLE IF NOT EXISTS public.scope_element_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope_element_id uuid REFERENCES public.scope_elements(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  valuation_id uuid REFERENCES public.valuations(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  rejection_reason text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scope_element_history TO authenticated;
GRANT ALL ON public.scope_element_history TO service_role;

ALTER TABLE public.scope_element_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage scope_element_history"
  ON public.scope_element_history
  FOR ALL
  TO authenticated
  USING (public.user_owns_project(project_id))
  WITH CHECK (public.user_owns_project(project_id));

CREATE INDEX IF NOT EXISTS idx_scope_history_element ON public.scope_element_history(scope_element_id);
CREATE INDEX IF NOT EXISTS idx_scope_history_project ON public.scope_element_history(project_id, created_at DESC);
