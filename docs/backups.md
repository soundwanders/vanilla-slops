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
# Use the DIRECT connection, not the pooler: pg_dump needs a session.
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
| `SUPABASE_DB_URL` | Project Settings → Database → Connection string → URI (direct, not pooler) |
| `BACKUP_PASSPHRASE` | Any long random string |

Keep the passphrase somewhere that is **not this repo and not the same password
manager entry as the database itself**. A backup you cannot decrypt is not a
backup.

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

**Rehearse this once against a throwaway Supabase project.** An untested backup
is a hypothesis. The first time you find out whether it works should not be the
day you need it.

## The pause risk, which is tighter than it looks

Free projects pause after **one week** of inactivity — not the 90 days this
project's notes assumed. `.github/workflows/health.yml` hits the live API every
four hours, which is what keeps it awake.

But GitHub disables scheduled workflows on a public repo after 60 days with no
repository activity. So: stop committing for two months → the workflow is
disabled → the keepalive stops → the project pauses **within a week** → and the
thing that would have emailed you about it is the thing that was disabled.

One external uptime check, hosted anywhere that is not this repo, breaks that
circle. It is the cheapest reliability buy available here.

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
