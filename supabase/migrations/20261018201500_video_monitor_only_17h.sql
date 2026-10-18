-- Monitoring tracks ONLY the independent 17:00 daily Shorts and TikTok windows.
-- No change to delivery code, editorial approvals, or existing published IDs.
CREATE OR REPLACE FUNCTION public.giro_pipeline_status_readonly()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare cfg record; counts jsonb; channels jsonb:='[]'; alerts jsonb:='[]';
 tbl text; id_col text; lane text; slot timestamptz; slot_hour int; delivered boolean;
 day_start timestamptz:=(date_trunc('day',now() at time zone 'America/Porto_Velho') at time zone 'America/Porto_Velho');
begin
 for cfg in select * from public.giro_channel_settings order by channel loop
  if cfg.channel in ('shorts','tiktok') then
   lane:=case cfg.channel when 'shorts' then 'youtube_shorts' else 'tiktok' end;
   select jsonb_build_object(
    'awaiting_review',count(*) filter(where status='pronto_para_revisao' and shorts_render_version>0 and (not editor_approved or visual_review_status<>'approved')),
    'ready',count(*) filter(where status='pronto_para_revisao' and editor_approved and visual_review_status='approved' and shorts_render_version>0),
    'uncertain',count(*) filter(where status='aguardando_autorizacao' and shorts_render_version>0 and provider_post_id is null),
    'confirmed_24h',count(*) filter(where status='enviado' and provider_post_id is not null and provider_privacy_status='public' and updated_at>now()-interval '24 hours'),
    'failed_24h',count(*) filter(where status='falha' and updated_at>now()-interval '24 hours')) into counts
   from public.giro_social_video_queue where platform=lane and created_at>now()-interval '36 hours';
   foreach slot_hour in array array[17] loop
    slot:=day_start+make_interval(hours=>slot_hour);
    if cfg.publication_enabled and now()>slot+interval '45 minutes' then
     select exists(select 1 from public.giro_social_video_queue q
      where q.platform=lane and q.scheduled_for>=slot and q.scheduled_for<slot+interval '45 minutes'
       and q.status='enviado' and q.provider_post_id is not null and q.provider_privacy_status='public'
       and (cfg.channel='shorts' or exists(select 1 from public.giro_buffer_tiktok_jobs j
        where j.source_queue_id=q.id and j.status='sent' and j.sent_at is not null
         and j.buffer_post_url ~ '^https://(www[.])?tiktok[.]com/@[^/]+/video/[0-9]+')))
     into delivered;
     if not delivered then alerts:=alerts||jsonb_build_array(jsonb_build_object('channel',cfg.channel,'reason','scheduled_publication_unconfirmed','slot',slot)); end if;
    end if;
   end loop;
  else
   tbl:='giro_publicacoes_'||cfg.channel;
   id_col:=case cfg.channel when 'feed' then 'instagram_media_id' when 'stories' then 'instagram_story_media_id' else 'instagram_reel_media_id' end;
   execute format('select jsonb_build_object(''awaiting_review'',count(*) filter(where status=''pendente'' and visual_approved is distinct from true),''ready'',count(*) filter(where status=''aprovada'' and visual_approved),''uncertain'',count(*) filter(where status=''publicando'' or erro=''reconcile_provider_before_resend''),''confirmed_24h'',count(*) filter(where status=''publicada'' and %I is not null and published_at>now()-interval ''24 hours''),''failed_24h'',count(*) filter(where status=''erro'' and created_at>now()-interval ''24 hours'')) from public.%I where created_at>now()-interval ''36 hours''',id_col,tbl) into counts;
  end if;
  if cfg.publication_enabled and (counts->>'uncertain')::int>0 then
   alerts:=alerts||jsonb_build_array(jsonb_build_object('channel',cfg.channel,'reason','reconciliation_required'));
  end if;
  if cfg.publication_enabled and (counts->>'awaiting_review')::int>0 then
   alerts:=alerts||jsonb_build_array(jsonb_build_object('channel',cfg.channel,'reason','awaiting_editorial_visual_review','count',(counts->>'awaiting_review')::int));
  end if;
  channels:=channels||jsonb_build_array(jsonb_build_object('channel',cfg.channel,'publication_enabled',cfg.publication_enabled,'radar_enabled',cfg.radar_enabled,'last_radar_at',cfg.last_radar_at,'counts',counts));
 end loop;
 return jsonb_build_object('checked_at',now(),'read_only',true,'publication_attempted',false,'channels',channels,'alerts',alerts);
end $function$
;