# slop-scraper → vanilla-slops Handoff — Round 1 Follow-Through

> **Purpose:** Documents what changed in `slop-scraper` in response to the
> Round 1 user-testing handoff, what's already live in production, and what
> the website needs to account for. Read it before touching launch-option
> rendering code — several assumptions from the Round 1 doc's DB-only snapshot
> turned out to be incomplete once checked against the actual scraper code.

_Last updated: 2026-08-08 · Source: live `launch_options` snapshot below (524 rows, post-migration)._

---

## 0. Headline: a data-quality bug was found and fixed, not just tagging gaps

The Round 1 doc's "39% Uncategorized" number wasn't purely a tagging gap. **55
rows were confirmed to be scraper junk, not real launch options** — prose
fragments pulled out of PCGamingWiki wiki-page sentences (`-based`,
`-related`, `-protected`), page-title fragments (`-doom-ii`, `-saboteur`),
and two raw hash/GUID fragments. All had the literal fallback description
`"Launch option from PCGamingWiki"`, which is exactly the string the scraper
writes when it found a token but no real description to go with it — a
reliable tell in hindsight. These were deleted from production (55
`launch_options` rows, 72 `game_launch_options` links). **Total row count
dropped from 579 to 524.** If anything on the frontend caches or hardcodes
row counts, refresh it.

---

## 1. Schema — already applied, act accordingly

`migrations/002_add_source_url_and_verification.sql` has been run in
Supabase. `launch_options` now has, in addition to the `risk_level` /
`categories` / `engine_compatibility` columns from the prior round:

```sql
source_url            TEXT          -- nullable
last_verified_at      TIMESTAMPTZ   -- nullable
verification_method   TEXT          -- nullable
usage_example         TEXT          -- nullable
effect                TEXT          -- nullable
```

### Coverage right now — mostly empty, this is expected, not a bug

| Column | Populated | Notes |
|---|---|---|
| `source_url` | 50 / 524 (ProtonDB only) | See §2 |
| `last_verified_at` | 0 / 524 | See §3 |
| `verification_method` | 0 / 524 | Fills alongside `last_verified_at` |
| `usage_example` | 0 / 524 | Not populated by the scraper at all yet — treat as always-null for now |
| `effect` | 0 / 524 | Same — always-null for now |

**Frontend implication:** render `source_url` conditionally (null ≠ broken
link, it means "not backfilled yet" or "no stable per-option URL exists for
this source"). Don't build a "usage example" or "effect" UI element that
assumes data is there — there's nothing to show yet for any row.

---

## 2. `source_url` — how it fills in from here

- **ProtonDB**: backfilled deterministically where a command is linked to
  exactly one game (`app_id` → `https://www.protondb.com/app/{app_id}`).
  50 of 83 ProtonDB rows got a URL this way; the other 33 are shared
  wrapper commands (`gamemode`, `mangohud`, etc.) linked to many unrelated
  games — there's no single correct ProtonDB page for those, so they were
  deliberately left null rather than guessed. They'll likely stay null
  permanently; that's correct, not missing data.
- **PCGamingWiki / Steam Community**: NOT retroactively backfilled (would
  require live re-lookups against PCGamingWiki, which risks tripping its
  circuit breaker for ~209 historical rows with no urgent need). Both
  scrapers now capture `source_url` at scrape time going forward, AND the
  save path stamps it onto any existing row the scraper re-encounters with
  a fresh URL. **Practical effect: `source_url` coverage will climb on its
  own as normal scraping/`--rescan` runs happen** — no separate script
  needed, but also no fixed timeline. Don't build a UI that assumes >50
  rows have a URL any time soon.

---

## 3. `last_verified_at` / `verification_method` — read this before showing a "freshness" badge

**Every row shows `last_verified_at = NULL` right now**, including options
scraped weeks ago. This is because stamping only happens when a game is
*re-scraped* (normal run or `--rescan`), and none have been re-scraped since
the migration landed. This is NOT the same as "never verified" in a
concerning sense — it's "not yet touched under the new tracking system."

**Important framing for the UI**: if you show a "last verified" badge,
`NULL` should read as something neutral like *"not yet re-checked"*, not as
a red flag — otherwise literally the entire catalog will look stale on day
one, which is misleading. Once `--rescan` passes happen periodically,
coverage will grow organically.

`verification_method` values (once populated): `pcgamingwiki-scrape`,
`protondb-scrape`, `steam-community-scrape`, `manual`, or `curated` (for
game_specific.py's static engine-tagged lists and documentation-derived
sources — these are re-emitted from a fixed list each run, not freshly
fetched from the web, so "curated" rather than implying a live check).

---

## 4. `risk_level` — distribution changed significantly, not just a few rows

| | Before this round | After |
|---|---|---|
| `safe` | 146 | 305 |
| `experimental` | 425 | 211 |
| `caution` | 8 | 8 |
| Total | 579 | 524 |

The classifier now promotes options already recognized as
Display/Performance/Skip-Intro/Audio to `safe` (previously only an exact,
narrowly-curated flag list qualified). Network and Debug-Dev were
deliberately left conservative — those can touch multiplayer integrity or
anti-cheat, so they still default to `experimental` pending case-by-case
review. **If any frontend copy or color-coding assumed "most options are
experimental," that assumption no longer holds** — the catalog now skews
majority-safe (58%), which is a more accurate and less alarming picture for
users browsing options.

---

## 5. `categories` — Uncategorized is now more trustworthy, still not zero

172 / 524 (33%) remain `Uncategorized`, down from 225/579 (39%) — the drop
is entirely from junk deletion (§0), not new tagging logic. The classifier
itself wasn't changed for categories this round. Residual Uncategorized rows
are genuinely obscure game-specific flags (e.g. `-force_device_id`,
`-eac_launcher`, `-EpicPortal` — all real, just not fitting the existing
category taxonomy) — expected, not a gap to chase to zero.

---

## 6. Pipeline facts for the "How This Works" methodology page

Verified against the actual code, not assumed:

1. **Source order per game**: `game_specific.py` (curated engine-specific +
   manual_curation lists) → PCGamingWiki → Steam Community guides →
   ProtonDB, in that sequence.
2. **Cadence**: on-demand only. No cron job or scheduler exists anywhere in
   `slop-scraper` — it runs when the maintainer runs it manually via CLI.
   Don't imply a fixed refresh schedule in copy.
3. **Risk/category computation**: a pure function of the command string
   (+ source) — no ML, no network calls, a curated rule set of exact flags
   and keyword patterns (`validation/metadata_tagging.py`).
4. **What "validation" means today**: a save-gate rejects malformed/junk
   commands before insert; `last_verified_at` will track re-confirmation
   freshness going forward (see §3); **voting is schema-present but
   completely unwired** (0 upvotes/downvotes across every row, untouched
   this round) — don't claim it works in copy.
5. **Dedup**: `command` is a unique key in `launch_options` — the same flag
   found for multiple games is stored once and shared via the
   `game_launch_options` junction table.

---

## 7. Not done this round — still open

- `usage_example` / `effect` columns exist but are entirely unpopulated —
  no scraper or backfill writes to them yet.
- Description quality: 67 / 524 rows still have descriptions under 25
  characters (unchanged from Round 1 — not addressed this pass).
- Voting system: still unwired, as noted in §6.
- `verified` column: still legacy/retired from UI per Round 1 guidance — no
  change.
- PCGamingWiki/Steam Community `source_url` backfill: will happen
  organically, not on a guaranteed timeline (see §2).

---

## vanilla-slops side — what was wired in response (2026-08-08)

- **`source_url` plumbed through** `fetchLaunchOptionsForGame` (the single
  query behind both the SPA table expansion and the SEO game page). The
  already-shipped link-ready `renderSource` now emits real
  `target="_blank" rel="noopener"` links for the ~51 rows that have a URL;
  everything else stays plain text. Verified live: `-columns` →
  `https://www.protondb.com/app/6200`.
- **`last_verified_at` / `verification_method` plumbed through** and a
  conditional "Last checked {date}" chip added to each option (SPA + SEO).
  It renders **only** when `last_verified_at` is present — null is omitted,
  never shown as "stale" — exactly per §3. Grows organically as `--rescan`
  runs.
- **`usage_example` / `effect`**: intentionally NOT wired (no data, no UI)
  per §1/§7. Revisit when the scraper starts populating them.
- **Counts**: no fix needed — statistics/counts are computed live from the
  DB, so 524 was reflected automatically.
- **Risk copy/color**: verified no "mostly experimental" assumption existed;
  updated a stale CSS comment now that `safe` is the majority level.
- **Still open on this side (Phase B):** attribute filter by category/risk
  (#1) and the "How This Works" page (#4) — the §6 facts above unblock the
  latter.
