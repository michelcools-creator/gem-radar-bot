-- Insert sample coins for demonstration
INSERT INTO public.coins (name, symbol, coingecko_coin_url, official_links, status) VALUES 
('Bitcoin Minetrix', 'BTCMTX', 'https://www.coingecko.com/en/coins/bitcoin-minetrix', '{"website": "https://bitcoinminetrix.com", "twitter": "https://twitter.com/bitcoinminetrix"}', 'analyzed'),
('Meme AI', 'MEMEAI', 'https://www.coingecko.com/en/coins/meme-ai', '{"website": "https://meme-ai.org", "docs": "https://docs.meme-ai.org"}', 'processing'),
('Sponge V2', 'SPONGEV2', 'https://www.coingecko.com/en/coins/sponge-v2', '{"website": "https://spongev2.vip"}', 'pending');

-- Insert sample scores for the analyzed coin
INSERT INTO public.scores (coin_id, overall, confidence, pillars, red_flags, green_flags, summary) 
VALUES (
  (SELECT id FROM public.coins WHERE symbol = 'BTCMTX'),
  72,
  0.85,
  '{"security_rug_pull": 65, "tokenomics": 70, "team_transparency": 80, "product_roadmap": 75, "onchain_traction": 60, "market_narrative_fit": 78, "community": 68}',
  '["Limited audit information", "Vague tokenomics details"]',
  '["Experienced team", "Clear roadmap", "Strong community engagement", "Innovative mining concept"]',
  'Bitcoin Minetrix shows strong fundamentals with an experienced team and innovative approach to Bitcoin mining through staking. The project demonstrates good transparency and community engagement, though some concerns exist around audit documentation.'
);