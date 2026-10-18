-- Giro Madeira: cautious one-Story-per-day pilot; manual artwork review mandatory.
-- No change to Feed/Reels (one each), full stage, or traffic-light yellow.
BEGIN;
ALTER TABLE public.giro_meta_rate_state
 ADD COLUMN IF NOT EXISTS traffic_light_story_test_enabled boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.giro_instagram_semaforo_gate(p_media_type text, p_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 st public.giro_meta_rate_state%ROWTYPE;
 light text;
 local_dt timestamp;
 start_at timestamptz;
 end_at timestamptz;
 next_start timestamptz;
 n_used integer;
 max_today integer;
 last_any timestamptz;
 last_type timestamptz;
 latest_feed timestamptz;
 effective_gap integer;
 same_gap integer;
 wait_until timestamptz;
 reason text;
BEGIN
 IF p_media_type NOT IN ('IMAGE','REELS','STORIES') THEN
   RETURN jsonb_build_object('allowed',false,'semaforo','vermelho','reason','Tipo de mídia desconhecido.');
 END IF;
 SELECT * INTO st FROM public.giro_meta_rate_state WHERE id=1;
 IF NOT FOUND THEN
   RETURN jsonb_build_object('allowed',false,'semaforo','vermelho','reason','Configuração do semáforo ausente.');
 END IF;
 IF st.integrity_hold THEN
   RETURN jsonb_build_object('allowed',false,'semaforo','vermelho','reason','Proteção de integridade da Meta ativa; exige revisão.');
 END IF;
 IF st.publication_pause_until IS NOT NULL AND st.publication_pause_until>p_at THEN
   RETURN jsonb_build_object('allowed',false,'semaforo','vermelho','reason','Pausa editorial ativa.','retry_at',st.publication_pause_until);
 END IF;
 IF st.blocked_until IS NOT NULL AND st.blocked_until>p_at THEN
   RETURN jsonb_build_object('allowed',false,'semaforo','vermelho','reason','Bloqueio preventivo da API.','retry_at',st.blocked_until);
 END IF;
 IF st.usage_percent>=95 THEN
   RETURN jsonb_build_object('allowed',false,'semaforo','vermelho','reason','Uso da API igual ou superior a 95%; envio suspenso.');
 END IF;
 light:=coalesce(st.traffic_light_target,'amarelo');
 IF light='amarelo' AND p_media_type='STORIES' THEN
   IF NOT coalesce(st.traffic_light_story_test_enabled,false) THEN
     RETURN jsonb_build_object('allowed',false,'semaforo','amarelo','reason','Piloto diário de Stories desativado.');
   END IF;
   -- A green GET or elapsed time alone does not prove Meta publishing recovered.
   IF st.quota_checked_at IS NULL OR st.quota_checked_at < p_at-interval '24 hours'
     OR coalesce(st.usage_percent,100)>=80 THEN
     RETURN jsonb_build_object('allowed',false,'semaforo','amarelo','reason','Stories aguardam telemetria recente e segura da Meta.');
   END IF;
   IF st.last_meta_error_at>p_at-interval '72 hours' THEN
     RETURN jsonb_build_object('allowed',false,'semaforo','amarelo','reason','Stories aguardam janela sem novo erro da Meta.');
   END IF;
   IF NOT EXISTS (SELECT 1 FROM public.giro_instagram_publication_events
      WHERE media_type='IMAGE' AND published_at>p_at-interval '48 hours'
       AND nullif(instagram_media_id,'') IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM public.giro_instagram_publication_events
      WHERE media_type='REELS' AND published_at>p_at-interval '72 hours'
       AND nullif(instagram_media_id,'') IS NOT NULL) THEN
     RETURN jsonb_build_object('allowed',false,'semaforo','amarelo','reason','Stories aguardam Feed e Reel recentes confirmados pela Meta.');
   END IF;
 END IF;
 IF light='amarelo' AND p_media_type='REELS' AND NOT st.traffic_light_reel_test_enabled THEN
   RETURN jsonb_build_object('allowed',false,'semaforo','amarelo','reason','Reel de teste ainda não habilitado pela revisão editorial.');
 END IF;
 local_dt:=p_at AT TIME ZONE 'America/Porto_Velho';
 start_at:=(local_dt::date+time '06:00') AT TIME ZONE 'America/Porto_Velho';
 end_at:=(local_dt::date+time '23:30') AT TIME ZONE 'America/Porto_Velho';
 IF p_at<start_at OR p_at>=end_at THEN
   next_start:=case when p_at<start_at then start_at else ((local_dt::date+1)+time '06:00') AT TIME ZONE 'America/Porto_Velho' end;
   RETURN jsonb_build_object('allowed',false,'semaforo',light,'reason','Fora da janela editorial de Porto Velho (06h às 23h30).','retry_at',next_start);
 END IF;

 max_today:=case when light='amarelo' then 1 when p_media_type='IMAGE' then 3 when p_media_type='REELS' then 2 else 3 end;
 SELECT count(*)::integer INTO n_used FROM public.giro_instagram_publication_events
 WHERE media_type=p_media_type AND published_at>=start_at AND published_at<end_at;
 IF p_media_type='IMAGE' THEN
   n_used:=greatest(n_used,(
     SELECT count(*)::integer FROM public.giro_madeira_publicacoes
     WHERE published_at>=start_at AND published_at<end_at AND instagram_media_id IS NOT NULL
   ));
 END IF;
 IF n_used>=max_today THEN
   RETURN jsonb_build_object('allowed',false,'semaforo',light,'reason','Limite diário interno deste formato atingido.','used_today',n_used,'daily_cap',max_today,'retry_at',((local_dt::date+1)+time '06:00') AT TIME ZONE 'America/Porto_Velho');
 END IF;

 SELECT max(published_at) INTO last_any FROM public.giro_instagram_publication_events;
 SELECT max(published_at) INTO last_type FROM public.giro_instagram_publication_events WHERE media_type=p_media_type;
 SELECT max(published_at) INTO latest_feed FROM public.giro_madeira_publicacoes WHERE instagram_media_id IS NOT NULL;
 IF p_media_type='IMAGE' THEN last_type:=greatest(last_type,latest_feed); END IF;
 last_any:=greatest(last_any,latest_feed,st.last_instagram_published_at);
 wait_until:=p_at;
 IF last_any IS NOT NULL THEN
   effective_gap:=case when light='amarelo' then 75 else 40 end
      + (abs(hashtext(last_any::text||p_media_type||'geral')::bigint)% (case when light='amarelo' then 31 else 26 end))::integer;
   wait_until:=greatest(wait_until,last_any+make_interval(mins=>effective_gap));
 END IF;
 IF last_type IS NOT NULL THEN
   same_gap:=case when light='amarelo' then 180 when p_media_type='STORIES' then 60 else 120 end
      + (abs(hashtext(last_type::text||p_media_type||'formato')::bigint)%
        (case when light='amarelo' then 61 when p_media_type='STORIES' then 61 else 91 end))::integer;
   wait_until:=greatest(wait_until,last_type+make_interval(mins=>same_gap));
 END IF;
 IF wait_until>p_at THEN
   RETURN jsonb_build_object('allowed',false,'semaforo',light,'reason','Intervalo editorial variável entre publicações.','retry_at',wait_until,'used_today',n_used,'daily_cap',max_today);
 END IF;

 RETURN jsonb_build_object('allowed',true,'semaforo',light,'reason','Dentro da janela editorial e dos intervalos seguros.','used_today',n_used,'daily_cap',max_today,'next_check_at',p_at);
END $function$
;
COMMIT;
