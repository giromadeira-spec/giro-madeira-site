-- Applied 2026-10-20 UTC: next-day 06h Porto Velho expiry prevents stale package from blocking 07h production.
CREATE OR REPLACE FUNCTION public.giro_chatgpt_registrar_pacote(p_ciclo_local text, p_titulo text, p_fonte_url text, p_fonte_nome text, p_resumo text, p_legenda text, p_feed_image_url text, p_reel_story_image_url text, p_story_image_url text, p_video_url text, p_image_kind text, p_imagem_credito text, p_comprovacao_direitos text, p_comprovacao_qa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
 v_slot timestamp;
 v_origin text:='https://dsihvbdhocbqscaypraw.supabase.co/storage/v1/object/public/';
 v_fpath text; v_rpath text; v_spath text; v_vpath text;
 v_caption text;v_origin_label text;
 v_fid bigint;v_rid bigint;v_sid bigint;v_pid bigint;
 v_photo boolean;
begin
 if not pg_try_advisory_xact_lock(832026,1019) then raise exception 'hourly_ingest_busy'; end if;
 if p_ciclo_local !~ '^20[0-9]{2}-(0[1-9]|1[0-2])-[0-3][0-9]T(0[7-9]|1[0-9]|2[0-2]):00$'
 then raise exception 'invalid_porto_velho_cycle';end if;
 v_slot:=replace(p_ciclo_local,'T',' ')::timestamp;
 if abs(extract(epoch from (v_slot-(now() at time zone 'America/Porto_Velho'))))>5400
 then raise exception 'cycle_outside_current_window';end if;
 if length(trim(coalesce(p_titulo,'')))<18 or length(p_titulo)>160
 or length(trim(coalesce(p_fonte_nome,'')))<3
 or length(trim(coalesce(p_resumo,'')))<45
 or length(trim(coalesce(p_legenda,'')))<55
 or p_fonte_url !~ '^https://[^/]+/.+'
 then raise exception 'unverified_article_or_missing_editorial_text';end if;
 if p_image_kind not in ('foto_fato','foto_arquivo','ilustracao_editorial')
 or length(trim(coalesce(p_imagem_credito,'')))<8
 or length(trim(coalesce(p_comprovacao_direitos,'')))<15
 or length(trim(coalesce(p_comprovacao_qa,'')))<50
 then raise exception 'media_rights_and_actual_visual_review_required';end if;
 if exists(select 1 from public.giro_chatgpt_pacotes where ciclo_local=p_ciclo_local or fonte_url=p_fonte_url)
 or exists(select 1 from public.giro_publicacoes_feed where fonte_url=p_fonte_url)
 or exists(select 1 from public.giro_publicacoes_reels where fonte_url=p_fonte_url)
 or exists(select 1 from public.giro_publicacoes_stories where fonte_url=p_fonte_url)
 or exists(select 1 from public.giro_madeira_publicacoes where fonte_url=p_fonte_url
  and (instagram_media_id is not null or instagram_reel_media_id is not null or instagram_story_media_id is not null))
 then raise exception 'duplicate_cycle_or_article';end if;
 if p_feed_image_url !~ ('^'||v_origin||'news-images/auto/jpeg/feed/feed/[A-Za-z0-9_.-]+\.jpg$')
 or p_reel_story_image_url !~ ('^'||v_origin||'news-images/auto/jpeg/reels/story/[A-Za-z0-9_.-]+\.jpg$')
 or p_story_image_url !~ ('^'||v_origin||'news-images/auto/jpeg/stories/story/[A-Za-z0-9_.-]+\.jpg$')
 or p_video_url !~ ('^'||v_origin||'news-videos/auto/reels/reels/[A-Za-z0-9_.-]+\.mp4$')
 then raise exception 'final_artifacts_not_in_required_storage_paths';end if;
 v_fpath:=substring(p_feed_image_url from length(v_origin||'news-images/')+1);
 v_rpath:=substring(p_reel_story_image_url from length(v_origin||'news-images/')+1);
 v_spath:=substring(p_story_image_url from length(v_origin||'news-images/')+1);
 v_vpath:=substring(p_video_url from length(v_origin||'news-videos/')+1);
 if (select count(distinct name) from storage.objects
  where bucket_id='news-images' and name in (v_fpath,v_rpath,v_spath)
  and metadata->>'mimetype'='image/jpeg'
  and (metadata->>'size')::bigint between 30000 and 12000000)<>3
 or not exists(select 1 from storage.objects
  where bucket_id='news-videos' and name=v_vpath
  and metadata->>'mimetype'='video/mp4'
  and (metadata->>'size')::bigint between 100000 and 35000000)
 then raise exception 'missing_or_invalid_media_in_supabase_storage';end if;
 v_photo:=p_image_kind<>'ilustracao_editorial';
 v_origin_label:=case p_image_kind
  when 'foto_fato' then 'Foto do acontecimento: '||trim(p_imagem_credito)
  when 'foto_arquivo' then 'Foto de arquivo: '||trim(p_imagem_credito)
  else 'ILUSTRAÇÃO EDITORIAL ORIGINAL — NÃO É FOTO DO ACONTECIMENTO.' end;
 v_caption:=trim(p_legenda)||E'\n\nFonte: '||trim(p_fonte_nome)||
 E'\nMatéria original: '||trim(p_fonte_url)||E'\n'||v_origin_label;
 insert into public.giro_publicacoes_feed
 (titulo,fonte_url,fonte_nome,resumo,legenda,feed_image_url,image_url,story_image_url,
 status,visual_approved,publicar_story,publicar_reel,media_pipeline_version,
 media_status,auto_review_basis,editorial_expires_at)
 values(trim(p_titulo),trim(p_fonte_url),trim(p_fonte_nome),trim(p_resumo),v_caption,
 p_feed_image_url,p_feed_image_url,p_story_image_url,
 'aprovada',true,false,false,6,
 case when v_photo then 'feed_foto_verificada' else 'feed_ilustracao_revisada' end,
 'chatgpt_asset_qa_v1',((((now() AT TIME ZONE 'America/Porto_Velho')::date + 1) + time '06:00') AT TIME ZONE 'America/Porto_Velho')) returning id into v_fid;
 insert into public.giro_publicacoes_reels
 (titulo,fonte_url,fonte_nome,resumo,legenda,story_image_url,video_url,status,
 visual_approved,publicar_story,publicar_reel,media_pipeline_version,media_status,
 auto_review_basis,editorial_expires_at)
 values(trim(p_titulo),trim(p_fonte_url),trim(p_fonte_nome),trim(p_resumo),v_caption,
 p_reel_story_image_url,p_video_url,'aprovada',true,false,true,5,
 case when v_photo then 'reel_foto_verificada' else 'reel_ilustracao_revisada' end,
 'chatgpt_asset_qa_v1',((((now() AT TIME ZONE 'America/Porto_Velho')::date + 1) + time '06:00') AT TIME ZONE 'America/Porto_Velho')) returning id into v_rid;
 insert into public.giro_publicacoes_stories
 (titulo,fonte_url,fonte_nome,resumo,legenda,story_image_url,status,
 visual_approved,publicar_story,publicar_reel,media_pipeline_version,
 media_status,auto_review_basis,editorial_expires_at)
 values(trim(p_titulo),trim(p_fonte_url),trim(p_fonte_nome),trim(p_resumo),v_caption,
 p_story_image_url,'aprovada',true,true,false,5,
 case when v_photo then 'stories_foto_verificada' else 'stories_ilustracao_revisada' end,
 'chatgpt_asset_qa_v1',((((now() AT TIME ZONE 'America/Porto_Velho')::date + 1) + time '06:00') AT TIME ZONE 'America/Porto_Velho')) returning id into v_sid;
 insert into public.giro_chatgpt_pacotes
 (ciclo_local,titulo,fonte_url,fonte_nome,resumo,legenda,feed_image_url,reel_story_image_url,
 story_image_url,video_url,image_kind,imagem_credito,comprovacao_direitos,comprovacao_qa,
 feed_id,reel_id,story_id)
 values(p_ciclo_local,trim(p_titulo),trim(p_fonte_url),trim(p_fonte_nome),trim(p_resumo),
 v_caption,p_feed_image_url,p_reel_story_image_url,p_story_image_url,p_video_url,
 p_image_kind,trim(p_imagem_credito),trim(p_comprovacao_direitos),
 trim(p_comprovacao_qa),v_fid,v_rid,v_sid) returning id into v_pid;
 return jsonb_build_object('success',true,'package_id',v_pid,'feed_id',v_fid,
 'reel_id',v_rid,'story_id',v_sid,'publication_not_confirmed',true);
end $function$
;

UPDATE public.giro_publicacoes_feed f SET editorial_expires_at='2026-10-20 10:00:00+00'::timestamptz FROM public.giro_chatgpt_pacotes p
WHERE p.id=2 AND p.feed_id=f.id AND f.status='aprovada' AND f.instagram_media_id IS NULL AND f.published_at IS NULL AND f.editorial_expires_at>'2026-10-20 10:00:00+00'::timestamptz;
UPDATE public.giro_publicacoes_reels r SET editorial_expires_at='2026-10-20 10:00:00+00'::timestamptz FROM public.giro_chatgpt_pacotes p
WHERE p.id=2 AND p.reel_id=r.id AND r.status='aprovada' AND r.instagram_reel_media_id IS NULL AND r.published_at IS NULL AND r.editorial_expires_at>'2026-10-20 10:00:00+00'::timestamptz;
UPDATE public.giro_publicacoes_stories s SET editorial_expires_at='2026-10-20 10:00:00+00'::timestamptz FROM public.giro_chatgpt_pacotes p
WHERE p.id=2 AND p.story_id=s.id AND s.status='aprovada' AND s.instagram_story_media_id IS NULL AND s.published_at IS NULL AND s.editorial_expires_at>'2026-10-20 10:00:00+00'::timestamptz;