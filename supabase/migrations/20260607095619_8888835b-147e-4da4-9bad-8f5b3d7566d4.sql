
ALTER TABLE public.profiles
  ADD COLUMN company_address_line1 TEXT,
  ADD COLUMN company_address_line2 TEXT,
  ADD COLUMN company_town TEXT,
  ADD COLUMN company_postcode TEXT;
