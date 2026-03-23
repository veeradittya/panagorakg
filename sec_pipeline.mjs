#!/usr/bin/env node
/**
 * SEC EDGAR Pipeline for PanAgora KG
 *
 * 1. Maps all 1,176 holdings to SEC CIKs
 * 2. Fetches filing submissions for each company
 * 3. For top 50: fetches 10-K documents and extracts risk factors
 * 4. Records filing metadata (types, dates) for all
 * 5. Outputs sec_data.json for KG enrichment
 *
 * SEC EDGAR rate limit: 10 requests/second
 * User-Agent required: PanAgoraKG/1.0 veeradittya@example.com
 */

import fs from 'fs';
import https from 'https';
import http from 'http';

const USER_AGENT = 'PanAgoraKG/1.0 veeradittya@example.com';
const RATE_LIMIT_MS = 120; // ~8 req/sec (stay under 10)
const TOP_N = 50; // deep analysis for top N
const MAX_RETRIES = 2;

// ============================================================
// HTTP FETCH WITH RATE LIMITING
// ============================================================
let lastRequestTime = 0;

function fetchUrl(url, retries = MAX_RETRIES) {
  return new Promise((resolve, reject) => {
    const delay = Math.max(0, RATE_LIMIT_MS - (Date.now() - lastRequestTime));
    setTimeout(() => {
      lastRequestTime = Date.now();
      const protocol = url.startsWith('https') ? https : http;
      const req = protocol.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json,text/html,*/*',
          'Accept-Encoding': 'identity'
        },
        timeout: 15000
      }, (res) => {
        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrl(res.headers.location, retries).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          if (retries > 0 && res.statusCode === 429) {
            // Rate limited - wait and retry
            setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 2000);
            return;
          }
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', (err) => {
        if (retries > 0) {
          setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 1000);
        } else {
          reject(err);
        }
      });
      req.on('timeout', () => {
        req.destroy();
        if (retries > 0) {
          setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 1000);
        } else {
          reject(new Error(`Timeout for ${url}`));
        }
      });
    }, delay);
  });
}

// ============================================================
// STEP 1: LOAD HOLDINGS
// ============================================================
console.log('=== SEC EDGAR PIPELINE ===\n');
console.log('Step 1: Loading holdings...');

const csvRaw = fs.readFileSync('panagora_portfolio_2025Q4.csv', 'utf-8');
const csvLines = csvRaw.trim().split('\n');
const holdings = csvLines.slice(1).map(line => {
  const vals = line.split(',');
  return {
    issuer: vals[0].trim(),
    cusip: vals[2].trim(),
    value_k: parseInt(vals[3].trim()),
    shares: parseInt(vals[4].trim()),
  };
});
holdings.sort((a, b) => b.value_k - a.value_k);

// Deduplicate (Alphabet has two share classes)
const seen = new Set();
const uniqueHoldings = holdings.filter(h => {
  const key = h.issuer;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`  Loaded ${uniqueHoldings.length} unique holdings (${holdings.length} total with share classes)`);

// ============================================================
// STEP 2: MAP HOLDINGS TO CIKs
// ============================================================
console.log('\nStep 2: Fetching SEC company tickers index...');

async function mapHoldingsToCIKs() {
  // Fetch SEC's company tickers file (maps tickers/names to CIKs)
  const tickersRaw = await fetchUrl('https://www.sec.gov/files/company_tickers.json');
  const tickers = JSON.parse(tickersRaw);

  // Build lookup maps
  const nameToInfo = {}; // normalized name -> {cik, ticker, title}
  const tickerToInfo = {};

  for (const key of Object.keys(tickers)) {
    const entry = tickers[key];
    const normName = entry.title.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
    nameToInfo[normName] = { cik: entry.cik_str, ticker: entry.ticker, title: entry.title };
    tickerToInfo[entry.ticker.toUpperCase()] = { cik: entry.cik_str, ticker: entry.ticker, title: entry.title };
  }

  console.log(`  Loaded ${Object.keys(tickers).length} SEC-registered companies`);

  // Match our holdings
  let matched = 0;
  let unmatched = 0;
  const results = [];

  for (const h of uniqueHoldings) {
    const normIssuer = h.issuer.toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();

    // Try exact name match first
    let info = nameToInfo[normIssuer];

    // Try partial name matches
    if (!info) {
      // Try removing common suffixes
      const shortened = normIssuer.replace(/\s+(INC|CORP|CO|LTD|PLC|LLC|LP|NEW|DEL|CL [A-Z]|COM|SHS)\s*/g, '').trim();
      for (const [name, entry] of Object.entries(nameToInfo)) {
        if (name.startsWith(shortened) || shortened.startsWith(name.split(' ').slice(0, 2).join(' '))) {
          info = entry;
          break;
        }
      }
    }

    // Try even shorter match (first 2 words)
    if (!info) {
      const words = normIssuer.split(/\s+/).slice(0, 2).join(' ');
      if (words.length >= 4) {
        for (const [name, entry] of Object.entries(nameToInfo)) {
          if (name.startsWith(words)) {
            info = entry;
            break;
          }
        }
      }
    }

    if (info) {
      matched++;
      results.push({ ...h, cik: info.cik, ticker: info.ticker, sec_name: info.title, matched: true });
    } else {
      unmatched++;
      results.push({ ...h, cik: null, ticker: null, sec_name: null, matched: false });
    }
  }

  console.log(`  Matched: ${matched}/${uniqueHoldings.length} (${(matched/uniqueHoldings.length*100).toFixed(1)}%)`);
  console.log(`  Unmatched: ${unmatched}`);

  // Show first few unmatched
  const unmatchedList = results.filter(r => !r.matched);
  if (unmatchedList.length > 0) {
    console.log(`  Sample unmatched: ${unmatchedList.slice(0, 10).map(r => r.issuer).join(', ')}`);
  }

  return results;
}

// ============================================================
// STEP 3: FETCH SUBMISSIONS FOR ALL MATCHED COMPANIES
// ============================================================
async function fetchSubmissions(holdingsWithCIK) {
  const matched = holdingsWithCIK.filter(h => h.matched);
  console.log(`\nStep 3: Fetching SEC submissions for ${matched.length} companies...`);
  console.log(`  (Rate limited to ~8 req/sec, ETA: ~${Math.ceil(matched.length / 8 / 60)} minutes)`);

  const results = {};
  let completed = 0;
  let errors = 0;

  for (const h of matched) {
    const paddedCIK = String(h.cik).padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${paddedCIK}.json`;

    try {
      const raw = await fetchUrl(url);
      const data = JSON.parse(raw);

      // Extract recent filings
      const recentFilings = data.filings?.recent || {};
      const forms = recentFilings.form || [];
      const dates = recentFilings.filingDate || [];
      const accessions = recentFilings.accessionNumber || [];
      const primaryDocs = recentFilings.primaryDocument || [];
      const descriptions = recentFilings.primaryDocDescription || [];

      // Find most recent 10-K
      let latest10K = null;
      let latest10Q = null;
      const recent8Ks = [];

      for (let i = 0; i < forms.length; i++) {
        const form = forms[i];
        const date = dates[i];
        const accession = accessions[i];
        const doc = primaryDocs[i];
        const desc = descriptions[i];

        if ((form === '10-K' || form === '10-K/A') && !latest10K) {
          latest10K = { form, date, accession, doc, desc };
        }
        if ((form === '10-Q' || form === '10-Q/A') && !latest10Q) {
          latest10Q = { form, date, accession, doc, desc };
        }
        if (form === '8-K' || form === '8-K/A') {
          // Last 6 months of 8-Ks
          if (date >= '2025-09-22') {
            recent8Ks.push({ form, date, accession, doc, desc });
          }
        }
      }

      // Count all filing types
      const filingCounts = {};
      for (const f of forms) {
        filingCounts[f] = (filingCounts[f] || 0) + 1;
      }

      results[h.issuer] = {
        cik: h.cik,
        ticker: h.ticker,
        sec_name: data.name,
        sic: data.sic,
        sic_description: data.sicDescription,
        state_of_incorp: data.stateOfIncorporation,
        fiscal_year_end: data.fiscalYearEnd,
        total_filings: forms.length,
        filing_counts: filingCounts,
        latest_10K: latest10K,
        latest_10Q: latest10Q,
        recent_8Ks: recent8Ks.slice(0, 10), // limit to 10 most recent
        exchanges: data.exchanges,
        ein: data.ein,
        category: data.category,
        entity_type: data.entityType,
      };

      completed++;
      if (completed % 50 === 0) {
        console.log(`  Progress: ${completed}/${matched.length} (${errors} errors)`);
      }
    } catch (err) {
      errors++;
      results[h.issuer] = { cik: h.cik, ticker: h.ticker, error: err.message };
      completed++;
      if (completed % 50 === 0) {
        console.log(`  Progress: ${completed}/${matched.length} (${errors} errors)`);
      }
    }
  }

  console.log(`  Completed: ${completed} (${errors} errors)`);
  return results;
}

// ============================================================
// STEP 4: FETCH 10-K DOCUMENTS FOR TOP 50
// ============================================================
async function fetch10KDocuments(submissions, holdingsWithCIK) {
  const top50 = holdingsWithCIK.filter(h => h.matched).slice(0, TOP_N);
  console.log(`\nStep 4: Fetching 10-K documents for top ${TOP_N} holdings...`);

  const filingData = {};
  let completed = 0;
  let errors = 0;

  for (const h of top50) {
    const sub = submissions[h.issuer];
    if (!sub || sub.error || !sub.latest_10K) {
      completed++;
      continue;
    }

    const accession = sub.latest_10K.accession.replace(/-/g, '');
    const doc = sub.latest_10K.doc;
    const paddedCIK = String(h.cik).padStart(10, '0');

    // Fetch the filing index first
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${h.cik}/${accession}/${sub.latest_10K.accession}-index.htm`;

    try {
      // Try to fetch the actual 10-K document (usually .htm)
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${h.cik}/${accession}/${doc}`;

      console.log(`  Fetching 10-K for ${h.issuer} (${sub.latest_10K.date})...`);
      const raw = await fetchUrl(docUrl);

      // Extract risk factors section (Item 1A)
      // Look for common patterns in SEC filings
      let riskFactors = '';

      // Try to find Item 1A section
      const item1APatterns = [
        /Item\s*1A[\.\s\-–]*Risk\s*Factors([\s\S]*?)(?=Item\s*1B|Item\s*2[\.\s])/i,
        /ITEM\s*1A[\.\s\-–]*RISK\s*FACTORS([\s\S]*?)(?=ITEM\s*1B|ITEM\s*2[\.\s])/i,
        /Risk\s*Factors([\s\S]*?)(?=Unresolved\s*Staff\s*Comments|Properties)/i,
      ];

      for (const pattern of item1APatterns) {
        const match = raw.match(pattern);
        if (match && match[1] && match[1].length > 500) {
          riskFactors = match[1];
          break;
        }
      }

      // Extract geographic/segment revenue
      let geoRevenue = '';
      const geoPatterns = [
        /(?:geographic|segment|region)[\s\S]*?revenue([\s\S]{500,3000}?)(?=\n\n|\<\/table)/i,
        /Revenue by (?:geography|region|segment)([\s\S]{200,3000}?)(?=\n\n|\<\/table)/i,
      ];

      for (const pattern of geoPatterns) {
        const match = raw.match(pattern);
        if (match) {
          geoRevenue = match[0].substring(0, 2000);
          break;
        }
      }

      // Extract key customers/suppliers
      let supplyChain = '';
      const supplyPatterns = [
        /(?:significant|major|principal)\s+(?:customer|supplier|vendor)([\s\S]{200,2000}?)(?=\.\s*[A-Z]|\n\n)/i,
        /(?:customer|supplier)\s+concentration([\s\S]{200,2000}?)(?=\.\s*[A-Z]|\n\n)/i,
        /(?:sole|single)\s+source\s+(?:supplier|provider)([\s\S]{200,1500}?)(?=\.\s*[A-Z]|\n\n)/i,
      ];

      for (const pattern of supplyPatterns) {
        const match = raw.match(pattern);
        if (match) {
          supplyChain += match[0].substring(0, 1000) + '\n';
        }
      }

      // Strip HTML tags for cleaner text
      const stripHtml = (text) => text.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

      filingData[h.issuer] = {
        filing_url: docUrl,
        filing_date: sub.latest_10K.date,
        doc_size_kb: Math.round(raw.length / 1024),
        has_risk_factors: riskFactors.length > 500,
        risk_factors_raw_length: riskFactors.length,
        risk_factors_excerpt: stripHtml(riskFactors).substring(0, 5000),
        has_geo_revenue: geoRevenue.length > 100,
        geo_revenue_excerpt: stripHtml(geoRevenue).substring(0, 2000),
        has_supply_chain: supplyChain.length > 100,
        supply_chain_excerpt: stripHtml(supplyChain).substring(0, 2000),
      };

      completed++;
    } catch (err) {
      errors++;
      filingData[h.issuer] = { error: err.message, filing_date: sub.latest_10K?.date };
      completed++;
    }
  }

  console.log(`  Completed: ${completed} (${errors} errors)`);
  return filingData;
}

// ============================================================
// STEP 5: FETCH 8-K SUMMARIES FOR TOP 50
// ============================================================
async function fetch8KSummaries(submissions, holdingsWithCIK) {
  const top50 = holdingsWithCIK.filter(h => h.matched).slice(0, TOP_N);
  console.log(`\nStep 5: Fetching recent 8-K events for top ${TOP_N}...`);

  const events8K = {};
  let completed = 0;

  for (const h of top50) {
    const sub = submissions[h.issuer];
    if (!sub || sub.error || !sub.recent_8Ks || sub.recent_8Ks.length === 0) {
      completed++;
      continue;
    }

    const companyEvents = [];

    // Fetch up to 3 most recent 8-Ks per company
    for (const filing of sub.recent_8Ks.slice(0, 3)) {
      try {
        const accession = filing.accession.replace(/-/g, '');
        const docUrl = `https://www.sec.gov/Archives/edgar/data/${h.cik}/${accession}/${filing.doc}`;

        const raw = await fetchUrl(docUrl);
        const stripped = raw.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

        // Extract item numbers from 8-K
        const items = [];
        const itemPattern = /Item\s+(\d+\.\d+)/gi;
        let match;
        while ((match = itemPattern.exec(stripped)) !== null) {
          if (!items.includes(match[1])) items.push(match[1]);
        }

        companyEvents.push({
          date: filing.date,
          accession: filing.accession,
          items: items,
          excerpt: stripped.substring(0, 1500),
        });
      } catch (err) {
        companyEvents.push({ date: filing.date, error: err.message });
      }
    }

    events8K[h.issuer] = companyEvents;
    completed++;

    if (completed % 10 === 0) {
      console.log(`  Progress: ${completed}/${top50.length}`);
    }
  }

  console.log(`  Completed: ${completed}`);
  return events8K;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  try {
    // Step 1-2: Map holdings to CIKs
    const holdingsWithCIK = await mapHoldingsToCIKs();

    // Save CIK mapping
    fs.writeFileSync('sec_cik_mapping.json', JSON.stringify(
      holdingsWithCIK.map(h => ({ issuer: h.issuer, cusip: h.cusip, cik: h.cik, ticker: h.ticker, matched: h.matched })),
      null, 2
    ));
    console.log('  Saved CIK mapping to sec_cik_mapping.json');

    // Step 3: Fetch submissions for ALL matched companies
    const submissions = await fetchSubmissions(holdingsWithCIK);

    // Save submissions
    fs.writeFileSync('sec_submissions.json', JSON.stringify(submissions, null, 2));
    console.log('  Saved submissions to sec_submissions.json');

    // Step 4: Fetch 10-K documents for top 50
    const filingData = await fetch10KDocuments(submissions, holdingsWithCIK);

    // Save filing data
    fs.writeFileSync('sec_10k_data.json', JSON.stringify(filingData, null, 2));
    console.log('  Saved 10-K data to sec_10k_data.json');

    // Step 5: Fetch 8-K summaries for top 50
    const events8K = await fetch8KSummaries(submissions, holdingsWithCIK);

    // Save 8-K data
    fs.writeFileSync('sec_8k_data.json', JSON.stringify(events8K, null, 2));
    console.log('  Saved 8-K data to sec_8k_data.json');

    // ============================================================
    // SUMMARY STATISTICS
    // ============================================================
    const matchedCount = holdingsWithCIK.filter(h => h.matched).length;
    const withSubmissions = Object.values(submissions).filter(s => !s.error).length;
    const with10K = Object.values(submissions).filter(s => s.latest_10K).length;
    const with10KDoc = Object.values(filingData).filter(f => !f.error && f.has_risk_factors).length;
    const with8K = Object.values(events8K).filter(e => e.length > 0).length;

    // Count total filings across all companies
    let totalFilings = 0;
    let total10Ks = 0;
    let total10Qs = 0;
    let total8Ks = 0;
    for (const sub of Object.values(submissions)) {
      if (sub.error) continue;
      totalFilings += sub.total_filings || 0;
      total10Ks += sub.filing_counts?.['10-K'] || 0;
      total10Qs += sub.filing_counts?.['10-Q'] || 0;
      total8Ks += sub.filing_counts?.['8-K'] || 0;
    }

    console.log('\n=== SEC PIPELINE SUMMARY ===');
    console.log(`Holdings matched to CIK: ${matchedCount}/${uniqueHoldings.length}`);
    console.log(`Submissions fetched: ${withSubmissions}`);
    console.log(`Companies with 10-K filings: ${with10K}`);
    console.log(`10-K documents parsed (top 50): ${with10KDoc}`);
    console.log(`Companies with recent 8-K events: ${with8K}`);
    console.log(`Total filings indexed: ${totalFilings}`);
    console.log(`  10-K annual reports: ${total10Ks}`);
    console.log(`  10-Q quarterly reports: ${total10Qs}`);
    console.log(`  8-K current reports: ${total8Ks}`);

    // Compile comprehensive output for KG enrichment
    const secData = {
      pipeline_date: new Date().toISOString(),
      stats: {
        holdings_total: uniqueHoldings.length,
        cik_matched: matchedCount,
        submissions_fetched: withSubmissions,
        companies_with_10K: with10K,
        ten_k_docs_parsed: with10KDoc,
        companies_with_8K: with8K,
        total_filings_indexed: totalFilings,
      },
      submissions,
      filing_data: filingData,
      events_8k: events8K,
    };

    fs.writeFileSync('sec_data.json', JSON.stringify(secData, null, 2));
    console.log('\nFinal output written to sec_data.json');

  } catch (err) {
    console.error('Pipeline error:', err);
    process.exit(1);
  }
}

main();
