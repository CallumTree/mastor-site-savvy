
CREATE TABLE public.material_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_name TEXT NOT NULL,
  material_key TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL,
  unit TEXT,
  source_type TEXT NOT NULL DEFAULT 'Retail',
  confidence TEXT NOT NULL DEFAULT 'Medium',
  last_checked TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_material_prices_key ON public.material_prices(material_key);
CREATE INDEX idx_material_prices_checked ON public.material_prices(last_checked DESC);

GRANT SELECT ON public.material_prices TO authenticated;
GRANT ALL ON public.material_prices TO service_role;

ALTER TABLE public.material_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read material prices"
  ON public.material_prices FOR SELECT
  TO authenticated USING (true);
