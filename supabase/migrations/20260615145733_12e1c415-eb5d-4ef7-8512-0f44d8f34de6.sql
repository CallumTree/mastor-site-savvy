
ALTER TABLE public.claim_opportunities
  ALTER COLUMN work_package_name DROP NOT NULL,
  ALTER COLUMN finding_text DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS claim_title text,
  ADD COLUMN IF NOT EXISTS claim_description text,
  ADD COLUMN IF NOT EXISTS contract_value numeric,
  ADD COLUMN IF NOT EXISTS confidence_score text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_to_claim_at timestamptz;
