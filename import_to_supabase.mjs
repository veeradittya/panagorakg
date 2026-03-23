/**
 * Import kg_output.json into Supabase kg_nodes and kg_edges tables.
 *
 * Usage:
 *   export SUPABASE_URL=https://xxx.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   node import_to_supabase.mjs
 *
 * This script:
 *   1. Reads kg_output.json from the same directory
 *   2. Upserts all nodes into kg_nodes (by label)
 *   3. Looks up node IDs and inserts all edges into kg_edges
 *   4. Reports statistics
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Read the output file
const data = JSON.parse(readFileSync(new URL('./kg_output.json', import.meta.url), 'utf-8'));
console.log(`Loaded: ${data.nodes.length} nodes, ${data.edges.length} edges`);
console.log(`Metadata:`, data.metadata);

// ── Step 1: Upsert nodes ──
const labelToId = new Map();
let nodesCreated = 0;
let nodesUpdated = 0;

for (const node of data.nodes) {
  const row = {
    label: node.label,
    type: node.type,
    description: node.description,
    metadata: node.metadata || {},
    mention_count: node.mention_count || 1,
    event_ids: node.event_ids || ['panagora_portfolio'],
    causal_depth: node.causal_depth ?? null,
    causal_role: node.causal_role ?? null,
    last_seen_at: node.last_seen_at ?? null,
    updated_at: new Date().toISOString(),
  };

  // Check if node exists
  const { data: existing } = await sb
    .from('kg_nodes')
    .select('id, mention_count, event_ids')
    .eq('label', node.label)
    .maybeSingle();

  if (existing) {
    // Update: merge event_ids, increment mention_count
    const mergedEvents = [...new Set([...(existing.event_ids || []), ...(row.event_ids || [])])];
    await sb.from('kg_nodes').update({
      ...row,
      mention_count: (existing.mention_count || 0) + (row.mention_count || 1),
      event_ids: mergedEvents,
    }).eq('id', existing.id);
    labelToId.set(node.label, existing.id);
    nodesUpdated++;
  } else {
    const { data: inserted, error } = await sb
      .from('kg_nodes')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      console.error(`Failed to insert node "${node.label}":`, error.message);
      continue;
    }
    labelToId.set(node.label, inserted.id);
    nodesCreated++;
  }
}

console.log(`\nNodes: ${nodesCreated} created, ${nodesUpdated} updated`);

// ── Step 2: Resolve any labels we don't have IDs for ──
const missingLabels = new Set();
for (const edge of data.edges) {
  if (!labelToId.has(edge.source_label)) missingLabels.add(edge.source_label);
  if (!labelToId.has(edge.target_label)) missingLabels.add(edge.target_label);
}

if (missingLabels.size > 0) {
  console.log(`\nLooking up ${missingLabels.size} labels from existing DB...`);
  for (const label of missingLabels) {
    const { data: node } = await sb
      .from('kg_nodes')
      .select('id')
      .eq('label', label)
      .maybeSingle();
    if (node) labelToId.set(label, node.id);
  }
}

// ── Step 3: Insert edges ──
let edgesCreated = 0;
let edgesSkipped = 0;

for (const edge of data.edges) {
  const sourceId = labelToId.get(edge.source_label);
  const targetId = labelToId.get(edge.target_label);

  if (!sourceId || !targetId) {
    console.warn(`Skipping edge: "${edge.source_label}" → "${edge.target_label}" (missing node)`);
    edgesSkipped++;
    continue;
  }

  const { error } = await sb.from('kg_edges').insert({
    source_id: sourceId,
    target_id: targetId,
    relationship: edge.relationship,
    causal_type: edge.causal_type || 'correlative',
    weight: edge.weight || 1,
    event_ids: edge.event_ids || ['panagora_portfolio'],
    metadata: edge.metadata || {},
  });

  if (error) {
    console.warn(`Edge insert error: ${error.message}`);
    edgesSkipped++;
  } else {
    edgesCreated++;
  }
}

console.log(`\nEdges: ${edgesCreated} created, ${edgesSkipped} skipped`);
console.log(`\nDone. Total in DB:`);

const { count: totalNodes } = await sb.from('kg_nodes').select('id', { count: 'exact', head: true });
const { count: totalEdges } = await sb.from('kg_edges').select('id', { count: 'exact', head: true });
console.log(`  Nodes: ${totalNodes}`);
console.log(`  Edges: ${totalEdges}`);
