CREATE UNIQUE INDEX IF NOT EXISTS valuation_items_claim_opportunity_unique
ON public.valuation_items (claim_opportunity_id)
WHERE claim_opportunity_id IS NOT NULL;