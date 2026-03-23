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

For the **top 50 holdings**, search for:

1. **Recent news** (last 90 days) from tier-1 sources:
   - Reuters, Bloomberg, Financial Times, Wall Street Journal
   - CNBC, MarketWatch, Barron's
   - Industry-specific: Semiconductor Engineering, Ars Technica, etc.

2. **Analyst reports** and consensus estimates

3. **Regulatory actions**: SEC enforcement, FTC investigations, DOJ antitrust

4. **Geopolitical factors**: Trade restrictions, tariffs, sanctions

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

### Data Freshness
- Set `last_seen_at` to current timestamp for any entity mentioned in news from the last 48 hours
- Leave `last_seen_at` as `null` for entities only found in SEC filings

---

## 7. Output Validation

Before finalizing `kg_output.json`, verify:

1. **JSON is valid** — parseable with no syntax errors
2. **All labels are unique** — no duplicate node labels
3. **All edge endpoints exist** — every `source_label` and `target_label` matches a node
4. **No empty fields** — all required fields have values
5. **Reasonable counts**:
   - Expect 1,200-2,000 nodes total
   - Expect 3,000-8,000 edges total
   - Top 50 holdings should have 5+ edges each
   - At least 8 thematic event clusters

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
