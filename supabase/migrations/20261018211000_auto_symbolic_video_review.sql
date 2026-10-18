-- Automated editorial review only for the deterministic abstract art renderer,
-- with a distinct machine review audit trail. No bypass of any posting window.
ALTER TABLE public.giro_social_video_queue
 ADD COLUMN IF NOT EXISTS auto_review_basis text,
 ADD COLUMN IF NOT EXISTS auto_review_at timestamptz;
CREATE OR REPLACE FUNCTION public.giro_dispatch_channel(p_channel text, p_stage text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare target text; key_value text; cfg public.giro_channel_settings%rowtype; request_id bigint;
begin
 select * into cfg from public.giro_channel_settings where channel=p_channel;
 if not found then raise exception 'invalid_channel'; end if;
 if p_stage='radar' then
  if not cfg.radar_enabled then return null; end if;
  target:='giro-radar-independente';
 elsif p_stage='prepare' then
  if not cfg.preparation_enabled then return null; end if;
  target:=case p_channel when 'shorts' then 'giro-shorts-editorial-queue' when 'tiktok' then 'giro-tiktok-editorial-queue' else 'giro-instagram-preparar-independente' end;
 elsif p_stage='storyboard' and p_channel in ('shorts','tiktok') then
  if not cfg.preparation_enabled then return null; end if;
  target:=case p_channel when 'shorts' then 'giro-shorts-preparar-storyboard' else 'giro-tiktok-preparar-storyboard' end;
 elsif p_stage='review' and p_channel in ('shorts','tiktok') then
  if not cfg.preparation_enabled then return null; end if;
  target:='giro-auto-revisao-video';
 elsif p_stage='publish' and p_channel in ('feed','stories','reels') then
  if not cfg.publication_enabled then return null; end if;
  target:='giro-instagram-publicar-independente';
 else raise exception 'invalid_stage'; end if;
 select decrypted_secret into key_value from vault.decrypted_secrets where name='giro_db_dispatch_key' limit 1;
 if key_value is null then raise exception 'dispatch_key_missing'; end if;
 select net.http_post(url:='https://dsihvbdhocbqscaypraw.supabase.co/functions/v1/'||target,
 headers:=jsonb_build_object('Content-Type','application/json','x-giro-db-key',key_value),
 body:=jsonb_build_object('channel',p_channel),timeout_milliseconds:=120000) into request_id;
 return request_id;
end $function$
;
-- Existing restricted dispatcher manages authorization and private credentials.
-- The cron job never reads, copies, or embeds credentials directly.
SELECT cron.schedule('giro-auto-review-video-17h', '40,50,55 20 * * *',
 $$SELECT public.giro_dispatch_channel('shorts','review');$$);
SELECT cron.schedule('giro-auto-review-video-17h-fallback', '5,20 21 * * *',
 $$SELECT public.giro_dispatch_channel('shorts','review');$$);