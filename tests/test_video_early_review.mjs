import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {storyboardIsCurrent} from '../supabase/functions/_shared/article-recency.ts';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const shorts=read('../supabase/functions/giro-shorts-github-bridge/index.ts');
const tiktok=read('../supabase/functions/giro-tiktok-github-bridge/index.ts');
const planner=read('../supabase/functions/giro-tiktok-editorial-queue/index.ts');
const shortFlow=read('../.github/workflows/giro-shorts-producao.yml');
const tikFlow=read('../.github/workflows/giro-tiktok-producao.yml');
const slot=Date.parse('2026-10-19T02:00:00Z');
for(const [lane,src,flow] of [['shorts',shorts,shortFlow],['tiktok',tiktok,tikFlow]]){
 assert.ok(src.includes('Date.now()+8*3600000'),lane+' can claim within eight hours');
 assert.ok(!src.includes('Date.now()+2*3600000'),lane+' not limited to two hours');
 assert.ok(src.includes('if(!storyboardIsCurrent(item))continue'),lane+' requires verified future-slot article date');
 assert.ok(flow.includes("cron: '15 6,20 * * *'"),lane+' has 02:15/16:15 Porto Velho early pass');
 assert.ok(flow.includes("cron: '5 0,10 * * *'"),lane+' retains backup before each slot');
 assert.ok(src.includes('last_prepared_at:new Date().toISOString()'),lane+' registers real MP4 preparation');
 assert.ok(src.includes('if(!updated)return response'),lane+' only updates after successful completion');
 assert.ok(src.includes('.is("provider_post_id",null)'),lane+' does not reclaim delivered media');
}
assert.ok(shorts.includes('visual_review_status:"pending",editor_approved:false'),
 'Shorts illustration remains in review');
assert.ok(tiktok.includes('visual_review_status:isIllustration?"pending":"approved"') &&
 tiktok.includes('editor_approved:!isIllustration'), 'TikTok illustration cannot self-approve');
assert.ok(planner.includes('.eq("shorts_render_version",0).is("video_url",null).is("provider_post_id",null)'));
assert.ok(planner.includes('giro_buffer_tiktok_jobs'));
assert.ok(planner.includes('if(bufferErr)throw bufferErr'));
assert.ok(planner.includes('if(reserved.has(String(f.id)))continue'));
assert.ok(planner.includes('released_preupload_failures:releasedPreUpload'));
assert.equal(storyboardIsCurrent({
 storyboard_status:'preparado',scheduled_for:new Date(slot).toISOString(),
 storyboard_source_published_at:'2026-10-18T14:31:15Z'},Date.parse('2026-10-18T20:15:00Z')),true);
assert.equal(storyboardIsCurrent({
 storyboard_status:'preparado',scheduled_for:new Date(slot).toISOString(),
 storyboard_source_published_at:'2026-10-17T14:00:00Z'},Date.parse('2026-10-18T20:15:00Z')),false);
console.log('PASS: early MP4 production, future-slot freshness, manual illustration review and safe replacement; zero publications.');
