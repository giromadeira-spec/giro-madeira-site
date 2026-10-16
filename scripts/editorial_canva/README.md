# Canva editorial handoff — isolated review tools

This package adds no scheduler, cloud function or publishing endpoint. It
does not change the existing production renderer or workflows. It adds a private
metadata-only review schema, disconnected from production queues.
Template IDs and verified Canva links are in `template-registry.json`.

## What is ready

- Five square Feed layouts, five Story layouts and a five-scene vertical master,
  with separate Reels, TikTok and Shorts designs. The current Feed is V4 and the
  other designs are V3. All are marked for validation, never as current news.
- Text and hero-image replacement was exercised through Canva draft operations
  in each design family, with every draft discarded. Each five-page design has
  15 independently editable image objects, including the logo, photo slot and
  regional signature. Canva's connector exposes text and media, but does not
  allow full inspection of vector-shape editability or video timeline controls.
- Native vector bands and gradients remain separate objects in the source PPTX.
- Local 1080x1920 H.264/yuv420p/30fps rendering from exported scene PNGs, AAC audio,
  original synthesized music and brief fades. Reels 18s, TikTok 14s, Shorts 20s.
- Offline handoff validation with distinct per-channel/event/media keys.

## Offline commands

```bash
python3 scripts/editorial_canva/render_preview.py \
  --frames-dir /path/to/five/exported/pages --channel reels \
  --output /path/to/review.mp4

python3 scripts/editorial_canva/review_packet.py /path/to/manifest.json \
  --media /path/to/review.mp4 --out /path/to/packet.json

python3 -m unittest discover -s tests -p test_canva_review_packet.py -v
```

Use Pillow, FFmpeg and ffprobe already used by the existing renderer. No paid
LLM API is used. Input pages must be page-1.png through page-5.png, 1080x1920.

## Evidence contract

The JSON manifest includes `channel`, `event_id`, `scope`, `reference_only`,
`headline`, `scheduled_at` for Shorts/TikTok, `meta_hold` for Meta channels,
`source` and `photo`. Source contains the original HTTPS article URL,
`published_at` with timezone, the fact checker's name and an evidence reference.
Photo contains the same `article_url` and `event_id`, its HTTPS media URL,
caption, `kind=original_event_photo`, evidence of correspondence, author,
license name, license URL and rights evidence URL.

This validator checks completeness and file encoding. It cannot establish
whether a claim or license statement is true. It never issues editorial or
visual approval, even for complete input. Output always has
`publish_allowed=false`, `editor_approved=false` and `visual_approved=false`.

The stricter current AGENTS.md Commons/CC0-or-CC-BY policy is preserved.
Alternative explicit written licenses require a separately reviewed policy
change. Never infer permission from a publisher's og:image or government logo.

## Integration boundary

1. Keep each existing radar, editorial queue and publication gate independent.
2. Fact-check the article and independently verify event-media correspondence
   and reuse permission. Missing evidence remains pending.
3. Copy the selected Canva design and replace fields and the hero-media slot.
   Remove template-only labels only after the article's editorial review.
4. Review the exported file, including full headline, correct local context,
   logo, licensed photo, credits, no play icons and no competitor brands.
5. For a safe preview, render exported PNG pages locally and run review_packet.
6. A future importer must re-read the existing queue and Meta state, enforce
   expiration, deduplication and independent approvals, then stage the file in
   isolated storage. This package intentionally performs none of those writes.
7. Only a later authorized deployment may link approved media to the existing
   queues. An uncertain provider response requires reconciliation, not retry.

Existing queue mapping: Feed/Reels/Stories use their respective
`giro_publicacoes_*` tables. Shorts uses
`giro_social_video_queue.platform=youtube_shorts`; TikTok uses the same table
with `platform=tiktok`, preserving separate item IDs, media and consumption.
The packet is a review plan, not an accepted database insert payload.

## Canva account limitation and remaining configuration

- Autofill fields were saved and their schemas were read back for all six
  designs: 272 named fields in total. `autofill-schemas.json` records the actual
  returned schemas. Execution was tested once in a copy and rejected because
  the connected account plan does not include Autofill. No upgrade was made.
  `compose.py` provides the tested free local alternative.
- Separate Canva API authorization for a server worker if unattended export is
  chosen. The ChatGPT connector session is not a token for GitHub Actions.
- MP4 import through the available upload endpoint failed with HTTP 400,
  `Unsupported file format MP4`. Do not claim an editable video timeline was
  created from the PPTX import. The saved designs are editable storyboards.
- Video durations, transitions and soundtrack inside Canva need its video
  timeline controls. The local renderer is the tested alternative.
- Final visual approval, verified current news media and a separately reviewed
  importer/deployment. Stories publication remains disabled.

Schedule contract: Shorts and TikTok use 08:00 and 22:00 in
`America/Porto_Velho` (12:00 and 02:00 UTC). No new schedule was installed.

## Local composition and private staging

`compose.py` accepts a JSON manifest, local photo, regional strip and official
logo. It renders Feed, Story or five vertical scenes without Canva Autofill,
OpenAI, a network request or publication. Normal mode requires complete
source/photo evidence and a matching photo SHA256. `--template-preview` requires
`reference_only=true`, visibly labels the asset as a test and never authorizes
publication. Caption and headline overflow fail instead of truncating.

`stage_review.py` validates the actual file and emits an idempotent insert into
`giro_editorial_review.assets`, a private metadata-only table with RLS, no public
access, no custom triggers, no production queue references, and a constraint
that publish_allowed must stay false. It stores the artifact reference and its
hash, not the video bytes. Existing files remain in their authorized location.
It does not make private artifact references accessible to an unattended worker.

Default writes a reviewable SQL file only. `--execute` is available for an
operator with psql and existing PG connection settings. The validated session
used the authenticated Supabase connection to stage a reference item and repeat
the same insert: one row was preserved, no duplicate appeared.

Migration applied via Supabase and tracked with its returned version:
`20261016170638_giro_isolated_editorial_review_staging.sql`. An INFO advisor notes
RLS with no user policy; that is intentional because user access is revoked and
only service-side review is allowed. No policy granting public access was added.

The Canva fields are configured; paid Autofill execution, Canva timeline/video
export and unattended access to exported media are still unavailable or
unconfigured. A production publication importer is deliberately not enabled.
No manual task in this package should be described as scheduled automation.
