# 17 - FAA Verification Operations and Freshness

Phase 9 of the Instructor Program — documents the FAA data source, import pipeline, freshness policy, and operational procedures for keeping instructor verification data current.

---

## FAA Data Source

| Field | Value |
|-------|-------|
| URL | https://registry.faa.gov/database/ReleasableAirmen.zip |
| Contains | `PILOT_BASIC.csv`, `PILOT_CERT.csv` |
| Update frequency | Quarterly (by the FAA) |
| Format | CSV with pipe or comma delimiters |
| Certificate numbers | **NOT included** in the downloadable dataset |

The FAA Releasable Airmen database is a publicly available dataset containing basic airman information (name, city, state, medical class) and certificate records (certificate type, level, ratings). It does **not** include certificate numbers, which means our verification logic cannot confirm a specific certificate number against FAA records. This is a known limitation documented in the `certificate_number_unverifiable` reason code.

---

## Import Pipeline

### Script Location

`scripts/instructor/import-faa-airmen.ts`

### Usage

```bash
npx tsx scripts/instructor/import-faa-airmen.ts \
  --basic-csv <path-to-PILOT_BASIC.csv> \
  --cert-csv <path-to-PILOT_CERT.csv> \
  --source-date YYYY-MM-DD \
  [--instructor-only] \
  [--dry-run]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--basic-csv <path>` | Yes | Path to the PILOT_BASIC.csv (or .txt) file |
| `--cert-csv <path>` | Yes | Path to the PILOT_CERT.csv (or .txt) file |
| `--source-date <YYYY-MM-DD>` | Yes | Publication date of the FAA dataset |
| `--instructor-only` | No | Only import flight/ground instructors (cert type F or G) |
| `--dry-run` | No | Parse and validate without writing to the database |

### NPM Shortcut

```bash
npm run instructor:import:faa -- --basic-csv data/PILOT_BASIC.csv --cert-csv data/PILOT_CERT.csv --source-date 2026-03-01
```

### Database Tables

| Table | Purpose |
|-------|---------|
| `faa_airmen` | Basic airman records (name, location, medical info) |
| `faa_airmen_certs` | Certificate records per airman (type, level, ratings) |
| `faa_import_log` | Tracks each import run (source_date, status, row counts) |

### Safety Guards

- **`--dry-run` mode**: Parses and validates CSV files without writing to the database. Always use this first with a new dataset.
- **`ALLOW_PROD_WRITE` guard**: The script calls `assertNotProduction()` and will refuse to run against production unless `ALLOW_PROD_WRITE=1` is set explicitly.
- **Environment detection**: Uses `getAppEnv()` to detect the current environment and log it before any writes.
- **Batch upserts**: Uses `ON CONFLICT` upserts (not blind inserts) to safely re-run imports without duplicating data.

### Import Log Schema

```sql
CREATE TABLE faa_import_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_date DATE NOT NULL,
  source_url TEXT,
  basic_rows_imported INTEGER NOT NULL DEFAULT 0,
  cert_rows_imported INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);
```

---

## Freshness Policy

### Threshold

**45 days** from the `source_date` of the most recent completed import.

This threshold is defined as the constant `FAA_FRESHNESS_THRESHOLD_DAYS = 45` in the eval script (`scripts/eval/instructor-faa-freshness.ts`).

### Freshness Verdicts

| Verdict | Condition | Meaning |
|---------|-----------|---------|
| `FRESH` | `source_date` is within 45 days of today | Data is current; no action needed |
| `STALE` | `source_date` is more than 45 days old | Data should be refreshed; verification still works but confidence may be lower for new applicants |
| `NO_DATA` | No completed import log entries exist | No FAA data available; all verifications fall back to manual review |

### When Data Is Stale

- Instructor verification **still works** but may not reflect recent FAA certificate changes
- Confidence for **new applicants** may be lower since recently issued certificates might not appear
- Existing verified instructors are not affected (their verification was already completed)
- The manual review path remains fully available regardless of freshness
- Admin should schedule a re-import from the latest FAA dataset

### When No FAA Data Exists

- `computeVerificationResult()` returns `confidence: 'none'` with `status: 'needs_manual_review'`
- The `faa_data_not_available` reason code is included
- Admin can still approve instructors based on documentation they provide
- This is the expected state for a new deployment before the first import

---

## Freshness Monitoring

### Eval Script

```bash
npm run eval:instructor-faa-freshness
```

This runs 8 deterministic offline checks that validate the freshness logic without requiring a database connection.

### Checks

| # | Check | What It Validates |
|---|-------|-------------------|
| 1 | FAA import log table schema referenced | FaaImportLogEntry interface includes source_date, completed_at, status |
| 2 | Freshness threshold constant exists | FAA_FRESHNESS_THRESHOLD_DAYS = 45 |
| 3 | No imports case | computeFaaFreshness(null) returns stale=true, daysOld=null, verdict=NO_DATA |
| 4 | Fresh import case | source_date within 45 days returns stale=false, verdict=FRESH |
| 5 | Stale import case | source_date 60+ days ago returns stale=true, verdict=STALE |
| 6 | Verification without FAA data | No-data verdict triggers manual review path |
| 7 | Manual review fallback | Stale recommendation includes re-import instructions and FAA URL |
| 8 | Import script exists | File exists at scripts/instructor/import-faa-airmen.ts |

### Evidence Output

The eval script writes evidence to:

- `docs/instructor-program/evidence/2026-03-06-phase9/eval/instructor-faa-freshness.json`
- `docs/instructor-program/evidence/2026-03-06-phase9/eval/instructor-faa-freshness.md`

### Integration with Admin Quality Endpoints

Admin quality endpoints surface import metadata (last import date, source date, row counts) from the `faa_import_log` table. When freshness monitoring detects stale data, admins can see this in the partnership dashboard.

---

## Verification Without FAA Data

When no FAA data has been imported (or all imports have failed), the verification module behaves as follows:

1. `verifyInstructor()` queries `faa_import_log` for any `status = 'completed'` entries
2. If none exist, `hasFaaData` is set to `false`
3. `computeVerificationResult()` returns:
   - `confidence: 'none'`
   - `status: 'needs_manual_review'`
   - `reasonCodes: ['faa_data_not_available', 'certificate_number_unverifiable']`
   - `explanation: 'No FAA airmen data has been imported yet. Manual verification required.'`
4. The admin reviews the instructor's submitted documentation manually
5. Admin can approve or reject based on their own verification of certificates

This ensures the instructor program can operate even before FAA data is loaded.

---

## Recommended Cron Schedule

### Frequency

**Monthly or quarterly**, aligned with FAA release cadence.

The FAA updates the Releasable Airmen database quarterly. Monthly imports are recommended if operational cadence allows, to catch any mid-cycle corrections.

### Process

1. **Download** the latest dataset:
   ```bash
   curl -O https://registry.faa.gov/database/ReleasableAirmen.zip
   unzip ReleasableAirmen.zip -d data/
   ```

2. **Dry-run** to validate the data:
   ```bash
   npx tsx scripts/instructor/import-faa-airmen.ts \
     --basic-csv data/PILOT_BASIC.csv \
     --cert-csv data/PILOT_CERT.csv \
     --source-date $(date +%Y-%m-%d) \
     --instructor-only \
     --dry-run
   ```

3. **Live import** (after confirming dry-run output):
   ```bash
   npx tsx scripts/instructor/import-faa-airmen.ts \
     --basic-csv data/PILOT_BASIC.csv \
     --cert-csv data/PILOT_CERT.csv \
     --source-date $(date +%Y-%m-%d) \
     --instructor-only
   ```

4. **Verify** the import completed:
   - Check `faa_import_log` for a row with `status = 'completed'`
   - Review `basic_rows_imported` and `cert_rows_imported` counts
   - Run the freshness eval: `npm run eval:instructor-faa-freshness`

### Monitoring

- Check `faa_import_log` for `status = 'completed'` entries with recent `source_date`
- If `source_date` is more than 45 days old, the freshness eval will flag it as `STALE`
- Set up an external cron reminder (e.g., calendar event) to download and import quarterly

### Production Considerations

- The import script requires `ALLOW_PROD_WRITE=1` to run against production
- Use `--instructor-only` to reduce import size (~90% reduction) when only instructor data is needed
- Large imports (full dataset without `--instructor-only`) may take several minutes
- The script uses batch upserts of 500 rows at a time to manage memory and database load
