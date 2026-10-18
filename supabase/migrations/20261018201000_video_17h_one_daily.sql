-- GIRO MADEIRA: one independently verified Shorts/TikTok video daily at
-- 17:00 America/Porto_Velho (21:00 UTC). Old 08:00/22:00 windows are retired.
-- Historic publication IDs and Buffer jobs are never cleared or resent.
begin;
update public.giro_shorts_settings
 set daily_goal=1, min_interval_minutes=1200,
 football_bonus_enabled=false, football_bonus_max=0,
 editorial_style_prompt=replace(editorial_style_prompt,
   'Shorts: 2 por dia, preferencialmente 08h e 22h de Porto Velho, duas janelas diárias',
   'Shorts: 1 por dia às 17h de Porto Velho, janela única, sem bônus de futebol'),
 last_updated_at=now()
 where id='giro_madeira';
update public.giro_tiktok_editorial_settings
 set daily_goal=1, football_bonus_enabled=false, football_bonus_max=0,
 editorial_style_prompt=replace(editorial_style_prompt,
   'Dois vídeos diários às 08h e 22h America/Porto_Velho',
   'Um vídeo diário às 17h America/Porto_Velho, sem horários adicionais'),
 last_updated_at=now()
 where id='giro_madeira';
update public.giro_buffer_tiktok_settings
 set daily_limit=1, posting_slots_local=array['17:00'::time],
 posting_window_minutes=45, updated_at=now()
 where id='giro_madeira';
-- Single 17:00–17:44 PV release window; cron retries are safe because the
-- uploader enforces the 1/day cap, current slot, ownership and provider ID.
select cron.alter_job(11, schedule:='0,15,30 21 * * *');
-- Preserve old unpublished drafts as expired, with their actual media files and
-- history intact. Only fail-closed rows without editorial approval or remote ID.
update public.giro_social_video_queue q
 set status='expirado', updated_at=now(),
 last_error='Agenda alterada para 1 vídeo diário às 17h de Porto Velho; slot antigo encerrado sem envio e sem reaproveitar notícia vencida.'
 where q.platform in ('youtube_shorts','tiktok')
 and (q.scheduled_for at time zone 'America/Porto_Velho')::time in ('08:00'::time,'22:00'::time)
 and q.scheduled_for>=now()
 and q.status in ('pronto_para_revisao','aguardando_video')
 and q.editor_approved=false and q.visual_review_status='pending'
 and q.provider_post_id is null
 and not exists(select 1 from public.giro_buffer_tiktok_jobs b where b.source_queue_id=q.id);
commit;
