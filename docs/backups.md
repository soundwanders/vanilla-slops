# Backups

## The situation

Supabase's Free plan includes **no automated backups** — not daily, not
point-in-time. That is not a gap in the setup here; it is what the plan is.
Supabase's own guidance is that free-tier projects export regularly and keep the
copies off-site. Until this project is on a paid plan, the exports described
below are the only thing standing between a bad day and starting over.

Measured 2026-08-22: the entire database is **2.5 MB across 20,548 rows**. The
cost of backing it up is trivial. The cost of not having done so is not.

## What is actually at risk

Not all of it is equally replaceable, and the ranking is not the obvious one.

**The schema is the irreplaceable part.** The DDL was deliberately removed from
this repo — the live database is the source of truth. That means the
`public_games` and `public_launch_options` view definitions, the
`total_options_count` trigger, the `pg_trgm` indexes, and the GRANTs exist in
exactly one place in the world. They are small, they are text, and they are the
part that no amount of re-scraping brings back.

**The data is rebuildable, slowly.** `slop-scraper` can repopulate the
catalogue, but that is a rebuild measured in hours against live third-party
sources, not a restore, and it has never been rehearsed under pressure. What it
cannot bring back is anything hand-corrected in the Supabase dashboard, which
exists in exactly one place too.

So the order of value is: schema first, then data, then convenience.

## Layer 1 — `npm run db:backup` (works today, no setup)

```bash
npm run db:backup
```

Reads every base table through the REST API with the service_role key and writes
NDJSON plus a manifest to `backups/<timestamp>/`. That directory is gitignored.

It needs no Postgres client, no connection string and no new dependency — it
runs with the `.env` already on the machine. That is deliberate: a backup you can
take right now beats a better one you have to install tooling for first.

It verifies as it goes. If the row count written does not match the count the
database reported before the export started, it fails loudly and tells you not
to keep the file. A backup that silently stopped early is worse than none — it
looks like insurance and is not.

**It captures data only.** No schema, no views, no triggers, no indexes, no
grants. Restoring from it means recreating the schema first and loading data
into it. Which is why layer 2 exists.

**Copy the directory off this machine.** A backup on the same disk as nothing
else is a backup against exactly one failure mode.

## Layer 2 — the schema snapshot (needs one-time setup)

This is the layer that matters most and the one not yet automated.

```bash
# One-time: install the CLI and get the direct connection string from
# Supabase → Project Settings → Database → Connection string → URI.
# Locally, the direct connection is the right one (if your network has IPv6).
# From GitHub Actions it is not — see the table below.
supabase db dump --db-url "$SUPABASE_DB_URL" --schema-only -f schema.sql
```

A schema-only dump contains no rows and no secrets, so unlike the data it is
safe to keep in this public repo. Committing a regenerated snapshot is not the
same mistake as the stale hand-maintained migrations that were deleted in
August 2026: a snapshot regenerated from the live database cannot drift from it
by construction, whereas hand-written migrations drifted precisely because they
were maintained separately.

Take one **before and after** any grant change — including the least-privilege
work in section 9 of `sql-snippets.sql` — so the change is a readable diff
rather than a memory.

## Layer 3 — the weekly workflow

`.github/workflows/backup.yml` runs every Sunday at 04:00 UTC and uploads an
encrypted dump as a 90-day artifact. It stays inert, warning rather than
failing, until two repository secrets exist:

| Secret | Where it comes from |
| --- | --- |
| `SUPABASE_DB_URL` | Project Settings → Database → Connection string → **Session pooler** (port 5432) |
| `BACKUP_PASSPHRASE` | Any long random string |

Keep the passphrase somewhere that is **not this repo and not the same password
manager entry as the database itself**. A backup you cannot decrypt is not a
backup.

### Which connection string — this one is a trap

Supabase offers three, and the one that reads as obviously correct is wrong for
CI.

| Option | Port | Works from GitHub Actions? | Works for `pg_dump`? |
| --- | --- | --- | --- |
| Direct connection | 5432 | **No** — IPv6 only without the paid IPv4 add-on, and runners are IPv4-only | Yes |
| **Session pooler** | 5432 | **Yes** — IPv4 on every tier | **Yes** |
| Transaction pooler | 6543 | Yes | **No** — no session-level features |

So: **session pooler for the workflow, direct connection for local dumps** (if
your own network has IPv6, which most home ISPs now do).

The session pooler host looks like `aws-0-<region>.pooler.supabase.com` and the
username is `postgres.<project-ref>` rather than bare `postgres` — if you copied
a string with plain `postgres@`, you took the direct one.

The failure mode if you pick wrong is unhelpful: a direct URL from CI resolves
fine and then hangs or refuses, which reads like a credentials problem rather
than a network-family problem.

The encryption is not optional. This repository is public, artifacts on a public
repo are downloadable by anyone who can see the Actions tab, and a plain dump
would publish the launch options that `public_launch_options` deliberately hides
because the project cannot stand behind them.

90 days is a rolling window, not an archive. Pull one down to cold storage
periodically or the oldest thing you have is always three months old.

## Restoring

```bash
# From a layer 3 artifact:
gpg --decrypt --batch --passphrase "$BACKUP_PASSPHRASE" \
    -o restore.sql slops-backup-YYYY-MM-DD.sql.gpg
psql "$SUPABASE_DB_URL" -f restore.sql
```

From a layer 1 export: create the schema first, then load each `.ndjson`.

### The circular-FK warning, and why it does not apply here

`games.duplicate_of` is a foreign key pointing back at `games.app_id`, so
pg_dump prints this on every `--data-only` run:

```
pg_dump: warning: there are circular foreign-key constraints on this table:
pg_dump: detail: games
```

**It is a generic structural warning, not a finding about this dump.** It fires
because the cycle exists, not because pg_dump established that the output would
fail to load. Verified 2026-08-22 by decrypting an actual artifact and testing
the semantics against the live database:

- The CLI's `--data-only` output **already opens with `SET
  session_replication_role = replica;`**, so row triggers are disabled for the
  whole data load before anything else happens.
- The data is emitted as **one multi-row `INSERT` per table**, not `COPY`.
  Foreign keys are implemented as AFTER ROW triggers, and Postgres queues those
  to *statement* end — so a row referencing a row listed later in the same
  `INSERT` is fine. Confirmed on a temp table with a self-referencing FK:

  | statement shape | result |
  | --- | --- |
  | one multi-row INSERT, child before parent | succeeds |
  | two separate INSERTs, child first | **fails, 23503** |
  | one multi-row INSERT, parent before child | succeeds |

  Only the middle shape breaks, and the dump never produces it.

So `psql -f restore.sql` is the whole procedure. Physical row order does not
matter here, and no drop/re-add dance is needed — including for artifacts made
before this was understood.

**What the workflow's wrapper is actually for.** The CLI sets
`session_replication_role = replica` and never resets it, which would leave
every statement you run *after* the restore, in the same psql session, executing
with triggers disabled. The workflow appends `SET session_replication_role =
DEFAULT;` to close that window. It also keeps the file correct if the CLI's
output format ever changes to one of the shapes that would break.

**Rehearse this whenever the dump format or the restore target changes.** An
untested backup is a hypothesis, and the first time you find out whether it works
should not be the day you need it. This project's first rehearsal is recorded
below — it passed, and it corrected a wrong belief about the artifact that had
already been written down twice.

### Rehearsed end to end, 2026-08-22 — it works

Not "it decrypts and looks about right": the artifact was loaded into a real,
empty PostgreSQL instance and the result compared against live column by column.

**The data is byte-for-byte faithful.** Content fingerprints, not row counts:

| fingerprint | live | restored |
| --- | --- | --- |
| `games` (app_id, title, engine) | `1c15cb150c83` | match |
| `launch_options` (id, command, risk_level) | `b9fa7d4f9a21` | match |
| `game_launch_options` (both columns) | `6ecf13dd487c` | match |
| `public_games` | `7d56abfe19a0` | match |
| `public_launch_options` | `17149131ea1d` | match |

**The structure came back too**, which is the part this document ranks first:
2,853 / 529 / 19,051 rows, both views returning their correct filtered counts
(2,847 and 434), all three foreign keys restored **and validated**, 16 indexes,
and both triggers. `trg_sync_options_count` was not merely present — inserting a
junction row moved Team Fortress 2's `total_options_count` from 28 to 29, so the
trigger is live in the restored database, not just recreated as text.

### The restore target is not a free choice

**120 of the dump's 237 statements failed on a plain PostgreSQL server, and 114
of them were GRANTs:**

```
[38x] role "anon" does not exist
[38x] role "authenticated" does not exist
[38x] role "service_role" does not exist
[3x]  schema "extensions" does not exist
[1x]  extension "supabase_vault" is not available
[1x]  publication "supabase_realtime" does not exist
```

Every one is Supabase platform furniture rather than project data — which is why
the tables and views still landed perfectly. But the GRANT failures are the ones
that matter, because **the GRANT set is the security model**. The views run with
`security_invoker=off` and `anon` was revoked from the base tables; without those
grants the application connects to a database holding perfect data and reads
nothing from it. That is the "queries return empty rather than erroring" failure
this project already knows is the hardest kind to diagnose.

**So: restore into a Supabase project**, where the three roles exist. If you ever
must restore somewhere else, create `anon`, `authenticated` and `service_role`
first, then load the dump — otherwise you will spend the worst hour of the
incident debugging permissions rather than recovering.

Two smaller notes from the same run. The dump touches the `auth` (23 references)
and `storage` (7) schemas as well as `public`; harmless here, since this project
uses neither, but it explains the stragglers in the list above. And the rehearsal
was run against PostgreSQL 18 while the dump came from 17.6 — restoring forward a
major version worked without complaint.

What the rehearsal caught was not a broken backup but a broken belief about one;
see the circular-FK section above.

## The pause risk, which is tighter than it looks

Free projects pause after **one week** of inactivity — not the 90 days this
project's notes assumed. `.github/workflows/health.yml` hits the live API every
four hours, which is what keeps it awake.

But GitHub disables scheduled workflows on a public repo after 60 days with no
repository activity. So: stop committing for two months → the workflow is
disabled → the keepalive stops → the project pauses **within a week** → and the
thing that would have emailed you about it is the thing that was disabled.

**That circle is now broken.** Two external checks run on `cron-job.org`, outside
this repository and therefore immune to GitHub disabling anything:

| check | target | interval |
| --- | --- | --- |
| database keepalive | Supabase | every 3 days |
| full-stack check | `https://launchoptions.dev/api/games` | every 3 days |

The second is the more useful of the two: it exercises the serverless function,
the database and the CDN in one request, so a pass means the whole chain is up,
not merely that the database is awake. Both notify on the first failure, which is
what makes them monitors rather than just keepalives.

The three-day interval is deliberate. A seven-day ping against a seven-day pause
threshold has no margin at all — one missed run and the project sleeps. Three
days leaves room for a failure and a retry before anything is at stake.

`health.yml` still runs every four hours and is still useful; it is simply no
longer the only thing standing between this project and a silent pause.

## When to start paying

Pro is $25/month: daily backups kept 7 days, 8 GB disk, 250 GB egress, and no
pausing at all — which retires the whole circular-dependency problem above.

Against a stated ~$5/month budget that is a real jump, and today it is not
warranted: the database is 2.5 MB against a 500 MB ceiling, and free-tier egress
is 5 GB/month. The honest trigger is not traffic. It is the first moment when
losing the database would cost more than the insurance — which is likely to be
the point where hand-corrections and community contributions outweigh what
`slop-scraper` can regenerate, not the point where the row count gets large.

Until then: run layer 1 monthly, get layer 2 committed, and turn on layer 3.
