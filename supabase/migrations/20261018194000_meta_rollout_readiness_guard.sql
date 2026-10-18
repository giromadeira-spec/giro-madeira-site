-- Giro Madeira / Meta: readiness is READ-ONLY and never authorizes or triggers publication.
-- Keep feed_only, yellow 1/day, midday Reels pilot and disabled Stories until
-- REAL successful posting has been established across multiple local days.
create or replace function public.giro_meta_rollout_readiness_readonly()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $giro$
with state as (
  select * from public.giro_meta_rate_state where id=1
),
history as (
  select
    count(distinct (published_at at time zone 'America/Porto_Velho')::date)
      filter (where media_type='IMAGE' and nullif(instagram_media_id,'') is not null) as feed_days_72h,
    count(distinct (published_at at time zone 'America/Porto_Velho')::date)
      filter (where media_type='REELS' and nullif(instagram_media_id,'') is not null) as reels_days_72h,
    max(published_at)
      filter (where media_type='IMAGE' and nullif(instagram_media_id,'') is not null) as last_feed,
    max(published_at)
      filter (where media_type='REELS' and nullif(instagram_media_id,'') is not null) as last_reel
  from public.giro_instagram_publication_events
  where published_at>=now()-interval '72 hours' and published_at<=now()
),
editorial as (
  select
    (select count(*) from public.giro_publicacoes_feed
       where status='aprovada' and visual_approved=true
         and instagram_media_id is null and editorial_expires_at>now()
         and media_status in ('feed_foto_verificada','feed_ilustracao_revisada','feed_pronto')
    ) as feed_ready,
    (select count(*) from public.giro_publicacoes_reels
       where status='aprovada' and visual_approved=true
         and instagram_reel_media_id is null and editorial_expires_at>now()
         and media_status in ('reel_validado','reel_ilustracao_revisada')
    ) as reels_ready
),
checks as (
  select h.*,e.*,
    array_remove(array[
      case when s.id is null then 'meta_state_missing' end,
      case when s.integrity_hold is distinct from false
        or s.blocked_until>now() or s.publication_pause_until>now()
        then 'meta_integrity_or_pause' end,
      case when s.traffic_light_target is distinct from 'amarelo'
        or s.rollout_stage is distinct from 'feed_only'
        or s.traffic_light_reel_test_enabled is distinct from true
        then 'not_in_yellow_feed_reels_pilot' end,
      case when s.last_meta_error_at>now()-interval '72 hours'
        then 'recent_meta_error_wait_for_clean_window' end,
      case when s.quota_checked_at is null
        or s.quota_checked_at<now()-interval '24 hours'
        or coalesce(s.usage_percent,100)>=80
        then 'meta_usage_unverified_or_high' end,
      case when coalesce(h.feed_days_72h,0)<3
        then 'need_feed_ids_on_three_distinct_local_days' end,
      case when coalesce(h.reels_days_72h,0)<2
        then 'need_reels_ids_on_two_distinct_local_days' end,
      case when h.last_feed is null or h.last_feed<now()-interval '28 hours'
        then 'no_recent_confirmed_feed' end,
      case when h.last_reel is null or h.last_reel<now()-interval '52 hours'
        then 'no_recent_confirmed_reels' end,
      case when coalesce(e.feed_ready,0)<1 then 'no_current_editorially_approved_feed' end,
      case when coalesce(e.reels_ready,0)<1 then 'no_current_editorially_approved_reel' end
    ]::text[],null) blockers
  from history h cross join editorial e left join state s on true
)
select jsonb_build_object(
  'read_only',true,'publication_attempted',false,
  'checked_at',now(),
  'eligible_for_review_to_raise_feed_cap_to_two',cardinality(blockers)=0,
  'automatic_cap_increase',false,
  'current_guard','Do not change yellow/1 Feed daily/1 Reel daily/no Stories',
  'next_pilot_if_authorized_and_ready','2 Feed/day and 1 Reel/day, interleaved with wide gaps; Stories still disabled',
  'feed_confirmed_local_days_72h',feed_days_72h,
  'reels_confirmed_local_days_72h',reels_days_72h,
  'last_confirmed_feed',last_feed,'last_confirmed_reel',last_reel,
  'ready_approved_feed',feed_ready,'ready_approved_reels',reels_ready,
  'blockers',to_jsonb(blockers)
) from checks;
$giro$;
revoke all on function public.giro_meta_rollout_readiness_readonly() from public, anon, authenticated;
grant execute on function public.giro_meta_rollout_readiness_readonly() to service_role;
