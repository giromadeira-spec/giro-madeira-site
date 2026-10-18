-- Recovery checks only for Reels. All central Meta limits and ambiguity holds remain.
select cron.alter_job(jobid,schedule:='0,15,30 16 * * *') from cron.job
where jobname='giro-publicar-reels';

