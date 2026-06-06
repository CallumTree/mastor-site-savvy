ALTER TABLE public.valuation_items
  ALTER COLUMN contract_item_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS work_package_id uuid,
  ADD COLUMN IF NOT EXISTS work_package_name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Draft',
  ADD COLUMN IF NOT EXISTS claim_opportunity_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();