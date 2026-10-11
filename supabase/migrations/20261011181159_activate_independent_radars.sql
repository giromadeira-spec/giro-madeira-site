-- Retire shared collection/preparation schedules; preserve their history and definitions.
select cron.alter_job(jobid,active:=false) from cron.job
where jobname in ('giro-madeira-radar-5min','giro-madeira-auto-publicar-5min','giro-shorts-planejamento-15min','giro-shorts-storyboard-15min');
do $$ declare cfg record; begin
 for cfg in select * from public.giro_channel_settings loop
  perform cron.schedule('giro-radar-'||cfg.channel,cfg.radar_cron,format('select public.giro_dispatch_channel(%L,%L);',cfg.channel,'radar'));
  perform cron.schedule('giro-preparar-'||cfg.channel,cfg.preparation_cron,format('select public.giro_dispatch_channel(%L,%L);',cfg.channel,'prepare'));
  if cfg.channel in ('shorts','tiktok') then
   perform cron.schedule('giro-storyboard-'||cfg.channel,case cfg.channel when 'shorts' then '7,22,37,52 * * * *' else '10,25,40,55 * * * *' end,format('select public.giro_dispatch_channel(%L,%L);',cfg.channel,'storyboard'));
  else
   -- Publication remains disabled by its channel gate until separately approved.
   perform cron.schedule('giro-publicar-'||cfg.channel,'*/15 10-23,0-3 * * *',format('select public.giro_dispatch_channel(%L,%L);',cfg.channel,'publish'));
  end if;
 end loop;
end $$;

create or replace function public.giro_configurar_radar_independente(p_channel text,p_radar_schedule text default null,p_prepare_schedule text default null)
returns void language plpgsql security definer set search_path=public,pg_catalog as $$
declare cfg public.giro_channel_settings%rowtype; job_id bigint;
begin
 select * into cfg from public.giro_channel_settings where channel=p_channel for update;
 if not found then raise exception 'invalid_channel'; end if;
 if p_radar_schedule is not null then
  select jobid into job_id from cron.job where jobname='giro-radar-'||p_channel;
  if job_id is null then raise exception 'radar_job_missing'; end if;
  perform cron.alter_job(job_id,schedule:=p_radar_schedule);
 end if;
 if p_prepare_schedule is not null then
  select jobid into job_id from cron.job where jobname='giro-preparar-'||p_channel;
  if job_id is null then raise exception 'prepare_job_missing'; end if;
  perform cron.alter_job(job_id,schedule:=p_prepare_schedule);
 end if;
 update public.giro_channel_settings set radar_cron=coalesce(p_radar_schedule,radar_cron),preparation_cron=coalesce(p_prepare_schedule,preparation_cron),updated_at=now() where channel=p_channel;
end $$;
revoke all on function public.giro_configurar_radar_independente(text,text,text) from public,anon,authenticated;
grant execute on function public.giro_configurar_radar_independente(text,text,text) to service_role;

create or replace function public.giro_radares_status_independentes()
returns jsonb language plpgsql set search_path=public,pg_catalog as $$
declare cfg record; rows_count bigint; pending bigint; confirmed bigint; result jsonb:='[]'::jsonb;
begin
 for cfg in select * from public.giro_channel_settings order by channel loop
  execute format('select count(*) from public.%I where first_seen_at>now()-interval ''36 hours''','giro_radar_'||cfg.channel) into rows_count;
  if cfg.channel in ('shorts','tiktok') then
   select count(*) filter(where status in ('aguardando_video','pronto_para_revisao','aguardando_autorizacao')),count(*) filter(where provider_post_id is not null) into pending,confirmed from public.giro_social_video_queue where platform=case cfg.channel when 'shorts' then 'youtube_shorts' else 'tiktok' end and created_at>now()-interval '36 hours';
  else
   execute format('select count(*) filter(where status in (''pendente'',''aprovada'',''publicando'')),count(*) filter(where status=''publicada'') from public.%I','giro_publicacoes_'||cfg.channel) into pending,confirmed;
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('channel',cfg.channel,'radar_cron',cfg.radar_cron,'preparation_cron',cfg.preparation_cron,'radar_enabled',cfg.radar_enabled,'preparation_enabled',cfg.preparation_enabled,'publication_enabled',cfg.publication_enabled,'radar_recent',rows_count,'pending',pending,'confirmed',confirmed,'last_radar_at',cfg.last_radar_at,'last_prepared_at',cfg.last_prepared_at,'visual_contract',cfg.visual_contract));
 end loop;
 return result;
end $$;
revoke all on function public.giro_radares_status_independentes() from public,anon,authenticated;
grant execute on function public.giro_radares_status_independentes() to service_role;
