import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting pipeline run...');
    
    // Step 1: Discover recent listings
    await discoverRecentListings();
    
    // Step 2: Resolve official links for pending coins
    await resolveOfficialLinks();
    
    // Step 3: Fetch pages for coins with official links
    await fetchPages();
    
    // Step 4: Extract facts using LLM
    await extractFacts();
    
    // Step 5: Calculate scores
    await calculateScores();
    
    console.log('Pipeline run completed successfully');
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Pipeline error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function discoverRecentListings() {
  try {
    console.log('Discovering recent listings from CoinGecko...');
    
    // Check if hybrid mode is enabled
    const { data: settings } = await supabase
      .from('settings')
      .select('hybrid_mode')
      .single();
    
    if (settings?.hybrid_mode) {
      console.log('Hybrid mode enabled - would use CoinGecko API');
      // TODO: Implement CoinGecko API integration
      return;
    }
    
    // Web-only mode: scrape the new cryptocurrencies page
    const response = await fetch('https://www.coingecko.com/en/new-cryptocurrencies', {
      headers: {
        'User-Agent': 'NewCoinRadarResearchBot/1.0 (research purposes)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch CoinGecko listings: ${response.status}`);
    }
    
    const html = await response.text();
    const coins = parseCoinGeckoListings(html);
    
    console.log(`Found ${coins.length} new coins`);
    
    // Upsert coins
    for (const coin of coins) {
      await supabase
        .from('coins')
        .upsert(
          {
            name: coin.name,
            symbol: coin.symbol,
            coingecko_coin_url: coin.coinUrl,
            status: 'pending'
          },
          {
            onConflict: 'coingecko_coin_url',
            ignoreDuplicates: false
          }
        );
    }
    
    console.log('Successfully upserted coins');
  } catch (error) {
    console.error('Error discovering listings:', error);
    throw error;
  }
}

function parseCoinGeckoListings(html: string): Array<{name: string, symbol: string, coinUrl: string}> {
  // Simple regex-based parsing for the table rows
  const coins = [];
  
  // Look for table rows with coin data
  const tableRowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/g;
  const rows = html.match(tableRowRegex) || [];
  
  for (const row of rows) {
    // Extract coin name, symbol, and detail URL
    const nameMatch = row.match(/title="([^"]+)"/);
    const symbolMatch = row.match(/class="tw-uppercase[^>]*>([A-Z0-9]+)</);
    const urlMatch = row.match(/href="(\/en\/coins\/[^"]+)"/);
    
    if (nameMatch && symbolMatch && urlMatch) {
      coins.push({
        name: nameMatch[1],
        symbol: symbolMatch[1],
        coinUrl: `https://www.coingecko.com${urlMatch[1]}`
      });
    }
  }
  
  return coins.slice(0, 50); // Limit to 50 most recent
}

async function resolveOfficialLinks() {
  console.log('Resolving official links...');
  
  const { data: coins } = await supabase
    .from('coins')
    .select('id, coingecko_coin_url')
    .eq('status', 'pending')
    .limit(10);
  
  if (!coins?.length) return;
  
  for (const coin of coins) {
    try {
      const response = await fetch(coin.coingecko_coin_url, {
        headers: {
          'User-Agent': 'NewCoinRadarResearchBot/1.0 (research purposes)',
        },
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      const officialLinks = parseOfficialLinks(html);
      
      await supabase
        .from('coins')
        .update({
          official_links: officialLinks,
          status: 'processing'
        })
        .eq('id', coin.id);
        
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error resolving links for coin ${coin.id}:`, error);
    }
  }
}

function parseOfficialLinks(html: string): Record<string, string> {
  const links: Record<string, string> = {};
  
  // Look for website links
  const websiteMatch = html.match(/href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?website/i);
  if (websiteMatch) links.website = websiteMatch[1];
  
  // Look for documentation
  const docsMatch = html.match(/href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?(docs|documentation|whitepaper)/i);
  if (docsMatch) links.docs = docsMatch[1];
  
  // Look for GitHub
  const githubMatch = html.match(/href="(https?:\/\/github\.com\/[^"]+)"/i);
  if (githubMatch) links.github = githubMatch[1];
  
  return links;
}

async function fetchPages() {
  console.log('Fetching pages...');
  
  const { data: coins } = await supabase
    .from('coins')
    .select('id, official_links')
    .eq('status', 'processing')
    .limit(5);
  
  if (!coins?.length) return;
  
  const { data: settings } = await supabase
    .from('settings')
    .select('allow_domains')
    .single();
    
  const allowedDomains = settings?.allow_domains || ['coingecko.com'];
  
  for (const coin of coins) {
    const links = coin.official_links as Record<string, string>;
    
    for (const [type, url] of Object.entries(links)) {
      if (!url || !isAllowedDomain(url, allowedDomains)) continue;
      
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'NewCoinRadarResearchBot/1.0 (research purposes)',
          },
        });
        
        if (response.ok) {
          const html = await response.text();
          const cleanText = extractCleanText(html);
          const excerpt = cleanText.substring(0, 1000);
          
          await supabase
            .from('pages')
            .upsert({
              coin_id: coin.id,
              url,
              status: 'fetched',
              http_status: response.status,
              content_text: cleanText.substring(0, 200000), // 200KB limit
              content_excerpt: excerpt,
              fetched_at: new Date().toISOString()
            });
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error fetching page ${url}:`, error);
      }
    }
  }
}

function isAllowedDomain(url: string, allowedDomains: string[]): boolean {
  try {
    const domain = new URL(url).hostname;
    return allowedDomains.some(allowed => domain.includes(allowed) || domain.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function extractCleanText(html: string): string {
  // Remove scripts, styles, and navigation
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '');
  
  // Remove HTML tags and extract text
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');
  
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
}

async function extractFacts() {
  console.log('Extracting facts using LLM...');
  
  const { data: coins } = await supabase
    .from('coins')
    .select(`
      id, name, symbol, coingecko_coin_url,
      pages!inner(url, content_text)
    `)
    .eq('status', 'processing')
    .eq('pages.status', 'fetched')
    .limit(3);
  
  if (!coins?.length) return;
  
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }
  
  for (const coin of coins) {
    try {
      const pages = coin.pages as Array<{url: string, content_text: string}>;
      
      const extractorPrompt = `
COIN: ${coin.name} (${coin.symbol}) – ${coin.coingecko_coin_url}

PAGES:
${pages.map(p => `URL: ${p.url}\nCONTENT: ${p.content_text?.substring(0, 10000) || 'No content'}`).join('\n\n')}

TASK: Extract structured facts and return ONLY JSON in this exact schema:
{
  "team": {"doxxed": true|false|"unknown", "members":[{"name":"...", "role":"...", "proof_url":"..."}]},
  "tokenomics": {"supply":"...", "vesting":"...", "utility":"...", "proof_urls":["..."]},
  "security": {"audit_links":["..."], "owner_controls":"...", "risky_language": ["guaranteed returns"], "proof_urls":["..."]},
  "product": {"mvp":"yes|no|unknown", "roadmap_items":[{"milestone":"...", "date":"..."}], "proof_urls":["..."]},
  "market": {"narrative":"...", "competitors":["..."], "proof_urls":["..."]},
  "community": {"channels":["x","discord"], "notable_engagement":"...", "proof_urls":["..."]},
  "meta": {"pages_used":[{"url":"...", "excerpt":"<=300 chars"}]}
}

CITE every claim with proof_urls and excerpts. Mark unknown as "unknown".
`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a factual extractor. Return only JSON in the requested schema. Cite every claim with proof_urls and excerpts. No interpretations, no scores.'
            },
            {
              role: 'user', 
              content: extractorPrompt
            }
          ],
          temperature: 0.2,
          max_tokens: 2000
        }),
      });
      
      if (!response.ok) {
        console.error(`OpenAI API error: ${response.status}`);
        continue;
      }
      
      const result = await response.json();
      const extractedText = result.choices[0].message.content;
      
      let extractedData;
      try {
        extractedData = JSON.parse(extractedText);
      } catch (e) {
        console.error('Failed to parse extracted JSON:', e);
        continue;
      }
      
      await supabase
        .from('facts')
        .insert({
          coin_id: coin.id,
          extracted: extractedData,
          sources: { pages: pages.map(p => p.url) }
        });
        
      console.log(`Extracted facts for ${coin.name}`);
    } catch (error) {
      console.error(`Error extracting facts for coin ${coin.id}:`, error);
    }
  }
}

async function calculateScores() {
  console.log('Calculating scores...');
  
  const { data: coinsWithFacts } = await supabase
    .from('coins')
    .select(`
      id, name, symbol,
      facts!inner(extracted)
    `)
    .eq('status', 'processing')
    .limit(5);
  
  if (!coinsWithFacts?.length) return;
  
  const { data: settings } = await supabase
    .from('settings')
    .select('weights_json')
    .single();
    
  const weights = settings?.weights_json as Record<string, number>;
  
  for (const coin of coinsWithFacts) {
    try {
      const facts = coin.facts[0]?.extracted as any;
      const scores = calculateCoinScore(facts, weights);
      
      await supabase
        .from('scores')
        .insert({
          coin_id: coin.id,
          overall: scores.overall,
          overall_cap: scores.overall_cap,
          confidence: scores.confidence,
          pillars: scores.pillars,
          penalties: scores.penalties,
          red_flags: scores.red_flags,
          green_flags: scores.green_flags,
          summary: scores.summary
        });
      
      await supabase
        .from('coins')
        .update({ status: 'analyzed' })
        .eq('id', coin.id);
        
      console.log(`Scored ${coin.name}: ${scores.overall}`);
    } catch (error) {
      console.error(`Error scoring coin ${coin.id}:`, error);
    }
  }
}

function calculateCoinScore(facts: any, weights: Record<string, number>) {
  const pillars: Record<string, number> = {};
  let penalties = 0;
  const red_flags: string[] = [];
  const green_flags: string[] = [];
  
  // Security & Rug-Pull (15 points)
  let securityScore = 5; // base
  if (facts.security?.audit_links?.length > 0) {
    securityScore += 5;
    green_flags.push('Has audit links');
  }
  if (facts.security?.risky_language?.length > 0) {
    penalties += 10;
    red_flags.push('Contains risky language');
  }
  pillars.security_rug_pull = Math.min(securityScore, weights.security_rug_pull);
  
  // Team & Transparency (20 points)  
  let teamScore = 2; // base
  if (facts.team?.doxxed === true) {
    teamScore += 15;
    green_flags.push('Doxxed team');
  } else if (facts.team?.doxxed === false) {
    teamScore += 5;
  }
  if (facts.team?.members?.length > 2) {
    teamScore += 3;
    green_flags.push('Multiple team members listed');
  }
  pillars.team_transparency = Math.min(teamScore, weights.team_transparency);
  
  // Product & Roadmap (20 points)
  let productScore = 2; // base
  if (facts.product?.mvp === 'yes') {
    productScore += 10;
    green_flags.push('Has MVP');
  }
  if (facts.product?.roadmap_items?.length > 2) {
    productScore += 8;
    green_flags.push('Detailed roadmap');
  }
  pillars.product_roadmap = Math.min(productScore, weights.product_roadmap);
  
  // Other pillars with basic scoring
  pillars.tokenomics = Math.min(facts.tokenomics?.supply ? 8 : 3, weights.tokenomics);
  pillars.onchain_traction = Math.min(5, weights.onchain_traction); // web-only limitation
  pillars.market_narrative = Math.min(facts.market?.narrative ? 12 : 5, weights.market_narrative);
  pillars.community = Math.min(facts.community?.channels?.length > 1 ? 8 : 3, weights.community);
  
  const overall = Object.values(pillars).reduce((sum, score) => sum + score, 0);
  const overall_cap = Math.max(overall - penalties, 0);
  
  // Calculate confidence based on data availability
  const dataPoints = [
    facts.team?.doxxed !== 'unknown',
    facts.tokenomics?.supply,
    facts.product?.mvp !== 'unknown',
    facts.security?.audit_links?.length > 0,
    facts.market?.narrative,
    facts.community?.channels?.length > 0
  ];
  const confidence = dataPoints.filter(Boolean).length / dataPoints.length;
  
  return {
    overall: overall_cap,
    overall_cap: overall_cap < overall ? overall_cap : null,
    confidence: Math.round(confidence * 100) / 100,
    pillars,
    penalties,
    red_flags,
    green_flags,
    summary: `Score: ${overall_cap}/100 (${Math.round(confidence * 100)}% confidence)`
  };
}
