-- Safe, idempotent pg_cron configuration for ChatGPT media. All schedules UTC.
-- Meta gate, daily caps, approval, expiries and cross-format predecessor IDs are enforced by publisher.
SELECT cron.schedule('giro-chatgpt-catchup-feed','0 21-23,0-1 * * *',
  $$SELECT public.giro_dispatch_channel('feed','publish');$$);
SELECT cron.schedule('giro-chatgpt-catchup-reels','20 21-23,0-1 * * *',
  $$SELECT public.giro_dispatch_channel('reels','publish');$$);
SELECT cron.schedule('giro-chatgpt-catchup-stories','40 21-23,0-1 * * *',
  $$SELECT public.giro_dispatch_channel('stories','publish');$$);
SELECT cron.schedule('giro-chatgpt-expirar-apos-validade','50 * * * *',$job$
 UPDATE public.giro_publicacoes_feed f
 SET status='descartada',erro='expired_verified_package_not_sent',scheduled_at=NULL
 FROM public.giro_chatgpt_pacotes p
 WHERE p.feed_id=f.id AND f.status='aprovada' AND f.instagram_media_id IS NULL
  AND f.editorial_expires_at IS NOT NULL AND f.editorial_expires_at<=now();
 UPDATE public.giro_publicacoes_reels r
 SET status='descartada',erro='expired_verified_package_not_sent',scheduled_at=NULL
 FROM public.giro_chatgpt_pacotes p
 WHERE p.reel_id=r.id AND r.status='aprovada' AND r.instagram_reel_media_id IS NULL
  AND r.editorial_expires_at IS NOT NULL AND r.editorial_expires_at<=now();
 UPDATE public.giro_publicacoes_stories s
 SET status='descartada',erro='expired_verified_package_not_sent',scheduled_at=NULL
 FROM public.giro_chatgpt_pacotes p
 WHERE p.story_id=s.id AND s.status='aprovada' AND s.instagram_story_media_id IS NULL
  AND s.editorial_expires_at IS NOT NULL AND s.editorial_expires_at<=now();
$job$);
