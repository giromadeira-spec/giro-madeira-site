import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261018194000_meta_rollout_readiness_guard.sql',import.meta.url),'utf8');
const publisher=readFileSync(new URL('../supabase/functions/giro-instagram-publicar-independente/index.ts',import.meta.url),'utf8');
const documentation=readFileSync(new URL('../docs/RETOMADA_CONTROLADA_META_2026_10_18.md',import.meta.url),'utf8');
const expected=[
  'giro_meta_rollout_readiness_readonly',
  'security invoker',
  'feed_days_72h,0)<3',
  'reels_days_72h,0)<2',
  'last_meta_error_at>now()-interval \'72 hours\'',
  'quota_checked_at<now()-interval \'24 hours\'',
  'coalesce(s.usage_percent,100)>=80',
  "visual_approved=true",
  'editorial_expires_at>now()',
  "'automatic_cap_increase',false",
  "'publication_attempted',false",
  'cardinality(blockers)=0',
  'revoke all on function public.giro_meta_rollout_readiness_readonly() from public, anon, authenticated',
  'grant execute on function public.giro_meta_rollout_readiness_readonly() to service_role'
];
for(const phrase of expected)assert.ok(sql.includes(phrase),'Missing rollout safety guard: '+phrase);
assert.ok(publisher.includes("const channelAllowed=channel==='feed'||meta.data.rollout_stage==='full'||"),
 'Reels publishing must still honor the controlled staging gate');
assert.ok(publisher.includes("channel==='reels'&&!reelsAfterNoon"),
 'Reels only inside controlled afternoon pilot window after Feed');
assert.ok(publisher.includes(".eq('visual_approved',true)"),
 'Never publish unrevised media');
assert.ok(documentation.includes('Nenhuma cota foi aumentada'));
console.log('PASS: Meta readiness is read-only, private, requires real successes & review; rollout caps remain unchanged.');
