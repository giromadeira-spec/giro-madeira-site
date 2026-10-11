create table public.giro_channel_settings (
 channel text primary key check(channel in ('shorts','tiktok','feed','stories','reels')),
 radar_enabled boolean not null default true,
 preparation_enabled boolean not null default true,
 publication_enabled boolean not null default false,
 radar_cron text not null,
 preparation_cron text not null,
 min_prepare_gap_minutes int not null default 90 check(min_prepare_gap_minutes>=0),
 max_drafts_24h int not null default 8 check(max_drafts_24h between 1 and 24),
 timezone text not null default 'America/Porto_Velho',
 visual_contract text not null default 'GIRO_EDITORIAL_FOTO_MANCHETE_RIO_V1',
 last_radar_at timestamptz,
 last_prepared_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.giro_channel_settings enable row level security;
revoke all on public.giro_channel_settings from public,anon,authenticated;
grant all on public.giro_channel_settings to service_role;
insert into public.giro_channel_settings(channel,radar_cron,preparation_cron,min_prepare_gap_minutes,max_drafts_24h) values
('shorts','0,15,30,45 * * * *','2,17,32,47 * * * *',0,2),
('tiktok','3,18,33,48 * * * *','5,20,35,50 * * * *',0,5),
('feed','0 10-23,0-3 * * *','5 10-23,0-3 * * *',90,8),
('stories','20 10-23,0-3 * * *','25 10-23,0-3 * * *',90,8),
('reels','10 10-23,0-3 * * *','15 10-23,0-3 * * *',90,8);

create table public.giro_radar_shorts (like public.giro_madeira_radar including all);
alter table public.giro_radar_shorts enable row level security;
revoke all on public.giro_radar_shorts from public,anon,authenticated;
grant all on public.giro_radar_shorts to service_role;
insert into public.giro_radar_shorts overriding system value select * from public.giro_madeira_radar;
select setval(pg_get_serial_sequence('public.giro_radar_shorts','id'),greatest(1,(select coalesce(max(id),1) from public.giro_radar_shorts)),true);
update public.giro_radar_shorts set status='descoberta',auto_reason=null,processed_at=null;

CREATE OR REPLACE FUNCTION public.giro_registrar_radar_shorts(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected integer;
begin
  insert into public.giro_radar_shorts
    (fonte_id,titulo,url,score,motivos,urgente,status,source_published_at,first_seen_at,last_seen_at,seen_count)
  select
    x.fonte_id,
    x.titulo,
    x.url,
    least(100,greatest(0,x.score)),
    coalesce(x.motivos,'[]'::jsonb),
    coalesce(x.urgente,false),
    'descoberta',
    x.source_published_at,
    now(),
    now(),
    1
  from jsonb_to_recordset(p_items) as x(
    fonte_id bigint,
    titulo text,
    url text,
    score integer,
    motivos jsonb,
    urgente boolean,
    source_published_at timestamptz
  )
  where x.url is not null
    and x.titulo is not null
  on conflict (url) do update
  set
    titulo = excluded.titulo,
    score = excluded.score,
    motivos = excluded.motivos,
    urgente = excluded.urgente,
    source_published_at = coalesce(excluded.source_published_at, public.giro_radar_shorts.source_published_at),
    last_seen_at = now(),
    seen_count = public.giro_radar_shorts.seen_count + 1;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function public.giro_registrar_radar_shorts(jsonb) from public,anon,authenticated; grant execute on function public.giro_registrar_radar_shorts(jsonb) to service_role;
create table public.giro_radar_tiktok (like public.giro_madeira_radar including all);
alter table public.giro_radar_tiktok enable row level security;
revoke all on public.giro_radar_tiktok from public,anon,authenticated;
grant all on public.giro_radar_tiktok to service_role;
insert into public.giro_radar_tiktok overriding system value select * from public.giro_madeira_radar;
select setval(pg_get_serial_sequence('public.giro_radar_tiktok','id'),greatest(1,(select coalesce(max(id),1) from public.giro_radar_tiktok)),true);
update public.giro_radar_tiktok set status='descoberta',auto_reason=null,processed_at=null;

CREATE OR REPLACE FUNCTION public.giro_registrar_radar_tiktok(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected integer;
begin
  insert into public.giro_radar_tiktok
    (fonte_id,titulo,url,score,motivos,urgente,status,source_published_at,first_seen_at,last_seen_at,seen_count)
  select
    x.fonte_id,
    x.titulo,
    x.url,
    least(100,greatest(0,x.score)),
    coalesce(x.motivos,'[]'::jsonb),
    coalesce(x.urgente,false),
    'descoberta',
    x.source_published_at,
    now(),
    now(),
    1
  from jsonb_to_recordset(p_items) as x(
    fonte_id bigint,
    titulo text,
    url text,
    score integer,
    motivos jsonb,
    urgente boolean,
    source_published_at timestamptz
  )
  where x.url is not null
    and x.titulo is not null
  on conflict (url) do update
  set
    titulo = excluded.titulo,
    score = excluded.score,
    motivos = excluded.motivos,
    urgente = excluded.urgente,
    source_published_at = coalesce(excluded.source_published_at, public.giro_radar_tiktok.source_published_at),
    last_seen_at = now(),
    seen_count = public.giro_radar_tiktok.seen_count + 1;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function public.giro_registrar_radar_tiktok(jsonb) from public,anon,authenticated; grant execute on function public.giro_registrar_radar_tiktok(jsonb) to service_role;
create table public.giro_radar_feed (like public.giro_madeira_radar including all);
alter table public.giro_radar_feed enable row level security;
revoke all on public.giro_radar_feed from public,anon,authenticated;
grant all on public.giro_radar_feed to service_role;
insert into public.giro_radar_feed overriding system value select * from public.giro_madeira_radar;
select setval(pg_get_serial_sequence('public.giro_radar_feed','id'),greatest(1,(select coalesce(max(id),1) from public.giro_radar_feed)),true);
update public.giro_radar_feed set status='descoberta',auto_reason=null,processed_at=null;

CREATE OR REPLACE FUNCTION public.giro_registrar_radar_feed(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected integer;
begin
  insert into public.giro_radar_feed
    (fonte_id,titulo,url,score,motivos,urgente,status,source_published_at,first_seen_at,last_seen_at,seen_count)
  select
    x.fonte_id,
    x.titulo,
    x.url,
    least(100,greatest(0,x.score)),
    coalesce(x.motivos,'[]'::jsonb),
    coalesce(x.urgente,false),
    'descoberta',
    x.source_published_at,
    now(),
    now(),
    1
  from jsonb_to_recordset(p_items) as x(
    fonte_id bigint,
    titulo text,
    url text,
    score integer,
    motivos jsonb,
    urgente boolean,
    source_published_at timestamptz
  )
  where x.url is not null
    and x.titulo is not null
  on conflict (url) do update
  set
    titulo = excluded.titulo,
    score = excluded.score,
    motivos = excluded.motivos,
    urgente = excluded.urgente,
    source_published_at = coalesce(excluded.source_published_at, public.giro_radar_feed.source_published_at),
    last_seen_at = now(),
    seen_count = public.giro_radar_feed.seen_count + 1;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function public.giro_registrar_radar_feed(jsonb) from public,anon,authenticated; grant execute on function public.giro_registrar_radar_feed(jsonb) to service_role;
create table public.giro_publicacoes_feed (like public.giro_madeira_publicacoes including all);
alter table public.giro_publicacoes_feed enable row level security;
revoke all on public.giro_publicacoes_feed from public,anon,authenticated;
grant all on public.giro_publicacoes_feed to service_role;
create index giro_publicacoes_feed_due on public.giro_publicacoes_feed(status,scheduled_at,created_at);

create table public.giro_radar_stories (like public.giro_madeira_radar including all);
alter table public.giro_radar_stories enable row level security;
revoke all on public.giro_radar_stories from public,anon,authenticated;
grant all on public.giro_radar_stories to service_role;
insert into public.giro_radar_stories overriding system value select * from public.giro_madeira_radar;
select setval(pg_get_serial_sequence('public.giro_radar_stories','id'),greatest(1,(select coalesce(max(id),1) from public.giro_radar_stories)),true);
update public.giro_radar_stories set status='descoberta',auto_reason=null,processed_at=null;

CREATE OR REPLACE FUNCTION public.giro_registrar_radar_stories(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected integer;
begin
  insert into public.giro_radar_stories
    (fonte_id,titulo,url,score,motivos,urgente,status,source_published_at,first_seen_at,last_seen_at,seen_count)
  select
    x.fonte_id,
    x.titulo,
    x.url,
    least(100,greatest(0,x.score)),
    coalesce(x.motivos,'[]'::jsonb),
    coalesce(x.urgente,false),
    'descoberta',
    x.source_published_at,
    now(),
    now(),
    1
  from jsonb_to_recordset(p_items) as x(
    fonte_id bigint,
    titulo text,
    url text,
    score integer,
    motivos jsonb,
    urgente boolean,
    source_published_at timestamptz
  )
  where x.url is not null
    and x.titulo is not null
  on conflict (url) do update
  set
    titulo = excluded.titulo,
    score = excluded.score,
    motivos = excluded.motivos,
    urgente = excluded.urgente,
    source_published_at = coalesce(excluded.source_published_at, public.giro_radar_stories.source_published_at),
    last_seen_at = now(),
    seen_count = public.giro_radar_stories.seen_count + 1;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function public.giro_registrar_radar_stories(jsonb) from public,anon,authenticated; grant execute on function public.giro_registrar_radar_stories(jsonb) to service_role;
create table public.giro_publicacoes_stories (like public.giro_madeira_publicacoes including all);
alter table public.giro_publicacoes_stories enable row level security;
revoke all on public.giro_publicacoes_stories from public,anon,authenticated;
grant all on public.giro_publicacoes_stories to service_role;
create index giro_publicacoes_stories_due on public.giro_publicacoes_stories(status,scheduled_at,created_at);

create table public.giro_radar_reels (like public.giro_madeira_radar including all);
alter table public.giro_radar_reels enable row level security;
revoke all on public.giro_radar_reels from public,anon,authenticated;
grant all on public.giro_radar_reels to service_role;
insert into public.giro_radar_reels overriding system value select * from public.giro_madeira_radar;
select setval(pg_get_serial_sequence('public.giro_radar_reels','id'),greatest(1,(select coalesce(max(id),1) from public.giro_radar_reels)),true);
update public.giro_radar_reels set status='descoberta',auto_reason=null,processed_at=null;

CREATE OR REPLACE FUNCTION public.giro_registrar_radar_reels(p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected integer;
begin
  insert into public.giro_radar_reels
    (fonte_id,titulo,url,score,motivos,urgente,status,source_published_at,first_seen_at,last_seen_at,seen_count)
  select
    x.fonte_id,
    x.titulo,
    x.url,
    least(100,greatest(0,x.score)),
    coalesce(x.motivos,'[]'::jsonb),
    coalesce(x.urgente,false),
    'descoberta',
    x.source_published_at,
    now(),
    now(),
    1
  from jsonb_to_recordset(p_items) as x(
    fonte_id bigint,
    titulo text,
    url text,
    score integer,
    motivos jsonb,
    urgente boolean,
    source_published_at timestamptz
  )
  where x.url is not null
    and x.titulo is not null
  on conflict (url) do update
  set
    titulo = excluded.titulo,
    score = excluded.score,
    motivos = excluded.motivos,
    urgente = excluded.urgente,
    source_published_at = coalesce(excluded.source_published_at, public.giro_radar_reels.source_published_at),
    last_seen_at = now(),
    seen_count = public.giro_radar_reels.seen_count + 1;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function public.giro_registrar_radar_reels(jsonb) from public,anon,authenticated; grant execute on function public.giro_registrar_radar_reels(jsonb) to service_role;
create table public.giro_publicacoes_reels (like public.giro_madeira_publicacoes including all);
alter table public.giro_publicacoes_reels enable row level security;
revoke all on public.giro_publicacoes_reels from public,anon,authenticated;
grant all on public.giro_publicacoes_reels to service_role;
create index giro_publicacoes_reels_due on public.giro_publicacoes_reels(status,scheduled_at,created_at);

do $$ declare t text; seq text; begin foreach t in array array['giro_radar_shorts','giro_radar_tiktok','giro_radar_feed','giro_radar_stories','giro_radar_reels','giro_publicacoes_feed','giro_publicacoes_stories','giro_publicacoes_reels'] loop seq:=pg_get_serial_sequence('public.'||t,'id'); execute format('grant usage,select on sequence %s to service_role',seq); end loop; end $$;
create table public.giro_tiktok_editorial_settings(like public.giro_shorts_settings including all);
alter table public.giro_tiktok_editorial_settings enable row level security;
revoke all on public.giro_tiktok_editorial_settings from public,anon,authenticated;
grant all on public.giro_tiktok_editorial_settings to service_role;
insert into public.giro_tiktok_editorial_settings select * from public.giro_shorts_settings where id='giro_madeira';
update public.giro_tiktok_editorial_settings set daily_goal=5,min_interval_minutes=90,private_auto_uploads_enabled=false,public_auto_uploads_enabled=false,football_bonus_enabled=false,football_bonus_max=0,last_updated_at=now();

CREATE OR REPLACE FUNCTION public.giro_reels_interesse_independente(p_radar_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_title text;
 v_scope text;
 v_source text;
 v_tokens text[];
 v_lcount int;
 v_signals jsonb;
 v_sources jsonb;
 v_signal_count int;
 v_direct boolean;
 v_is_global boolean;
 v_scope_out text;
BEGIN
 SELECT r.titulo,coalesce(f.escopo,'nao_identificado'),coalesce(f.nome,''),
   public.giro_reel_title_tokens(r.titulo)
 INTO v_title,v_scope,v_source,v_tokens
 FROM public.giro_radar_reels r LEFT JOIN public.giro_madeira_fontes f ON f.id=r.fonte_id
 WHERE r.id=p_radar_id;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('elegivel',false,'escopo','indefinido','motivo','Radar não encontrado.','buscas_locais_verificadas',false);
 END IF;

 v_is_global:=(
   coalesce(v_scope,'') IN ('nacional','internacional','mundo')
   OR (coalesce(v_title,'') ~* '\\m(trump|biden|putin|zelensky|zelenski|ucr[aâ]ni|r[úu]ssia|israel|gaza|ir[aã]|otan|onu|eua|estados unidos|china|coreia do norte|londres|paris|europa|venezuela)\\M')
 );
 v_scope_out:=CASE
 WHEN v_scope='internacional' OR (v_is_global AND v_title ~* '\\m(trump|putin|zelensky|zelenski|ucr[aâ]ni|r[úu]ssia|israel|gaza|ir[aã]|otan|onu|eua|estados unidos|china|coreia do norte|londres|paris|europa|venezuela)\\M') THEN 'internacional'
 WHEN v_is_global THEN 'nacional'
 ELSE 'local_regional' END;

 IF NOT v_is_global THEN
   RETURN jsonb_build_object('elegivel',true,'escopo','local_regional',
     'motivo','Pauta regional; Reels dependem de impacto visual e critérios editoriais.',
     'buscas_locais_verificadas',false,'repercussao_regional_verificada',false);
 END IF;

 v_direct:=v_title ~* '(porto velho|rond[ôo]nia|rio madeira|ji.paran[aá]|ariquemes|vilhena|cacoal|jaru|guajar[aá].mirim|nova mamor[eé])';

 SELECT count(*)::integer,
   coalesce(jsonb_agg(jsonb_build_object('tipo',tipo_metrica,'indice',indice_relativo,
    'fonte',fonte_nome,'url',fonte_url,'medido_em',medido_em)), '[]'::jsonb)
 INTO v_signal_count,v_signals
 FROM public.giro_ro_interesse_sinais
 WHERE radar_id=(select legacy.id from public.giro_madeira_radar legacy join public.giro_radar_reels own on own.url=legacy.url where own.id=p_radar_id) AND medido_em >= now()-interval '48 hours' AND indice_relativo>=70;

 -- Distinct local publishers discussing the SAME subject in the last 48h.
 WITH candidates AS (
 SELECT r.id,r.url,f.nome,f.dominio,
  public.giro_reel_title_tokens(r.titulo) AS tokens
 FROM public.giro_radar_reels r
 JOIN public.giro_madeira_fontes f ON f.id=r.fonte_id
 WHERE f.escopo IN ('porto_velho','rondonia','interior')
   AND r.first_seen_at>=now()-interval '48 hours'
   AND r.id<>p_radar_id
 ),
 matches AS (
 SELECT nome,dominio,url,
  (SELECT count(*) FROM unnest(tokens) AS t WHERE t=ANY(v_tokens)) AS overlap,
  cardinality(tokens) + cardinality(v_tokens)
   - (SELECT count(*) FROM unnest(tokens) AS t WHERE t=ANY(v_tokens)) AS union_n
 FROM candidates WHERE cardinality(tokens)>=2 AND cardinality(v_tokens)>=2
 ),
 filtered AS (
 SELECT DISTINCT ON (dominio) nome,dominio,url
 FROM matches
 WHERE overlap>=3 AND union_n>0 AND (overlap::numeric/union_n)>=0.33
 ORDER BY dominio,nome
 )
 SELECT count(*)::integer,
   coalesce(jsonb_agg(jsonb_build_object('veiculo',nome,'url',url)), '[]'::jsonb)
 INTO v_lcount,v_sources FROM filtered;

 RETURN jsonb_build_object(
  'elegivel',coalesce(v_signal_count,0)>0 OR coalesce(v_lcount,0)>=2 OR v_direct,
  'escopo',v_scope_out,
  'impacto_regional_direto',v_direct,
  'buscas_locais_verificadas',coalesce(v_signal_count,0)>0,
  'sinais_buscas_acessos',coalesce(v_signals,'[]'::jsonb),
  'repercussao_regional_verificada',coalesce(v_lcount,0)>=2,
  'veiculos_regionais_distintos',coalesce(v_lcount,0),
  'evidencias_cobertura_regional',coalesce(v_sources,'[]'::jsonb),
  'motivo',CASE
     WHEN v_signal_count>0 THEN 'Sinal regional de busca/acesso documentado.'
     WHEN v_lcount>=2 THEN 'Cobertura corroborada em pelo menos dois veículos regionais; não significa medição de buscas.'
     WHEN v_direct THEN 'Impacto geográfico direto em Rondônia; não significa medição de buscas.'
     ELSE 'Sem evidência de repercussão regional suficiente para priorizar Reel.' END
 );
END $function$;

revoke all on function public.giro_reels_interesse_independente(bigint) from public,anon,authenticated; grant execute on function public.giro_reels_interesse_independente(bigint) to service_role;
CREATE OR REPLACE FUNCTION public.giro_buffer_claim_tiktok_video()
 RETURNS TABLE(job_id bigint, source_queue_id bigint, video_url text, caption text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
 cfg public.giro_buffer_tiktok_settings%rowtype;
 candidate public.giro_social_video_queue%rowtype;
 converted text;
 midnight_pvh timestamptz;
 claimed_id bigint;
 claimed_caption text;
 now_local timestamp without time zone;
 active_slot time without time zone;
 slot_start timestamptz;
 base_slot_available boolean := false;
BEGIN
 IF NOT pg_try_advisory_xact_lock(812404,92517) THEN RETURN; END IF;
 SELECT * INTO cfg FROM public.giro_buffer_tiktok_settings WHERE id='giro_madeira';
 IF NOT EXISTS (select 1 from public.giro_channel_settings where channel='tiktok' and publication_enabled) THEN RETURN; END IF;
 IF NOT FOUND OR cfg.enabled IS NOT TRUE OR cfg.dry_run IS TRUE
   OR cfg.channel_id IS NULL OR cfg.organization_id IS NULL
   OR cfg.channel_name IS DISTINCT FROM 'giro_madeira' THEN RETURN; END IF;
 now_local := now() AT TIME ZONE 'America/Porto_Velho';
 midnight_pvh := (now_local::date::timestamp AT TIME ZONE 'America/Porto_Velho');
 IF (SELECT count(*) FROM public.giro_buffer_tiktok_jobs
     WHERE created_at >= midnight_pvh
     AND status IN ('claimed','queued','sent','uncertain','review_required')) >= cfg.daily_limit
   THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.giro_buffer_tiktok_jobs
     WHERE status IN ('claimed','queued','sent','uncertain','review_required')
       AND created_at > now()-make_interval(mins=>cfg.min_interval_minutes)) THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.giro_buffer_tiktok_jobs
     WHERE status IN ('claimed','uncertain','review_required')) THEN RETURN; END IF;
 -- Cron runs every 15 minutes; a slot has a bounded 45-minute window,
 -- so late media never results in a burst of catch-up publications.
 SELECT s INTO active_slot FROM unnest(cfg.posting_slots_local) AS s
  WHERE now_local >= (now_local::date + s)
    AND now_local < (now_local::date + s) + make_interval(mins=>cfg.posting_window_minutes)
  ORDER BY s DESC LIMIT 1;
 IF active_slot IS NOT NULL THEN
  slot_start := ((now_local::date + active_slot) AT TIME ZONE 'America/Porto_Velho');
  base_slot_available := NOT EXISTS(
    SELECT 1 FROM public.giro_buffer_tiktok_jobs
    WHERE created_at >= slot_start
      AND created_at < slot_start + make_interval(mins=>cfg.posting_window_minutes)
      AND status IN ('claimed','queued','sent','uncertain','review_required'));
 END IF;
 -- Only explicitly editorial-marked urgent videos may bypass the normal slots.
 -- They still obey all rate, QA, identity, recency and dedupe guards.
 SELECT q.* INTO candidate
 FROM public.giro_social_video_queue q
 INNER JOIN public.giro_tiktok_media_prepared p ON p.source_queue_id=q.id
 WHERE q.platform='tiktok' AND q.status='pronto_para_revisao'
   AND q.editor_approved IS TRUE AND q.visual_review_status='approved'
   AND q.storyboard_status='preparado'
   AND q.shorts_render_origin='tiktok_github_oidc_v1'
   AND q.shorts_render_version>0 AND q.shorts_rendered_at>now()-interval '18 hours'
   AND q.scheduled_for >= midnight_pvh AND q.scheduled_for<=now()
   AND (base_slot_available OR q.tiktok_urgent IS TRUE)
   AND p.status='ready' AND p.output_fps BETWEEN 29.5 AND 30.5
   AND p.output_height>p.output_width AND p.output_width>=480
   AND p.converted_video_url LIKE 'https://dsihvbdhocbqscaypraw.supabase.co/storage/v1/object/public/news-videos/shorts/tiktok-30fps/%'
   AND right(lower(p.converted_video_url),4)='.mp4'
   AND NOT EXISTS(SELECT 1 FROM public.giro_buffer_tiktok_jobs j WHERE j.source_queue_id=q.id)
 ORDER BY q.tiktok_urgent DESC, q.scheduled_for ASC, q.id ASC LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT p.converted_video_url INTO converted FROM public.giro_tiktok_media_prepared p
 WHERE p.source_queue_id=candidate.id AND p.status='ready'
 AND p.output_fps BETWEEN 29.5 AND 30.5;
 IF converted IS NULL THEN RETURN; END IF;
 claimed_caption := trim(coalesce(candidate.title,candidate.caption,''));
 IF length(trim(claimed_caption))<25 THEN RETURN; END IF;
 claimed_caption := trim(claimed_caption)||' #GiroMadeira #Rondonia #Noticias';
 INSERT INTO public.giro_buffer_tiktok_jobs (source_queue_id,video_url,caption)
 VALUES(candidate.id,converted,claimed_caption)
 ON CONFLICT ON CONSTRAINT giro_buffer_tiktok_jobs_source_queue_id_key DO NOTHING
 RETURNING id INTO claimed_id;
 IF claimed_id IS NULL THEN RETURN; END IF;
 RETURN QUERY SELECT claimed_id,candidate.id,converted,claimed_caption;
END
$function$;

create or replace function public.giro_dispatch_channel(p_channel text,p_stage text)
returns bigint language plpgsql security definer set search_path=public,pg_catalog as $$
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
end $$;
revoke all on function public.giro_dispatch_channel(text,text) from public,anon,authenticated;
grant execute on function public.giro_dispatch_channel(text,text) to service_role;

alter table public.giro_publicacoes_feed add column preparation_attempts int not null default 0, add column preparation_retry_at timestamptz;

alter table public.giro_publicacoes_stories add column preparation_attempts int not null default 0, add column preparation_retry_at timestamptz;

alter table public.giro_publicacoes_reels add column preparation_attempts int not null default 0, add column preparation_retry_at timestamptz;
create or replace function public.giro_claim_editorial_independente(p_channel text)
returns bigint language plpgsql set search_path=public,pg_catalog as $$
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
 execute format('select count(*),max(created_at) from public.%I where created_at>=now()-interval ''24 hours''',table_name) into draft_count,latest;
 if draft_count>=cfg.max_drafts_24h or latest>now()-make_interval(mins=>cfg.min_prepare_gap_minutes) then return null; end if;
 for candidate in execute format('select r.*,f.nome as source_name from public.%I r left join public.giro_madeira_fontes f on f.id=r.fonte_id
  where r.status=''descoberta'' and r.first_seen_at>=now()-interval ''36 hours'' and r.score>=25
  and (r.source_published_at is null or r.source_published_at>=now()-interval ''36 hours'')
  and not exists(select 1 from public.%I p where p.fonte_url=r.url)
  and not exists(select 1 from public.giro_madeira_publicacoes old where old.fonte_url=r.url)
  order by r.urgente desc,r.score desc,r.first_seen_at desc limit 50', 'giro_radar_'||p_channel,table_name)
 loop
  if candidate.titulo ~* '^(leia|assista|saiba mais|confira|veja|receba|acompanhe)\M' or candidate.titulo ~* '(podcast|assine|anuncie|publicidade|classificados|licença ambiental|edital)' then continue; end if;
  if candidate.source_name ilike '%News Rondônia%' and candidate.titulo ~* '(convida|recebe|entrevista|apresenta|ao vivo)' then continue; end if;
  if candidate.url !~ '^https://' then continue; end if;
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
end $$;
revoke all on function public.giro_claim_editorial_independente(text) from public,anon,authenticated;
grant execute on function public.giro_claim_editorial_independente(text) to service_role;
