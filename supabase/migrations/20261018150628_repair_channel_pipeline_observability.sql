CREATE OR REPLACE FUNCTION public.giro_claim_editorial_independente(p_channel text)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare cfg public.giro_channel_settings%rowtype; candidate record; source_name text; table_name text;
draft_count int; latest timestamptz; publication_id bigint; local_min int; interest jsonb; duplicate_story boolean;
begin
 if p_channel not in ('feed','stories','reels') then raise exception 'invalid_channel'; end if;
 if not pg_try_advisory_xact_lock(812405,hashtext(p_channel)) then return null; end if;
 select * into cfg from public.giro_channel_settings where channel=p_channel;
 if not found or not cfg.preparation_enabled then return null; end if;
 local_min:=extract(hour from (now() at time zone cfg.timezone))::int*60+extract(minute from (now() at time zone cfg.timezone))::int;
 if local_min<360 or local_min>1410 then return null; end if;
 table_name:='giro_publicacoes_'||p_channel;
 execute format('select count(*) filter (where status not in (''descartada'')),max(created_at) from public.%I where created_at>=now()-interval ''24 hours''',table_name) into draft_count,latest;
 if draft_count>=cfg.max_drafts_24h or latest>now()-make_interval(mins=>cfg.min_prepare_gap_minutes) then return null; end if;
 for candidate in execute format('select r.*,f.nome as source_name from public.%I r left join public.giro_madeira_fontes f on f.id=r.fonte_id
  where r.status=''descoberta'' and r.first_seen_at>=now()-interval ''36 hours'' and r.score>=25
  and (r.source_published_at is null or r.source_published_at>=now()-interval ''36 hours'')
  and not exists(select 1 from public.%I p where p.fonte_url=r.url)
  and not exists(select 1 from public.giro_madeira_publicacoes old where old.fonte_url=r.url and old.%I is not null)
  order by (case when r.url ~* ''(rondonia|porto-velho|portovelho|pc[.]ro[.]gov[.]br|pm[.]ro[.]gov[.]br)'' or r.titulo ~* ''(Porto Velho|Rond[oô]nia|Ariquemes|Ji-Paran[aá]|Vilhena|Jaru|Cacoal|Guajar[aá]|Buritis)'' then 1 else 0 end) desc, r.urgente desc,(case when r.first_seen_at>=now()-interval ''8 hours'' then 1 else 0 end) desc,r.score desc,(case when f.tipo_fonte=''oficial'' then 1 else 0 end) desc,r.first_seen_at desc limit 50', 'giro_radar_'||p_channel,table_name,case p_channel when 'feed' then 'instagram_media_id' when 'stories' then 'instagram_story_media_id' else 'instagram_reel_media_id' end)
 loop
  if candidate.titulo ~* '^(leia|assista|saiba mais|confira|veja|receba|acompanhe)\M' or candidate.titulo ~* '(podcast|assine|anuncie|publicidade|classificados|licença ambiental|edital)' then continue; end if;
  if candidate.source_name ilike '%News Rondônia%' and candidate.titulo ~* '(convida|recebe|entrevista|apresenta|ao vivo)' then continue; end if;
  if candidate.url !~ '^https://' then continue; end if;
  -- No edital/publicidade ou previsao de rotina nas redes; pautas urgentes sao selecionadas editorialmente.
  if candidate.url ilike '%/editais/%' or candidate.url ilike '%/classificados/%' or candidate.url ilike '%/previsao-do-tempo/%' or candidate.url ilike '%/publicidade/%' or candidate.url ilike '%/conexao-rondoniaovivo-%' then continue; end if;
  if p_channel='reels' then
   interest:=public.giro_reels_interesse_independente(candidate.id);
   if coalesce((interest->>'elegivel')::boolean,false) is not true then continue; end if;
   if interest->>'escopo'='local_regional' and not candidate.urgente and candidate.titulo !~* '(polícia|prisão|preso|operação|acidente|colisão|incêndio|alerta|temporal|chuva|enchente|evento|apreensão)' then continue; end if;
  end if;
  -- Different URL from the same recent story is deduplicated within this channel only.
  execute format('select exists(select 1 from public.%I p where p.created_at>=now()-interval ''48 hours'' and (lower(p.titulo)=lower($1) or (cardinality(public.giro_reel_title_tokens(p.titulo))>=3 and (select count(*) from unnest(public.giro_reel_title_tokens(p.titulo)) t where t=any(public.giro_reel_title_tokens($1)))::numeric/greatest(1,cardinality(public.giro_reel_title_tokens(p.titulo))+cardinality(public.giro_reel_title_tokens($1))-(select count(*) from unnest(public.giro_reel_title_tokens(p.titulo)) t where t=any(public.giro_reel_title_tokens($1))))>=0.68)))',table_name) using candidate.titulo into duplicate_story;
  if duplicate_story then continue; end if;
  execute format('insert into public.%I(titulo,fonte_url,fonte_nome,status,urgente,relevancia,discovered_at,publicar_story,publicar_reel,media_pipeline_version,media_status,auto_origin_radar_id,editorial_expires_at)
   values($1,$2,$3,''pendente'',$4,$5,$6,$7,$8,5,''aguardando_midia'',$9,now()+interval ''36 hours'') returning id',table_name)
   using candidate.titulo,candidate.url,coalesce(candidate.source_name,'Fonte original'),candidate.urgente,candidate.score,candidate.first_seen_at,p_channel='stories',p_channel='reels',candidate.id into publication_id;
  execute format('update public.%I set status=''processada'',processed_at=now(),auto_reason=''fila independente ''||$1 where id=$2','giro_radar_'||p_channel) using p_channel,candidate.id;
  update public.giro_channel_settings set last_prepared_at=now() where channel=p_channel;
  return publication_id;
 end loop;
 return null;
end $function$;


-- Read-only operational snapshot. A successful worker is never a delivery receipt.
create or replace function public.giro_pipeline_status_readonly()
returns jsonb language plpgsql stable set search_path=public,pg_catalog as $$
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
   foreach slot_hour in array array[8,22] loop
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
end $$;
revoke all on function public.giro_pipeline_status_readonly() from public,anon,authenticated;
grant execute on function public.giro_pipeline_status_readonly() to service_role;
