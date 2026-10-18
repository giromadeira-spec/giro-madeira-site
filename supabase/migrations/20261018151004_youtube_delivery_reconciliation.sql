-- Existing video IDs only. This cron cannot create or resend a video.
select cron.schedule('giro-youtube-reconciliar-visibilidade','*/30 * * * *',
$job$
select net.http_post(
 url:='https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/giro-youtube-upload-auto',
 headers:=jsonb_build_object('Content-Type','application/json','x-giro-db-key',
  (select decrypted_secret from vault.decrypted_secrets where name='giro_db_dispatch_key' limit 1)),
 body:='{"action":"reconcile"}'::jsonb,timeout_milliseconds:=120000);
$job$);

