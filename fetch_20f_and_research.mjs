#!/usr/bin/env node
/**
 * Phase 2: Fetch 20-F filings for foreign issuers, and generate
 * research docs for companies that have no annual filing at all.
 */

import fs from 'fs';
import https from 'https';
import path from 'path';

const USER_AGENT = 'PanAgoraKG/1.0 veeradittya@example.com';
const RATE_LIMIT_MS = 130;
const FILINGS_DIR = 'filings';
const RESEARCH_DIR = 'research';

let lastRequestTime = 0;

function fetchUrl(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const delay = Math.max(0, RATE_LIMIT_MS - (Date.now() - lastRequestTime));
    setTimeout(() => {
      lastRequestTime = Date.now();
      const req = https.get(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/json,*/*' },
        timeout: 30000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchUrl(res.headers.location, retries).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          if (retries > 0 && (res.statusCode === 429 || res.statusCode >= 500)) {
            setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 3000);
            return;
          }
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', err => retries > 0 ? setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 2000) : reject(err));
      req.on('timeout', () => { req.destroy(); retries > 0 ? setTimeout(() => fetchUrl(url, retries - 1).then(resolve).catch(reject), 2000) : reject(new Error('Timeout')); });
    }, delay);
  });
}

function stripHtml(text) {
  return text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&[a-z]+;/gi, ' ')
    .replace(/&#\d+;/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

function sanitizeDirName(name) {
  return name.replace(/[^a-zA-Z0-9\s\-&]/g, '').replace(/\s+/g, '_').substring(0, 80);
}

async function main() {
  console.log('=== 20-F FETCHER + RESEARCH DOC GENERATOR ===\n');

  const submissions = JSON.parse(fs.readFileSync('sec_submissions.json', 'utf-8'));
  const mapping = JSON.parse(fs.readFileSync('sec_cik_mapping.json', 'utf-8'));
  const existing10K = JSON.parse(fs.readFileSync('sec_10k_data.json', 'utf-8'));

  // ============================================================
  // PART 1: Fetch 20-F filings for foreign issuers
  // ============================================================
  console.log('PART 1: Fetching 20-F filings for foreign issuers...\n');

  let fetched20F = 0, errors20F = 0;

  for (const [issuer, sub] of Object.entries(submissions)) {
    if (sub.error || sub.latest_10K) continue; // skip if has 10-K or errored

    // Look for 20-F filing
    const forms = sub.filing_counts || {};
    if (!forms['20-F'] && !forms['20-F/A'] && !forms['40-F']) continue;

    // Find most recent 20-F
    const recentFilings = { form: [], filingDate: [], accessionNumber: [], primaryDocument: [] };
    // Re-fetch submissions to get filing details
    const paddedCIK = String(sub.cik).padStart(10, '0');
    try {
      const raw = await fetchUrl(`https://data.sec.gov/submissions/CIK${paddedCIK}.json`);
      const data = JSON.parse(raw);
      const rf = data.filings?.recent || {};

      let latest20F = null;
      for (let i = 0; i < (rf.form || []).length; i++) {
        if ((rf.form[i] === '20-F' || rf.form[i] === '40-F') && !latest20F) {
          latest20F = {
            form: rf.form[i],
            date: rf.filingDate[i],
            accession: rf.accessionNumber[i],
            doc: rf.primaryDocument[i]
          };
          break;
        }
      }

      if (!latest20F) continue;

      // Fetch the 20-F document
      const accession = latest20F.accession.replace(/-/g, '');
      const docUrl = `https://www.sec.gov/Archives/edgar/data/${sub.cik}/${accession}/${latest20F.doc}`;

      console.log(`  Fetching ${latest20F.form} for ${issuer} (${latest20F.date})...`);
      const docRaw = await fetchUrl(docUrl);
      const text = stripHtml(docRaw);

      // Extract key sections (20-F has different structure)
      let riskFactors = '';
      const riskPatterns = [
        /Item\s*3[\.\s]*D[\.\s\-–—:]*Risk\s*Factors([\s\S]*?)(?=Item\s*4|Item\s*3[\.\s]*E)/i,
        /RISK\s*FACTORS([\s\S]*?)(?=UNRESOLVED|ITEM\s*4|KEY\s*INFORMATION)/i,
        /Item\s*1A[\.\s\-–—:]*Risk\s*Factors([\s\S]*?)(?=Item\s*1B|Item\s*2)/i,
      ];
      for (const p of riskPatterns) {
        const m = text.match(p);
        if (m && m[1] && m[1].length > 200) { riskFactors = m[1].substring(0, 15000); break; }
      }

      let business = '';
      const bizPatterns = [
        /Item\s*4[\.\s\-–—:]*Information\s+on\s+the\s+Company([\s\S]*?)(?=Item\s*4A|Item\s*5)/i,
        /Item\s*1[\.\s\-–—:]+Business([\s\S]*?)(?=Item\s*1A|Item\s*2)/i,
      ];
      for (const p of bizPatterns) {
        const m = text.match(p);
        if (m && m[1] && m[1].length > 200) { business = m[1].substring(0, 10000); break; }
      }

      const hasRisk = riskFactors.length > 200;

      // Save to 10-K data (works same way)
      existing10K[issuer] = {
        filing_url: docUrl,
        filing_date: latest20F.date,
        filing_type: latest20F.form,
        doc_size_kb: Math.round(docRaw.length / 1024),
        has_risk_factors: hasRisk,
        risk_factors_raw_length: riskFactors.length,
        risk_factors_excerpt: riskFactors.substring(0, 5000),
        has_geo_revenue: false,
        geo_revenue_excerpt: '',
        has_supply_chain: false,
        supply_chain_excerpt: '',
      };

      // Save filing extract
      const dirName = sanitizeDirName(issuer);
      const dir = path.join(FILINGS_DIR, dirName);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(path.join(dir, `${latest20F.form}_${latest20F.date}.txt`), `# ${issuer} — ${latest20F.form} Annual Report
# Filed: ${latest20F.date}
# CIK: ${sub.cik}
# SIC: ${sub.sic_description || 'N/A'}
# Source: ${docUrl}

## BUSINESS DESCRIPTION
${business || '(Not extracted)'}

## RISK FACTORS
${riskFactors || '(Not extracted)'}

---
Document size: ${Math.round(docRaw.length / 1024)} KB
`);

      fetched20F++;
      if (fetched20F % 10 === 0) console.log(`  Progress: ${fetched20F} 20-F/40-F documents fetched`);

    } catch (err) {
      errors20F++;
      // Save error
      const dirName = sanitizeDirName(issuer);
      const dir = path.join(FILINGS_DIR, dirName);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `20-F_ERROR.txt`), `Failed to fetch 20-F: ${err.message}\n`);
    }
  }

  console.log(`\n20-F fetching complete: ${fetched20F} fetched, ${errors20F} errors\n`);

  // ============================================================
  // PART 2: Generate research docs for unmatched companies
  // ============================================================
  console.log('PART 2: Generating research docs for unmatched companies...\n');

  const unmatched = mapping.filter(m => !m.matched);
  let researchDocs = 0;

  for (const u of unmatched) {
    const dirName = sanitizeDirName(u.issuer);
    const dir = path.join(RESEARCH_DIR, dirName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Check if already have data from 10-K fetch
    if (existing10K[u.issuer] && !existing10K[u.issuer].error) continue;

    // Create research doc with available info
    const content = `# ${u.issuer} — Research Profile
# CUSIP: ${u.cusip}
# SEC CIK: Not matched
# Status: Requires manual SEC CIK lookup or web research

## OVERVIEW
Company name from PanAgora 13F filing: ${u.issuer}
CUSIP: ${u.cusip}
This company was not automatically matched to a SEC CIK number.
The abbreviated name in the 13F CSV did not match SEC's registered entity names.

## RECOMMENDED SOURCES
1. SEC EDGAR company search: https://www.sec.gov/cgi-bin/browse-edgar?company=${encodeURIComponent(u.issuer)}&CIK=&type=10-K&dateb=&owner=include&count=10&search_text=&action=getcompany
2. CUSIP lookup: ${u.cusip}
3. Bloomberg Terminal
4. S&P Capital IQ
5. Company investor relations website

## NOTES
- This company is held in PanAgora's Q4 2025 13F portfolio
- The abbreviated SEC issuer name "${u.issuer}" needs manual matching
- Common abbreviations: HLDGS=Holdings, MTR=Motor, SVS=Services, INTL=International, CORP=Corporation
`;

    fs.writeFileSync(path.join(dir, `research_profile.md`), content);
    researchDocs++;
  }

  // Also handle CIK-matched but no annual filing at all (not 10-K or 20-F)
  for (const [issuer, sub] of Object.entries(submissions)) {
    if (sub.error) continue;
    if (sub.latest_10K) continue;
    if (existing10K[issuer] && !existing10K[issuer].error) continue; // already got 20-F

    const forms = sub.filing_counts || {};
    if (forms['20-F'] || forms['40-F']) continue; // handled in Part 1

    const dirName = sanitizeDirName(issuer);
    const dir = path.join(RESEARCH_DIR, dirName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const content = `# ${issuer} — Research Profile
# CIK: ${sub.cik}
# SIC: ${sub.sic_description || 'N/A'}
# Entity type: ${sub.entity_type || 'N/A'}
# Category: ${sub.category || 'N/A'}

## OVERVIEW
This entity files with the SEC but does not have 10-K or 20-F annual reports.
Entity type: ${sub.entity_type || 'Unknown'}
SIC: ${sub.sic} - ${sub.sic_description || 'Unknown'}
Total filings on record: ${sub.total_filings}
Filing types: ${Object.entries(forms).map(([k,v]) => k + ':' + v).join(', ')}

## ENTITY CLASSIFICATION
This may be an ETF, mutual fund, trust, or other non-operating entity.
${forms['N-CSR'] ? 'Has N-CSR filings (investment company)' : ''}
${forms['N-Q'] ? 'Has N-Q filings (investment company)' : ''}
${forms['S-1'] ? 'Has S-1 registration' : ''}

## SEC EDGAR PAGE
https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${sub.cik}&type=&dateb=&owner=include&count=40
`;

    fs.writeFileSync(path.join(dir, `research_profile.md`), content);
    researchDocs++;
  }

  console.log(`Research docs created: ${researchDocs}\n`);

  // Save updated data
  fs.writeFileSync('sec_10k_data.json', JSON.stringify(existing10K, null, 2));

  // Update sec_data.json
  const secData = JSON.parse(fs.readFileSync('sec_data.json', 'utf-8'));
  secData.filing_data = existing10K;
  secData.stats.ten_k_docs_parsed = Object.values(existing10K).filter(f => !f.error && f.has_risk_factors).length;
  fs.writeFileSync('sec_data.json', JSON.stringify(secData, null, 2));

  // Final stats
  const filingDirs = fs.readdirSync(FILINGS_DIR).filter(f => fs.statSync(path.join(FILINGS_DIR, f)).isDirectory()).length;
  const researchDirCount = fs.readdirSync(RESEARCH_DIR).filter(f => fs.statSync(path.join(RESEARCH_DIR, f)).isDirectory()).length;
  const totalParsed = Object.values(existing10K).filter(f => !f.error && f.has_risk_factors).length;

  console.log('=== FINAL STATS ===');
  console.log(`Filing directories: ${filingDirs}`);
  console.log(`Research directories: ${researchDirCount}`);
  console.log(`Total 10-K/20-F/40-F docs with risk factors: ${totalParsed}`);
  console.log(`20-F docs fetched this run: ${fetched20F}`);
  console.log(`Research docs created: ${researchDocs}`);
}

main();
