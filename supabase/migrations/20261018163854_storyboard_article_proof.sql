-- Persist the publication date verified from the original article.
-- NULL means that a cached/legacy storyboard still needs verification.
alter table public.giro_social_video_queue
  add column if not exists storyboard_source_published_at timestamptz;
comment on column public.giro_social_video_queue.storyboard_source_published_at is
  'Publication date verified from the original article, never radar discovery time. Rechecked against now and scheduled_for before render/send.';
