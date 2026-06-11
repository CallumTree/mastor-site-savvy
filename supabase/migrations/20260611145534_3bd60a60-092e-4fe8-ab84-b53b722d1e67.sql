
DROP POLICY IF EXISTS "Authenticated can insert material prices" ON public.material_prices;
CREATE POLICY "Authenticated can insert material prices" ON public.material_prices
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
