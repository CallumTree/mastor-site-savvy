ALTER TABLE public.site_walk_photos
  ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS annotations JSONB,
  ADD COLUMN IF NOT EXISTS annotated_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS annotated_storage_path TEXT;