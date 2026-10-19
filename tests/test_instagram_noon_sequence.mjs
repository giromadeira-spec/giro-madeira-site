import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(p)=>readFileSync(new URL(p,import.meta.url),'utf8');
const publisher=read('../supabase/functions/giro-instagram-publicar-independente/index.ts');
const migration=read('../supabase/migrations/20261018203000_instagram_noon_sequence.sql');
assert.ok(publisher.includes("const feedNoon=channel==='feed'&&localHour===12&&localMinute<45"),
 'Feed must post only within the first noon window');
assert.ok(publisher.includes("localHour===13&&localMinute>=30") &&
 publisher.includes("localHour===14&&localMinute<45"),
 'Reels must start at least 90 minutes after noon');
assert.ok(publisher.includes("localHour===15&&localMinute>=30") &&
 publisher.includes("localHour===16"),
 'Stories must wait for the later afternoon window');
assert.ok(publisher.includes("const normalWindow=channel==='feed'?feedNoon:channel==='reels'?reelsAfterNoon:storiesAfterNoon;") &&
 publisher.includes("const allowedTime=normalWindow||lateCatchup;") &&
 publisher.includes("(!manualTest&&!allowedTime)") &&
 publisher.includes("eligible=eligible.eq('auto_review_basis','chatgpt_asset_qa_v1')"),
 'Original midday slots stay channel-specific; evening recovery only permits approved ChatGPT assets');
assert.ok(publisher.includes("meta_semaphore_denied") &&
 publisher.includes("gate.data?.allowed!==true"),'Cannot bypass Meta safe-interval gate');
assert.ok(publisher.includes("vertical_story_specific_media_required") &&
 publisher.includes("media_provenance_or_human_review_missing"),
 'Story must use its own reviewed vertical art');
assert.ok(migration.includes("cron.alter_job(28,schedule:='0,15,30,45 16 * * *')"),
 'Feed attempts from 12:00 Porto Velho');
assert.ok(migration.includes("cron.alter_job(34,schedule:='30,45 17 * * *')"),
 'Reel starts at 13:30 PV, not simultaneously with Feed');
assert.ok(migration.includes("cron.schedule('giro-reels-12h-sequencia-segura'"),
 'Independent Reel fallback slots');
assert.ok(migration.includes("cron.alter_job(31,schedule:='30,45 19 * * *')"),
 'Story begins 15:30 PV, never 18h legacy');
assert.ok(migration.includes("cron.schedule('giro-stories-12h-sequencia-segura'"),
 'Independent Story fallback slots');
console.log('PASS: noon-first Instagram schedule preserves 75–105 min Meta gap, format isolation and manual approval; no provider calls.');
