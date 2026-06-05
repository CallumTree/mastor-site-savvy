
CREATE TABLE public.trade_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  merchant_name TEXT NOT NULL,
  account_reference TEXT,
  branch_name TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_accounts TO authenticated;
GRANT ALL ON public.trade_accounts TO service_role;
ALTER TABLE public.trade_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own trade accounts" ON public.trade_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_trade_accounts_updated BEFORE UPDATE ON public.trade_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.merchant_quotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  merchant_name TEXT NOT NULL,
  quote_value NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'Requested',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_quotes TO authenticated;
GRANT ALL ON public.merchant_quotes TO service_role;
ALTER TABLE public.merchant_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage merchant quotes for own projects" ON public.merchant_quotes
  FOR ALL USING (public.user_owns_project(project_id)) WITH CHECK (public.user_owns_project(project_id));
CREATE TRIGGER trg_merchant_quotes_updated BEFORE UPDATE ON public.merchant_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
