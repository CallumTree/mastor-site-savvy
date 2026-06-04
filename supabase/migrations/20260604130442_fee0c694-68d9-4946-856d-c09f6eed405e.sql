-- Dev mode: make policies permissive and default user_id to a fixed dev user
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.projects ALTER COLUMN user_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects, public.contract_items, public.variations, public.progress_logs, public.valuations, public.valuation_items TO anon, authenticated;

CREATE POLICY "dev_all" ON public.projects FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_all" ON public.contract_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_all" ON public.variations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_all" ON public.progress_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_all" ON public.valuations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_all" ON public.valuation_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);