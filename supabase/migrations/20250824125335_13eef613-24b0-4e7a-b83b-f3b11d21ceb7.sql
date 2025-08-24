-- Update facts table to support on-chain traction tracking
-- Add index for better performance on score history queries
CREATE INDEX IF NOT EXISTS idx_scores_coin_id_as_of ON public.scores(coin_id, as_of DESC);

-- Add some additional settings for the new features
INSERT INTO public.settings (id, weights_json, hybrid_mode, strategy_version, allow_domains, created_at, updated_at) 
VALUES (1, 
  '{"community": 10, "tokenomics": 10, "product_roadmap": 20, "market_narrative": 15, "onchain_traction": 10, "security_rug_pull": 15, "team_transparency": 20}', 
  false, 
  '1.0', 
  ARRAY['coingecko.com', 'github.com', 'twitter.com', 'medium.com', 'docs.'], 
  now(), 
  now()
) ON CONFLICT (id) DO UPDATE SET 
  allow_domains = EXCLUDED.allow_domains,
  updated_at = now();