-- Create enum types
CREATE TYPE coin_status AS ENUM ('pending', 'processing', 'analyzed', 'failed', 'insufficient_data');
CREATE TYPE page_status AS ENUM ('pending', 'fetched', 'failed', 'empty');

-- Create coins table
CREATE TABLE public.coins (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    coingecko_coin_url TEXT,
    official_links JSONB DEFAULT '{}',
    status coin_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pages table
CREATE TABLE public.pages (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    coin_id UUID NOT NULL REFERENCES public.coins(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE,
    status page_status NOT NULL DEFAULT 'pending',
    http_status INTEGER,
    content_text TEXT,
    content_excerpt TEXT,
    content_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create facts table
CREATE TABLE public.facts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    coin_id UUID NOT NULL REFERENCES public.coins(id) ON DELETE CASCADE,
    as_of TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    extracted JSONB NOT NULL DEFAULT '{}',
    sources JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create scores table
CREATE TABLE public.scores (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    coin_id UUID NOT NULL REFERENCES public.coins(id) ON DELETE CASCADE,
    as_of TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    overall NUMERIC(5,2) NOT NULL,
    overall_cap NUMERIC(5,2),
    confidence NUMERIC(3,2) NOT NULL DEFAULT 0,
    pillars JSONB DEFAULT '{}',
    penalties NUMERIC(5,2) DEFAULT 0,
    red_flags JSONB DEFAULT '[]',
    green_flags JSONB DEFAULT '[]',
    summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create settings table
CREATE TABLE public.settings (
    id INTEGER PRIMARY KEY DEFAULT 1,
    strategy_version TEXT NOT NULL DEFAULT '1.0',
    weights_json JSONB NOT NULL DEFAULT '{
        "security_rug_pull": 15,
        "tokenomics": 10, 
        "team_transparency": 20,
        "product_roadmap": 20,
        "onchain_traction": 10,
        "market_narrative": 15,
        "community": 10
    }',
    hybrid_mode BOOLEAN NOT NULL DEFAULT false,
    allow_domains TEXT[] DEFAULT ARRAY['coingecko.com'],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT single_settings_row CHECK (id = 1)
);

-- Insert default settings
INSERT INTO public.settings (id) VALUES (1);

-- Create indexes
CREATE INDEX idx_coins_status ON public.coins(status);
CREATE INDEX idx_coins_first_seen ON public.coins(first_seen DESC);
CREATE INDEX idx_pages_coin_id ON public.pages(coin_id);
CREATE INDEX idx_pages_status ON public.pages(status);
CREATE INDEX idx_facts_coin_id ON public.facts(coin_id);
CREATE INDEX idx_facts_as_of ON public.facts(as_of DESC);
CREATE INDEX idx_scores_coin_id ON public.scores(coin_id);
CREATE INDEX idx_scores_overall ON public.scores(overall DESC);
CREATE INDEX idx_scores_as_of ON public.scores(as_of DESC);

-- Create updated_at triggers
CREATE TRIGGER update_coins_updated_at
    BEFORE UPDATE ON public.coins
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pages_updated_at
    BEFORE UPDATE ON public.pages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facts_updated_at
    BEFORE UPDATE ON public.facts
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scores_updated_at
    BEFORE UPDATE ON public.scores
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE public.coins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (public read access for research tool)
CREATE POLICY "Anyone can view coins" ON public.coins FOR SELECT USING (true);
CREATE POLICY "Anyone can view pages" ON public.pages FOR SELECT USING (true);
CREATE POLICY "Anyone can view facts" ON public.facts FOR SELECT USING (true);
CREATE POLICY "Anyone can view scores" ON public.scores FOR SELECT USING (true);
CREATE POLICY "Anyone can view settings" ON public.settings FOR SELECT USING (true);