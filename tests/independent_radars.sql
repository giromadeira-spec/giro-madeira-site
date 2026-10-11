-- Run in a transaction. No HTTP dispatch, media generation or publication.
begin;
select public.giro_configurar_radar_independente('feed','0 */2 * * *',null);
do $$ begin
 if (select schedule from cron.job where jobname='giro-radar-shorts')<>'0,15,30,45 * * * *' then raise exception 'Shorts cron changed'; end if;
 if (select schedule from cron.job where jobname='giro-radar-tiktok')<>'3,18,33,48 * * * *' then raise exception 'TikTok cron changed'; end if;
 if (select schedule from cron.job where jobname='giro-radar-reels')<>'10 10-23,0-3 * * *' then raise exception 'Reels cron changed'; end if;
end $$;
update public.giro_channel_settings set preparation_enabled=false where channel='feed';
do $$ begin
 if public.giro_claim_editorial_independente('feed') is not null then raise exception 'Disabled Feed consumed a story'; end if;
 if not (select preparation_enabled from giro_channel_settings where channel='shorts') then raise exception 'Shorts preparation changed'; end if;
 if not (select preparation_enabled from giro_channel_settings where channel='tiktok') then raise exception 'TikTok preparation changed'; end if;
end $$;
rollback;
