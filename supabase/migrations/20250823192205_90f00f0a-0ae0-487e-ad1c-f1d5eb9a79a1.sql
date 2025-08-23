-- Create tables for the New-Coin Radar Web-Only analysis system

-- Main coins table
CREATE TABLE public.coins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  coingecko_coin_url TEXT,
  official_links JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'analyzed', 'failed', 'insufficient_data')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name, symbol)
);

-- Pages fetched for analysis
CREATE TABLE public.pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coin_id UUID NOT NULL REFERENCES public.coins(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fetched', 'failed')),
  http_status INTEGER,
  content_text TEXT,
  content_excerpt TEXT,
  content_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(coin_id, url)
);

-- Extracted facts from LLM analysis
CREATE TABLE public.facts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coin_id UUID NOT NULL REFERENCES public.coins(id) ON DELETE CASCADE,
  as_of TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  extracted JSONB NOT NULL DEFAULT '{}',
  sources JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Calculated scores
CREATE TABLE public.scores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coin_id UUID NOT NULL REFERENCES public.coins(id) ON DELETE CASCADE,
  as_of TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  overall INTEGER NOT NULL CHECK (overall >= 0 AND overall <= 100),
  overall_cap INTEGER CHECK (overall_cap >= 0 AND overall_cap <= 100),
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  pillars JSONB NOT NULL DEFAULT '{}',
  penalties JSONB NOT NULL DEFAULT '{}',
  red_flags JSONB NOT NULL DEFAULT '[]',
  green_flags JSONB NOT NULL DEFAULT '[]',
  summary TEXT,
  top_drivers JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System settings
CREATE TABLE public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  strategy_version TEXT NOT NULL DEFAULT 'web_only_v1',
  weights_json JSONB NOT NULL DEFAULT '{
    "security_rug_pull": 15,
    "tokenomics": 10, 
    "team_transparency": 20,
    "product_roadmap": 20,
    "onchain_traction": 10,
    "market_narrative_fit": 15,
    "community": 10
  }',
  hybrid_mode BOOLEAN NOT NULL DEFAULT false,
  allow_domains TEXT[] NOT NULL DEFAULT ARRAY['coingecko.com'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CHECK (id = 1)
);

-- Enable Row Level Security
ALTER TABLE public.coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all operations for now since this is a research tool)
CREATE POLICY "Allow all operations on coins" ON public.coins FOR ALL USING (true);
CREATE POLICY "Allow all operations on pages" ON public.pages FOR ALL USING (true);
CREATE POLICY "Allow all operations on facts" ON public.facts FOR ALL USING (true);
CREATE POLICY "Allow all operations on scores" ON public.scores FOR ALL USING (true);
CREATE POLICY "Allow all operations on settings" ON public.settings FOR ALL USING (true);

-- Create indexes for performance
CREATE INDEX idx_coins_status ON public.coins(status);
CREATE INDEX idx_coins_first_seen ON public.coins(first_seen DESC);
CREATE INDEX idx_pages_coin_id ON public.pages(coin_id);
CREATE INDEX idx_pages_status ON public.pages(status);
CREATE INDEX idx_facts_coin_id ON public.facts(coin_id);
CREATE INDEX idx_scores_coin_id ON public.scores(coin_id);
CREATE INDEX idx_scores_as_of ON public.scores(as_of DESC);

-- Full-text search on content
CREATE INDEX idx_pages_content_search ON public.pages USING GIN(to_tsvector('english', content_text));

-- Insert default settings
INSERT INTO public.settings (id, strategy_version, weights_json, hybrid_mode, allow_domains) 
VALUES (1, 'web_only_v1', '{
  "security_rug_pull": 15,
  "tokenomics": 10, 
  "team_transparency": 20,
  "product_roadmap": 20,
  "onchain_traction": 10,
  "market_narrative_fit": 15,
  "community": 10
}', false, ARRAY['coingecko.com']) 
ON CONFLICT (id) DO NOTHING;

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_coins_updated_at
  BEFORE UPDATE ON public.coins
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();