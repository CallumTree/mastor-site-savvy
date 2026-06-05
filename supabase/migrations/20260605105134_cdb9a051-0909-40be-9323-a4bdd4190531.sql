
CREATE POLICY "Authenticated can insert material prices"
  ON public.material_prices FOR INSERT
  TO authenticated WITH CHECK (true);
