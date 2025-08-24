-- Add deep_analysis_pending status to coin_status enum
ALTER TYPE coin_status ADD VALUE 'deep_analysis_pending';

-- Create deep_analysis table
CREATE TABLE public.deep_analysis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coin_id UUID NOT NULL REFERENCES public.coins(id) ON DELETE CASCADE,
  team_deep_dive JSONB DEFAULT '{}',
  partnership_analysis JSONB DEFAULT '{}',
  competitor_analysis JSONB DEFAULT '{}',
  red_flag_analysis JSONB DEFAULT '{}',
  social_sentiment JSONB DEFAULT '{}',
  financial_deep_dive JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on deep_analysis table
ALTER TABLE public.deep_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies for deep_analysis
CREATE POLICY "Anyone can view deep analysis" 
ON public.deep_analysis 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can delete deep analysis" 
ON public.deep_analysis 
FOR DELETE 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_deep_analysis_updated_at
BEFORE UPDATE ON public.deep_analysis
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();