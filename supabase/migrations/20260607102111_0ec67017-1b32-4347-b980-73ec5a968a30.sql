ALTER TABLE public.procurement_items
  ADD COLUMN IF NOT EXISTS scope_element_id uuid REFERENCES public.scope_elements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phase_order integer NOT NULL DEFAULT 6;
CREATE INDEX IF NOT EXISTS idx_procurement_items_phase ON public.procurement_items(project_id, phase_order);