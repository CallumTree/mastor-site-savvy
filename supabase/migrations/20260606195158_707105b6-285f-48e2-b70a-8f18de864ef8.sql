ALTER TABLE public.claim_opportunities
  ADD COLUMN IF NOT EXISTS unit_rate numeric,
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS claimed_value numeric;

ALTER TABLE public.valuation_items
  ADD COLUMN IF NOT EXISTS unit_rate numeric;