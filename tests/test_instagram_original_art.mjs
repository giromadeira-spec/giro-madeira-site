import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const gen=readFileSync(new URL('../supabase/functions/gerar-arte-noticia-vault/index.ts',import.meta.url),'utf8');
const prep=readFileSync(new URL('../supabase/functions/giro-instagram-preparar-independente/index.ts',import.meta.url),'utf8');
const publish=readFileSync(new URL('../supabase/functions/giro-instagram-publicar-independente/index.ts',import.meta.url),'utf8');

assert.ok(gen.includes('const photo=registeredPhoto;'),
  'Real event photos must come from the rights AND event-matching registry');
assert.ok(gen.includes('const bg=photo?photo.dataUri:"original_editorial_illustration";'));
assert.ok(!gen.includes('const photo=registeredPhoto||'));
assert.ok(gen.includes('ILUSTRAÇÃO EDITORIAL ORIGINAL — representação gráfica simbólica'));
assert.ok(gen.includes('awaiting_visual_approval:true,publication_not_attempted:true'));
assert.ok(gen.includes('const credit=previewLabel||(isEventPhoto?"FOTO DA NOTÍCIA"'));
assert.ok(gen.includes('if(!photo){'));
assert.ok(gen.includes('photographic_layout_requires_verified_photo'));
assert.ok(!gen.includes("M540 '+(cy-245)"),'Rejected generic police shield cannot return');

assert.ok(prep.includes('verifiedPhoto=registryReady(registered.data)'));
assert.ok(!prep.includes('result.visual_mode==="original_event_photo"'),
 'CC metadata alone must not authorize auto-approval for a photo of the event');
assert.ok(prep.includes('if(!autoApproved)'));
assert.ok(publish.includes("item.media_status===(channel==='feed'?'feed_ilustracao_revisada':"));
assert.ok(publish.includes("!artReviewed&&!photoReviewed"));
assert.ok(publish.includes("status','aprovada'"));
console.log('PASS: illustrator workflow is visibly labeled, not self-approved, and event-photo approval requires registry proof.');
