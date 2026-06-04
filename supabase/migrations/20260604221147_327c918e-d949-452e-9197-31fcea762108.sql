CREATE TABLE public.valuation_basket_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  claim_id UUID REFERENCES public.potential_claims(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  value NUMERIC,
  status TEXT NOT NULL DEFAULT 'In Basket' CHECK (status IN ('In Basket','Removed','Added To Valuation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.valuation_basket_items TO authenticated;
GRANT ALL ON public.valuation_basket_items TO service_role;

ALTER TABLE public.valuation_basket_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage basket items in own projects"
ON public.valuation_basket_items
FOR ALL
TO authenticated
USING (public.user_owns_project(project_id))
WITH CHECK (public.user_owns_project(project_id));

CREATE TRIGGER update_valuation_basket_items_updated_at
BEFORE UPDATE ON public.valuation_basket_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_valuation_basket_items_project ON public.valuation_basket_items(project_id);
CREATE INDEX idx_valuation_basket_items_claim ON public.valuation_basket_items(claim_id);