#!/usr/bin/env npx tsx
/**
 * classify-difficulty.ts — Assign difficulty_default to acs_elements based on heuristics.
 *
 * Rules:
 *  - Knowledge elements with "regulations", "requirements", "definitions": easy
 *  - Knowledge elements with "effects", "factors", "procedures": medium
 *  - Knowledge elements with "hazards", "emergency", "malfunction": hard
 *  - Risk management elements: medium by default, hard if "failure" or "emergency"
 *  - Skill elements: medium by default
 *
 * Usage: npx tsx scripts/classify-difficulty.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EASY_KEYWORDS = [
  'definition', 'requirements', 'regulations', 'certificate', 'documents',
  'privileges', 'limitations', 'currency', 'types', 'purpose',
];

const HARD_KEYWORDS = [
  'emergency', 'hazard', 'malfunction', 'failure', 'abnormal',
  'spin', 'stall', 'icing', 'thunderstorm', 'turbulence',
  'loss of', 'degraded', 'partial', 'inoperative',
];

function classifyDifficulty(description: string, elementType: string): 'easy' | 'medium' | 'hard' {
  const lower = description.toLowerCase();

  if (elementType === 'skill') return 'medium';

  // Check hard keywords first (more specific)
  for (const kw of HARD_KEYWORDS) {
    if (lower.includes(kw)) return 'hard';
  }

  // Check easy keywords
  if (elementType === 'knowledge') {
    for (const kw of EASY_KEYWORDS) {
      if (lower.includes(kw)) return 'easy';
    }
  }

  return 'medium';
}

async function main() {
  console.log('Classifying element difficulties...\n');

  const { data: elements, error } = await supabase
    .from('acs_elements')
    .select('code, description, element_type, difficulty_default');

  if (error || !elements) {
    console.error('Error fetching elements:', error?.message);
    process.exit(1);
  }

  let updated = 0;
  const counts = { easy: 0, medium: 0, hard: 0 };

  for (const el of elements) {
    const newDifficulty = classifyDifficulty(el.description, el.element_type);
    counts[newDifficulty]++;

    if (el.difficulty_default !== newDifficulty) {
      const { error: updateErr } = await supabase
        .from('acs_elements')
        .update({ difficulty_default: newDifficulty })
        .eq('code', el.code);

      if (updateErr) {
        console.error(`  Error updating ${el.code}:`, updateErr.message);
      } else {
        updated++;
      }
    }
  }

  console.log(`Total elements: ${elements.length}`);
  console.log(`  Easy:   ${counts.easy}`);
  console.log(`  Medium: ${counts.medium}`);
  console.log(`  Hard:   ${counts.hard}`);
  console.log(`Updated:  ${updated}`);
  console.log('Done!');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
