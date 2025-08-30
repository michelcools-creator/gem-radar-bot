import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { JSDOM } from "https://esm.sh/jsdom@24.0.0";
import { Readability } from "https://esm.sh/@mozilla/readability@0.6.0";

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
    // Safely parse JSON body, handle empty body case
    let body = {};
    if (req.method === 'POST') {
      try {
        const text = await req.text();
        if (text.trim()) {
          body = JSON.parse(text);
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        // If parsing fails, continue with empty body
        body = {};
      }
    }
    
    const { manual_url, reset_coin_id, reset_all_stuck } = body;
    
    console.log('Starting pipeline run...');
    
    if (reset_all_stuck) {
      console.log('Resetting all stuck coins');
      await resetAllStuckCoins();
      return new Response(JSON.stringify({ success: true, action: 'all_coins_reset' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (reset_coin_id) {
      console.log('Resetting stuck coin:', reset_coin_id);
      await resetStuckCoin(reset_coin_id);
      return new Response(JSON.stringify({ success: true, action: 'coin_reset' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    if (manual_url) {
      console.log('Processing manual URL:', manual_url);
      await processManualCoin(manual_url);
    } else {
      // Step 1: Discover recent listings
      await discoverRecentListings();
    }
    
    // Step 2: Resolve official links for pending coins
    await resolveOfficialLinks();
    
    // Step 2.5: Handle retry cases for previously failed extractions
    await handleRetries();
    
    // Step 3: Fetch pages for coins with official links
    await fetchPages();
    
    // Step 4: Extract facts using LLM
    await extractFacts();
    
    // Step 5: Calculate scores
    await calculateScores();
    
    // Step 6: Perform deep analysis
    await performDeepAnalysis();
    
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

async function processManualCoin(manual_url: string) {
  console.log('Processing manual coin URL:', manual_url);
  
  // Validate URL format - now supports all language codes
  const coinGeckoRegex = /^https?:\/\/(www\.)?coingecko\.com\/[a-z]{2}\/coins\/([a-zA-Z0-9-_]+)$/;
  const match = manual_url.match(coinGeckoRegex);
  
  if (!match) {
    throw new Error('Invalid CoinGecko URL format');
  }
  
  const coinId = match[2];
  
  try {
    // Fetch the CoinGecko page to extract coin info
    const response = await fetch(manual_url, {
      headers: {
        'User-Agent': 'NewCoinRadarResearchBot/1.0 (research purposes)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch coin page: ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract coin name and symbol from HTML
    let name = coinId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()); // fallback
    let symbol = coinId.toUpperCase(); // fallback
    
    // Try to extract actual name and symbol
    const titleMatch = html.match(/<title[^>]*>([^<]+)/i);
    if (titleMatch) {
      const title = titleMatch[1];
      const nameSymbolMatch = title.match(/^([^|]+?)\s*\(([A-Z0-9]+)\)/);
      if (nameSymbolMatch) {
        name = nameSymbolMatch[1].trim();
        symbol = nameSymbolMatch[2].trim();
      }
    }
    
    // Alternative extraction from h1 or main content
    if (!name || name === coinId) {
      const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (h1Match) {
        const h1Content = h1Match[1].replace(/<[^>]*>/g, '').trim();
        if (h1Content && h1Content.length < 50) {
          name = h1Content;
        }
      }
    }
    
    console.log(`Extracted coin info - Name: ${name}, Symbol: ${symbol}`);
    
    // Check if coin already exists
    const { data: existingCoin } = await supabase
      .from('coins')
      .select('id, name, status')
      .eq('coingecko_coin_url', manual_url)
      .single();
    
    if (existingCoin) {
      console.log(`Coin already exists: ${existingCoin.name} (${existingCoin.status})`);
      return; // Don't throw error, just continue with existing coin
    }
    
    // Insert new coin with manual source
    const { data: newCoin, error } = await supabase
      .from('coins')
      .insert({
        name: name,
        symbol: symbol,
        coingecko_coin_url: manual_url,
        manual_url: manual_url,
        source: 'manual_input',
        status: 'pending'
      })
      .select('id, name')
      .single();
    
    if (error) {
      throw error;
    }
    
    console.log(`Successfully added manual coin: ${newCoin.name}`);
    
  } catch (error) {
    console.error('Error processing manual coin:', error);
    throw new Error(`Failed to process manual coin: ${error.message}`);
  }
}

async function resetStuckCoin(coinId: string) {
  console.log(`Resetting stuck coin: ${coinId}`);
  
  try {
    // Reset coin status and clean up associated data
    await supabase
      .from('coins')
      .update({ status: 'pending' })
      .eq('id', coinId);
    
    // Delete existing pages to force re-fetch
    await supabase
      .from('pages')
      .delete()
      .eq('coin_id', coinId);
    
    // Delete existing facts to force re-extraction
    await supabase
      .from('facts')
      .delete()
      .eq('coin_id', coinId);
    
    // Delete existing scores to force re-calculation
    await supabase
      .from('scores')
      .delete()
      .eq('coin_id', coinId);
    
    console.log(`Successfully reset coin ${coinId} to pending status`);
    
  } catch (error) {
    console.error('Error resetting stuck coin:', error);
    throw new Error(`Failed to reset coin: ${error.message}`);
  }
}

async function resetAllStuckCoins() {
  console.log('Resetting all stuck coins...');
  
  try {
    // Find coins that have been stuck in processing/retry states for more than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: stuckCoins } = await supabase
      .from('coins')
      .select('id, name, status, updated_at')
      .in('status', ['processing', 'retry_pending'])
      .lt('updated_at', oneHourAgo);
    
    if (!stuckCoins?.length) {
      console.log('No stuck coins found');
      return;
    }
    
    console.log(`Found ${stuckCoins.length} stuck coins to reset`);
    
    for (const coin of stuckCoins) {
      console.log(`Resetting stuck coin: ${coin.name} (${coin.status})`);
      await resetStuckCoin(coin.id);
    }
    
    console.log(`Successfully reset ${stuckCoins.length} stuck coins`);
    
  } catch (error) {
    console.error('Error resetting all stuck coins:', error);
    throw new Error(`Failed to reset stuck coins: ${error.message}`);
  }
}

async function discoverRecentListings() {
  console.log('Discovering recent listings from CoinGecko...');
  
  try {
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
    
    let coins = [];
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts && coins.length === 0) {
      attempt++;
      console.log(`Scraping attempt ${attempt}/${maxAttempts}...`);
      
      // Rate limiting with exponential backoff for retries
      if (attempt > 1) {
        const backoffDelay = Math.pow(2, attempt - 1) * 3000; // 6s, 12s delays
        console.log(`Waiting ${backoffDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      } else {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      try {
        // Rotate different user agents for better stealth
        const userAgents = [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        
        const selectedUA = userAgents[Math.floor(Math.random() * userAgents.length)];
        
        // Web scraping with rotating stealth headers
        const response = await fetch('https://www.coingecko.com/en/new-cryptocurrencies', {
          headers: {
            'User-Agent': selectedUA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.coingecko.com/',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'no-cache',
          },
          // Add timeout to prevent hanging requests
          signal: AbortSignal.timeout(30000) // 30 second timeout
        });
        
        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            console.log(`Received ${response.status}, will retry with exponential backoff`);
            continue; // Retry with backoff
          }
          
          if (response.status === 403) {
            console.log('Received 403 Forbidden - trying different approach on next attempt');
            continue; // Retry with different headers
          }
          
          throw new Error(`Failed to fetch CoinGecko listings: ${response.status} ${response.statusText}`);
        }
        
        const html = await response.text();
        console.log(`Response HTML length: ${html.length} characters`);
        
        if (html.length < 1000) {
          console.log('Response too short, likely blocked - retrying...');
          continue;
        }
        
        coins = parseCoinGeckoListings(html);
        console.log(`Found ${coins.length} new coins from CoinGecko new cryptocurrencies page`);
        
        if (coins.length === 0 && html.length > 10000) {
          console.log('HTML received but no coins parsed - page structure may have changed');
          // Log a sample of the HTML for debugging
          console.log('HTML sample:', html.substring(0, 500));
        }
        
      } catch (fetchError) {
        console.error(`Fetch attempt ${attempt} failed:`, fetchError.message);
        if (attempt === maxAttempts) {
          throw new Error(`All ${maxAttempts} scraping attempts failed. Last error: ${fetchError.message}`);
        }
      }
    }
    
    if (coins.length === 0) {
      console.log('Warning: No new coins found after all attempts. Continuing pipeline...');
      return; // Don't throw error, just continue pipeline
    }
    
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
          { onConflict: 'coingecko_coin_url' }
        );
    }
    
    console.log(`Successfully upserted ${coins.length} coins`);
  } catch (error) {
    console.error('Error in discoverRecentListings:', error);
    // Don't re-throw to allow pipeline to continue with existing coins
    console.log('Discovery failed, but continuing pipeline with existing coins...');
  }
}

function parseCoinGeckoListings(html: string): Array<{name: string, symbol: string, coinUrl: string}> {
  const coins = [];
  
  try {
    // Multiple parsing strategies for better reliability
    
    // Strategy 1: Look for coin links in the new cryptocurrencies table
    const coinLinkRegex = /<a[^>]*href="(\/en\/coins\/[^"]+)"[^>]*>([^<]+)<\/a>/g;
    let match;
    
    while ((match = coinLinkRegex.exec(html)) !== null) {
      const coinUrl = `https://www.coingecko.com${match[1]}`;
      const nameOrSymbol = match[2].trim();
      
      // Try to extract symbol from nearby elements
      const coinId = match[1].split('/').pop();
      
      if (coinId && nameOrSymbol) {
        coins.push({
          name: nameOrSymbol,
          symbol: nameOrSymbol.toUpperCase(), // Will be refined later
          coinUrl: coinUrl
        });
      }
    }
    
    // Strategy 2: Look for table rows with structured data
    if (coins.length === 0) {
      const tableRowRegex = /<tr[^>]*class="[^"]*hover[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows = html.match(tableRowRegex) || [];
      
      for (const row of rows) {
        // Look for coin names and symbols
        const nameMatch = row.match(/title="([^"]+)"/);
        const symbolMatch = row.match(/class="[^"]*tw-uppercase[^"]*"[^>]*>([A-Z0-9]+)</i);
        const urlMatch = row.match(/href="(\/en\/coins\/[^"]+)"/);
        
        if (nameMatch && symbolMatch && urlMatch) {
          coins.push({
            name: nameMatch[1],
            symbol: symbolMatch[1],
            coinUrl: `https://www.coingecko.com${urlMatch[1]}`
          });
        }
      }
    }
    
    // Strategy 3: Fallback - look for any coin URLs and extract IDs
    if (coins.length === 0) {
      const fallbackRegex = /\/en\/coins\/([^\/"\s]+)/g;
      const uniqueCoins = new Set();
      
      while ((match = fallbackRegex.exec(html)) !== null) {
        const coinId = match[1];
        if (!uniqueCoins.has(coinId)) {
          uniqueCoins.add(coinId);
          coins.push({
            name: coinId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            symbol: coinId.toUpperCase().replace(/-/g, ''),
            coinUrl: `https://www.coingecko.com/en/coins/${coinId}`
          });
        }
      }
    }
    
    console.log(`Parsing strategies found ${coins.length} coins total`);
    
  } catch (error) {
    console.error('Error parsing CoinGecko listings:', error);
  }
  
  // Remove duplicates by URL and limit results
  const uniqueCoins = Array.from(
    new Map(coins.map(coin => [coin.coinUrl, coin])).values()
  );
  
  return uniqueCoins.slice(0, 50); // Limit to 50 most recent
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
  
  // Improved link extraction with content validation
  const linkPatterns = [
    // Website links with better context matching
    { pattern: /href="(https?:\/\/[^"]+)"[^>]*>[^<]*(?:website|official|home|main)/i, type: 'website' },
    // Documentation with more specific patterns
    { pattern: /href="(https?:\/\/[^"]+)"[^>]*>[^<]*(?:docs|documentation|whitepaper|guide|api)/i, type: 'docs' },
    // GitHub repositories
    { pattern: /href="(https?:\/\/github\.com\/[^"\/]+\/[^"\/]+)"/i, type: 'github' },
    // Blog/Medium posts
    { pattern: /href="(https?:\/\/(?:medium\.com|blog\.|[^\/]+\.medium\.com)[^"]+)"/i, type: 'blog' },
    // Twitter/X profiles (not individual posts)
    { pattern: /href="(https?:\/\/(?:twitter\.com|x\.com)\/[a-zA-Z0-9_]+)(?:\/?)"/i, type: 'twitter' }
  ];
  
  for (const { pattern, type } of linkPatterns) {
    const match = html.match(pattern);
    if (match && isValidContentUrl(match[1])) {
      links[type] = match[1];
    }
  }
  
  // Additional extraction for project websites from structured data
  const structuredLinks = extractStructuredLinks(html);
  Object.assign(links, structuredLinks);
  
  return links;
}

function isValidContentUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    
    // Exclude image and media URLs
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.webp'];
    const mediaExtensions = ['.mp4', '.mp3', '.pdf', '.zip'];
    const excludedExtensions = [...imageExtensions, ...mediaExtensions];
    
    if (excludedExtensions.some(ext => urlObj.pathname.toLowerCase().endsWith(ext))) {
      return false;
    }
    
    // Exclude social media post URLs (keep profile URLs)
    const socialPostPatterns = [
      /twitter\.com\/[^\/]+\/status\//,
      /x\.com\/[^\/]+\/status\//,
      /t\.me\/[^\/]+\/\d+/,
      /discord\.gg\//,
      /t\.co\//
    ];
    
    if (socialPostPatterns.some(pattern => pattern.test(url))) {
      return false;
    }
    
    // Exclude obvious ad/tracking URLs
    const excludedDomains = [
      'googletagmanager.com',
      'google-analytics.com',
      'facebook.com/tr',
      'analytics.',
      'ads.',
      'doubleclick.net'
    ];
    
    if (excludedDomains.some(domain => urlObj.hostname.includes(domain))) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

function extractStructuredLinks(html: string): Record<string, string> {
  const links: Record<string, string> = {};
  
  // Look for JSON-LD structured data
  const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatches) {
    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match.replace(/<[^>]*>/g, '');
        const data = JSON.parse(jsonContent);
        if (data.url && isValidContentUrl(data.url)) {
          links.website = data.url;
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  }
  
  // Look for meta properties
  const metaPatterns = [
    { pattern: /<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i, type: 'website' },
    { pattern: /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i, type: 'website' }
  ];
  
  for (const { pattern, type } of metaPatterns) {
    const match = html.match(pattern);
    if (match && isValidContentUrl(match[1]) && !links[type]) {
      links[type] = match[1];
    }
  }
  
  return links;
}

async function handleRetries() {
  console.log('Handling retries for previously failed extractions...');
  
  const { data: retryCoins } = await supabase
    .from('coins')
    .select('id, name, created_at')
    .eq('status', 'retry_pending')
    .limit(5);
  
  if (!retryCoins?.length) return;
  
  for (const coin of retryCoins) {
    try {
      // Check if the coin has been stuck in retry for too long (more than 24 hours)
      const coinAge = new Date().getTime() - new Date(coin.created_at).getTime();
      const maxRetryAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      
      if (coinAge > maxRetryAge) {
        console.log(`Coin ${coin.name} has been in retry too long, marking as failed`);
        await supabase
          .from('coins')
          .update({ status: 'failed' })
          .eq('id', coin.id);
        continue;
      }
      
      // Check if we have pages for this coin
      const { data: pages } = await supabase
        .from('pages')
        .select('id, status')
        .eq('coin_id', coin.id)
        .eq('status', 'fetched');
      
      if (pages && pages.length > 0) {
        // We have pages, reset to processing to retry fact extraction
        console.log(`Resetting ${coin.name} to processing status for fact extraction retry`);
        await supabase
          .from('coins')
          .update({ status: 'processing' })
          .eq('id', coin.id);
      } else {
        // No valid pages, reset to pending to retry from the beginning
        console.log(`Resetting ${coin.name} to pending status for full retry`);
        await supabase
          .from('coins')
          .update({ status: 'pending' })
          .eq('id', coin.id);
      }
    } catch (error) {
      console.error(`Error handling retry for coin ${coin.id}:`, error);
    }
  }
}

async function fetchPages() {
  console.log('Fetching pages with Epic A4 Readability & PDF extraction...');
  
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
    let successfulPages = 0;
    
    for (const [type, url] of Object.entries(links)) {
      if (!url || !isAllowedDomain(url, allowedDomains)) continue;
      
      let attempt = 0;
      const maxAttempts = 3;
      
      while (attempt < maxAttempts) {
        try {
          // Check if URL is a PDF
          const isPdf = url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('pdf');
          
          if (isPdf) {
            console.log(`Processing PDF: ${url}`);
            const pdfResult = await processPdfDocument(coin.id, url);
            if (pdfResult.success) {
              successfulPages++;
            }
            break; // Exit retry loop for PDF
          }
          
          // Head request first to check content type
          const headResponse = await fetch(url, {
            method: 'HEAD',
            headers: {
              'User-Agent': 'NewCoinRadarResearchBot/1.0 (research purposes)',
            },
          });
          
          const contentType = headResponse.headers.get('content-type') || '';
          
          // Handle PDF content type
          if (contentType.includes('application/pdf')) {
            console.log(`PDF detected by content-type: ${url}`);
            const pdfResult = await processPdfDocument(coin.id, url);
            if (pdfResult.success) {
              successfulPages++;
            }
            break;
          }
          
          // Skip non-HTML content (except already handled PDFs)
          if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
            console.log(`Skipping non-HTML content: ${url} (${contentType})`);
            await supabase
              .from('pages')
              .upsert({
                coin_id: coin.id,
                url,
                status: 'invalid_content',
                http_status: headResponse.status,
                content_excerpt: `Skipped: ${contentType}`,
                fetched_at: new Date().toISOString()
              });
            break;
          }
          
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'NewCoinRadarResearchBot/1.0 (research purposes)',
            },
          });
          
          if (response.ok) {
            const html = await response.text();
            
            // Validate that we got actual HTML content
            if (html.length < 100 || !html.includes('<') || html.startsWith('data:image')) {
              console.log(`Invalid HTML content from ${url}: length=${html.length}`);
              await supabase
                .from('pages')
                .upsert({
                  coin_id: coin.id,
                  url,
                  status: 'invalid_content',
                  http_status: response.status,
                  content_excerpt: 'Invalid or insufficient HTML content',
                  fetched_at: new Date().toISOString()
                });
              break;
            }
            
            // Epic A4: Enhanced content extraction with Readability + JS detection
            const extractionResult = await extractContentWithReadability(html, url);
            
            // Create content hash for deduplication
            const contentHash = await createContentHash(extractionResult.content);
            
            // Create 600-char excerpt as specified
            const excerpt = extractionResult.content.substring(0, 600);
            
            // Validate extracted content quality
            if (extractionResult.content.length < 50) {
              console.log(`Insufficient content extracted from ${url}: ${extractionResult.content.length} chars`);
              
              const status = extractionResult.isJsHeavy ? 'js_empty' : 'insufficient_content';
              
              await supabase
                .from('pages')
                .upsert({
                  coin_id: coin.id,
                  url,
                  status,
                  http_status: response.status,
                  content_excerpt: extractionResult.isJsHeavy ? 'JS-heavy SPA detected, no extractable content' : 'Insufficient extractable content',
                  content_hash: contentHash,
                  fetched_at: new Date().toISOString()
                });
              break;
            }
            
            await supabase
              .from('pages')
              .upsert({
                coin_id: coin.id,
                url,
                status: 'fetched',
                http_status: response.status,
                content_text: extractionResult.content.substring(0, 200000), // 200KB limit
                content_excerpt: excerpt,
                content_hash: contentHash,
                fetched_at: new Date().toISOString()
              });
            
            successfulPages++;
            break; // Success, exit retry loop
          } else if (response.status === 429 || response.status >= 500) {
            // Exponential backoff for rate limits and server errors
            attempt++;
            if (attempt < maxAttempts) {
              const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000; // 2^n seconds + jitter
              console.log(`HTTP ${response.status}, attempt ${attempt}/${maxAttempts}, waiting ${Math.round(waitTime/1000)}s`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
              console.error(`Failed to fetch ${url} after ${maxAttempts} attempts: ${response.status}`);
              await supabase
                .from('pages')
                .upsert({
                  coin_id: coin.id,
                  url,
                  status: 'failed',
                  http_status: response.status,
                  content_excerpt: `Failed after ${maxAttempts} attempts: ${response.status}`,
                  fetched_at: new Date().toISOString()
                });
            }
          } else {
            // Other errors, don't retry
            console.error(`HTTP error for ${url}: ${response.status}`);
            await supabase
              .from('pages')
              .upsert({
                coin_id: coin.id,
                url,
                status: 'failed',
                http_status: response.status,
                content_excerpt: `HTTP error: ${response.status}`,
                fetched_at: new Date().toISOString()
              });
            break;
          }
        } catch (error) {
          attempt++;
          if (attempt < maxAttempts) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`Fetch error for ${url}, attempt ${attempt}/${maxAttempts}, waiting ${Math.round(waitTime/1000)}s`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            console.error(`Error fetching page ${url}:`, error);
            await supabase
              .from('pages')
              .upsert({
                coin_id: coin.id,
                url,
                status: 'failed',
                http_status: null,
                content_excerpt: `Fetch error: ${error.message}`,
                fetched_at: new Date().toISOString()
              });
          }
        }
      }
      
      // Rate limiting between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Update coin status based on page fetch results
    if (successfulPages === 0) {
      console.log(`No pages successfully fetched for coin ${coin.id}, marking as insufficient_data`);
      await supabase
        .from('coins')
        .update({ status: 'insufficient_data' })
        .eq('id', coin.id);
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

// Epic A4: Enhanced content extraction with Mozilla Readability + JS detection
async function extractContentWithReadability(html: string, url: string): Promise<{content: string, isJsHeavy: boolean}> {
  try {
    const dom = new JSDOM(html, { url });
    const document = dom.window.document;

    // Check if page is JS-heavy/SPA by looking for indicators
    const isJsHeavy = detectJsHeavyPage(html, document);
    
    // Try Mozilla Readability first
    const reader = new Readability(document);
    const article = reader.parse();
    
    if (article && article.textContent && article.textContent.trim().length > 100) {
      console.log(`Readability extraction successful for ${url}: ${article.textContent.length} chars`);
      return {
        content: cleanupExtractedText(article.textContent),
        isJsHeavy
      };
    }
    
    // Fallback to improved manual extraction
    console.log(`Readability failed for ${url}, using fallback extraction`);
    const fallbackText = extractCleanTextImproved(html);
    
    return {
      content: fallbackText,
      isJsHeavy: isJsHeavy && fallbackText.length < 200 // Only mark as JS-heavy if also poor extraction
    };
    
  } catch (error) {
    console.log(`Content extraction error for ${url}:`, error.message);
    return {
      content: extractCleanTextFallback(html),
      isJsHeavy: true
    };
  }
}

function detectJsHeavyPage(html: string, document: any): boolean {
  // Look for SPA/JS framework indicators
  const jsIndicators = [
    /<div[^>]*id=["\']?react-root["\']?/i,
    /<div[^>]*id=["\']?root["\']?/i,
    /<script[^>]*src=[^>]*react[^>]*>/i,
    /<script[^>]*src=[^>]*angular[^>]*>/i,
    /<script[^>]*src=[^>]*vue[^>]*>/i,
    /ng-app|ng-controller|v-app|v-if/i,
    /"__NEXT_DATA__"/i,
    /"__NUXT__"/i
  ];
  
  const hasJsFramework = jsIndicators.some(regex => regex.test(html));
  
  // Check for very little static text content vs script tags
  const scriptTags = (html.match(/<script/gi) || []).length;
  const textContent = document.body ? document.body.textContent?.trim().length || 0 : 0;
  const highScriptRatio = scriptTags > 5 && textContent < 500;
  
  // Check for common loading/placeholder text
  const commonLoadingTexts = /loading|please wait|javascript.*required|enable.*javascript/i;
  const hasLoadingText = commonLoadingTexts.test(html);
  
  return hasJsFramework || highScriptRatio || hasLoadingText;
}

// Epic A4: PDF processing function (simplified - no parsing for now)
async function processPdfDocument(coinId: string, url: string): Promise<{success: boolean}> {
  try {
    console.log(`PDF detected but parsing not supported in Edge Functions: ${url}`);
    
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'NewCoinRadarResearchBot/1.0 (research purposes)',
      },
    });
    
    await supabase
      .from('pages')
      .upsert({
        coin_id: coinId,
        url,
        status: 'pdf_detected',
        http_status: response.status,
        content_excerpt: 'PDF document detected - manual review recommended',
        content_text: `PDF whitepaper detected at ${url}. Manual review recommended for tokenomics and technical details.`,
        content_hash: await createContentHash(`PDF:${url}`),
        fetched_at: new Date().toISOString()
      });
    
    console.log(`PDF marked for manual review: ${url}`);
    return { success: true };
    
  } catch (error) {
    console.error(`Error processing PDF ${url}:`, error.message);
    await supabase
      .from('pages')
      .upsert({
        coin_id: coinId,
        url,
        status: 'failed',
        http_status: null,
        content_excerpt: `PDF processing error: ${error.message}`,
        fetched_at: new Date().toISOString()
      });
    return { success: false };
  }
}

// Epic A4: Content hash for deduplication
async function createContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

function cleanupExtractedText(text: string): string {
  return text
    .replace(/\s+/g, ' ')  // Multiple whitespace to single space
    .replace(/\n\s*\n/g, '\n\n')  // Multiple newlines to double
    .replace(/[^\S\n]+/g, ' ')  // Multiple non-newline whitespace to single space
    .replace(/(.)\1{4,}/g, '$1$1$1')  // Reduce repeated characters (more than 4) to 3
    .trim();
}

function extractCleanTextFallback(html: string): string {
  // Enhanced text extraction using readability-like approach (fallback)
  // Remove scripts, styles, navigation, and other non-content elements
  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Extract main content areas - prioritize article, main, content areas
  const mainContentRegex = /<(article|main|div[^>]*class="[^"]*content[^"]*")[^>]*>([\s\S]*?)<\/\1>/gi;
  const mainMatches = cleaned.match(mainContentRegex);
  
  if (mainMatches && mainMatches.length > 0) {
    // Use the largest content block
    cleaned = mainMatches.reduce((a, b) => a.length > b.length ? a : b);
  }

  // Remove remaining HTML tags but preserve paragraph breaks
  cleaned = cleaned
    .replace(/<\/?(p|br|div)[^>]*>/gi, '\n')
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n\n')
    .replace(/<[^>]*>/g, ' ');
  
  // Clean up whitespace and normalize
  cleaned = cleaned
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double
    .replace(/[ \t]+/g, ' ') // Multiple spaces to single
    .replace(/\n /g, '\n') // Remove leading spaces on lines
    .trim();
  
  return cleaned.substring(0, 200000); // 200KB limit
}

async function extractFacts() {
  console.log('Extracting facts using LLM...');
  
  // Get settings to check for ChatGPT Pro API key
  const { data: settings } = await supabase
    .from('settings')
    .select('chatgpt_pro_api_key')
    .eq('id', 1)
    .single();

  // Use ChatGPT Pro API key if available, otherwise fallback to OPENAI_API_KEY
  const apiKey = settings?.chatgpt_pro_api_key || Deno.env.get('OPENAI_API_KEY');
  const model = settings?.chatgpt_pro_api_key ? 'gpt-5-2025-08-07' : 'gpt-4o-mini';
  
  console.log(`Using model: ${model} with ${settings?.chatgpt_pro_api_key ? 'user' : 'default'} API key`);
  
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
  
  if (!apiKey) {
    throw new Error('No API key configured');
  }
  
  for (const coin of coins) {
    try {
      const pages = coin.pages as Array<{url: string, content_text: string}>;
      
      // Filter out pages with insufficient content
      const validPages = pages.filter(p => 
        p.content_text && 
        p.content_text.length > 100 && 
        !p.content_text.startsWith('Invalid') &&
        !p.content_text.startsWith('Skipped')
      );
      
      if (validPages.length === 0) {
        console.log(`No valid pages found for ${coin.name}, marking as insufficient_data`);
        await supabase
          .from('coins')
          .update({ status: 'insufficient_data' })
          .eq('id', coin.id);
        continue;
      }
      
      const extractorPrompt = `
COIN: ${coin.name} (${coin.symbol}) – ${coin.coingecko_coin_url}

PAGES:
${validPages.map(p => `URL: ${p.url}\nCONTENT: ${p.content_text?.substring(0, 8000) || 'No content'}`).join('\n\n')}

TASK: Extract structured evidence and return ONLY valid JSON (no markdown, no code blocks) in this exact schema:
{
  "claims": [
    {
      "id": "SEC-001",
      "pillar": "security|tokenomics|team|product|market|community|traction",
      "type": "audit|supply|vesting|doxxed_team|mvp|roadmap_date|partner|integration|competitor|channel|risk_language|legal",
      "value": "Short factual statement",
      "proof_urls": ["url1", "url2"],
      "excerpt": "Direct quote from source (≤300 chars)",
      "confidence_local": 0.8
    }
  ],
  "on_chain_traction": {
    "partners": [{"name": "Partner Name", "proof_url": "url"}],
    "integrations": [{"name": "Platform", "type": "dex|l2|wallet|oracle|infra|exchange", "proof_url": "url"}]
  },
  "contradictions": [
    {
      "claim_ids": ["SEC-001", "SEC-002"], 
      "reason": "Supply numbers differ between whitepaper and website",
      "proof_urls": ["url1", "url2"]
    }
  ],
  "red_flags": {
    "guaranteed_returns": ["phrase1", "phrase2"],
    "audit_claim_no_source": true,
    "suspected_copycat": {"brand": "Bitcoin", "reason": "domain similarity", "proof_urls": ["url"]},
    "misleading_claims": [{"claim_id": "MKT-001", "reason": "Exaggerated partnership claim"}]
  }
}

REQUIREMENTS:
- Return ONLY the JSON object, no markdown formatting, no backticks, no explanations
- Generate claims for ALL pillars: security, tokenomics, team, product, market, community, traction
- Each claim MUST have proof_urls from the provided PAGES and direct excerpts
- Use "unknown" for pillar if no reliable information found - do NOT guess or infer
- Detect partners/integrations mentioned with "integrate", "partner", "listed", "supports", "built on"
- Flag guaranteed returns phrases like "guaranteed profits", "risk-free", "100% returns"
- Flag audit claims without source links
- Flag suspected copycats (similar names to major projects)
- All arrays must be valid JSON (use [] for empty, not null)
`;

      // Prepare request body based on model
      const requestBody: any = {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a FACTUAL EXTRACTOR. Return ONLY valid JSON conforming to schema. NO explanations, NO text outside JSON. Unknown = "unknown". Each claim must have ≥1 proof_url from PAGES plus excerpt (≤300 chars). Detect contradictions and red_flags (guaranteed_returns, audit_claim_no_source, suspected_copycat).'
          },
          {
            role: 'user', 
            content: extractorPrompt
          }
        ]
      };

      // Use correct parameters based on model
      if (model === 'gpt-5-2025-08-07') {
        requestBody.max_completion_tokens = 2500;
        // GPT-5 doesn't support temperature parameter
      } else {
        requestBody.max_tokens = 2500;
        requestBody.temperature = 0.0; // Set to 0.0 for strict JSON output
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        console.error(`OpenAI API error: ${response.status} ${response.statusText}`);
        
        // Mark coin as failed if API error persists
        await supabase
          .from('coins')
          .update({ status: 'failed' })
          .eq('id', coin.id);
        continue;
      }
      
      const result = await response.json();
      let extractedText = result.choices[0].message.content;
      
      // Clean up common AI response formatting issues
      extractedText = extractedText.trim();
      
      // Remove markdown code block formatting if present
      if (extractedText.startsWith('```json')) {
        extractedText = extractedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (extractedText.startsWith('```')) {
        extractedText = extractedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Remove any leading/trailing non-JSON text
      const jsonStart = extractedText.indexOf('{');
      const jsonEnd = extractedText.lastIndexOf('}');
      
      if (jsonStart === -1 || jsonEnd === -1 || jsonStart >= jsonEnd) {
        console.error(`No valid JSON found in AI response for ${coin.name}`);
        console.log('AI Response:', extractedText.substring(0, 500));
        
        // Try with a simpler fallback prompt
        const fallbackData = {
          team: { doxxed: "unknown", members: [] },
          tokenomics: { supply: "unknown", vesting: "unknown", utility: "unknown", proof_urls: [] },
          security: { audit_links: [], owner_controls: "unknown", risky_language: [], proof_urls: [] },
          product: { mvp: "unknown", roadmap_items: [], proof_urls: [] },
          market: { narrative: "unknown", competitors: [], proof_urls: [] },
          community: { channels: [], notable_engagement: "unknown", proof_urls: [] },
          on_chain_traction: { partnerships: [], integrations: [], contracts_verified: false, proof_urls: [] },
          brand_analysis: { similar_names: [], copycat_indicators: [], misleading_claims: [] },
          meta: { pages_used: validPages.map(p => ({ url: p.url, excerpt: p.content_text.substring(0, 300) })) }
        };
        
        await supabase
          .from('facts')
          .insert({
            coin_id: coin.id,
            extracted: fallbackData,
            sources: { pages: validPages.map(p => p.url), error: 'AI_PARSE_FALLBACK' }
          });
          
        console.log(`Used fallback data for ${coin.name} due to AI parse error`);
        continue;
      }
      
      extractedText = extractedText.substring(jsonStart, jsonEnd + 1);
      
      let extractedData;
      try {
        extractedData = JSON.parse(extractedText);
        
        // Validate the structure has required fields for new claims-based schema
        if (!extractedData.claims || !Array.isArray(extractedData.claims)) {
          console.warn(`Invalid claims structure for ${coin.name}, using fallback`);
          extractedData.claims = [];
        }
        
        // Ensure required structures exist
        if (!extractedData.on_chain_traction) {
          extractedData.on_chain_traction = { partners: [], integrations: [] };
        }
        if (!extractedData.contradictions) {
          extractedData.contradictions = [];
        }
        if (!extractedData.red_flags) {
          extractedData.red_flags = {
            guaranteed_returns: [],
            audit_claim_no_source: false,
            suspected_copycat: null,
            misleading_claims: []
          };
        }
        
      } catch (parseError) {
        console.error(`JSON parse error for ${coin.name}:`, parseError.message);
        console.log('Attempted to parse:', extractedText.substring(0, 500));
        
        // Mark coin for retry or as failed
        await supabase
          .from('coins')
          .update({ status: 'retry_pending' })
          .eq('id', coin.id);
        continue;
      }
      
      await supabase
        .from('facts')
        .insert({
          coin_id: coin.id,
          extracted: extractedData,
          sources: { pages: validPages.map(p => p.url) }
        });
        
      console.log(`Successfully extracted facts for ${coin.name}`);
      
    } catch (error) {
      console.error(`Error extracting facts for coin ${coin.id}:`, error);
      
      // Mark coin as failed after multiple extraction errors
      await supabase
        .from('coins')
        .update({ status: 'failed' })
        .eq('id', coin.id);
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
      const scores = calculateCoinScore(facts, weights, coin);
      
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
        .update({ status: 'deep_analysis_pending' })
        .eq('id', coin.id);
        
      console.log(`Scored ${coin.name}: ${scores.overall}`);
      
      // High score achieved - could add other notifications here if needed
      if (scores.overall >= 70 && scores.confidence >= 0.7) {
        console.log(`High score alert: ${coin.name} achieved score ${scores.overall} with confidence ${scores.confidence}`);
      }
    } catch (error) {
      console.error(`Error scoring coin ${coin.id}:`, error);
    }
  }
}

function calculateCoinScore(facts: any, weights: Record<string, number>, coin: any) {
  const pillars: Record<string, number> = {};
  let penalties = 0;
  const red_flags: string[] = [];
  const green_flags: string[] = [];
  let overall_cap: number | null = null;
  
  // Web-Only Scoring with exact weights specified
  const w = weights || DEFAULT_SCORING_WEIGHTS;
  
  // Extract claims by pillar for scoring
  const claimsByPillar = (facts.claims || []).reduce((acc: any, claim: any) => {
    if (!acc[claim.pillar]) acc[claim.pillar] = [];
    acc[claim.pillar].push(claim);
    return acc;
  }, {});
  
  // Security & Rug-Pull Detection (15%) - based on security claims
  let securityScore = calculateSecurityScoreFromClaims(claimsByPillar.security || []);
  pillars.security_rug_pull = (securityScore / 100) * w.security_rug_pull;
  
  // Tokenomics (10%) - based on tokenomics claims  
  let tokenomicsScore = calculateTokenomicsScoreFromClaims(claimsByPillar.tokenomics || []);
  pillars.tokenomics = (tokenomicsScore / 100) * w.tokenomics;
  
  // Team & Transparency (20%) - based on team claims
  let teamScore = calculateTeamScoreFromClaims(claimsByPillar.team || []);
  pillars.team_transparency = (teamScore / 100) * w.team_transparency;
  
  // Product & Roadmap (20%) - based on product claims
  let productScore = calculateProductScoreFromClaims(claimsByPillar.product || []);
  pillars.product_roadmap = (productScore / 100) * w.product_roadmap;
  
  // On-chain Traction (10%) - based on traction claims and on_chain_traction data
  let tractionScore = calculateTractionScoreFromClaims(claimsByPillar.traction || [], facts.on_chain_traction);
  pillars.onchain_traction = (tractionScore / 100) * w.onchain_traction;
  
  // Market/Narrative Fit (15%) - based on market claims
  let marketScore = calculateMarketScoreFromClaims(claimsByPillar.market || []);
  pillars.market_narrative = (marketScore / 100) * w.market_narrative;
  
  // Community (10%) - based on community claims
  let communityScore = calculateCommunityScoreFromClaims(claimsByPillar.community || []);
  pillars.community = (communityScore / 100) * w.community;
  
  // Calculate base score from pillars
  const baseScore = Object.values(pillars).reduce((sum, score) => sum + score, 0);
  
  // Apply penalties and caps using Epic A3 logic
  const penaltyResult = applyPenaltiesAndCaps(facts, pillars, baseScore);
  
  // Use penalty result values
  const finalScore = penaltyResult.finalScore;
  overall_cap = penaltyResult.overall_cap;
  penalties = Math.abs(penaltyResult.penalties); // Store absolute value for UI
  red_flags.push(...penaltyResult.red_flags);
  green_flags.push(...penaltyResult.green_flags);
  
  // Calculate confidence based on evidence quality
  const totalClaims = facts.claims?.length || 0;
  const claimsWithProof = (facts.claims || []).filter((c: any) => c.proof_urls?.length > 0).length;
  const coverage = totalClaims > 0 ? claimsWithProof / totalClaims : 0;
  
  // Get unique domains from proof URLs
  const allProofUrls = (facts.claims || []).flatMap((c: any) => c.proof_urls || []);
  const uniqueDomains = [...new Set(allProofUrls.map((url: string) => {
    try { return new URL(url).hostname; } catch { return url; }
  }))].length;
  const sourceDiversity = Math.min(uniqueDomains / 3, 1);
  
  // Simple freshness (assume recent for now)
  const freshness = 0.8;
  
  const confidence = Math.round((0.6 * coverage + 0.2 * sourceDiversity + 0.2 * freshness) * 100) / 100;
  
  return {
    overall: Math.round(finalScore),
    overall_cap,
    confidence,
    pillars,
    penalties,
    red_flags,
    green_flags,
    confidence_factors: {
      coverage,
      source_diversity: sourceDiversity,
      freshness
    }
  };
}

function applyPenaltiesAndCaps(facts: any, pillars: any, baseScore: number): { 
  finalScore: number, 
  overall_cap: number | null, 
  penalties: number,
  red_flags: string[], 
  green_flags: string[] 
} {
  let penalties = 0;
  const red_flags: string[] = [];
  const green_flags: string[] = [];
  
  // Epic A3: Apply penalties based on red flags
  if (facts.red_flags) {
    // Guaranteed returns penalty: -5 to -15 based on phrase severity
    if (facts.red_flags.guaranteed_returns?.length > 0) {
      const phrases = facts.red_flags.guaranteed_returns;
      let guaranteePenalty = 0;
      phrases.forEach((phrase: string) => {
        if (phrase.toLowerCase().includes('guaranteed') || phrase.toLowerCase().includes('100%')) {
          guaranteePenalty -= 15; // Severe penalty
        } else if (phrase.toLowerCase().includes('risk-free') || phrase.toLowerCase().includes('safe')) {
          guaranteePenalty -= 10; // Medium penalty  
        } else {
          guaranteePenalty -= 5; // Base penalty
        }
      });
      penalties += guaranteePenalty;
      red_flags.push(`Guaranteed returns language detected (${guaranteePenalty} penalty)`);
    }
    
    // Audit claim without source penalty: -3
    if (facts.red_flags.audit_claim_no_source === true) {
      penalties -= 3;
      red_flags.push("Audit claimed without verifiable source (-3 penalty)");
    }
    
    // Suspected copycat penalty: -7 (soft penalty, reviewable)  
    if (facts.red_flags.suspected_copycat) {
      penalties -= 7;
      red_flags.push(`Suspected copycat of ${facts.red_flags.suspected_copycat.brand} (-7 penalty)`);
    }
  }
  
  // Check for contradictions and misleading claims -> overall cap at 20
  let overall_cap = null;
  const hasContradictions = facts.contradictions && facts.contradictions.length > 0;
  const hasMisleadingClaims = facts.red_flags?.misleading_claims?.length > 0;
  
  if (hasContradictions || hasMisleadingClaims) {
    overall_cap = 20;
    red_flags.push("Score capped at 20 due to misleading/contradictory information");
  }
  
  // Add green flags based on positive findings
  if (facts.claims) {
    const auditClaims = facts.claims.filter((c: any) => c.type === 'audit' && c.proof_urls?.length > 0);
    if (auditClaims.length > 0) {
      green_flags.push("Audited by third party");
    }
    
    const mvpClaims = facts.claims.filter((c: any) => c.type === 'mvp' && c.value?.toLowerCase().includes('yes'));
    if (mvpClaims.length > 0) {
      green_flags.push("MVP/Demo available");
    }
    
    const tokenomicsClaims = facts.claims.filter((c: any) => c.pillar === 'tokenomics' && c.proof_urls?.length > 0);
    if (tokenomicsClaims.length >= 2) {
      green_flags.push("Tokenomics documented");
    }
    
    const communityClaims = facts.claims.filter((c: any) => c.pillar === 'community');
    if (communityClaims.length >= 2) {
      green_flags.push("Active on multiple channels");
    }
  }
  
  // Calculate final score with penalties applied
  let finalScore = baseScore + penalties;
  
  // Apply overall cap if set
  if (overall_cap !== null) {
    finalScore = Math.min(overall_cap, finalScore);
  }
  
  // Ensure score stays within bounds
  finalScore = Math.max(0, Math.min(100, finalScore));
  
  return {
    finalScore: Math.round(finalScore),
    overall_cap,
    penalties,
    red_flags,
    green_flags
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

// New claims-based scoring functions
function calculateSecurityScoreFromClaims(securityClaims: any[]): number {
  let score = 0;
  
  // Check for audit claims
  const auditClaims = securityClaims.filter(c => c.type === 'audit');
  if (auditClaims.length > 0) {
    score += 60; // Base score for having audits
    if (auditClaims.length > 1) score += 20; // Multiple audits bonus
  }
  
  // Check for risk language
  const riskClaims = securityClaims.filter(c => c.type === 'risk_language');
  if (riskClaims.length > 0) {
    score -= 30; // Penalty for risky language
  }
  
  // Check for legal compliance claims
  const legalClaims = securityClaims.filter(c => c.type === 'legal');
  if (legalClaims.length > 0) {
    score += 20; // Bonus for legal compliance
  }
  
  return Math.max(0, Math.min(100, score));
}

function calculateTokenomicsScoreFromClaims(tokenomicsClaims: any[]): number {
  let score = 0;
  
  // Check for supply information
  const supplyClaims = tokenomicsClaims.filter(c => c.type === 'supply');
  if (supplyClaims.length > 0) {
    score += 40;
  }
  
  // Check for vesting schedule
  const vestingClaims = tokenomicsClaims.filter(c => c.type === 'vesting');
  if (vestingClaims.length > 0) {
    score += 35;
  }
  
  // Bonus for comprehensive tokenomics
  if (supplyClaims.length > 0 && vestingClaims.length > 0) {
    score += 25;
  }
  
  return Math.max(0, Math.min(100, score));
}

function calculateTeamScoreFromClaims(teamClaims: any[]): number {
  let score = 0;
  
  // Check for doxxed team
  const doxxedClaims = teamClaims.filter(c => c.type === 'doxxed_team');
  if (doxxedClaims.length > 0) {
    const isDoxxed = doxxedClaims.some(c => c.value?.toLowerCase().includes('yes') || c.value?.toLowerCase().includes('true'));
    if (isDoxxed) score += 70;
  }
  
  // Additional team information
  if (teamClaims.length > 1) {
    score += 30; // Bonus for detailed team info
  }
  
  return Math.max(0, Math.min(100, score));
}

function calculateProductScoreFromClaims(productClaims: any[]): number {
  let score = 0;
  
  // Check for MVP
  const mvpClaims = productClaims.filter(c => c.type === 'mvp');
  if (mvpClaims.length > 0) {
    const hasMvp = mvpClaims.some(c => c.value?.toLowerCase().includes('yes'));
    if (hasMvp) score += 50;
  }
  
  // Check for roadmap
  const roadmapClaims = productClaims.filter(c => c.type === 'roadmap_date');
  if (roadmapClaims.length > 0) {
    score += 30;
    if (roadmapClaims.length > 2) score += 20; // Detailed roadmap bonus
  }
  
  return Math.max(0, Math.min(100, score));
}

function calculateTractionScoreFromClaims(tractionClaims: any[], onChainTraction: any): number {
  let score = 0;
  
  // Partners scoring: 0=none, 1=25pts, 2=45pts, 3=65pts, ≥4=85pts
  const partnerCount = onChainTraction?.partners?.length || 0;
  if (partnerCount === 1) score += 25;
  else if (partnerCount === 2) score += 45; 
  else if (partnerCount === 3) score += 65;
  else if (partnerCount >= 4) score += 85;
  
  // Integrations scoring with quality weighting (max additional 15 points)
  const integrations = onChainTraction?.integrations || [];
  let integrationScore = 0;
  integrations.forEach((integration: any) => {
    if (integration.type === 'infra' || integration.type === 'exchange') {
      integrationScore += 4; // Higher value integrations (+1 bonus)
    } else {
      integrationScore += 3; // Standard integrations (dex, l2, wallet, oracle)
    }
  });
  
  // Cap integration bonus at 15 points
  score += Math.min(15, integrationScore);
  
  // Additional traction claims from general mentions
  const partnerClaims = tractionClaims.filter(c => c.type === 'partner');
  const integrationClaims = tractionClaims.filter(c => c.type === 'integration');
  
  if (partnerClaims.length > 0) score += 20;
  if (integrationClaims.length > 0) score += 15;
  
  return Math.max(0, Math.min(100, score));
}

function calculateMarketScoreFromClaims(marketClaims: any[]): number {
  let score = 20; // Base score
  
  // Check for competitor analysis
  const competitorClaims = marketClaims.filter(c => c.type === 'competitor');
  if (competitorClaims.length > 0) {
    score += 40;
  }
  
  // Additional market claims
  if (marketClaims.length > 1) {
    score += 40; // Bonus for comprehensive market analysis
  }
  
  return Math.max(0, Math.min(100, score));
}

function calculateCommunityScoreFromClaims(communityClaims: any[]): number {
  let score = 10; // Base score
  
  // Check for channel presence
  const channelClaims = communityClaims.filter(c => c.type === 'channel');
  if (channelClaims.length > 0) {
    score += 30;
    if (channelClaims.length > 2) score += 30; // Multiple channels bonus
  }
  
  // Additional community information
  if (communityClaims.length > channelClaims.length) {
    score += 30; // Bonus for engagement metrics
  }
  
  return Math.max(0, Math.min(100, score));
}

async function performDeepAnalysis() {
  // Get settings to check for ChatGPT Pro API key
  const { data: settings } = await supabase
    .from('settings')
    .select('chatgpt_pro_api_key')
    .eq('id', 1)
    .single();

  // Use ChatGPT Pro API key if available, otherwise fallback to OPENAI_API_KEY
  const apiKey = settings?.chatgpt_pro_api_key || Deno.env.get('OPENAI_API_KEY');
  const model = settings?.chatgpt_pro_api_key ? 'gpt-5-2025-08-07' : 'gpt-4o-mini';
  
  console.log(`Deep analysis using model: ${model} with ${settings?.chatgpt_pro_api_key ? 'user' : 'default'} API key`);

  if (!apiKey) {
    console.error('No API key configured for deep analysis');
    return;
  }

  // Get coins that are ready for deep analysis
  const { data: coinsForDeepAnalysis, error } = await supabase
    .from('coins')
    .select(`
      *,
      facts!inner(*),
      scores!inner(*),
      pages(*)
    `)
    .eq('status', 'deep_analysis_pending')
    .order('updated_at', { ascending: true })
    .limit(2); // Limit to 2 at a time to respect rate limits

  if (error) {
    console.error('Error fetching coins for deep analysis:', error);
    return;
  }

  if (!coinsForDeepAnalysis?.length) {
    console.log('No coins ready for deep analysis');
    return;
  }

  console.log(`Found ${coinsForDeepAnalysis.length} coins ready for deep analysis`);

  for (const coin of coinsForDeepAnalysis) {
    try {
      console.log(`Starting deep analysis for ${coin.name}...`);
      
      const facts = coin.facts[0]?.extracted as any;
      const scores = coin.scores[0]?.pillars as any;
      const pages = coin.pages || [];
      
      // Prepare comprehensive context for deep analysis
      const contextData = {
        coin: {
          name: coin.name,
          symbol: coin.symbol,
          official_links: coin.official_links
        },
        facts,
        scores,
        pages: pages.map(p => ({
          url: p.url,
          content_excerpt: p.content_excerpt?.substring(0, 1000) // Limit content
        }))
      };

      const deepAnalysisPrompt = `
You are a professional cryptocurrency researcher conducting an in-depth investigation. Analyze the following cryptocurrency comprehensively and provide detailed findings in JSON format.

COIN DATA:
${JSON.stringify(contextData, null, 2)}

Perform a deep dive analysis covering these areas:

1. TEAM_DEEP_DIVE: Research each team member thoroughly
   - Verify LinkedIn profiles and professional backgrounds
   - Check previous projects and their outcomes
   - Identify any red flags in team history
   - Rate team credibility (1-100)

2. PARTNERSHIP_ANALYSIS: Validate all claimed partnerships
   - Verify if partnerships are real or just marketing claims
   - Check mutual confirmation from partner companies
   - Assess partnership quality and strategic value
   - Rate partnership legitimacy (1-100)

3. COMPETITOR_ANALYSIS: Compare with market competitors
   - Identify direct and indirect competitors
   - Compare technology, team, and market position
   - Assess competitive advantages and disadvantages
   - Rate competitive position (1-100)

4. RED_FLAG_ANALYSIS: Deep investigation for warning signs
   - Check for copycat behavior or plagiarized content
   - Look for unrealistic claims or promises
   - Verify technical claims and roadmap feasibility
   - Identify potential rug pull indicators
   - Overall risk assessment (1-100, where 100 = highest risk)

5. SOCIAL_SENTIMENT: Analyze community and social presence
   - Check for fake followers or bot activity
   - Assess genuine community engagement
   - Monitor sentiment trends and discussions
   - Rate social authenticity (1-100)

6. FINANCIAL_DEEP_DIVE: Advanced tokenomics analysis
   - Analyze token distribution and whale wallets
   - Check for unusual trading patterns
   - Verify locked liquidity and vesting schedules
   - Assess financial transparency
   - Rate financial health (1-100)

Return ONLY a valid JSON object with this exact structure:
{
  "team_deep_dive": {
    "analysis": "detailed analysis text",
    "credibility_score": 0,
    "key_findings": ["finding1", "finding2"],
    "red_flags": ["flag1", "flag2"]
  },
  "partnership_analysis": {
    "analysis": "detailed analysis text",
    "legitimacy_score": 0,
    "verified_partnerships": ["partner1", "partner2"],
    "questionable_claims": ["claim1", "claim2"]
  },
  "competitor_analysis": {
    "analysis": "detailed analysis text",
    "competitive_score": 0,
    "main_competitors": ["comp1", "comp2"],
    "advantages": ["adv1", "adv2"],
    "disadvantages": ["dis1", "dis2"]
  },
  "red_flag_analysis": {
    "analysis": "detailed analysis text",
    "risk_score": 0,
    "critical_flags": ["flag1", "flag2"],
    "minor_concerns": ["concern1", "concern2"]
  },
  "social_sentiment": {
    "analysis": "detailed analysis text",
    "authenticity_score": 0,
    "engagement_quality": "high/medium/low",
    "sentiment_trend": "positive/neutral/negative"
  },
  "financial_deep_dive": {
    "analysis": "detailed analysis text",
    "health_score": 0,
    "transparency_rating": "high/medium/low",
    "risk_factors": ["risk1", "risk2"]
  }
}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: 'You are a professional cryptocurrency researcher and due diligence expert. Provide thorough, factual analysis based on available data. Always return valid JSON format.'
            },
            {
              role: 'user',
              content: deepAnalysisPrompt
            }
          ],
          ...(model.startsWith('gpt-5') || model.startsWith('gpt-4.1') || model.startsWith('o3') || model.startsWith('o4') 
            ? { max_completion_tokens: 4000 } 
            : { max_tokens: 4000 })
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API error:', errorData);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const analysisText = data.choices[0].message.content;
      
      let deepAnalysisData;
      try {
        deepAnalysisData = JSON.parse(analysisText);
      } catch (parseError) {
        console.error('Failed to parse deep analysis JSON:', parseError);
        console.log('Raw response:', analysisText);
        throw new Error('Failed to parse deep analysis response');
      }

      // Store deep analysis in database
      const { error: insertError } = await supabase
        .from('deep_analysis')
        .insert({
          coin_id: coin.id,
          team_deep_dive: deepAnalysisData.team_deep_dive,
          partnership_analysis: deepAnalysisData.partnership_analysis,
          competitor_analysis: deepAnalysisData.competitor_analysis,
          red_flag_analysis: deepAnalysisData.red_flag_analysis,
          social_sentiment: deepAnalysisData.social_sentiment,
          financial_deep_dive: deepAnalysisData.financial_deep_dive
        });

      if (insertError) {
        console.error('Error inserting deep analysis:', insertError);
        throw insertError;
      }

      // Update coin status to analyzed (final status)
      await supabase
        .from('coins')
        .update({ 
          status: 'analyzed',
          updated_at: new Date().toISOString()
        })
        .eq('id', coin.id);

      console.log(`Deep analysis completed for ${coin.name}`);
      
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`Error in deep analysis for ${coin.name}:`, error);
      
      // Mark coin as analyzed even if deep analysis fails
      await supabase
        .from('coins')
        .update({ 
          status: 'analyzed',
          updated_at: new Date().toISOString()
        })
        .eq('id', coin.id);
    }
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
  let score = 5; // base score
  
  // On-chain traction from new dedicated field
  if (facts.on_chain_traction) {
    if (facts.on_chain_traction.partnerships && facts.on_chain_traction.partnerships.length > 0) {
      score += Math.min(35, facts.on_chain_traction.partnerships.length * 12);
    }
    
    if (facts.on_chain_traction.integrations && facts.on_chain_traction.integrations.length > 0) {
      score += Math.min(30, facts.on_chain_traction.integrations.length * 10);
    }
    
    if (facts.on_chain_traction.contracts_verified === true) {
      score += 25;
    }
    
    if (facts.on_chain_traction.proof_urls && facts.on_chain_traction.proof_urls.length > 0) {
      score += 5;
    }
  }
  
  // Fallback to market field for legacy compatibility
  if (!facts.on_chain_traction && facts.market) {
    if (facts.market.narrative && facts.market.narrative !== "unknown") {
      if (facts.market.narrative.toLowerCase().includes("partner") ||
          facts.market.narrative.toLowerCase().includes("integration") ||
          facts.market.narrative.toLowerCase().includes("collaboration")) {
        score += 30;
      }
    }
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

async function performDeepAnalysis() {
  // Get coins that are ready for deep analysis
  const { data: coinsForDeepAnalysis, error } = await supabase
    .from('coins')
    .select(`
      *,
      facts!inner(*),
      scores!inner(*),
      pages(*)
    `)
    .eq('status', 'deep_analysis_pending')
    .order('updated_at', { ascending: true })
    .limit(2); // Limit to 2 at a time to respect rate limits

  if (error) {
    console.error('Error fetching coins for deep analysis:', error);
    return;
  }

  if (!coinsForDeepAnalysis?.length) {
    console.log('No coins ready for deep analysis');
    return;
  }

  console.log(`Found ${coinsForDeepAnalysis.length} coins ready for deep analysis`);

  for (const coin of coinsForDeepAnalysis) {
    try {
      console.log(`Starting deep analysis for ${coin.name}...`);
      
      const facts = coin.facts[0]?.extracted as any;
      const scores = coin.scores[0]?.pillars as any;
      const pages = coin.pages || [];
      
      // Prepare comprehensive context for deep analysis
      const contextData = {
        coin: {
          name: coin.name,
          symbol: coin.symbol,
          official_links: coin.official_links
        },
        facts,
        scores,
        pages: pages.map(p => ({
          url: p.url,
          content_excerpt: p.content_excerpt?.substring(0, 1000) // Limit content
        }))
      };

      const deepAnalysisPrompt = `
You are a professional cryptocurrency researcher conducting an in-depth investigation. Analyze the following cryptocurrency comprehensively and provide detailed findings in JSON format.

COIN DATA:
${JSON.stringify(contextData, null, 2)}

Perform a deep dive analysis covering these areas:

1. TEAM_DEEP_DIVE: Research each team member thoroughly
   - Verify LinkedIn profiles and professional backgrounds
   - Check previous projects and their outcomes
   - Identify any red flags in team history
   - Rate team credibility (1-100)

2. PARTNERSHIP_ANALYSIS: Validate all claimed partnerships
   - Verify if partnerships are real or just marketing claims
   - Check mutual confirmation from partner companies
   - Assess partnership quality and strategic value
   - Rate partnership legitimacy (1-100)

3. COMPETITOR_ANALYSIS: Compare with market competitors
   - Identify direct and indirect competitors
   - Compare technology, team, and market position
   - Assess competitive advantages and disadvantages
   - Rate competitive position (1-100)

4. RED_FLAG_ANALYSIS: Deep investigation for warning signs
   - Check for copycat behavior or plagiarized content
   - Look for unrealistic claims or promises
   - Verify technical claims and roadmap feasibility
   - Identify potential rug pull indicators
   - Overall risk assessment (1-100, where 100 = highest risk)

5. SOCIAL_SENTIMENT: Analyze community and social presence
   - Check for fake followers or bot activity
   - Assess genuine community engagement
   - Monitor sentiment trends and discussions
   - Rate social authenticity (1-100)

6. FINANCIAL_DEEP_DIVE: Advanced tokenomics analysis
   - Analyze token distribution and whale wallets
   - Check for unusual trading patterns
   - Verify locked liquidity and vesting schedules
   - Assess financial transparency
   - Rate financial health (1-100)

Return ONLY a valid JSON object with this exact structure:
{
  "team_deep_dive": {
    "analysis": "detailed analysis text",
    "credibility_score": 0,
    "key_findings": ["finding1", "finding2"],
    "red_flags": ["flag1", "flag2"]
  },
  "partnership_analysis": {
    "analysis": "detailed analysis text",
    "legitimacy_score": 0,
    "verified_partnerships": ["partner1", "partner2"],
    "questionable_claims": ["claim1", "claim2"]
  },
  "competitor_analysis": {
    "analysis": "detailed analysis text",
    "competitive_score": 0,
    "main_competitors": ["comp1", "comp2"],
    "advantages": ["adv1", "adv2"],
    "disadvantages": ["dis1", "dis2"]
  },
  "red_flag_analysis": {
    "analysis": "detailed analysis text",
    "risk_score": 0,
    "critical_flags": ["flag1", "flag2"],
    "minor_concerns": ["concern1", "concern2"]
  },
  "social_sentiment": {
    "analysis": "detailed analysis text",
    "authenticity_score": 0,
    "engagement_quality": "high/medium/low",
    "sentiment_trend": "positive/neutral/negative"
  },
  "financial_deep_dive": {
    "analysis": "detailed analysis text",
    "health_score": 0,
    "transparency_rating": "high/medium/low",
    "risk_factors": ["risk1", "risk2"]
  }
}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-2025-08-07', // Use GPT-5 for deep analysis
          messages: [
            {
              role: 'system',
              content: 'You are a professional cryptocurrency researcher and due diligence expert. Provide thorough, factual analysis based on available data. Always return valid JSON format.'
            },
            {
              role: 'user',
              content: deepAnalysisPrompt
            }
          ],
          max_completion_tokens: 4000
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API error:', errorData);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const analysisText = data.choices[0].message.content;
      
      let deepAnalysisData;
      try {
        deepAnalysisData = JSON.parse(analysisText);
      } catch (parseError) {
        console.error('Failed to parse deep analysis JSON:', parseError);
        console.log('Raw response:', analysisText);
        throw new Error('Failed to parse deep analysis response');
      }

      // Store deep analysis in database
      const { error: insertError } = await supabase
        .from('deep_analysis')
        .insert({
          coin_id: coin.id,
          team_deep_dive: deepAnalysisData.team_deep_dive,
          partnership_analysis: deepAnalysisData.partnership_analysis,
          competitor_analysis: deepAnalysisData.competitor_analysis,
          red_flag_analysis: deepAnalysisData.red_flag_analysis,
          social_sentiment: deepAnalysisData.social_sentiment,
          financial_deep_dive: deepAnalysisData.financial_deep_dive
        });

      if (insertError) {
        console.error('Error inserting deep analysis:', insertError);
        throw insertError;
      }

      // Update coin status to analyzed (final status)
      await supabase
        .from('coins')
        .update({ 
          status: 'analyzed',
          updated_at: new Date().toISOString()
        })
        .eq('id', coin.id);

      console.log(`Deep analysis completed for ${coin.name}`);
      
      // Small delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error(`Error in deep analysis for ${coin.name}:`, error);
      
      // Mark coin as analyzed even if deep analysis fails
      await supabase
        .from('coins')
        .update({ 
          status: 'analyzed',
          updated_at: new Date().toISOString()
        })
        .eq('id', coin.id);
    }
  }
}
