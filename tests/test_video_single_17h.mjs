import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const shorts=read('../supabase/functions/giro-shorts-editorial-queue/index.ts');
const tiktok=read('../supabase/functions/giro-tiktok-editorial-queue/index.ts');
const uploader=read('../supabase/functions/giro-youtube-upload-auto/index.ts');
const migration=read('../supabase/migrations/20261018201000_video_17h_one_daily.sql');
const ytWorkflow=read('../.github/workflows/giro-shorts-producao.yml');
const tkWorkflow=read('../.github/workflows/giro-tiktok-producao.yml');
const transcoder=read('../.github/workflows/giro-tiktok-30fps.yml');
const monitor=read('../.github/workflows/giro-pipeline-monitor.yml');
const docs=read('../docs/TIKTOK_AGENDA_OFICIAL.md');
const slotRegex=/const oneDailySlot=\[\{h:18,m:0,scope:"em_alta"\}\] as const;/;
for(const [channel,planner] of [['shorts',shorts],['tiktok',tiktok]]){
 assert.match(planner,slotRegex,channel+' planned only at 18h BRT / 17h PV');
 assert.ok(planner.includes('const baseSlots=oneDailySlot'),channel+' uses single daily base slot');
 assert.ok(!planner.includes('const twoDailySlots='),channel+' cannot create the retired two-slot schedule');
 assert.ok(planner.includes('const targetMax=Math.min(daySlots.length,settings.data.daily_goal+extraCount)'));
}
assert.ok(uploader.includes('Number(localTime.hour)!==17||Number(localTime.minute)>=45'),
 'YouTube cannot post outside 17:00–17:44 PV, even when manually called');
assert.ok(uploader.includes('daily_publication_limit'),'YouTube has independent one/day limiter');
assert.ok(migration.includes('daily_goal=1'),'two planners are capped at one/day');
assert.ok(migration.includes('daily_limit=1, posting_slots_local=array[\'17:00\'::time]'),
 'Buffer is limited to 17h PV and one/day');
assert.ok(migration.includes("select cron.alter_job(11, schedule:='0,15,30 21 * * *')"),
 'YouTube uploader only attempts at 17:00, 17:15, 17:30 PV');
assert.ok(migration.includes("q.editor_approved=false") && migration.includes("not exists(select 1 from public.giro_buffer_tiktok_jobs"),
 'old slots are retired only if unapproved and without TikTok delivery attempt');
const workflows=[ytWorkflow,tkWorkflow];
for(const w of workflows){
 const times=[...w.matchAll(/^\s+- cron: '([^']+)'\s*$/gm)].map(x=>x[1]);
 assert.deepEqual(times,['15 15 * * *','30 17 * * *','15 19 * * *','15,35 20 * * *'],
  'video rendering must prepare only before 17h PV, no legacy 08h/22h');
}
const transcode=[...transcoder.matchAll(/^\s+- cron: '([^']+)'\s*$/gm)].map(x=>x[1]);
assert.deepEqual(transcode,['25,40 20 * * *','10 21 * * *'],'TikTok 30fps fallback at 16:25/16:40/17:10 PV');
assert.ok(monitor.includes("cron: '50 21 * * *'"),'late delivery check at 17:50 PV');
assert.ok(monitor.includes("cron: '0 19,20 * * *'"),'15/16h PV preview');
assert.ok(docs.includes('**17:00**')&&docs.includes('daily_limit=1'));
console.log('PASS: single daily 17h PV upload, independently planned Shorts/TikTok, 30fps prep, buffer guard, no legacy schedule; no external posts.');
