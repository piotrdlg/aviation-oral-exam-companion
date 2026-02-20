#!/usr/bin/env npx tsx
/**
 * seed-elements.ts — Normalize ACS task elements into acs_elements table
 *
 * Reads all acs_tasks from Supabase, extracts K/R/S elements from the JSONB
 * arrays, and inserts them as individual rows in acs_elements.
 *
 * Usage:
 *   npx tsx scripts/seed-elements.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';

// Load env from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// --- Environment safety guard ---
const appEnv = getAppEnv();
console.log(`\n🌍 Environment: ${appEnv}`);
assertNotProduction('seed-elements', {
  allow: process.env.ALLOW_PROD_WRITE === '1',
});
if (process.env.ALLOW_PROD_WRITE === '1') {
  console.warn('⚠️  ALLOW_PROD_WRITE=1 — production write override active!');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

interface AcsElement {
  code: string;
  description: string;
}

interface AcsTaskRow {
  id: string;
  rating: string;
  area: string;
  task: string;
  knowledge_elements: AcsElement[];
  risk_management_elements: AcsElement[] | null;
  skill_elements: AcsElement[] | null;
}

type ElementType = 'knowledge' | 'risk' | 'skill';

interface ElementInsert {
  code: string;
  task_id: string;
  element_type: ElementType;
  short_code: string;
  description: string;
  order_index: number;
  difficulty_default: string;
  weight: number;
}

function extractShortCode(fullCode: string): string {
  // "PA.I.A.K1" -> "K1", "PA.XII.A.R3" -> "R3"
  const parts = fullCode.split('.');
  return parts[parts.length - 1];
}

async function main() {
  console.log('Fetching ACS tasks from Supabase...');

  const { data: tasks, error } = await supabase
    .from('acs_tasks')
    .select('*')
    .order('id');

  if (error) {
    console.error('Error fetching tasks:', error.message);
    process.exit(1);
  }

  if (!tasks || tasks.length === 0) {
    console.error('No ACS tasks found. Run seed migration first.');
    process.exit(1);
  }

  console.log(`Found ${tasks.length} ACS tasks`);

  const elements: ElementInsert[] = [];

  for (const task of tasks as AcsTaskRow[]) {
    // Knowledge elements
    if (task.knowledge_elements && Array.isArray(task.knowledge_elements)) {
      task.knowledge_elements.forEach((el, idx) => {
        elements.push({
          code: el.code,
          task_id: task.id,
          element_type: 'knowledge',
          short_code: extractShortCode(el.code),
          description: el.description,
          order_index: idx + 1,
          difficulty_default: 'medium',
          weight: 1.0,
        });
      });
    }

    // Risk management elements
    if (task.risk_management_elements && Array.isArray(task.risk_management_elements)) {
      task.risk_management_elements.forEach((el, idx) => {
        elements.push({
          code: el.code,
          task_id: task.id,
          element_type: 'risk',
          short_code: extractShortCode(el.code),
          description: el.description,
          order_index: idx + 1,
          difficulty_default: 'medium',
          weight: 1.0,
        });
      });
    }

    // Skill elements
    if (task.skill_elements && Array.isArray(task.skill_elements)) {
      task.skill_elements.forEach((el, idx) => {
        elements.push({
          code: el.code,
          task_id: task.id,
          element_type: 'skill',
          short_code: extractShortCode(el.code),
          description: el.description,
          order_index: idx + 1,
          difficulty_default: 'medium',
          weight: 1.0,
        });
      });
    }
  }

  console.log(`\nExtracted ${elements.length} elements:`);

  // Count by type
  const knowledgeCount = elements.filter(e => e.element_type === 'knowledge').length;
  const riskCount = elements.filter(e => e.element_type === 'risk').length;
  const skillCount = elements.filter(e => e.element_type === 'skill').length;
  console.log(`  Knowledge: ${knowledgeCount}`);
  console.log(`  Risk:      ${riskCount}`);
  console.log(`  Skill:     ${skillCount}`);

  // Check for duplicates
  const codes = elements.map(e => e.code);
  const duplicates = codes.filter((code, idx) => codes.indexOf(code) !== idx);
  if (duplicates.length > 0) {
    console.error(`\nDuplicate codes found: ${duplicates.join(', ')}`);
    process.exit(1);
  }

  // Clear existing elements (for idempotent re-runs)
  // Must clear element_attempts first due to FK constraint
  console.log('\nClearing element_attempts (FK dependency)...');
  const { error: attDeleteError } = await supabase
    .from('element_attempts')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');

  if (attDeleteError) {
    console.error('Error clearing element_attempts:', attDeleteError.message);
    process.exit(1);
  }

  console.log('Clearing existing acs_elements...');
  const { error: deleteError } = await supabase
    .from('acs_elements')
    .delete()
    .neq('code', '');

  if (deleteError) {
    console.error('Error clearing elements:', deleteError.message);
    process.exit(1);
  }

  // Insert in batches of 50
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < elements.length; i += batchSize) {
    const batch = elements.slice(i, i + batchSize);
    const { error: insertError } = await supabase
      .from('acs_elements')
      .insert(batch);

    if (insertError) {
      console.error(`Error inserting batch at offset ${i}:`, insertError.message);
      process.exit(1);
    }

    inserted += batch.length;
    process.stdout.write(`\rInserted ${inserted}/${elements.length} elements`);
  }

  console.log('\n\nVerifying...');
  const { count } = await supabase
    .from('acs_elements')
    .select('*', { count: 'exact', head: true });

  console.log(`Total elements in database: ${count}`);

  if (count === elements.length) {
    console.log('Seed completed successfully!');
  } else {
    console.error(`Expected ${elements.length} but found ${count}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
