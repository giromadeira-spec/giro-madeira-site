-- Extend the previously restricted and authenticated Supabase dispatcher for independent editorial QA. No publishing bypass.
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
 elsif p_stage='auto_review_instagram' and p_channel in ('feed','reels','stories') then
  if not cfg.preparation_enabled then return null; end if;
  target:='giro-auto-revisao-instagram';
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
