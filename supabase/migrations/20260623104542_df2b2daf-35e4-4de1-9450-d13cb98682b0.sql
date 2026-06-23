
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS po_number text;
ALTER TABLE public.variations ADD COLUMN IF NOT EXISTS client_reference text;

CREATE OR REPLACE FUNCTION public.valuation_is_invoiced(_vid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.invoices WHERE valuation_id = _vid)
$$;
