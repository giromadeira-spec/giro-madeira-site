-- Aplicado ao Supabase em 2026-10-19 (versão 20261019200237).
-- Evita encher a fila durante o semáforo amarelo da Meta.
create or replace function public.giro_chatgpt_pacote_guard()
returns trigger language plpgsql security invoker
set search_path=public,pg_catalog
as $fn$
begin
 if exists(select 1 from public.giro_chatgpt_pacotes
  where left(ciclo_local,10)=left(new.ciclo_local,10)) then
   raise exception 'instagram_safe_daily_package_cap';
 end if;
 if exists(
  select 1 from public.giro_chatgpt_pacotes p
  join public.giro_publicacoes_feed f on f.id=p.feed_id
  join public.giro_publicacoes_reels r on r.id=p.reel_id
  join public.giro_publicacoes_stories s on s.id=p.story_id
  where p.created_at>now()-interval '48 hours'
    and (f.status<>'publicada' or r.status<>'publicada' or s.status<>'publicada')
 ) then raise exception 'previous_package_not_yet_confirmed_on_instagram';end if;
 return new;
end $fn$;
revoke all on function public.giro_chatgpt_pacote_guard() from public,anon,authenticated;
drop trigger if exists giro_chatgpt_pacote_guard_trigger on public.giro_chatgpt_pacotes;
create trigger giro_chatgpt_pacote_guard_trigger
before insert on public.giro_chatgpt_pacotes
for each row execute function public.giro_chatgpt_pacote_guard();