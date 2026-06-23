
ALTER TABLE public.valuation_items ADD COLUMN IF NOT EXISTS variation_id uuid REFERENCES public.variations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS valuation_items_variation_id_idx ON public.valuation_items(variation_id);
