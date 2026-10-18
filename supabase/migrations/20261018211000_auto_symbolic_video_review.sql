-- Auto-review is explicitly delegated by the user for safe original abstract
-- pictogram videos. This is not human review; provenance is recorded distinctly.
ALTER TABLE public.giro_social_video_queue
 ADD COLUMN IF NOT EXISTS auto_review_basis text,
 ADD COLUMN IF NOT EXISTS auto_review_at timestamptz;
-- Review only while videos may still be published inside their legitimate slot.
-- The Edge function validates source facts, signed original-art provenance,
-- deterministic renderer and metadata; it never posts.
SELECT cron.schedule('giro-auto-review-video-17h',
 '40,50,55 20 * * *',
 $$SELECT net.http_post(
  url:='https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/giro-auto-revisao-video',
  headers:=jsonb_build_object(
   'Content-Type','application/json',
   'x-giro-db-key',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='giro_db_dispatch_key' LIMIT 1)),
  body:='{"dry_run":false}'::jsonb,timeout_milliseconds:=60000
 );$$);
SELECT cron.schedule('giro-auto-review-video-17h-fallback',
 '5,20 21 * * *',
 $$SELECT net.http_post(
  url:='https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/giro-auto-revisao-video',
  headers:=jsonb_build_object(
   'Content-Type','application/json',
   'x-giro-db-key',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='giro_db_dispatch_key' LIMIT 1)),
  body:='{"dry_run":false}'::jsonb,timeout_milliseconds:=60000
 );$$);