-- Metadata-only review area. No links, triggers or writes into production queues.
create schema if not exists giro_editorial_review authorization postgres;
revoke all on schema giro_editorial_review from public, anon, authenticated;
grant usage on schema giro_editorial_review to service_role;

create table if not exists giro_editorial_review.assets (
 id uuid primary key default gen_random_uuid(),
 channel text not null check(channel in ('feed','stories','reels','tiktok','shorts')),
 event_id text not null check(length(event_id) between 1 and 200),
 media_sha256 text not null check(media_sha256 ~ '^[0-9a-f]{64}$'),
 artifact_ref text not null check(length(artifact_ref) between 1 and 2000),
 reference_only boolean not null default true,
 publish_allowed boolean not null default false check(publish_allowed=false),
 review_state text not null default 'awaiting_review' check(review_state in ('awaiting_review','rejected')),
 media_metadata jsonb not null check(jsonb_typeof(media_metadata)='object'),
 evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object'),
 created_at timestamptz not null default now(),
 unique(channel,event_id,media_sha256)
);
alter table giro_editorial_review.assets enable row level security;
revoke all on giro_editorial_review.assets from public, anon, authenticated;
grant select, insert on giro_editorial_review.assets to service_role;
comment on table giro_editorial_review.assets is
 'Private metadata-only editorial staging. No publication approval, no production queue changes. Service-side review only.';
