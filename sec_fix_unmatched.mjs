#!/usr/bin/env node
/**
 * Fix unmatched companies by manually mapping known CIKs
 * and re-fetching their SEC submissions
 */

import fs from 'fs';
import https from 'https';

const USER_AGENT = 'PanAgoraKG/1.0 veeradittya@example.com';
const RATE_LIMIT_MS = 120;
let lastRequestTime = 0;

function fetchUrl(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const delay = Math.max(0, RATE_LIMIT_MS - (Date.now() - lastRequestTime));
    setTimeout(() => {
      lastRequestTime = Date.now();
      const req = https.get(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json,text/html,*/*' },
        timeout: 15000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrl(res.headers.location, retries).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          if (retries > 0 && res.statusCode === 429) {
            setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 2000);
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', err => retries > 0 ? setTimeout(() => fetchUrl(url, retries-1).then(resolve).catch(reject), 1000) : reject(err));
      req.on('timeout', () => { req.destroy(); retries > 0 ? setTimeout(() => fetchUrl(url, retries-1).then(resolve).catch(reject), 1000) : reject(new Error('Timeout')); });
    }, delay);
  });
}

// Manual CIK mapping for unmatched top companies + others
const manualCIKs = {
  "NVIDIA CORPORATION": { cik: 1045810, ticker: "NVDA" },
  "MASTERCARD INCORPORATED": { cik: 1141391, ticker: "MA" },
  "BANK AMERICA CORP": { cik: 70858, ticker: "BAC" },
  "BRISTOL-MYERS SQUIBB CO": { cik: 14272, ticker: "BMY" },
  "SIMON PPTY GROUP INC NEW": { cik: 1063761, ticker: "SPG" },
  "BANK NEW YORK MELLON CORP": { cik: 1390777, ticker: "BK" },
  "COSTCO WHSL CORP NEW": { cik: 909832, ticker: "COST" },
  "GENERAL MTRS CO": { cik: 1467858, ticker: "GM" },
  "GE AEROSPACE": { cik: 40554, ticker: "GE" },
  "CROWN HLDGS INC": { cik: 23111, ticker: "CCK" },
  "APPLIED MATLS INC": { cik: 6951, ticker: "AMAT" },
  "RTX CORPORATION": { cik: 101829, ticker: "RTX" },
  "FORD MTR CO": { cik: 37996, ticker: "F" },
  "MONOLITHIC PWR SYS INC": { cik: 1280452, ticker: "MPWR" },
  "GENPACT LIMITED": { cik: 1398659, ticker: "G" },
  "IQVIA HLDGS INC": { cik: 1667950, ticker: "IQV" },
  "PAYPAL HLDGS INC": { cik: 1633917, ticker: "PYPL" },
  "D R HORTON INC": { cik: 45012, ticker: "DHI" },
  "COEUR MNG INC": { cik: 215466, ticker: "CDE" },
  "BARRICK MNG CORP": { cik: 756894, ticker: "GOLD" },
  "REPUBLIC SVCS INC": { cik: 1060391, ticker: "RSG" },
  "MEDPACE HLDGS INC": { cik: 1338042, ticker: "MEDP" },
  "CAMDEN PPTY TR": { cik: 906163, ticker: "CPT" },
  "HONEYWELL INTL INC": { cik: 773840, ticker: "HON" },
  "RENAISSANCERE HLDGS LTD": { cik: 913144, ticker: "RNR" },
  "STIFEL FINL CORP": { cik: 720005, ticker: "SF" },
  "NMI HLDGS INC": { cik: 1547903, ticker: "NMIH" },
  "INVESCO EXCH TRADED FD TR II": { cik: 1378872, ticker: "QQQ" },
  "WABTEC": { cik: 943452, ticker: "WAB" },
  "SANMINA CORPORATION": { cik: 897723, ticker: "SANM" },
  "PROG HLDGS INC": { cik: 1524741, ticker: "PRG" },
  "TENET HEALTHCARE CORP": { cik: 70318, ticker: "THC" },
  "HUBBELL INC": { cik: 48898, ticker: "HUBB" },
  "LENNOX INTL INC": { cik: 1069974, ticker: "LII" },
  "MARATHON PETE CORP": { cik: 1510295, ticker: "MPC" },
  "CONOCOPHILLIPS": { cik: 1163165, ticker: "COP" },
  "STRYKER CORP": { cik: 310764, ticker: "SYK" },
  "PROGRESSIVE CORP": { cik: 80661, ticker: "PGR" },
  "TRAVELERS COS INC": { cik: 86312, ticker: "TRV" },
  "PALO ALTO NETWORKS INC": { cik: 1327567, ticker: "PANW" },
  "CROWDSTRIKE HLDGS INC": { cik: 1535527, ticker: "CRWD" },
  "ABBVIE INC": { cik: 1551152, ticker: "ABBV" },
  "UNITEDHEALTH GROUP INC": { cik: 731766, ticker: "UNH" },
  "CIGNA GROUP": { cik: 1739940, ticker: "CI" },
  "NORTHROP GRUMMAN CORP": { cik: 1133421, ticker: "NOC" },
  "LOCKHEED MARTIN CORP": { cik: 936468, ticker: "LMT" },
  "CATERPILLAR INC": { cik: 18230, ticker: "CAT" },
  "DEERE & CO": { cik: 315189, ticker: "DE" },
  "UNION PAC CORP": { cik: 100885, ticker: "UNP" },
  "TARGET CORP": { cik: 27419, ticker: "TGT" },
  "HOME DEPOT INC": { cik: 354950, ticker: "HD" },
  "PROCTER & GAMBLE CO": { cik: 80424, ticker: "PG" },
  "MERCK & CO INC": { cik: 310158, ticker: "MRK" },
  "PFIZER INC": { cik: 78003, ticker: "PFE" },
  "VERIZON COMMUNICATIONS INC": { cik: 732712, ticker: "VZ" },
  "COMCAST CORP NEW": { cik: 1166691, ticker: "CMCSA" },
  "CHEVRON CORP NEW": { cik: 93410, ticker: "CVX" },
  "ADOBE INC": { cik: 796343, ticker: "ADBE" },
  "NETFLIX INC": { cik: 1065280, ticker: "NFLX" },
  "TEXAS INSTRUMENTS INC": { cik: 97476, ticker: "TXN" },
  "MORGAN STANLEY": { cik: 895421, ticker: "MS" },
  "GOLDMAN SACHS GROUP INC": { cik: 886982, ticker: "GS" },
  "BLACKROCK INC": { cik: 1364742, ticker: "BLK" },
  "CHARLES SCHWAB CORP": { cik: 316709, ticker: "SCHW" },
  "SCHWAB CHARLES CORP": { cik: 316709, ticker: "SCHW" },
  "DUKE ENERGY CORP NEW": { cik: 1326160, ticker: "DUK" },
  "AMERICAN EXPRESS CO": { cik: 4962, ticker: "AXP" },
  "T-MOBILE US INC": { cik: 1283699, ticker: "TMUS" },
  "ADVANCED MICRO DEVICES INC": { cik: 2488, ticker: "AMD" },
  "CIGNA GROUP": { cik: 1739940, ticker: "CI" },
  "ELEVANCE HEALTH INC": { cik: 1156039, ticker: "ELV" },
  "PROLOGIS INC": { cik: 1045609, ticker: "PLD" },
  "AMERICAN TOWER CORP NEW": { cik: 1053507, ticker: "AMT" },
  "DIGITAL RLTY TR INC": { cik: 1365135, ticker: "DLR" },
  "EQUINIX INC": { cik: 1101239, ticker: "EQIX" },
  "NEXTERA ENERGY INC": { cik: 753308, ticker: "NEE" },
  "CONSTELLATION ENERGY CORP": { cik: 1868275, ticker: "CEG" },
  "3M CO": { cik: 66740, ticker: "MMM" },
  "INTERNATIONAL BUSINESS MACHS": { cik: 51143, ticker: "IBM" },
  "CISCO SYS INC": { cik: 858877, ticker: "CSCO" },
  "INTEL CORP": { cik: 50863, ticker: "INTC" },
  "LINDE PLC": { cik: 1707925, ticker: "LIN" },
};

async function main() {
  console.log('=== FIXING UNMATCHED COMPANIES ===\n');

  // Load existing data
  const existingSubs = JSON.parse(fs.readFileSync('sec_submissions.json', 'utf-8'));
  const existingMapping = JSON.parse(fs.readFileSync('sec_cik_mapping.json', 'utf-8'));

  // Also fetch company_tickers for secondary lookup
  console.log('Fetching SEC company tickers for secondary lookup...');
  const tickersRaw = await fetchUrl('https://www.sec.gov/files/company_tickers.json');
  const tickers = JSON.parse(tickersRaw);

  // Build reverse lookup: CIK -> info
  const cikToInfo = {};
  for (const key of Object.keys(tickers)) {
    const entry = tickers[key];
    cikToInfo[entry.cik_str] = { ticker: entry.ticker, title: entry.title };
  }

  // Find all unmatched from mapping
  const unmatched = existingMapping.filter(m => !m.matched);
  console.log(`Unmatched companies: ${unmatched.length}`);

  let fixed = 0;
  let stillUnmatched = 0;
  const newSubmissions = {};

  for (const u of unmatched) {
    const manual = manualCIKs[u.issuer];

    if (manual) {
      // Fetch submissions for this company
      const paddedCIK = String(manual.cik).padStart(10, '0');
      const url = `https://data.sec.gov/submissions/CIK${paddedCIK}.json`;

      try {
        const raw = await fetchUrl(url);
        const data = JSON.parse(raw);

        const recentFilings = data.filings?.recent || {};
        const forms = recentFilings.form || [];
        const dates = recentFilings.filingDate || [];
        const accessions = recentFilings.accessionNumber || [];
        const primaryDocs = recentFilings.primaryDocument || [];
        const descriptions = recentFilings.primaryDocDescription || [];

        let latest10K = null, latest10Q = null;
        const recent8Ks = [];

        for (let i = 0; i < forms.length; i++) {
          if ((forms[i] === '10-K' || forms[i] === '10-K/A') && !latest10K)
            latest10K = { form: forms[i], date: dates[i], accession: accessions[i], doc: primaryDocs[i] };
          if ((forms[i] === '10-Q' || forms[i] === '10-Q/A') && !latest10Q)
            latest10Q = { form: forms[i], date: dates[i], accession: accessions[i], doc: primaryDocs[i] };
          if ((forms[i] === '8-K' || forms[i] === '8-K/A') && dates[i] >= '2025-09-22')
            recent8Ks.push({ form: forms[i], date: dates[i], accession: accessions[i], doc: primaryDocs[i] });
        }

        const filingCounts = {};
        for (const f of forms) filingCounts[f] = (filingCounts[f] || 0) + 1;

        const result = {
          cik: manual.cik,
          ticker: manual.ticker,
          sec_name: data.name,
          sic: data.sic,
          sic_description: data.sicDescription,
          state_of_incorp: data.stateOfIncorporation,
          fiscal_year_end: data.fiscalYearEnd,
          total_filings: forms.length,
          filing_counts: filingCounts,
          latest_10K: latest10K,
          latest_10Q: latest10Q,
          recent_8Ks: recent8Ks.slice(0, 10),
          exchanges: data.exchanges,
          category: data.category,
          entity_type: data.entityType,
        };

        existingSubs[u.issuer] = result;
        newSubmissions[u.issuer] = result;
        fixed++;

        // Update mapping
        const idx = existingMapping.findIndex(m => m.issuer === u.issuer);
        if (idx >= 0) {
          existingMapping[idx].matched = true;
          existingMapping[idx].cik = manual.cik;
          existingMapping[idx].ticker = manual.ticker;
        }
      } catch (err) {
        console.log(`  Error for ${u.issuer}: ${err.message}`);
        stillUnmatched++;
      }
    } else {
      stillUnmatched++;
    }

    if ((fixed + stillUnmatched) % 20 === 0) {
      console.log(`  Progress: ${fixed} fixed, ${stillUnmatched} still unmatched`);
    }
  }

  console.log(`\nFixed: ${fixed}`);
  console.log(`Still unmatched: ${stillUnmatched}`);

  // Now fetch 10-K documents for newly matched top companies
  console.log('\nFetching 10-K documents for newly matched top companies...');

  const topUnmatched = ["NVIDIA CORPORATION", "MASTERCARD INCORPORATED", "BANK AMERICA CORP",
    "BRISTOL-MYERS SQUIBB CO", "SIMON PPTY GROUP INC NEW", "BANK NEW YORK MELLON CORP",
    "COSTCO WHSL CORP NEW", "GENERAL MTRS CO", "GE AEROSPACE", "RTX CORPORATION",
    "APPLIED MATLS INC", "HONEYWELL INTL INC", "FORD MTR CO", "PAYPAL HLDGS INC",
    "LOCKHEED MARTIN CORP", "NORTHROP GRUMMAN CORP", "ADVANCED MICRO DEVICES INC",
    "CONOCOPHILLIPS", "CHEVRON CORP NEW", "CROWDSTRIKE HLDGS INC", "PALO ALTO NETWORKS INC",
    "ABBVIE INC", "UNITEDHEALTH GROUP INC", "PROGRESSIVE CORP", "TRAVELERS COS INC",
    "CATERPILLAR INC", "AMERICAN EXPRESS CO", "MARATHON PETE CORP", "HOME DEPOT INC",
    "PROCTER & GAMBLE CO", "MERCK & CO INC", "PFIZER INC", "STRYKER CORP",
    "ADOBE INC", "NETFLIX INC", "TEXAS INSTRUMENTS INC", "MORGAN STANLEY", "GOLDMAN SACHS GROUP INC"];

  const existing10K = JSON.parse(fs.readFileSync('sec_10k_data.json', 'utf-8'));
  let fetched10K = 0;

  for (const issuer of topUnmatched) {
    const sub = existingSubs[issuer];
    if (!sub || sub.error || !sub.latest_10K) continue;

    const accession = sub.latest_10K.accession.replace(/-/g, '');
    const doc = sub.latest_10K.doc;
    const docUrl = `https://www.sec.gov/Archives/edgar/data/${sub.cik}/${accession}/${doc}`;

    try {
      console.log(`  Fetching 10-K for ${issuer} (${sub.latest_10K.date})...`);
      const raw = await fetchUrl(docUrl);

      const stripHtml = (text) => text.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

      let riskFactors = '';
      const item1APatterns = [
        /Item\s*1A[\.\s\-–]*Risk\s*Factors([\s\S]*?)(?=Item\s*1B|Item\s*2[\.\s])/i,
        /ITEM\s*1A[\.\s\-–]*RISK\s*FACTORS([\s\S]*?)(?=ITEM\s*1B|ITEM\s*2[\.\s])/i,
        /Risk\s*Factors([\s\S]*?)(?=Unresolved\s*Staff\s*Comments|Properties)/i,
      ];
      for (const pattern of item1APatterns) {
        const match = raw.match(pattern);
        if (match && match[1] && match[1].length > 500) { riskFactors = match[1]; break; }
      }

      let geoRevenue = '';
      const geoPatterns = [
        /(?:geographic|segment|region)[\s\S]*?revenue([\s\S]{500,3000}?)(?=\n\n|\<\/table)/i,
      ];
      for (const pattern of geoPatterns) {
        const match = raw.match(pattern);
        if (match) { geoRevenue = match[0].substring(0, 2000); break; }
      }

      let supplyChain = '';
      const supplyPatterns = [
        /(?:significant|major|principal)\s+(?:customer|supplier|vendor)([\s\S]{200,2000}?)(?=\.\s*[A-Z]|\n\n)/i,
        /(?:customer|supplier)\s+concentration([\s\S]{200,2000}?)(?=\.\s*[A-Z]|\n\n)/i,
      ];
      for (const pattern of supplyPatterns) {
        const match = raw.match(pattern);
        if (match) { supplyChain += match[0].substring(0, 1000) + '\n'; }
      }

      existing10K[issuer] = {
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
      fetched10K++;
    } catch (err) {
      console.log(`    Error: ${err.message}`);
      existing10K[issuer] = { error: err.message, filing_date: sub.latest_10K?.date };
    }
  }

  console.log(`Fetched ${fetched10K} additional 10-K documents`);

  // Save updated data
  fs.writeFileSync('sec_submissions.json', JSON.stringify(existingSubs, null, 2));
  fs.writeFileSync('sec_cik_mapping.json', JSON.stringify(existingMapping, null, 2));
  fs.writeFileSync('sec_10k_data.json', JSON.stringify(existing10K, null, 2));

  // Update sec_data.json
  const secData = JSON.parse(fs.readFileSync('sec_data.json', 'utf-8'));
  secData.submissions = existingSubs;
  secData.filing_data = existing10K;

  // Recount stats
  const matchedCount = existingMapping.filter(m => m.matched).length;
  const withSubs = Object.values(existingSubs).filter(s => !s.error).length;
  const with10K = Object.values(existingSubs).filter(s => s.latest_10K).length;
  const with10KDoc = Object.values(existing10K).filter(f => !f.error && f.has_risk_factors).length;

  let totalFilings = 0, t10K = 0, t10Q = 0, t8K = 0;
  for (const sub of Object.values(existingSubs)) {
    if (sub.error) continue;
    totalFilings += sub.total_filings || 0;
    t10K += sub.filing_counts?.['10-K'] || 0;
    t10Q += sub.filing_counts?.['10-Q'] || 0;
    t8K += sub.filing_counts?.['8-K'] || 0;
  }

  secData.stats = {
    holdings_total: existingMapping.length,
    cik_matched: matchedCount,
    submissions_fetched: withSubs,
    companies_with_10K: with10K,
    ten_k_docs_parsed: with10KDoc,
    total_filings_indexed: totalFilings,
    ten_k_total: t10K,
    ten_q_total: t10Q,
    eight_k_total: t8K,
  };

  fs.writeFileSync('sec_data.json', JSON.stringify(secData, null, 2));

  console.log('\n=== UPDATED SEC PIPELINE SUMMARY ===');
  console.log(`Holdings matched to CIK: ${matchedCount}/${existingMapping.length}`);
  console.log(`Submissions fetched: ${withSubs}`);
  console.log(`Companies with 10-K: ${with10K}`);
  console.log(`10-K documents parsed: ${with10KDoc}`);
  console.log(`Total filings indexed: ${totalFilings}`);
  console.log(`  10-K: ${t10K}, 10-Q: ${t10Q}, 8-K: ${t8K}`);
}

main();
