
ALTER TABLE public.site_walks
  ADD COLUMN IF NOT EXISTS recording_type text NOT NULL DEFAULT 'audio',
  ADD COLUMN IF NOT EXISTS video_path text;

ALTER TABLE public.site_walks
  DROP CONSTRAINT IF EXISTS site_walks_recording_type_check;
ALTER TABLE public.site_walks
  ADD CONSTRAINT site_walks_recording_type_check
  CHECK (recording_type IN ('audio', 'video'));

CREATE POLICY "site_walk_videos_dev_all"
  ON storage.objects
  FOR ALL
  TO anon, authenticated
  USING (bucket_id = 'site-walk-videos')
  WITH CHECK (bucket_id = 'site-walk-videos');
