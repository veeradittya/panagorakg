# PanAgora Asset Management — Knowledge Graph Extraction Protocol

## Overview

This document defines the complete protocol for building a knowledge graph around PanAgora Asset Management's portfolio. The output will be integrated into an existing Supabase-backed knowledge graph visualizer.

**Fund**: PanAgora Asset Management Inc
**CIK**: 0000883677
**AUM**: ~$32.9B (Form ADV, March 2025)
**13F Portfolio**: 1,176 holdings, $28.2B (Q4 2025)
**HQ**: One International Place, 24th Floor, Boston, MA 02110
**Ownership**: Jointly owned by employees and Great-West Lifeco Inc. (part of Power Financial Corporation)

---

## 1. Input Files

| File | Description |
|------|-------------|
| `panagora_portfolio_2025Q4.csv` | Full 13F holdings: issuer, CUSIP, value, shares, voting authority |
| `panagora_portfolio_2025Q4.xlsx` | Same data in Excel with formatting |
| `proprietary/` | Directory for user-uploaded proprietary news sources (PDF, DOCX, TXT) |

---

## 2. Output File Format

Produce a single JSON file: **`kg_output.json`**

```json
{
  "metadata": {
    "fund": "PanAgora Asset Management Inc",
    "extraction_date": "2026-03-22",
    "total_nodes": 0,
    "total_edges": 0,
    "events_covered": [],
    "sources_consulted": []
  },
  "nodes": [
    {
      "label": "NVIDIA Corporation",
      "type": "company",
      "description": "Semiconductor company designing GPUs. PanAgora's largest holding at $2.1B (7.5% of portfolio).",
      "metadata": {
        "cusip": "67066G104",
        "ticker": "NVDA",
        "sector": "Technology",
        "industry": "Semiconductors",
        "market_cap_b": 3200,
        "panagora_value_k": 2118004968,
        "panagora_shares": 10306646,
        "panagora_pct": 7.5,
        "sec_filings_reviewed": ["10-K 2025", "10-Q Q3 2025", "8-K 2026-01-15"],
        "key_risks": ["AI chip export restrictions", "China revenue dependency"],
        "key_catalysts": ["Data center demand", "Blackwell GPU cycle"]
      },
      "mention_count": 1,
      "event_ids": ["panagora_portfolio"],
      "causal_depth": 0,
      "causal_role": "core_holding",
      "last_seen_at": null
    }
  ],
  "edges": [
    {
      "source_label": "NVIDIA Corporation",
      "target_label": "Taiwan Semiconductor Manufacturing",
      "relationship": "Primary chip fabrication partner",
      "causal_type": "collaborative",
      "weight": 5,
      "event_ids": ["panagora_portfolio"],
      "metadata": {
        "nature": "TSMC fabricates all NVIDIA GPUs on advanced nodes",
        "risk_factor": "Taiwan geopolitical risk affects both companies",
        "source": "NVDA 10-K 2025, TSMC annual report"
      }
    }
  ]
}
```

---

## 3. Node Schema

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | Unique entity name (use official/canonical name) |
| `type` | string | One of the types below |
| `description` | string | 2-3 sentence description including PanAgora relevance |
| `metadata` | object | Type-specific structured data (see below) |
| `mention_count` | integer | Number of sources that mention this entity |
| `event_ids` | string[] | Always include `"panagora_portfolio"`. Add specific event IDs for thematic clusters |
| `causal_depth` | integer | 0 = core (holding itself), 1 = direct connection, 2 = second-order |
| `causal_role` | string | `"core_holding"`, `"upstream_supplier"`, `"downstream_customer"`, `"competitor"`, `"regulator"`, `"market_factor"`, `"geographic_risk"`, `"executive"`, `"sector_theme"` |
| `last_seen_at` | string or null | ISO timestamp if entity was in news within last 48 hours |

### Entity Types

| Type | Use For | Examples |
|------|---------|---------|
| `company` | Any publicly traded or private company | NVIDIA, Apple, TSMC |
| `person` | Executives, board members, regulators, analysts | Jensen Huang, Tim Cook |
| `organization` | Non-corporate entities: government bodies, NGOs, industry groups | SEC, Federal Reserve, OPEC |
| `location` | Countries, regions, cities relevant to operations | Taiwan, Silicon Valley, China |
| `sector` | Industry sectors and sub-sectors | Semiconductors, Cloud Computing |
| `event` | Specific events affecting holdings | NVDA earnings Q4 2025, Fed rate decision |
| `concept` | Abstract themes, risks, strategies | AI infrastructure buildout, ESG mandates |
| `policy` | Regulations, laws, executive orders | CHIPS Act, EU AI Act, Basel III |
| `market` | Financial instruments, indices, benchmarks | S&P 500, US 10Y Treasury, VIX |
| `fund` | The fund itself and related funds | PanAgora Asset Management, Great-West Lifeco |

### Type-Specific Metadata

**For `company` nodes:**
```json
{
  "cusip": "string",
  "ticker": "string",
  "sector": "string",
  "industry": "string",
  "market_cap_b": 0,
  "panagora_value_k": 0,
  "panagora_shares": 0,
  "panagora_pct": 0.0,
  "sec_filings_reviewed": [],
  "key_risks": [],
  "key_catalysts": [],
  "revenue_b": 0,
  "employees": 0,
  "hq_location": "string",
  "founded": "string"
}
```

**For `person` nodes:**
```json
{
  "title": "CEO",
  "company": "NVIDIA Corporation",
  "tenure_start": "1993",
  "compensation_m": 0,
  "notable_actions": []
}
```

**For `policy` nodes:**
```json
{
  "jurisdiction": "United States",
  "effective_date": "2022-08-09",
  "status": "enacted",
  "affected_sectors": ["Semiconductors"],
  "estimated_impact_b": 52.7
}
```

---

## 4. Edge Schema

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `source_label` | string | Must match a node's `label` exactly |
| `target_label` | string | Must match a node's `label` exactly |
| `relationship` | string | Clear, specific description of the connection |
| `causal_type` | string | One of: `causal`, `correlative`, `hierarchical`, `temporal`, `adversarial`, `collaborative`, `regulatory`, `supply_chain`, `competitive`, `financial` |
| `weight` | integer | 1-10 scale. 10 = critical dependency. 1 = peripheral mention |
| `event_ids` | string[] | Which thematic clusters this edge belongs to |
| `metadata` | object | Additional context |

### Edge Metadata

```json
{
  "nature": "Detailed explanation of the relationship",
  "risk_factor": "How this connection could create risk for PanAgora",
  "opportunity": "How this connection could create upside",
  "source": "Where this information was verified",
  "direction": "upstream|downstream|lateral|regulatory",
  "confidence": "high|medium|low"
}
```

### Causal Types Explained

| Type | Meaning | Example |
|------|---------|---------|
| `supply_chain` | A supplies to B | TSMC fabricates NVIDIA chips |
| `competitive` | A competes with B | AMD vs NVIDIA in GPUs |
| `collaborative` | A partners with B | Microsoft Azure + OpenAI |
| `causal` | A causes/drives B | Fed rate hike → bank profitability |
| `correlative` | A and B move together | Oil price ↔ Energy sector |
| `hierarchical` | A owns/controls B | Alphabet → Google → YouTube |
| `regulatory` | A regulates B | SEC regulates public companies |
| `financial` | Financial relationship | PanAgora holds NVIDIA shares |
| `adversarial` | A opposes/threatens B | Antitrust action vs Big Tech |
| `temporal` | A precedes/triggers B | Earnings miss → stock selloff |

---

## 5. Extraction Process

### Phase 1: Core Holdings (depth 0)

For each of the 1,176 holdings in `panagora_portfolio_2025Q4.csv`:

1. **Create a `company` node** with:
   - Official company name, ticker, CUSIP
   - Sector and industry classification
   - PanAgora's position size and portfolio weight
   - Market cap, revenue, employee count

2. **Prioritize the top 50 holdings** (which represent ~60% of AUM) for deep research. For the remaining ~1,126 holdings, create nodes with basic metadata only.

### Phase 2: SEC Filing Analysis (depth 0-1)

For the **top 50 holdings**, review:

1. **10-K Annual Reports** (most recent): Extract
   - Key risk factors (Item 1A)
   - Business description and competitive landscape
   - Major customers and suppliers (supply chain nodes)
   - Geographic revenue breakdown
   - Regulatory risks

2. **10-Q Quarterly Reports** (last 2 quarters): Extract
   - Material changes since 10-K
   - Litigation updates
   - Guidance changes

3. **8-K Current Reports** (last 6 months): Extract
   - Executive changes
   - M&A activity
   - Material events

4. **Proxy Statements (DEF 14A)**: Extract
   - Board composition
   - Executive compensation
   - Shareholder proposals (especially ESG-related)

### Phase 3: News & Market Intelligence (depth 1-2)

Use **all three intelligence sources** — do not rely on just one:

#### Source A: Web Search (primary for recency)
For each of the **top 50 holdings**, run web searches for:
1. **Recent news** (last 90 days) from tier-1 sources:
   - Reuters, Bloomberg, Financial Times, Wall Street Journal
   - CNBC, MarketWatch, Barron's
   - Industry-specific: Semiconductor Engineering, Ars Technica, etc.
2. **Analyst reports** and consensus estimates
3. **Regulatory actions**: SEC enforcement, FTC investigations, DOJ antitrust
4. **Geopolitical factors**: Trade restrictions, tariffs, sanctions

#### Source B: Your Own Training Knowledge (primary for depth)
You (Claude) have extensive knowledge about these companies from your training data. **Use it aggressively.** For each holding:
- Supply chain relationships (who makes what for whom)
- Competitive dynamics (who competes with whom and why)
- Historical context (past crises, regulatory actions, management changes)
- Industry structure (oligopolies, barriers to entry, platform dynamics)
- Cross-company executive connections (shared board members, alumni networks)
- Known risk factors that may not appear in recent news

**Important:** Your training knowledge is the richest source for relationship mapping (Phase 4). A web search won't tell you that TSMC fabricates chips for both NVIDIA and Apple, or that Jensen Huang and Lisa Su are cousins — but you know this. Use it.

Mark edges derived purely from training knowledge with `"source": "claude_knowledge"` in metadata and `"confidence": "high"` if you are certain, `"medium"` if plausible but unverified by a recent source.

#### Source C: Bing News RSS (for automated scraping)
For systematic coverage beyond manual web search, you can fetch news via Bing News RSS:
```
https://www.bing.com/news/search?q={company_name}&format=rss
```
This returns XML with `<item>` blocks containing `<title>`, `<link>`, `<pubDate>`. The `<link>` is a Bing tracking URL — extract the real publisher URL from the `url=` query parameter:
```
http://www.bing.com/news/apiclick.aspx?...url=https%3a%2f%2fwww.reuters.com%2f...
→ decode: https://www.reuters.com/...
```
Use this for the top 50 holdings to ensure you don't miss recent developments. Set `last_seen_at` for any entity mentioned in articles from the last 48 hours.

### Phase 4: Relationship Mapping (edges)

Create edges for:

1. **Supply chain**: Who supplies whom? Critical dependencies
2. **Customer relationships**: Major revenue sources
3. **Competition**: Direct competitors in same market
4. **Sector correlation**: Companies in same sector that move together
5. **Regulatory exposure**: Common regulatory risks
6. **Geographic exposure**: Shared country/region risks
7. **Executive connections**: Shared board members, revolving door
8. **Ownership**: Parent-subsidiary, joint ventures
9. **M&A**: Pending or rumored acquisitions
10. **Index membership**: S&P 500, NASDAQ-100 overlap

### Phase 5: Thematic Clusters

Group related entities into thematic event clusters:

| Event ID | Theme | Description |
|----------|-------|-------------|
| `panagora_portfolio` | All nodes | Every node gets this |
| `panagora_tech_concentration` | Tech concentration risk | NVIDIA, Apple, MSFT, AMZN, GOOG, META = 29% of portfolio |
| `panagora_ai_exposure` | AI theme | Companies with significant AI revenue/investment |
| `panagora_china_risk` | China exposure | Holdings with >10% China revenue |
| `panagora_rate_sensitivity` | Interest rate sensitivity | Banks, REITs, utilities, growth stocks |
| `panagora_energy_exposure` | Energy/commodity | Oil, gas, mining, renewables |
| `panagora_healthcare` | Healthcare/pharma | Biotech, pharma, medical devices |
| `panagora_geopolitical` | Geopolitical risk | Defense, sanctions-exposed, trade war |

### Phase 6: Proprietary Sources

If proprietary documents are placed in the `proprietary/` directory:

1. Read each document
2. Extract entities and relationships following the same schema
3. Mark these with `"source": "proprietary"` in edge metadata
4. Do NOT include the raw proprietary text in any output

### Phase 7: Active Market Event Mapping (CRITICAL)

This phase connects portfolio holdings to **live prediction market events** from Polymarket and Kalshi. This is what makes the knowledge graph actionable — it links fundamental analysis to real-time market pricing.

**Input file**: `active_market_events.json` — contains 393 curated active prediction market events (>$10K 24hr volume, sports/entertainment/memes excluded) with IDs, titles, volumes, categories, and sources. Total 24hr volume: $71M.

For each market event, determine which portfolio holdings are **materially affected** by the event's outcome. Create edges with `causal_type: "causal"` or `"correlative"`.

**Mapping rules:**

1. **Direct exposure**: If an event names a specific company held by PanAgora, create a direct edge.
   - "Will NVIDIA stock hit $200?" → edge to NVIDIA Corporation node
   - Weight: 8-10 (high)

2. **Sector exposure**: If an event affects a sector PanAgora is exposed to, create edges to the top 5 holdings in that sector.
   - "How many Fed rate cuts in 2026?" → edges to banks (JPMorgan, BofA), REITs, utilities
   - "Will Crude Oil hit $150?" → edges to energy holdings (Exxon, Chevron, ConocoPhillips)
   - Weight: 5-7 (medium)

3. **Geopolitical exposure**: If an event creates country/region risk for holdings with revenue there.
   - "Will China invade Taiwan by 2026?" → edges to TSMC, NVIDIA (supply chain), Apple (China revenue)
   - "US x Iran ceasefire by...?" → edges to oil companies, defense contractors, airlines
   - Weight: 4-6 (medium)

4. **Macro exposure**: If an event affects the broad market, create edges to the portfolio-level node.
   - "US GDP growth in Q2 2026?" → edge to "PanAgora Portfolio" concept node
   - "Bitcoin above $100K?" → edges to crypto-exposed holdings (if any)
   - Weight: 3-5 (lower)

**For each mapping, the edge metadata must include:**
```json
{
  "market_event_id": "event_id_from_active_market_events.json",
  "market_event_title": "Will Crude Oil hit $150?",
  "market_event_source": "polymarket",
  "impact_channel": "Oil price surge increases revenue for energy holdings",
  "direction": "positive|negative|mixed",
  "magnitude": "high|medium|low",
  "confidence": "high|medium|low"
}
```

**Key market events to map (by volume):**

| Volume | Event | Affected Holdings |
|--------|-------|-------------------|
| $13.5M | Democratic Presidential Nominee 2028 | All (policy uncertainty) |
| $10.1M | Republican Presidential Nominee 2028 | All (policy uncertainty) |
| $4.3M | Bitcoin price in March | Crypto-adjacent (if held) |
| $2.7M | US x Iran ceasefire | Energy, defense, airlines, shipping |
| $2.4M | Crude Oil price targets | Energy sector, airlines, chemicals |
| $1.0M | US forces enter Iran | Defense (Lockheed, RTX, Northrop), energy, gold |
| $0.5M | Fed rate cuts in 2026 | Banks, REITs, growth tech, utilities |
| $0.3M | China invade Taiwan | TSMC, NVIDIA, Apple, Broadcom, AMD |
| $0.3M | Trump visit China | Trade-exposed companies |

**Create a `market_event` type node** for each mapped event:
```json
{
  "label": "Will Crude Oil hit $150?",
  "type": "market_event",
  "description": "Polymarket prediction market on crude oil prices. $2.4M in 24hr volume.",
  "metadata": {
    "event_id": "...",
    "source": "polymarket",
    "volume_24hr": 2400000,
    "current_probability": null
  },
  "event_ids": ["panagora_portfolio", "panagora_energy_exposure"],
  "causal_role": "market_signal"
}
```

---

## 6. Quality Requirements

### Cross-Verification
- Every factual claim must be verifiable from at least one public source
- Flag unverified claims with `"confidence": "low"` in edge metadata
- Cite sources in edge metadata: `"source": "NVDA 10-K 2025, p.42"`

### Deduplication
- Use canonical company names (e.g., "Alphabet Inc" not "Google")
- Merge duplicate entities by checking `label` before creating new nodes
- If the same entity appears in multiple contexts, increment `mention_count`

### Completeness Checks
- Every `company` node from the top 50 must have at least 3 edges
- Every edge must have both `source_label` and `target_label` matching existing nodes
- No orphan nodes (every node must have at least 1 edge)

### Data Freshness & Heat Signals

The dashboard has a **HEAT toggle** that highlights entities with recent activity. This is driven entirely by the `last_seen_at` field on nodes. Getting this right is critical for the visualization to be useful.

**Rules for setting `last_seen_at`:**

1. **Set to current ISO timestamp** (`new Date().toISOString()`) for any entity that:
   - Appears in a news article published within the last **48 hours**
   - Is named in an SEC filing (8-K) filed within the last **48 hours**
   - Is directly referenced in a prediction market event that traded >$100K in the last **24 hours**
   - Had a material price move (>5% in a day) within the last **48 hours**
   - Was mentioned in an earnings call or analyst report within the last **48 hours**

2. **Set to null** for entities only found in:
   - Annual SEC filings (10-K) older than 48 hours
   - Historical data or background research
   - Static relationships (e.g., "TSMC fabricates NVIDIA chips" — always true, not news)

3. **Propagate heat to 1st-order connections**: If a node is hot (has `last_seen_at` within 48hrs), the dashboard automatically gives a lighter glow to its direct neighbors. You do NOT need to set `last_seen_at` on neighbors — just on the primary entity mentioned in the news. The visualization handles the propagation.

**How heat appears on the dashboard:**
- Nodes with `last_seen_at` within 48 hours glow **pulsing red** (`#ff3333`) when HEAT is toggled on
- Their 1st-order neighbors glow a dimmer red (`#661111`)
- The pulse is a smooth sinusoidal animation (2.5s period)
- Without HEAT toggle, hot nodes appear **white and 30% larger** than normal nodes

**Why this matters:** A portfolio manager looking at the graph should immediately see which parts of their portfolio are "in the news right now" — an earnings miss at NVIDIA, a regulatory action against Meta, an oil price spike affecting energy holdings. The heat signal is the difference between a static org chart and a live intelligence dashboard.

**Be aggressive with heat tagging.** If you're unsure whether something qualifies, tag it. It's better to highlight too many entities than to miss a material development. The user can always toggle HEAT off.

---

## 7. Output Validation

Before finalizing `kg_output.json`, verify:

1. **JSON is valid** — parseable with no syntax errors
2. **All labels are unique** — no duplicate node labels
3. **All edge endpoints exist** — every `source_label` and `target_label` matches a node
4. **No empty fields** — all required fields have values
5. **Reasonable counts**:
   - Expect 1,500-2,500 nodes total (1,176 holdings + executives + sectors + market events + policies)
   - Expect 4,000-10,000 edges total (supply chain + competitive + regulatory + market event mappings)
   - Top 50 holdings should have 5+ edges each
   - At least 8 thematic event clusters
   - At least 30 `market_event` nodes mapped to portfolio holdings
   - Every market event with >$500K volume should be mapped

---

## 8. Integration Instructions

The receiving Claude instance will:

1. Read `kg_output.json`
2. For each node: upsert into `kg_nodes` table (match by `label`, update if exists)
3. For each edge: look up `source_id` and `target_id` by label, insert into `kg_edges`
4. The knowledge graph will be visualized at https://rebecca-kg.vercel.app

### Supabase Schema Reference

**kg_nodes table:**
```sql
CREATE TABLE kg_nodes (
  id SERIAL PRIMARY KEY,
  label TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  mention_count INTEGER DEFAULT 1,
  event_ids TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  causal_depth INTEGER DEFAULT NULL,
  causal_role TEXT DEFAULT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT NULL
);
```

**kg_edges table:**
```sql
CREATE TABLE kg_edges (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES kg_nodes(id),
  target_id INTEGER REFERENCES kg_nodes(id),
  relationship TEXT NOT NULL,
  causal_type TEXT DEFAULT 'correlative',
  weight INTEGER DEFAULT 1,
  event_ids TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Label Consistency (IMPORTANT)

This knowledge graph may be merged with an existing geopolitical KG that already has nodes. To avoid duplicates, use these canonical labels for common entities:

| Correct Label | DO NOT USE |
|---------------|-----------|
| `United States` | US, USA, America, United States of America |
| `China` | PRC, People's Republic of China, Chinese |
| `European Union` | EU |
| `United Kingdom` | UK, Britain, Great Britain |
| `Russia` | Russian Federation |
| `Federal Reserve` | The Fed, US Fed, Federal Reserve Board |
| `Donald Trump` | Trump, President Trump |
| `Republican Party` | GOP, Republicans |
| `Democratic Party` | Democrats, Dems |
| `Alphabet Inc` | Google (use Alphabet for the parent company, Google for the subsidiary) |
| `Meta Platforms Inc` | Facebook, Meta |
| `JPMorgan Chase & Co` | JPMorgan, JP Morgan, Chase |

For company nodes from the 13F, use the **official SEC issuer name** from the CSV as the label. For non-holding entities (people, policies, locations), use the canonical forms above.

### Ticker Lookup

The CSV does not include stock tickers. For the top 50 holdings, look up the ticker from the CUSIP or company name. Include it in the `metadata.ticker` field. For holdings outside the top 50, the ticker is optional — the CUSIP is sufficient for identification.

### Sector Classification

The CSV does not include GICS sector/industry. Classify each holding into:
- **Sector**: One of: Technology, Healthcare, Financials, Consumer Discretionary, Consumer Staples, Industrials, Energy, Materials, Utilities, Real Estate, Communication Services
- **Industry**: More specific (e.g., "Semiconductors", "Biotechnology", "Regional Banks")

Include both in `metadata.sector` and `metadata.industry`. For the top 50, this is required. For others, use your best judgment from the company name.

---

## 9. Execution Checklist

- [ ] Parse `panagora_portfolio_2025Q4.csv` — create company nodes for all 1,176 holdings
- [ ] Deep research top 50 holdings — SEC filings, news, analyst coverage
- [ ] Create person nodes for key executives of top 50
- [ ] Create sector/industry nodes and link holdings
- [ ] Map supply chain relationships for top 50
- [ ] Map competitive relationships
- [ ] Identify regulatory and geopolitical risks
- [ ] Create thematic event clusters
- [ ] Process any proprietary documents in `proprietary/`
- [ ] Map portfolio holdings to active market events (Phase 7) using `active_market_events.json`
- [ ] Create `market_event` nodes for each mapped prediction market event
- [ ] Create causal/correlative edges between market events and affected holdings
- [ ] Cross-verify all claims
- [ ] Validate output JSON
- [ ] Write `kg_output.json`

---

## 10. SEC EDGAR API Reference

For pulling SEC filings programmatically:

```
# Company filings index
https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={CIK}&type={form_type}&dateb=&owner=include&count=40

# Full-text search
https://efts.sec.gov/LATEST/search-index?q={query}&forms={form_type}&dateRange=custom&startdt={start}&enddt={end}

# Filing documents
https://www.sec.gov/Archives/edgar/data/{CIK}/{accession_number}/

# IMPORTANT: Include User-Agent header with contact email
User-Agent: YourApp/1.0 your@email.com
```

PanAgora's CIK: **0000883677**

For each portfolio company, look up the company's CIK on EDGAR and pull their filings.

---

## 11. Fund-Level Context (for the extracting Claude)

### About PanAgora Asset Management

PanAgora is a **systematic/quantitative** investment manager — they use mathematical models, not fundamental stock-picking. This means:
- Their portfolio changes are driven by **factor exposures** (value, momentum, quality, volatility) not individual stock opinions
- Position sizing is algorithmic — they hold 1,176 stocks because their models optimize across a broad universe
- They are **not activists** — they don't take large concentrated positions or push for board changes
- Their risk management is **portfolio-level**, not stock-level — correlations and factor tilts matter more than individual company analysis

### Ownership Structure
- 50% owned by employees
- 50% owned by **Great-West Lifeco Inc** (TSX: GWO), a Canadian financial services company
- Great-West Lifeco is controlled by **Power Corporation of Canada** (TSX: POW), controlled by the **Desmarais family**
- This ownership chain matters — create nodes for Great-West Lifeco, Power Corporation, and the Desmarais family

### Key People (create person nodes)
- **Eric Sorensen** — Founder and former CEO (1989-2013), pioneer in quantitative investing
- **Edward Qian** — Chief Investment Officer, creator of Risk Parity strategy
- **Bryan Belton** — Director of Quantitative Research
- **George Mussalli** — CIO of Equity, runs stock selection models
- The firm has ~132 employees, mostly PhDs in mathematics, physics, and engineering

### Investment Strategies (create concept nodes)
- **Risk Parity**: Equal risk contribution across asset classes (their signature strategy)
- **Multi-Alpha Equity**: Stock selection using multiple alpha signals
- **Dynamic Equity**: Factor rotation strategies
- **ESG Integration**: They incorporate ESG factors into quantitative models
- **Alternative Risk Premia**: Harvesting risk premiums across asset classes

### Current Date Context
Today is **March 22, 2026**. Key ongoing events affecting the portfolio:
- **US-Iran War** (started March 1, 2026): Oil at $126/barrel, Strait of Hormuz 95% blocked, defense stocks surging, airlines hammered
- **2028 Presidential Race**: Both primaries actively trading on Polymarket/Kalshi
- **Fed Policy**: 2 rate cuts expected in 2026, inflation elevated due to oil shock
- **AI Bubble Debate**: NVIDIA at all-time highs, concentration risk in Mag-7
- **Hungary Election** (April 12, 2026): EU stability implications
- **Trump tariffs**: Ongoing trade policy uncertainty affecting multinationals

### Historical 13F Filing Accession Numbers (for quarter-over-quarter comparison)
| Period | Accession | Filed |
|--------|-----------|-------|
| Q4 2025 | 0001172661-26-000738 | 2026-02-13 |
| Q3 2025 | 0001172661-25-004745 | 2025-11-13 |
| Q2 2025 | 0001172661-25-003130 | 2025-08-13 |
| Q1 2025 | 0001172661-25-002054 | 2025-05-15 |
| Q4 2024 | 0001172661-25-000751 | 2025-02-13 |

Use these to identify **new positions** (not in prior quarter) and **closed positions** (in prior quarter but not current). New and closed positions are high-signal for the KG — they indicate the quant models detected something.

### Portfolio Concentration Risk
The top 10 holdings = 35% of the portfolio. The top 6 are all mega-cap tech:
1. NVIDIA — $2.1B (7.5%)
2. Apple — $1.7B (6.1%)
3. Microsoft — $1.4B (5.1%)
4. Amazon — $0.9B (3.1%)
5. Alphabet — $1.4B (5.0%, combined A+C shares)
6. Meta — $0.7B (2.5%)

**Total Mag-7 exposure: ~29% of portfolio** — this is the single biggest risk factor. Create a `panagora_mag7_concentration` thematic cluster for this.
