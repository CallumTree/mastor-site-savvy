ALTER TABLE public.scope_elements ADD COLUMN IF NOT EXISTS unit_rate numeric;
ALTER TABLE public.scope_elements ADD COLUMN IF NOT EXISTS total_cost numeric;
ALTER TABLE public.procurement_items ADD COLUMN IF NOT EXISTS unit text;