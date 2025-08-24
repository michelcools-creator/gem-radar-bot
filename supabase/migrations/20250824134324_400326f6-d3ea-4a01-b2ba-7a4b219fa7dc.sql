-- Add new status values for better error handling
ALTER TYPE coin_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE coin_status ADD VALUE IF NOT EXISTS 'insufficient_data';
ALTER TYPE coin_status ADD VALUE IF NOT EXISTS 'retry_pending';

-- Add new page status for content validation
ALTER TYPE page_status ADD VALUE IF NOT EXISTS 'invalid_content';
ALTER TYPE page_status ADD VALUE IF NOT EXISTS 'blocked';