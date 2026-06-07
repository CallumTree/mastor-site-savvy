
ALTER TABLE public.scope_elements
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Not Started',
  ADD COLUMN IF NOT EXISTS claimed_in_valuation jsonb,
  ADD COLUMN IF NOT EXISTS invoiced_in jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'scope_elements_status_check'
  ) THEN
    ALTER TABLE public.scope_elements
      ADD CONSTRAINT scope_elements_status_check
      CHECK (status IN ('Not Started','In Progress','Claimed','Disputed','Invoiced'));
  END IF;
END $$;

ALTER TABLE public.claim_opportunities
  ADD COLUMN IF NOT EXISTS scope_element_id uuid REFERENCES public.scope_elements(id) ON DELETE SET NULL;

ALTER TABLE public.valuation_items
  ADD COLUMN IF NOT EXISTS scope_element_id uuid REFERENCES public.scope_elements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_claim_opportunities_scope ON public.claim_opportunities(scope_element_id);
CREATE INDEX IF NOT EXISTS idx_valuation_items_scope ON public.valuation_items(scope_element_id);
