-- Add manual_url field to coins table for manually added coins
ALTER TABLE public.coins 
ADD COLUMN manual_url TEXT,
ADD COLUMN source TEXT DEFAULT 'auto_discovery' CHECK (source IN ('auto_discovery', 'manual_input'));