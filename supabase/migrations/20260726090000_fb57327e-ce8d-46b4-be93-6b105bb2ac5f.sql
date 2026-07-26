-- Custom project cover photo override. When null, the app falls back to
-- the most recent site walk photo for that project.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS cover_photo_path TEXT;

-- project-covers: private bucket for the custom cover photo upload,
-- created directly here (storage.buckets is a normal table) rather than
-- through the separate "storage tool" the earlier buckets used.
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-covers', 'project-covers', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can read their own project covers"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'project-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can upload their own project covers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own project covers"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'project-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own project covers"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-covers' AND (storage.foldername(name))[1] = auth.uid()::text);
