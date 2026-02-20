#!/usr/bin/env npx tsx
/**
 * ingest-sources.ts — PDF extraction + chunking + embedding pipeline
 *
 * Reads PDF files from the sources/ directory, extracts text,
 * splits into ~500-1000 token chunks, generates embeddings,
 * and inserts into Supabase source_documents + source_chunks tables.
 *
 * Usage:
 *   npx tsx scripts/ingest-sources.ts [--subset gold|all] [--skip-embeddings]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import OpenAI from 'openai';
import { getAppEnv, assertNotProduction } from '../src/lib/app-env';

// pdf-parse v1.x is a simple function: pdfParse(buffer) -> { text, numpages, ... }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// --- Environment safety guard ---
const appEnv = getAppEnv();
console.log(`\n🌍 Environment: ${appEnv}`);
assertNotProduction('ingest-sources', {
  allow: process.env.ALLOW_PROD_WRITE === '1',
});
if (process.env.ALLOW_PROD_WRITE === '1') {
  console.warn('⚠️  ALLOW_PROD_WRITE=1 — production write override active!');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const openai = new OpenAI({ apiKey: openaiKey });

const SOURCES_DIR = path.resolve(__dirname, '../sources');

// ================================================================
// Document Registry — maps source files to metadata
// ================================================================

interface DocMeta {
  title: string;
  faa_number: string | null;
  abbreviation: string;
  document_type: 'handbook' | 'ac' | 'cfr' | 'aim' | 'other';
  chapter_number: number | null;
  chapter_title: string | null;
  file_path: string; // relative to sources/
}

function buildDocumentRegistry(subset: 'gold' | 'all'): DocMeta[] {
  const docs: DocMeta[] = [];

  // PHAK chapters (gold)
  const phakDir = path.join(SOURCES_DIR, 'phak');
  if (fs.existsSync(phakDir)) {
    const phakFiles = fs.readdirSync(phakDir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of phakFiles) {
      const match = file.match(/phak_(\d+)_ch(\d+)/i) || file.match(/phak_(\d+)_/i);
      const chNum = match ? parseInt(match[2] || match[1]) : null;
      docs.push({
        title: `PHAK ${file.replace('.pdf', '').replace(/_/g, ' ')}`,
        faa_number: 'FAA-H-8083-25B',
        abbreviation: 'phak',
        document_type: 'handbook',
        chapter_number: chNum,
        chapter_title: null,
        file_path: `phak/${file}`,
      });
    }
  }

  // AFH chapters (gold)
  const afhDir = path.join(SOURCES_DIR, 'afh');
  if (fs.existsSync(afhDir)) {
    const afhFiles = fs.readdirSync(afhDir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of afhFiles) {
      const match = file.match(/(\d+)/);
      const chNum = match ? parseInt(match[1]) : null;
      docs.push({
        title: `AFH ${file.replace('.pdf', '').replace(/_/g, ' ')}`,
        faa_number: 'FAA-H-8083-3C',
        abbreviation: 'afh',
        document_type: 'handbook',
        chapter_number: chNum,
        chapter_title: null,
        file_path: `afh/${file}`,
      });
    }
  }

  // AIM chapters (gold)
  const aimChaptersDir = path.join(SOURCES_DIR, 'aim', 'chapters');
  if (fs.existsSync(aimChaptersDir)) {
    const aimFiles = fs.readdirSync(aimChaptersDir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of aimFiles) {
      const match = file.match(/aim_(\d+)_ch(\d+)/i);
      const chNum = match ? parseInt(match[2]) : null;
      docs.push({
        title: `AIM ${file.replace('.pdf', '').replace(/_/g, ' ')}`,
        faa_number: 'AIM',
        abbreviation: 'aim',
        document_type: 'aim',
        chapter_number: chNum,
        chapter_title: null,
        file_path: `aim/chapters/${file}`,
      });
    }
  }

  if (subset === 'gold') return docs;

  // CFRs
  const cfrDir = path.join(SOURCES_DIR, 'cfr');
  if (fs.existsSync(cfrDir)) {
    const cfrFiles = fs.readdirSync(cfrDir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of cfrFiles) {
      const match = file.match(/Part_(\d+)/);
      const partNum = match ? parseInt(match[1]) : null;
      docs.push({
        title: `14 CFR Part ${partNum || file}`,
        faa_number: `14 CFR Part ${partNum}`,
        abbreviation: 'cfr',
        document_type: 'cfr',
        chapter_number: partNum,
        chapter_title: null,
        file_path: `cfr/${file}`,
      });
    }
  }

  // Advisory Circulars
  const acDir = path.join(SOURCES_DIR, 'ac');
  if (fs.existsSync(acDir)) {
    const acFiles = fs.readdirSync(acDir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of acFiles) {
      docs.push({
        title: `AC ${file.replace('.pdf', '').replace(/_/g, ' ')}`,
        faa_number: file.replace('.pdf', '').replace(/_/g, '-'),
        abbreviation: 'ac',
        document_type: 'ac',
        chapter_number: null,
        chapter_title: null,
        file_path: `ac/${file}`,
      });
    }
  }

  // Other handbooks (IFH, AWH, RMH, WBH chapters)
  const handbookDirs = [
    { dir: 'handbooks/ifh_chapters', abbrev: 'ifh', faa: 'FAA-H-8083-15B' },
    { dir: 'handbooks/awh_chapters', abbrev: 'awh', faa: 'FAA-H-8083-28A' },
    { dir: 'handbooks/rmh_chapters', abbrev: 'rmh', faa: 'FAA-H-8083-2A' },
    { dir: 'handbooks/wbh_chapters', abbrev: 'wbh', faa: 'FAA-H-8083-1B' },
    { dir: 'handbooks/iph_chapters', abbrev: 'iph', faa: 'FAA-H-8083-16B' },
  ];

  for (const hb of handbookDirs) {
    const dir = path.join(SOURCES_DIR, hb.dir);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of files) {
      const match = file.match(/ch(\d+)/i);
      const chNum = match ? parseInt(match[1]) : null;
      docs.push({
        title: `${hb.abbrev.toUpperCase()} ${file.replace('.pdf', '').replace(/_/g, ' ')}`,
        faa_number: hb.faa,
        abbreviation: hb.abbrev,
        document_type: 'handbook',
        chapter_number: chNum,
        chapter_title: null,
        file_path: `${hb.dir}/${file}`,
      });
    }
  }

  // Other documents
  const otherDir = path.join(SOURCES_DIR, 'other');
  if (fs.existsSync(otherDir)) {
    const otherFiles = fs.readdirSync(otherDir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of otherFiles) {
      docs.push({
        title: file.replace('.pdf', '').replace(/_/g, ' '),
        faa_number: null,
        abbreviation: 'other',
        document_type: 'other',
        chapter_number: null,
        chapter_title: null,
        file_path: `other/${file}`,
      });
    }
  }

  // ACS documents (detect rating from filename)
  const acsDir = path.join(SOURCES_DIR, 'acs');
  if (fs.existsSync(acsDir)) {
    const acsFiles = fs.readdirSync(acsDir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of acsFiles) {
      let title = 'ACS Document';
      let faaNumber: string | null = null;
      if (file.includes('6C') || file.toLowerCase().includes('private')) {
        title = 'FAA-S-ACS-6C Private Pilot ACS';
        faaNumber = 'FAA-S-ACS-6C';
      } else if (file.includes('7B') || file.toLowerCase().includes('commercial')) {
        title = 'FAA-S-ACS-7B Commercial Pilot ACS';
        faaNumber = 'FAA-S-ACS-7B';
      } else if (file.includes('8C') || file.toLowerCase().includes('instrument')) {
        title = 'FAA-S-ACS-8C Instrument Rating ACS';
        faaNumber = 'FAA-S-ACS-8C';
      }
      docs.push({
        title,
        faa_number: faaNumber,
        abbreviation: 'acs',
        document_type: 'other',
        chapter_number: null,
        chapter_title: null,
        file_path: `acs/${file}`,
      });
    }
  }

  // Seaplane handbook parts
  const seaplaneDir = path.join(SOURCES_DIR, 'handbooks', 'seaplane');
  if (fs.existsSync(seaplaneDir)) {
    const spFiles = fs.readdirSync(seaplaneDir).filter(f => f.endsWith('.pdf')).sort();
    for (const file of spFiles) {
      docs.push({
        title: `Seaplane Handbook ${file.replace('.pdf', '').replace(/_/g, ' ')}`,
        faa_number: 'FAA-H-8083-23',
        abbreviation: 'seaplane',
        document_type: 'handbook',
        chapter_number: null,
        chapter_title: null,
        file_path: `handbooks/seaplane/${file}`,
      });
    }
  }

  return docs;
}

// ================================================================
// Text Chunking
// ================================================================

interface TextChunk {
  index: number;
  heading: string | null;
  content: string;
  page_start: number | null;
  page_end: number | null;
}

function chunkText(text: string, maxTokens: number = 800, overlap: number = 100): TextChunk[] {
  const chunks: TextChunk[] = [];

  // Split by double newlines first to preserve paragraph boundaries
  const paragraphs = text.split(/\n{2,}/);

  let currentChunk = '';
  let chunkIndex = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // Rough token estimate: ~4 chars per token
    const currentTokens = currentChunk.length / 4;
    const paraTokens = trimmed.length / 4;

    if (currentTokens + paraTokens > maxTokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        index: chunkIndex,
        heading: extractHeading(currentChunk),
        content: currentChunk.trim(),
        page_start: null,
        page_end: null,
      });
      chunkIndex++;

      // Keep overlap from end of current chunk
      const overlapChars = overlap * 4;
      const overlapText = currentChunk.slice(-overlapChars);
      currentChunk = overlapText + '\n\n' + trimmed;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmed;
    }
  }

  // Save final chunk
  if (currentChunk.trim().length > 50) {
    chunks.push({
      index: chunkIndex,
      heading: extractHeading(currentChunk),
      content: currentChunk.trim(),
      page_start: null,
      page_end: null,
    });
  }

  return chunks;
}

function extractHeading(text: string): string | null {
  // Try to find a heading-like line at the start
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return null;

  const firstLine = lines[0].trim();
  // Headings are typically short, uppercase, or contain "Chapter", "Section" etc.
  if (firstLine.length < 100 && (
    /^(chapter|section|part|\d+\.)/i.test(firstLine) ||
    firstLine === firstLine.toUpperCase()
  )) {
    return firstLine;
  }
  return null;
}

// ================================================================
// Main Pipeline
// ================================================================

async function main() {
  const args = process.argv.slice(2);
  const subset = args.includes('--subset') ? (args[args.indexOf('--subset') + 1] as 'gold' | 'all') : 'gold';
  const skipEmbeddings = args.includes('--skip-embeddings');

  console.log(`\nSource Ingestion Pipeline`);
  console.log(`========================`);
  console.log(`Subset: ${subset}`);
  console.log(`Embeddings: ${skipEmbeddings ? 'SKIPPED' : 'enabled'}\n`);

  const docs = buildDocumentRegistry(subset);
  console.log(`Found ${docs.length} documents to ingest\n`);

  let totalChunks = 0;
  let totalEmbedded = 0;
  let skipped = 0;

  for (const doc of docs) {
    const fullPath = path.join(SOURCES_DIR, doc.file_path);
    if (!fs.existsSync(fullPath)) {
      console.log(`  SKIP (not found): ${doc.file_path}`);
      skipped++;
      continue;
    }

    const fileName = path.basename(doc.file_path);
    const fileSize = fs.statSync(fullPath).size;

    // Skip very large files (>100MB) — e.g., testing supplements
    if (fileSize > 100 * 1024 * 1024) {
      console.log(`  SKIP (>100MB): ${fileName} (${(fileSize / 1024 / 1024).toFixed(0)}MB)`);
      skipped++;
      continue;
    }

    process.stdout.write(`  Processing: ${fileName} (${(fileSize / 1024).toFixed(0)}KB)...`);

    // Check if document already exists
    const { data: existing } = await supabase
      .from('source_documents')
      .select('id')
      .eq('file_name', fileName)
      .single();

    let documentId: string;

    if (existing) {
      documentId = existing.id;
      // Delete existing chunks for re-ingestion
      await supabase.from('source_chunks').delete().eq('document_id', documentId);
      process.stdout.write(' (re-ingesting)');
    } else {
      // Insert document record
      const { data: inserted, error: insertErr } = await supabase
        .from('source_documents')
        .insert({
          title: doc.title,
          faa_number: doc.faa_number,
          abbreviation: doc.abbreviation,
          document_type: doc.document_type,
          chapter_number: doc.chapter_number,
          chapter_title: doc.chapter_title,
          file_name: fileName,
        })
        .select('id')
        .single();

      if (insertErr || !inserted) {
        console.log(` ERROR: ${insertErr?.message}`);
        continue;
      }
      documentId = inserted.id;
    }

    // Extract text from PDF
    let text: string;
    try {
      const buffer = fs.readFileSync(fullPath);
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } catch (err) {
      console.log(` ERROR extracting text: ${err}`);
      continue;
    }

    if (text.trim().length < 100) {
      console.log(` SKIP (too little text: ${text.length} chars)`);
      continue;
    }

    // Chunk the text
    const chunks = chunkText(text);

    // Insert chunks (without embeddings first)
    const chunkRows = chunks.map((chunk) => ({
      document_id: documentId,
      chunk_index: chunk.index,
      heading: chunk.heading,
      content: chunk.content,
      content_hash: crypto.createHash('sha256').update(chunk.content).digest('hex'),
      page_start: chunk.page_start,
      page_end: chunk.page_end,
      embedding_status: skipEmbeddings ? 'stale' : 'current',
    }));

    // Insert in batches
    const batchSize = 50;
    const insertedChunkIds: string[] = [];

    for (let i = 0; i < chunkRows.length; i += batchSize) {
      const batch = chunkRows.slice(i, i + batchSize);
      const { data: insertedBatch, error: chunkErr } = await supabase
        .from('source_chunks')
        .insert(batch)
        .select('id');

      if (chunkErr) {
        console.log(` ERROR inserting chunks: ${chunkErr.message}`);
        break;
      }
      if (insertedBatch) {
        insertedChunkIds.push(...insertedBatch.map(r => r.id));
      }
    }

    totalChunks += chunks.length;

    // Generate embeddings if not skipped
    if (!skipEmbeddings && insertedChunkIds.length > 0) {
      const embeddingBatchSize = 50;
      for (let i = 0; i < chunks.length; i += embeddingBatchSize) {
        const textBatch = chunks.slice(i, i + embeddingBatchSize).map(c => c.content);
        const idBatch = insertedChunkIds.slice(i, i + embeddingBatchSize);

        try {
          const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: textBatch,
          });

          const sorted = response.data.sort((a, b) => a.index - b.index);

          // Batch DB updates with concurrency limit instead of sequential
          const CONCURRENCY = 10;
          for (let start = 0; start < sorted.length; start += CONCURRENCY) {
            const batch = sorted.slice(start, start + CONCURRENCY);
            const results = await Promise.allSettled(
              batch.map((item, idx) =>
                supabase
                  .from('source_chunks')
                  .update({
                    embedding: item.embedding as unknown as string,
                    embedding_status: 'current',
                  })
                  .eq('id', idBatch[start + idx])
              )
            );
            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
              console.log(` DB UPDATE: ${failures.length}/${batch.length} failed`);
            }
          }

          totalEmbedded += sorted.length;
        } catch (err) {
          console.log(` EMBED ERROR: ${err}`);
        }
      }
    }

    console.log(` ${chunks.length} chunks${skipEmbeddings ? '' : ' + embeddings'}`);
  }

  console.log(`\n========================`);
  console.log(`Documents processed: ${docs.length - skipped}`);
  console.log(`Documents skipped:   ${skipped}`);
  console.log(`Total chunks:        ${totalChunks}`);
  if (!skipEmbeddings) {
    console.log(`Total embedded:      ${totalEmbedded}`);
  }
  console.log(`Done!`);
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
