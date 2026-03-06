#!/usr/bin/env npx tsx
/**
 * import-faa-airmen.ts — Import FAA Airmen Certification data into Supabase
 *
 * Reads PILOT_BASIC.csv and PILOT_CERT.csv from the FAA Releasable Airmen
 * database (https://registry.faa.gov/database/ReleasableAirmen.zip) and
 * upserts the data into faa_airmen, faa_airmen_certs, and faa_import_log.
 *
 * Usage:
 *   npx tsx scripts/instructor/import-faa-airmen.ts \
 *     --basic-csv data/PILOT_BASIC.csv \
 *     --cert-csv data/PILOT_CERT.csv \
 *     --source-date 2026-03-01 \
 *     [--instructor-only] \
 *     [--dry-run]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { getAppEnv, assertNotProduction } from '../../src/lib/app-env';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  basicCsv: string;
  certCsv: string;
  sourceDate: string;
  dryRun: boolean;
  instructorOnly: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let basicCsv = '';
  let certCsv = '';
  let sourceDate = '';
  let dryRun = false;
  let instructorOnly = false;

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--basic-csv':
        basicCsv = argv[++i] || '';
        break;
      case '--cert-csv':
        certCsv = argv[++i] || '';
        break;
      case '--source-date':
        sourceDate = argv[++i] || '';
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--instructor-only':
        instructorOnly = true;
        break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!basicCsv || !certCsv || !sourceDate) {
    console.error('Missing required arguments.');
    printUsage();
    process.exit(1);
  }

  // Validate source-date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
    console.error(`Invalid --source-date format: "${sourceDate}". Expected YYYY-MM-DD.`);
    process.exit(1);
  }

  // Validate files exist
  if (!fs.existsSync(basicCsv)) {
    console.error(`Basic CSV file not found: ${basicCsv}`);
    process.exit(1);
  }
  if (!fs.existsSync(certCsv)) {
    console.error(`Cert CSV file not found: ${certCsv}`);
    process.exit(1);
  }

  return { basicCsv, certCsv, sourceDate, dryRun, instructorOnly };
}

function printUsage(): void {
  console.log(`
Usage:
  npx tsx scripts/instructor/import-faa-airmen.ts \\
    --basic-csv <path>        Path to PILOT_BASIC.csv (or .txt)
    --cert-csv <path>         Path to PILOT_CERT.csv (or .txt)
    --source-date <YYYY-MM-DD> Publication date of the FAA dataset
    [--instructor-only]       Only import flight/ground instructors (cert F or G)
    [--dry-run]               Parse and validate without writing to DB
`);
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Detect the delimiter used in a CSV line.
 * FAA files may use comma or pipe delimiters.
 */
function detectDelimiter(headerLine: string): string {
  // Count pipes vs commas in the header line
  const pipes = (headerLine.match(/\|/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return pipes > commas ? '|' : ',';
}

/**
 * Parse a single CSV/delimited line into fields.
 * Handles quoted fields (with embedded commas/pipes).
 */
function parseLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Create a line-by-line reader for a file. Yields parsed rows as objects
 * keyed by normalized header names.
 */
async function* readCsvRows(
  filePath: string,
): AsyncGenerator<{ headers: string[]; fields: string[]; lineNumber: number }> {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers: string[] = [];
  let delimiter = ',';
  let lineNumber = 0;

  for await (const rawLine of rl) {
    lineNumber++;
    const line = rawLine.trim();
    if (!line) continue;

    if (lineNumber === 1) {
      // Header row
      delimiter = detectDelimiter(line);
      headers = parseLine(line, delimiter).map((h) =>
        h.toUpperCase().replace(/[^A-Z0-9_ ]/g, '').trim(),
      );
      continue;
    }

    const fields = parseLine(line, delimiter);
    yield { headers, fields, lineNumber };
  }
}

/**
 * Build a key-value object from headers and field values.
 */
function rowToObject(headers: string[], fields: string[]): Record<string, string> {
  const obj: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    obj[headers[i]] = (fields[i] || '').trim();
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Batch upsert helpers
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;
const PROGRESS_INTERVAL = 10_000;

interface BasicRow {
  faa_unique_id: string;
  first_name: string;
  last_name: string;
  first_name_normalized: string;
  last_name_normalized: string;
  city: string | null;
  state: string | null;
  country: string | null;
  region: string | null;
  med_class: string | null;
  med_date: string | null;
  med_exp_date: string | null;
  source_file: string;
  source_date: string;
}

interface CertRow {
  faa_unique_id: string;
  cert_type: string;
  cert_level: string | null;
  cert_expire_date: string | null;
  rating_text: string | null;
  source_file: string;
  source_date: string;
}

async function upsertBasicBatch(
  supabase: SupabaseClient,
  batch: BasicRow[],
): Promise<number> {
  const { error } = await supabase
    .from('faa_airmen')
    .upsert(batch, {
      onConflict: 'faa_unique_id,source_date',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`\nUpsert error (faa_airmen): ${error.message}`);
    return 0;
  }
  return batch.length;
}

async function upsertCertBatch(
  supabase: SupabaseClient,
  batch: CertRow[],
): Promise<number> {
  const { error } = await supabase
    .from('faa_airmen_certs')
    .upsert(batch, {
      onConflict: 'faa_unique_id,cert_type,cert_level,source_date',
      ignoreDuplicates: false,
    });

  if (error) {
    console.error(`\nUpsert error (faa_airmen_certs): ${error.message}`);
    return 0;
  }
  return batch.length;
}

// ---------------------------------------------------------------------------
// Pass 1: Scan cert file to identify instructor IDs (for --instructor-only)
// ---------------------------------------------------------------------------

async function scanInstructorIds(certCsvPath: string): Promise<Set<string>> {
  const instructorIds = new Set<string>();
  let scanned = 0;

  console.log('Scanning cert file for instructor IDs (cert_type F or G)...');

  for await (const { headers, fields, lineNumber } of readCsvRows(certCsvPath)) {
    const row = rowToObject(headers, fields);
    const uniqueId = row['UNIQUE ID'] || row['UNIQUEID'] || '';
    const certType = (row['CERTIFICATE TYPE'] || row['TYPE'] || '').trim();

    if (!uniqueId) continue;

    if (certType === 'F' || certType === 'G') {
      instructorIds.add(uniqueId);
    }

    scanned++;
    if (scanned % PROGRESS_INTERVAL === 0) {
      process.stdout.write(`\r  Scanned ${scanned.toLocaleString()} cert rows, found ${instructorIds.size.toLocaleString()} instructor IDs`);
    }

    // Suppress unused variable warning
    void lineNumber;
  }

  console.log(`\r  Scanned ${scanned.toLocaleString()} cert rows, found ${instructorIds.size.toLocaleString()} instructor IDs`);
  return instructorIds;
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();

  // Load env
  dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

  // Environment safety guard
  const appEnv = getAppEnv();
  console.log(`\nEnvironment: ${appEnv}`);
  assertNotProduction('import-faa-airmen', {
    allow: process.env.ALLOW_PROD_WRITE === '1',
  });
  if (process.env.ALLOW_PROD_WRITE === '1') {
    console.warn('WARNING: ALLOW_PROD_WRITE=1 -- production write override active!');
  }

  const args = parseArgs();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  console.log(`\nFAA Airmen Import Pipeline`);
  console.log(`==========================`);
  console.log(`Basic CSV:       ${args.basicCsv}`);
  console.log(`Cert CSV:        ${args.certCsv}`);
  console.log(`Source date:     ${args.sourceDate}`);
  console.log(`Instructor only: ${args.instructorOnly}`);
  console.log(`Mode:            ${args.dryRun ? 'DRY RUN' : 'LIVE'}\n`);

  // Create import log entry (unless dry-run)
  let importLogId: string | null = null;
  if (!args.dryRun) {
    const { data: logEntry, error: logError } = await supabase
      .from('faa_import_log')
      .insert({
        source_date: args.sourceDate,
        source_url: 'https://registry.faa.gov/database/ReleasableAirmen.zip',
        status: 'running',
        metadata: {
          instructor_only: args.instructorOnly,
          basic_file: path.basename(args.basicCsv),
          cert_file: path.basename(args.certCsv),
        },
      })
      .select('id')
      .single();

    if (logError || !logEntry) {
      console.error(`Failed to create import log: ${logError?.message}`);
      process.exit(1);
    }
    importLogId = logEntry.id;
    console.log(`Import log ID: ${importLogId}`);
  }

  // --- Pre-scan for instructor IDs if --instructor-only ---
  let instructorIds: Set<string> | null = null;
  if (args.instructorOnly) {
    instructorIds = await scanInstructorIds(args.certCsv);
    if (instructorIds.size === 0) {
      console.error('No instructor IDs found. Check the cert file format.');
      if (importLogId) {
        await supabase.from('faa_import_log').update({
          status: 'error',
          error: 'No instructor IDs found in cert file',
          completed_at: new Date().toISOString(),
        }).eq('id', importLogId);
      }
      process.exit(1);
    }
    console.log('');
  }

  // -----------------------------------------------------------------------
  // Phase 1: Import PILOT_BASIC.csv
  // -----------------------------------------------------------------------

  console.log('Phase 1: Importing basic records...');
  const basicFileName = path.basename(args.basicCsv);

  let basicParsed = 0;
  let basicImported = 0;
  let basicSkipped = 0;
  let basicErrors = 0;
  let basicBatch: BasicRow[] = [];

  for await (const { headers, fields } of readCsvRows(args.basicCsv)) {
    const row = rowToObject(headers, fields);

    const uniqueId = row['UNIQUE ID'] || row['UNIQUEID'] || '';
    const firstName = row['FIRST NAME'] || row['FIRSTNAME'] || '';
    const lastName = row['LAST NAME'] || row['LASTNAME'] || '';

    if (!uniqueId || (!firstName && !lastName)) {
      basicErrors++;
      continue;
    }

    basicParsed++;

    // If --instructor-only, skip non-instructor records
    if (instructorIds && !instructorIds.has(uniqueId)) {
      basicSkipped++;
      if (basicParsed % PROGRESS_INTERVAL === 0) {
        process.stdout.write(
          `\r  Parsed: ${basicParsed.toLocaleString()} | Imported: ${basicImported.toLocaleString()} | Skipped: ${basicSkipped.toLocaleString()}`,
        );
      }
      continue;
    }

    const basicRow: BasicRow = {
      faa_unique_id: uniqueId,
      first_name: firstName,
      last_name: lastName,
      first_name_normalized: normalizeName(firstName),
      last_name_normalized: normalizeName(lastName),
      city: row['CITY'] || null,
      state: row['STATE'] || null,
      country: row['COUNTRY'] || null,
      region: row['REGION'] || null,
      med_class: row['MED CLASS'] || row['MEDCLASS'] || null,
      med_date: row['MED DATE'] || row['MEDDATE'] || null,
      med_exp_date: row['MED EXP DATE'] || row['MEDEXPDATE'] || null,
      source_file: basicFileName,
      source_date: args.sourceDate,
    };

    basicBatch.push(basicRow);

    if (basicBatch.length >= BATCH_SIZE) {
      if (!args.dryRun) {
        const inserted = await upsertBasicBatch(supabase, basicBatch);
        basicImported += inserted;
        if (inserted === 0) basicErrors += basicBatch.length;
      } else {
        basicImported += basicBatch.length;
      }
      basicBatch = [];
    }

    if (basicParsed % PROGRESS_INTERVAL === 0) {
      process.stdout.write(
        `\r  Parsed: ${basicParsed.toLocaleString()} | Imported: ${basicImported.toLocaleString()} | Skipped: ${basicSkipped.toLocaleString()}`,
      );
    }
  }

  // Flush remaining batch
  if (basicBatch.length > 0) {
    if (!args.dryRun) {
      const inserted = await upsertBasicBatch(supabase, basicBatch);
      basicImported += inserted;
      if (inserted === 0) basicErrors += basicBatch.length;
    } else {
      basicImported += basicBatch.length;
    }
  }

  console.log(
    `\r  Parsed: ${basicParsed.toLocaleString()} | Imported: ${basicImported.toLocaleString()} | Skipped: ${basicSkipped.toLocaleString()} | Errors: ${basicErrors}`,
  );

  // -----------------------------------------------------------------------
  // Phase 2: Import PILOT_CERT.csv
  // -----------------------------------------------------------------------

  console.log('\nPhase 2: Importing cert records...');
  const certFileName = path.basename(args.certCsv);

  let certParsed = 0;
  let certImported = 0;
  let certSkipped = 0;
  let certErrors = 0;
  let certBatch: CertRow[] = [];

  for await (const { headers, fields } of readCsvRows(args.certCsv)) {
    const row = rowToObject(headers, fields);

    const uniqueId = row['UNIQUE ID'] || row['UNIQUEID'] || '';
    const certType = (row['CERTIFICATE TYPE'] || row['TYPE'] || '').trim();

    if (!uniqueId || !certType) {
      certErrors++;
      continue;
    }

    certParsed++;

    // If --instructor-only, only import F and G cert rows
    if (args.instructorOnly && certType !== 'F' && certType !== 'G') {
      certSkipped++;
      if (certParsed % PROGRESS_INTERVAL === 0) {
        process.stdout.write(
          `\r  Parsed: ${certParsed.toLocaleString()} | Imported: ${certImported.toLocaleString()} | Skipped: ${certSkipped.toLocaleString()}`,
        );
      }
      continue;
    }

    const certLevel = row['LEVEL'] || null;

    const certRow: CertRow = {
      faa_unique_id: uniqueId,
      cert_type: certType,
      cert_level: certLevel,
      cert_expire_date: row['EXPIRE DATE'] || row['EXPIREDATE'] || null,
      rating_text: row['RATING'] || row['RATINGS'] || null,
      source_file: certFileName,
      source_date: args.sourceDate,
    };

    certBatch.push(certRow);

    if (certBatch.length >= BATCH_SIZE) {
      if (!args.dryRun) {
        const inserted = await upsertCertBatch(supabase, certBatch);
        certImported += inserted;
        if (inserted === 0) certErrors += certBatch.length;
      } else {
        certImported += certBatch.length;
      }
      certBatch = [];
    }

    if (certParsed % PROGRESS_INTERVAL === 0) {
      process.stdout.write(
        `\r  Parsed: ${certParsed.toLocaleString()} | Imported: ${certImported.toLocaleString()} | Skipped: ${certSkipped.toLocaleString()}`,
      );
    }
  }

  // Flush remaining batch
  if (certBatch.length > 0) {
    if (!args.dryRun) {
      const inserted = await upsertCertBatch(supabase, certBatch);
      certImported += inserted;
      if (inserted === 0) certErrors += certBatch.length;
    } else {
      certImported += certBatch.length;
    }
  }

  console.log(
    `\r  Parsed: ${certParsed.toLocaleString()} | Imported: ${certImported.toLocaleString()} | Skipped: ${certSkipped.toLocaleString()} | Errors: ${certErrors}`,
  );

  // -----------------------------------------------------------------------
  // Finalize import log
  // -----------------------------------------------------------------------

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (!args.dryRun && importLogId) {
    const totalErrors = basicErrors + certErrors;
    await supabase.from('faa_import_log').update({
      basic_rows_imported: basicImported,
      cert_rows_imported: certImported,
      completed_at: new Date().toISOString(),
      status: totalErrors > 0 ? 'completed_with_errors' : 'completed',
      error: totalErrors > 0 ? `${totalErrors} rows had errors` : null,
      metadata: {
        instructor_only: args.instructorOnly,
        basic_file: basicFileName,
        cert_file: certFileName,
        basic_parsed: basicParsed,
        basic_skipped: basicSkipped,
        cert_parsed: certParsed,
        cert_skipped: certSkipped,
        elapsed_seconds: parseFloat(elapsed),
      },
    }).eq('id', importLogId);
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------

  console.log(`\n==========================`);
  console.log(`FAA Airmen Import Summary`);
  console.log(`==========================`);
  console.log(`Mode:                ${args.dryRun ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`Source date:         ${args.sourceDate}`);
  console.log(`Instructor only:     ${args.instructorOnly}`);
  console.log(`---`);
  console.log(`Basic rows parsed:   ${basicParsed.toLocaleString()}`);
  console.log(`Basic rows imported: ${basicImported.toLocaleString()}`);
  console.log(`Basic rows skipped:  ${basicSkipped.toLocaleString()}`);
  console.log(`---`);
  console.log(`Cert rows parsed:    ${certParsed.toLocaleString()}`);
  console.log(`Cert rows imported:  ${certImported.toLocaleString()}`);
  console.log(`Cert rows skipped:   ${certSkipped.toLocaleString()}`);
  console.log(`---`);
  console.log(`Total errors:        ${(basicErrors + certErrors).toLocaleString()}`);
  console.log(`Elapsed time:        ${elapsed}s`);
  console.log(`Done!`);
}

main().catch((err) => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
