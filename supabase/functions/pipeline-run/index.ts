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

// Web-Only scoring weights as specified
const DEFAULT_SCORING_WEIGHTS = {
  security_rug_pull: 15,    // Based on claims on site/audit links (not verified)
  tokenomics: 10,           // Only what's publicly described (supply/vesting in docs)
  team_transparency: 20,    // Doxxed team, bios, LinkedIn/track record on site
  product_roadmap: 20,     // Demo/MVP, documentation quality, milestones with dates
  onchain_traction: 10,    // Qualitative: partners/integrations mentioned publicly
  market_narrative: 15,    // Clear positioning vs comparable projects
  community: 10           // Engagement from publicly visible channels
};

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
    
    // Check settings and allowed domains
    const { data: settings } = await supabase
      .from('settings')
      .select('hybrid_mode, allow_domains')
      .single();
    
    if (settings?.hybrid_mode) {
      console.log('Hybrid mode enabled - would use CoinGecko API');
      // TODO: Implement CoinGecko API integration
      return;
    }
    
    // Check if coingecko.com is in allowed domains
    const allowedDomains = settings?.allow_domains || ['coingecko.com'];
    if (!allowedDomains.includes('coingecko.com')) {
      console.log('CoinGecko not in allowed domains, skipping discovery');
      return;
    }
    
    // Rate limiting: wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Web-only mode: scrape the new cryptocurrencies page with proper compliance
    const response = await fetch('https://www.coingecko.com/en/new-cryptocurrencies', {
      headers: {
        'User-Agent': 'NewCoinRadarResearchBot/1.0 (contact: research@newcoinradar.dev)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'close',
      },
    });
    
    if (!response.ok) {
      if (response.status === 429) {
        console.log('Rate limited, implementing exponential backoff');
        await new Promise(resolve => setTimeout(resolve, 5000));
        throw new Error(`Rate limited: ${response.status}`);
      }
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
  
  // Web-Only Scoring with exact weights specified
  const w = weights || DEFAULT_SCORING_WEIGHTS;
  
  // Security & Rug-Pull Detection (15%) - based on claims/audit links
  let securityScore = calculateSecurityScore(facts);
  pillars.security_rug_pull = (securityScore / 100) * w.security_rug_pull;
  
  // Tokenomics (10%) - public supply/vesting info
  let tokenomicsScore = calculateTokenomicsScore(facts);
  pillars.tokenomics = (tokenomicsScore / 100) * w.tokenomics;
  
  // Team & Transparency (20%) - doxxed team, bios, LinkedIn
  let teamScore = calculateTeamScore(facts);
  pillars.team_transparency = (teamScore / 100) * w.team_transparency;
  
  // Product & Roadmap (20%) - demo/MVP, documentation quality
  let productScore = calculateProductScore(facts);
  pillars.product_roadmap = (productScore / 100) * w.product_roadmap;
  
  // On-chain Traction (10%) - partners/integrations mentioned publicly
  let tractionScore = calculateTractionScore(facts);
  pillars.onchain_traction = (tractionScore / 100) * w.onchain_traction;
  
  // Market/Narrative Fit (15%) - positioning vs competitors
  let marketScore = calculateMarketScore(facts);
  pillars.market_narrative = (marketScore / 100) * w.market_narrative;
  
  // Community (10%) - engagement from publicly visible channels
  let communityScore = calculateCommunityScore(facts);
  pillars.community = (communityScore / 100) * w.community;
  
  // Apply hard caps and penalties as specified
  if (facts.security?.risky_language?.some((lang: string) => 
    lang.toLowerCase().includes("guaranteed returns") || 
    lang.toLowerCase().includes("guaranteed profit"))) {
    penalties += 15;
    red_flags.push("Guaranteed return promises detected (-15 points)");
  }
  
  if (facts.security?.risky_language?.some((lang: string) => 
    lang.toLowerCase().includes("misleading") || 
    lang.toLowerCase().includes("false claim"))) {
    penalties += 10;
    red_flags.push("Misleading information detected (-10 points)");
  }
  
  if (facts.security?.audit_links?.length === 0 && 
      facts.security?.owner_controls?.includes("audit claim")) {
    penalties += 3;
    red_flags.push("Audit claim without source (-3 points)");
  }
  
  // Green flags
  if (facts.team?.doxxed === true) green_flags.push("Team is doxxed");
  if (facts.security?.audit_links?.length > 0) green_flags.push("Security audits found");
  if (facts.product?.mvp === "yes") green_flags.push("MVP/Demo available");
  if (facts.tokenomics?.supply && facts.tokenomics.supply !== "unknown") green_flags.push("Tokenomics documented");
  if (facts.community?.channels?.length > 2) green_flags.push("Active on multiple channels");
  
  const overall = Object.values(pillars).reduce((sum, score) => sum + score, 0);
  let finalScore = Math.max(overall - penalties, 0);
  
  // Hard cap for misleading information
  if (facts.security?.risky_language?.some((lang: string) => lang.toLowerCase().includes("misleading"))) {
    finalScore = Math.min(20, finalScore);
    red_flags.push("Score capped at 20 due to misleading information");
  }
  
  // Calculate confidence based on data coverage and freshness
  const expectedFields = ['team', 'tokenomics', 'security', 'product', 'market', 'community'];
  const coverageRatio = expectedFields.filter(field => 
    facts[field] && facts[field] !== "unknown" && 
    Object.keys(facts[field]).length > 0
  ).length / expectedFields.length;
  
  const confidence = Math.min(1, coverageRatio);
  
  return {
    overall: Math.round(Math.min(100, Math.max(0, finalScore))),
    overall_cap: finalScore > 100 ? 100 : null,
    confidence: Math.round(confidence * 100) / 100,
    pillars,
    penalties,
    red_flags,
    green_flags,
    summary: `Score: ${Math.round(finalScore)}/100 (${Math.round(confidence * 100)}% confidence)`
  };
}

// Individual scoring functions for Web-Only methodology

function calculateSecurityScore(facts: any): number {
  if (!facts.security) return 0;
  
  let score = 10; // base score
  
  // Audit links (major factor)
  if (facts.security.audit_links && facts.security.audit_links.length > 0) {
    score += 60; // Strong positive for actual audit links
  }
  
  // Owner controls assessment
  if (facts.security.owner_controls && facts.security.owner_controls !== "unknown") {
    if (facts.security.owner_controls.toLowerCase().includes("limited") || 
        facts.security.owner_controls.toLowerCase().includes("renounced")) {
      score += 20;
    } else if (facts.security.owner_controls.toLowerCase().includes("unlimited") ||
               facts.security.owner_controls.toLowerCase().includes("full control")) {
      score -= 10;
    }
  }
  
  // Deduct for risky language
  if (facts.security.risky_language && facts.security.risky_language.length > 0) {
    score -= facts.security.risky_language.length * 15; // Heavy penalty
  }
  
  // Proof URLs quality
  if (facts.security.proof_urls && facts.security.proof_urls.length > 1) {
    score += 10; // Multiple sources
  }
  
  return Math.min(100, Math.max(0, score));
}

function calculateTokenomicsScore(facts: any): number {
  if (!facts.tokenomics) return 0;
  
  let score = 5; // base score
  
  // Supply information
  if (facts.tokenomics.supply && facts.tokenomics.supply !== "unknown") {
    score += 30;
    
    // Bonus for clear supply cap
    if (facts.tokenomics.supply.toLowerCase().includes("cap") ||
        facts.tokenomics.supply.toLowerCase().includes("fixed") ||
        facts.tokenomics.supply.toLowerCase().includes("limited")) {
      score += 15;
    }
  }
  
  // Vesting information
  if (facts.tokenomics.vesting && facts.tokenomics.vesting !== "unknown") {
    score += 25;
    
    // Bonus for transparent vesting schedule
    if (facts.tokenomics.vesting.toLowerCase().includes("schedule") ||
        facts.tokenomics.vesting.toLowerCase().includes("timeline")) {
      score += 10;
    }
  }
  
  // Utility description
  if (facts.tokenomics.utility && facts.tokenomics.utility !== "unknown") {
    score += 20;
  }
  
  // Proof URLs
  if (facts.tokenomics.proof_urls && facts.tokenomics.proof_urls.length > 0) {
    score += 10;
  }
  
  return Math.min(100, score);
}

function calculateTeamScore(facts: any): number {
  if (!facts.team) return 0;
  
  let score = 0;
  
  // Doxxed team (major factor)
  if (facts.team.doxxed === true) {
    score += 50;
  } else if (facts.team.doxxed === false) {
    score += 15; // Some team info but not doxxed
  }
  
  // Team members with proof
  if (facts.team.members && facts.team.members.length > 0) {
    const membersWithProof = facts.team.members.filter((m: any) => m.proof_url);
    score += Math.min(30, membersWithProof.length * 10);
    
    // Bonus for LinkedIn/professional backgrounds
    const professionalMembers = facts.team.members.filter((m: any) => 
      m.role && (m.role.toLowerCase().includes("linkedin") || 
                 m.role.toLowerCase().includes("ceo") ||
                 m.role.toLowerCase().includes("cto") ||
                 m.role.toLowerCase().includes("founder")));
    score += Math.min(20, professionalMembers.length * 7);
  }
  
  return Math.min(100, score);
}

function calculateProductScore(facts: any): number {
  if (!facts.product) return 0;
  
  let score = 0;
  
  // MVP/Demo availability (major factor)
  if (facts.product.mvp === "yes") {
    score += 60;
  } else if (facts.product.mvp === "no") {
    score += 10; // Some product info but no demo
  }
  
  // Roadmap quality with dates
  if (facts.product.roadmap_items && facts.product.roadmap_items.length > 0) {
    const itemsWithDates = facts.product.roadmap_items.filter((item: any) => item.date);
    score += Math.min(25, itemsWithDates.length * 8);
    
    // Additional points for detailed milestones
    score += Math.min(15, facts.product.roadmap_items.length * 3);
  }
  
  return Math.min(100, score);
}

function calculateTractionScore(facts: any): number {
  if (!facts.market) return 10; // Web-only limitation - base score
  
  let score = 10;
  
  // Partners/integrations mentioned
  if (facts.market.narrative && facts.market.narrative !== "unknown") {
    if (facts.market.narrative.toLowerCase().includes("partner") ||
        facts.market.narrative.toLowerCase().includes("integration") ||
        facts.market.narrative.toLowerCase().includes("collaboration")) {
      score += 40;
    }
  }
  
  // Competitors analysis (shows market understanding)
  if (facts.market.competitors && facts.market.competitors.length > 0) {
    score += Math.min(30, facts.market.competitors.length * 10);
  }
  
  // Proof URLs for traction claims
  if (facts.market.proof_urls && facts.market.proof_urls.length > 0) {
    score += 20;
  }
  
  return Math.min(100, score);
}

function calculateMarketScore(facts: any): number {
  if (!facts.market) return 0;
  
  let score = 5; // base score
  
  // Clear narrative/positioning
  if (facts.market.narrative && facts.market.narrative !== "unknown") {
    score += 40;
    
    // Bonus for clear differentiation
    if (facts.market.narrative.toLowerCase().includes("unique") ||
        facts.market.narrative.toLowerCase().includes("different") ||
        facts.market.narrative.toLowerCase().includes("innovative")) {
      score += 20;
    }
  }
  
  // Competitor analysis
  if (facts.market.competitors && facts.market.competitors.length > 0) {
    score += 25; // Shows market awareness
  }
  
  // Proof URLs for market claims
  if (facts.market.proof_urls && facts.market.proof_urls.length > 0) {
    score += 10;
  }
  
  return Math.min(100, score);
}

function calculateCommunityScore(facts: any): number {
  if (!facts.community) return 0;
  
  let score = 0;
  
  // Number of official channels
  if (facts.community.channels && facts.community.channels.length > 0) {
    score += Math.min(50, facts.community.channels.length * 15);
  }
  
  // Notable engagement mentioned
  if (facts.community.notable_engagement && facts.community.notable_engagement !== "unknown") {
    score += 30;
    
    // Bonus for specific engagement metrics
    if (facts.community.notable_engagement.toLowerCase().includes("active") ||
        facts.community.notable_engagement.toLowerCase().includes("growing") ||
        facts.community.notable_engagement.toLowerCase().includes("engaged")) {
      score += 10;
    }
  }
  
  // Proof URLs for engagement claims
  if (facts.community.proof_urls && facts.community.proof_urls.length > 0) {
    score += 10;
  }
  
  return Math.min(100, score);
}