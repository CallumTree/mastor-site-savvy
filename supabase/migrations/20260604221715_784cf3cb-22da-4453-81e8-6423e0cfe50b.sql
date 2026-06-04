ALTER TABLE public.potential_claims
  DROP CONSTRAINT IF EXISTS potential_claims_status_check;

ALTER TABLE public.potential_claims
  ADD CONSTRAINT potential_claims_status_check
  CHECK (status IN (
    'Suggested',
    'Approved',
    'Rejected',
    'Moved To Basket',
    'Added To Valuation',
    'Ready To Claim',
    'Included In Valuation',
    'Paid'
  ));

ALTER TABLE public.potential_claims
  ADD COLUMN IF NOT EXISTS ready_to_claim_at TIMESTAMPTZ;