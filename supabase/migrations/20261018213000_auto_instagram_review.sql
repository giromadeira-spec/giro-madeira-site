-- Audit fields distinguish automated review from human approval.
ALTER TABLE public.giro_publicacoes_feed ADD COLUMN IF NOT EXISTS auto_review_basis text, ADD COLUMN IF NOT EXISTS auto_review_at timestamptz;
ALTER TABLE public.giro_publicacoes_reels ADD COLUMN IF NOT EXISTS auto_review_basis text, ADD COLUMN IF NOT EXISTS auto_review_at timestamptz;
ALTER TABLE public.giro_publicacoes_stories ADD COLUMN IF NOT EXISTS auto_review_basis text, ADD COLUMN IF NOT EXISTS auto_review_at timestamptz;
