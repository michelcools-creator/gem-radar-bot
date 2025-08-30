-- Epic A4: Add content_hash field for deduplication
ALTER TABLE public.pages 
ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- Add index for efficient deduplication queries
CREATE INDEX IF NOT EXISTS idx_pages_content_hash 
ON public.pages(content_hash) 
WHERE content_hash IS NOT NULL;