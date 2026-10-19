-- Applied in production 2026-10-19. Preserve provider-ID and expiry requirements.
CREATE OR REPLACE FUNCTION public.giro_chatgpt_pacote_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  -- Never create two new editorial packages on the same local calendar day.
  IF EXISTS (
    SELECT 1 FROM public.giro_chatgpt_pacotes
    WHERE left(ciclo_local, 10) = left(NEW.ciclo_local, 10)
  ) THEN
    RAISE EXCEPTION 'instagram_safe_daily_package_cap';
  END IF;

  -- An earlier package only clears when each format was really published
  -- (provider ID present) OR explicitly expired and was discarded.
  -- Pending, ambiguous and still-valid media keep ingestion blocked.
  IF EXISTS (
    SELECT 1
    FROM public.giro_chatgpt_pacotes p
    JOIN public.giro_publicacoes_feed f ON f.id = p.feed_id
    JOIN public.giro_publicacoes_reels r ON r.id = p.reel_id
    JOIN public.giro_publicacoes_stories s ON s.id = p.story_id
    WHERE p.created_at > now() - interval '48 hours'
      AND (
        NOT (
          (f.status = 'publicada' AND nullif(f.instagram_media_id,'') IS NOT NULL)
          OR (f.status = 'descartada' AND f.editorial_expires_at <= now())
        )
        OR NOT (
          (r.status = 'publicada' AND nullif(r.instagram_reel_media_id,'') IS NOT NULL)
          OR (r.status = 'descartada' AND r.editorial_expires_at <= now())
        )
        OR NOT (
          (s.status = 'publicada' AND nullif(s.instagram_story_media_id,'') IS NOT NULL)
          OR (s.status = 'descartada' AND s.editorial_expires_at <= now())
        )
      )
  ) THEN
    RAISE EXCEPTION 'previous_package_not_yet_confirmed_or_expired';
  END IF;

  RETURN NEW;
END
$function$

