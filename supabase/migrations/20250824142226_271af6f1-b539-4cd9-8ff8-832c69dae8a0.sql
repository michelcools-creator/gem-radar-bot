-- Add RLS policies for deleting coins and related data
CREATE POLICY "Anyone can delete coins" 
ON public.coins 
FOR DELETE 
USING (true);

CREATE POLICY "Anyone can delete scores" 
ON public.scores 
FOR DELETE 
USING (true);

CREATE POLICY "Anyone can delete facts" 
ON public.facts 
FOR DELETE 
USING (true);

CREATE POLICY "Anyone can delete pages" 
ON public.pages 
FOR DELETE 
USING (true);