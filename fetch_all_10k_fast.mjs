#!/usr/bin/env node
/**
 * FAST bulk 10-K fetcher — optimized for speed
 * - Limits download to first 2MB of each document
 * - Simplified text extraction (no heavy regex on full doc)
 * - Parallel fetching with rate limiting
 */

import fs from 'fs';
import https from 'https';
import path from 'path';

const USER_AGENT = 'PanAgoraKG/1.0 veeradittya@example.com';
const RATE_LIMIT_MS = 110;
const MAX_DOC_BYTES = 2 * 1024 * 1024; // 2MB cap
const FILINGS_DIR = 'filings';

let lastRequestTime = 0;
let stats = { fetched: 0, parsed: 0, errors: 0, skipped: 0 };

function fetchUrlLimited(url, maxBytes = MAX_DOC_BYTES) {
  return new Promise((resolve, reject) => {
    const delay = Math.max(0, RATE_LIMIT_MS - (Date.now() - lastRequestTime));
    setTimeout(() => {
      lastRequestTime = Date.now();
      const req = https.get(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,*/*' },
        timeout: 20000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrlLimited(res.headers.location, maxBytes).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        let data = '';
        let bytes = 0;
        res.on('data', chunk => {
          bytes += chunk.length;
          if (bytes <= maxBytes) data += chunk;
          else { res.destroy(); }
        });
        res.on('end', () => resolve(data));
        res.on('close', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    }, delay);
  });
}

function quickStrip(html) {
  // Fast HTML strip — just remove tags and normalize whitespace
  return html.replace(/<[^>]{0,500}>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&[a-z]{1,8};/gi, ' ').replace(/&#\d{1,6};/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n[ \n]+/g, '\n').trim();
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9\s\-&]/g, '').replace(/\s+/g, '_').substring(0, 80);
}

function extractFast(text) {
  // Quick extraction using indexOf for speed instead of regex on full text
  const upper = text.toUpperCase();

  let riskFactors = '(Not extracted)';
  const riskStart = upper.indexOf('RISK FACTORS');
  if (riskStart > 0) {
    // Find next Item heading after risk factors
    const afterRisk = upper.indexOf('ITEM 1B', riskStart + 100);
    const afterRisk2 = upper.indexOf('ITEM 2', riskStart + 100);
    const afterRisk3 = upper.indexOf('UNRESOLVED STAFF', riskStart + 100);
    const ends = [afterRisk, afterRisk2, afterRisk3].filter(x => x > 0);
    const end = ends.length > 0 ? Math.min(...ends) : riskStart + 15000;
    riskFactors = text.substring(riskStart, Math.min(end, riskStart + 15000)).trim();
  }

  let business = '(Not extracted)';
  const bizIdx = upper.indexOf('ITEM 1');
  if (bizIdx >= 0 && bizIdx < upper.indexOf('RISK FACTORS')) {
    const bizEnd = upper.indexOf('ITEM 1A', bizIdx + 10);
    if (bizEnd > bizIdx) {
      business = text.substring(bizIdx, Math.min(bizEnd, bizIdx + 10000)).trim();
    }
  }

  // Geographic revenue — look for common patterns
  let geoRevenue = '(Not extracted)';
  for (const marker of ['United States', 'Americas', 'North America', 'Domestic']) {
    const idx = text.indexOf(marker);
    if (idx > 0) {
      // Look for a nearby revenue-related section
      const context = text.substring(Math.max(0, idx - 200), idx + 2000);
      if (/revenue|sales|income/i.test(context) && /\d/.test(context)) {
        geoRevenue = context.trim();
        break;
      }
    }
  }

  // Supply chain / customers
  let supplyChain = '(Not extracted)';
  for (const marker of ['significant customer', 'major customer', 'largest customer', 'single customer',
                          'customer concentration', '10% of', 'principal supplier', 'sole source']) {
    const idx = upper.indexOf(marker.toUpperCase());
    if (idx > 0) {
      supplyChain = text.substring(idx, Math.min(idx + 2000, text.length)).trim();
      break;
    }
  }

  return { riskFactors, business, geoRevenue, supplyChain };
}

async function main() {
  console.log('=== FAST BULK 10-K FETCHER ===\n');

  const submissions = JSON.parse(fs.readFileSync('sec_submissions.json', 'utf-8'));
  const existing10K = JSON.parse(fs.readFileSync('sec_10k_data.json', 'utf-8'));

  // Find all companies needing 10-K fetch
  const toParse = [];
  for (const [issuer, sub] of Object.entries(submissions)) {
    if (sub.error || !sub.latest_10K) continue;
    const existing = existing10K[issuer];
    if (existing && !existing.error && existing.has_risk_factors) continue;
    toParse.push({ issuer, sub });
  }

  // Also save already-parsed filings that don't have directories yet
  const alreadyParsed = Object.entries(submissions).filter(([issuer, sub]) => {
    if (sub.error || !sub.latest_10K) return false;
    const ex = existing10K[issuer];
    return ex && !ex.error && ex.has_risk_factors;
  });

  for (const [issuer, sub] of alreadyParsed) {
    const dirName = sanitize(issuer);
    const dir = path.join(FILINGS_DIR, dirName);
    const filePath = path.join(dir, `10-K_${sub.latest_10K.date}.txt`);
    if (!fs.existsSync(filePath)) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const ex = existing10K[issuer];
      fs.writeFileSync(filePath, `# ${issuer} — 10-K Annual Report\n# Filed: ${sub.latest_10K.date}\n# CIK: ${sub.cik}\n# SIC: ${sub.sic_description||'N/A'}\n# Source: ${ex.filing_url||'SEC EDGAR'}\n\n## RISK FACTORS (Item 1A)\n${ex.risk_factors_excerpt||'(N/A)'}\n\n## GEOGRAPHIC REVENUE\n${ex.geo_revenue_excerpt||'(N/A)'}\n\n## SUPPLY CHAIN / KEY CUSTOMERS\n${ex.supply_chain_excerpt||'(N/A)'}\n`);
    }
  }
  console.log(`Pre-existing filings: ${alreadyParsed.length} dirs ensured`);
  console.log(`Remaining to fetch: ${toParse.length}`);
  console.log(`ETA at ~8 req/sec: ~${Math.ceil(toParse.length / 8 / 60)} minutes (with 2MB cap)\n`);

  const startTime = Date.now();

  for (let i = 0; i < toParse.length; i++) {
    const { issuer, sub } = toParse[i];
    const accession = sub.latest_10K.accession.replace(/-/g, '');
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${sub.cik}/${accession}/${sub.latest_10K.doc}`;

    try {
      const raw = await fetchUrlLimited(docUrl);
      stats.fetched++;

      const text = quickStrip(raw);
      const sections = extractFast(text);
      const hasRisk = sections.riskFactors !== '(Not extracted)' && sections.riskFactors.length > 100;

      existing10K[issuer] = {
        filing_url: docUrl,
        filing_date: sub.latest_10K.date,
        doc_size_kb: Math.round(raw.length / 1024),
        has_risk_factors: hasRisk,
        risk_factors_raw_length: sections.riskFactors.length,
        risk_factors_excerpt: sections.riskFactors.substring(0, 5000),
        has_geo_revenue: sections.geoRevenue !== '(Not extracted)',
        geo_revenue_excerpt: sections.geoRevenue.substring(0, 2000),
        has_supply_chain: sections.supplyChain !== '(Not extracted)',
        supply_chain_excerpt: sections.supplyChain.substring(0, 2000),
      };

      if (hasRisk) stats.parsed++;

      // Save filing extract
      const dirName = sanitize(issuer);
      const dir = path.join(FILINGS_DIR, dirName);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `10-K_${sub.latest_10K.date}.txt`),
        `# ${issuer} — 10-K Annual Report\n# Filed: ${sub.latest_10K.date}\n# CIK: ${sub.cik}\n# SIC: ${sub.sic_description||'N/A'}\n# Source: ${docUrl}\n\n## BUSINESS DESCRIPTION (Item 1)\n${sections.business}\n\n## RISK FACTORS (Item 1A)\n${sections.riskFactors}\n\n## GEOGRAPHIC REVENUE\n${sections.geoRevenue}\n\n## SUPPLY CHAIN / KEY CUSTOMERS\n${sections.supplyChain}\n\n---\nDoc size: ${Math.round(raw.length/1024)}KB (capped at 2MB)\n`
      );

    } catch (err) {
      stats.errors++;
      existing10K[issuer] = { error: err.message, filing_date: sub.latest_10K?.date };
      const dirName = sanitize(issuer);
      const dir = path.join(FILINGS_DIR, dirName);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `10-K_ERROR.txt`), `Failed: ${err.message}\nURL: ${docUrl}\n`);
    }

    if ((i + 1) % 50 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = stats.fetched / elapsed;
      console.log(`Progress: ${i+1}/${toParse.length} | fetched: ${stats.fetched} | parsed: ${stats.parsed} | errors: ${stats.errors} | ${rate.toFixed(1)} req/s | ${Math.ceil((toParse.length-i-1)/rate/60)}min left`);
      fs.writeFileSync('sec_10k_data.json', JSON.stringify(existing10K, null, 2));
    }
  }

  // Final save
  fs.writeFileSync('sec_10k_data.json', JSON.stringify(existing10K, null, 2));
  const secData = JSON.parse(fs.readFileSync('sec_data.json', 'utf-8'));
  secData.filing_data = existing10K;
  secData.stats.ten_k_docs_parsed = Object.values(existing10K).filter(f => !f.error && f.has_risk_factors).length;
  fs.writeFileSync('sec_data.json', JSON.stringify(secData, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  const dirs = fs.readdirSync(FILINGS_DIR).filter(f => fs.statSync(path.join(FILINGS_DIR, f)).isDirectory()).length;

  console.log(`\n=== COMPLETE (${elapsed}s) ===`);
  console.log(`Fetched: ${stats.fetched} | Parsed: ${stats.parsed} | Errors: ${stats.errors}`);
  console.log(`Total 10-K with risk factors: ${secData.stats.ten_k_docs_parsed}`);
  console.log(`Filing directories: ${dirs}`);
}

main();
