-- GIRO MADEIRA: Instagram daily cadence begins at 12:00 Porto Velho.
-- Meta AMARELO requires a real variable 75-105 min between ANY publications.
-- Do not publish Feed/Reel/Story simultaneously at 12h; defer latter formats.
-- Radar/preparation are unchanged and independent. No change to the 1/format/day cap.
BEGIN;
-- 12:00,12:15,12:30,12:45 Porto Velho: first Feed attempt and safe retries.
SELECT cron.alter_job(28,schedule:='0,15,30,45 16 * * *');
-- 13:30 to 14:45 Porto Velho: Reel when the Meta gap permits.
SELECT cron.alter_job(34,schedule:='30,45 17 * * *');
-- Multiple cron jobs cannot share a name; run supplemental attempts safely
-- using dedicated unique names where necessary.
SELECT cron.schedule('giro-reels-12h-sequencia-segura', '0,15,30,45 18 * * *',
  $$SELECT public.giro_dispatch_channel('reels','publish');$$);
-- 15:30 to 16:45 Porto Velho: Stories after confirmed Feed and Reel.
SELECT cron.alter_job(31,schedule:='30,45 19 * * *');
SELECT cron.schedule('giro-stories-12h-sequencia-segura', '0,15,30,45 20 * * *',
  $$SELECT public.giro_dispatch_channel('stories','publish');$$);
COMMIT;
