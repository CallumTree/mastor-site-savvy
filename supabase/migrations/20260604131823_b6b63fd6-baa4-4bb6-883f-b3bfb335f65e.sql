
ALTER TABLE public.procurement_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS estimated_cost numeric;

UPDATE public.procurement_items SET description = package_name WHERE description IS NULL;
UPDATE public.procurement_items SET estimated_cost = value WHERE estimated_cost IS NULL;

ALTER TABLE public.procurement_items
  DROP COLUMN IF EXISTS package_name,
  DROP COLUMN IF EXISTS value,
  DROP COLUMN IF EXISTS notes;

ALTER TABLE public.procurement_items
  ALTER COLUMN status SET DEFAULT 'Required';
