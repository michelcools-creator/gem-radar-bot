-- Add ChatGPT Pro API key column to settings table
ALTER TABLE public.settings 
ADD COLUMN chatgpt_pro_api_key TEXT;