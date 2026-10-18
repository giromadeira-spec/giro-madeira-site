import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p)=>readFileSync(new URL(p,import.meta.url),"utf8");
const worker=read("../supabase/functions/giro-auto-revisao-video/index.ts");
const dispatcher=read("../supabase/migrations/20261018211000_auto_symbolic_video_review.sql");
const policy=JSON.parse(read("../scripts/ai_agents/ecosystem-policy.json"));
for(const s of [
 "storyboardIsCurrent(item,at)",
 'item.shorts_render_origin!==origin',
 'Number(item.shorts_render_version)!==6',
 'item.shorts_image_credit||""',
 'await credit(String(item.source_url),headline)',
 'original_article_headline_mismatch',
 'original_article_scene_unverifiable_',
 'video_storage_or_mp4_metadata_invalid',
 'public_posts_attempted:false',
 'concurrent_revision_or_delivery',
 '.eq("editor_approved",false)',
 '.eq("visual_review_status","pending")',
 '.is("provider_post_id",null)'
])assert.ok(worker.includes(s),"missing automated editorial safety gate: "+s);
assert.ok(worker.includes("redirect:\"error\""),"Never follow unchecked source redirects");
assert.ok(worker.includes('content-type'),"MP4 media type must be checked");
assert.ok(!worker.includes('openai.com')&&!worker.includes("OPENAI_API_KEY"),"No paid OpenAI API");
assert.ok(dispatcher.includes("p_stage='review'")&&dispatcher.includes("target:='giro-auto-revisao-video'"));
assert.ok(dispatcher.includes("auto_review_basis")&&dispatcher.includes("auto_review_at"),"Auditable non-human mode");
assert.deepEqual(policy.posting_slots,["17:00"]);
assert.equal(policy.daily_limit,1);
console.log("PASS: automatic video QA stays source-bound, evidence-driven, fail-closed and one/day at 17h; offline only");
