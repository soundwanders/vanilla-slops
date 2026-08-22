/**
 * @fileoverview Local database export — `npm run db:backup`.
 *
 * WHY THIS EXISTS
 *
 * Supabase's Free plan includes no automated backups: not daily, not
 * point-in-time. Their own guidance is that free-tier projects export regularly
 * and keep the copies off-site. Until this project is on a paid plan there is
 * otherwise nothing to restore from.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 *
 * This is a DATA export, not a pg_dump. It reads through the REST API with the
 * service_role key, which means it needs no Postgres client, no connection
 * string and no new dependency — it runs today with the .env you already have.
 * That is the whole point: a backup you can take right now beats a better one
 * you have to install tooling for first.
 *
 * What it does NOT capture is the schema — table definitions, the
 * public_games / public_launch_options views, the total_options_count trigger,
 * the pg_trgm indexes, and the GRANTs. Those live only in the running database
 * (the DDL was deliberately removed from this repo), so they are the part that
 * is genuinely irreplaceable. Restoring from this file means recreating the
 * schema first and loading data into it. See docs/backups.md.
 *
 * FORMAT
 *
 * One NDJSON file per table plus a manifest. NDJSON rather than one big JSON
 * array so a truncated file still yields every complete row before the cut, and
 * so a diff between two backups is readable. The manifest records the row count
 * the database reported before the export started; verify-on-write compares it
 * to what was actually written, because a backup that silently stopped early is
 * worse than no backup at all — it looks like insurance and is not.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Base tables only. The public_* views are derived from these, so exporting
// them would duplicate data while capturing none of the definition that makes
// them useful.
const TABLES = ['games', 'launch_options', 'game_launch_options'];

// PostgREST caps a single response; page well under it and keep memory flat.
const PAGE_SIZE = 1000;

function fail(message) {
  console.error(`\n  ✖ ${message}\n`);
  process.exit(1);
}

async function exportTable(supabase, table, outDir) {
  const { count: expected, error: countError } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (countError) fail(`Could not count ${table}: ${countError.message}`);

  const file = path.join(outDir, `${table}.ndjson`);
  const stream = fs.createWriteStream(file, { encoding: 'utf8' });
  let written = 0;

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) fail(`Reading ${table} at offset ${offset}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      // Backpressure is ignored deliberately: these are small tables and the
      // process exits on completion, so the simpler synchronous-looking write
      // is worth more than the throughput a drain handler would buy.
      stream.write(`${JSON.stringify(row)}\n`);
      written++;
    }

    process.stdout.write(`\r  ${table}: ${written}/${expected}`);
    if (data.length < PAGE_SIZE) break;
  }

  await new Promise((resolve, reject) => {
    stream.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  const bytes = fs.statSync(file).size;
  process.stdout.write(`\r  ${table}: ${written}/${expected} rows · ${(bytes / 1024 / 1024).toFixed(2)} MB\n`);

  // A short read is the failure this whole script exists to catch.
  if (written !== expected) {
    fail(`${table} exported ${written} rows but the database reported ${expected}. ` +
         `The backup is incomplete — do not keep it. Re-run, and if it repeats, the ` +
         `table is changing under the export.`);
  }

  return { table, rows: written, bytes, file: path.basename(file) };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. ' +
         'Run with: node --env-file=.env src/server/scripts/backup-database.js');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const startedAt = new Date();
  const stamp = startedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const outDir = path.resolve(process.cwd(), 'backups', stamp);
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n  Vanilla Slops — database export`);
  console.log(`  ${outDir}\n`);

  const results = [];
  for (const table of TABLES) {
    results.push(await exportTable(supabase, table, outDir));
  }

  const manifest = {
    takenAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    supabaseUrl: SUPABASE_URL,
    format: 'ndjson',
    // Stated plainly in the manifest so a future reader restoring from this
    // knows what they are holding before they discover it the hard way.
    contains: 'table data only — no schema, no views, no triggers, no indexes, no grants',
    tables: results,
    totalRows: results.reduce((sum, r) => sum + r.rows, 0),
    totalBytes: results.reduce((sum, r) => sum + r.bytes, 0),
  };

  fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const mb = (manifest.totalBytes / 1024 / 1024).toFixed(2);
  console.log(`\n  ✔ ${manifest.totalRows.toLocaleString()} rows · ${mb} MB · ${(manifest.durationMs / 1000).toFixed(1)}s`);
  console.log(`\n  This captures data only. The schema — views, triggers, indexes,`);
  console.log(`  grants — exists nowhere but the live database. See docs/backups.md.`);
  console.log(`\n  Copy this directory somewhere that is not this machine.\n`);
}

main().catch((err) => fail(err.message));
