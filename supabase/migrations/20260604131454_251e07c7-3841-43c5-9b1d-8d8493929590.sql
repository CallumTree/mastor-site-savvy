
CREATE TABLE public.procurement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  package_name text NOT NULL,
  supplier text,
  status text NOT NULL DEFAULT 'Out to tender',
  value numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procurement_items TO anon, authenticated;
GRANT ALL ON public.procurement_items TO service_role;

ALTER TABLE public.procurement_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_all" ON public.procurement_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_procurement_items_updated_at
BEFORE UPDATE ON public.procurement_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
