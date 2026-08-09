# slop-scraper Handoff — Round 1 User Testing

> **Purpose:** A running, portable checklist of changes that must originate in the
> `slop-scraper` repo (schema, backfills, scraper logic) to support the
> vanilla-slops improvements from the first round of real user testing.
> Bring this file into `slop-scraper` and work it top-to-bottom. Check items off
> as they land. The companion analysis lives in `docs/user-testing-round-1.md`.

_Last updated: 2026-08-08 · Source: launch_options data snapshot below._

---

## 0. Data snapshot (the ground truth this plan is built on)

Taken from the live `launch_options` table — **579 rows**.

| Dimension | Finding | Implication |
|---|---|---|
| **Sources** | 14 distinct names, no URLs. PCGamingWiki 264, Steam Community 96, ProtonDB 83, manual_curation 42, Valve Developer Community 21, … | No link target exists yet (feedback #2). Need `source_url`. |
| **risk_level** | experimental **425 (73%)**, safe 146, caution 8 | Risk filter would mostly return "experimental". Skew needs attention. |
| **categories** | 100% have a value, but **225 (39%) are "Uncategorized"**. Real: Display 154, Proton-Deck 85, Performance 61, Skip-Intro 28, Audio 23, Debug-Dev 23, Network 12 | Attribute filter (#1) is viable but leaky until Uncategorized shrinks. |
| **engine_compatibility** | only **169 (29%)** have ≥1 engine | Engine-based hints/filters are sparse. |
| **description** | 0.7% missing, but **10.9% are <25 chars** | Thin descriptions hurt #5 (examples/effect). |
| **votes** | **0 upvotes and 0 downvotes across all 579** | Community trust signal is unpopulated / unwired. |
| **verified** | 119 rows `true` (legacy; retired from UI) | Deprecated — see analysis doc trust model. |
| **created_at** | 14 distinct days, 2026-06-27 → 2026-08-02 | Real per-batch signal → usable as "Added" date (#3). NOT a bulk import. |

Re-run a fresh snapshot after each backfill to track progress. (A reusable
snapshot script can be added to `src/server/scripts/` on request — the ad-hoc
one used here lived outside the repo.)

---

## 1. Schema changes

All of these are additive (safe to ship before backfill). Apply to the live DB
**and** update `supabase/schema.sql` in vanilla-slops (currently stale — it is
already missing `risk_level`, `categories`, `engine_compatibility`).

```sql
-- Feedback #2 — real source links
alter table launch_options add column if not exists source_url text;

-- Feedback #3 — freshness / validation signals
alter table launch_options add column if not exists discovered_at  timestamptz; -- first time the scraper saw it in the wild
alter table launch_options add column if not exists last_verified_at timestamptz; -- last time it was re-checked and still valid
alter table launch_options add column if not exists verification_method text;     -- e.g. 'steam-api', 'pcgamingwiki-scrape', 'manual'

-- Feedback #5 — usage documentation (optional but recommended)
alter table launch_options add column if not exists usage_example text; -- concrete example, e.g. "-w 1920 -h 1080"
alter table launch_options add column if not exists effect       text; -- one-line "what it does to the game"
```

> **Decision needed:** do you want `discovered_at` distinct from `created_at`?
> `created_at` already approximates "added to DB" well (14 batches). If the
> scraper can't know true in-the-wild discovery, skip `discovered_at` and let
> the UI show `created_at` as "Added". Keep `last_verified_at` regardless — it is
> the important one.

### Also fix the stale schema file
`supabase/schema.sql` must be regenerated to include the previously-added
`risk_level` (text), `categories` (text[]), `engine_compatibility` (text[])
columns plus everything above, so a fresh `schema.sql` run reproduces prod.

---

## 2. Backfills

Ordered by user impact.

- [ ] **`source_url` backfill (#2).** Populate per option where a canonical URL
  is derivable:
  - PCGamingWiki → the game's PCGamingWiki page (constructible from title/app_id).
  - ProtonDB → `https://www.protondb.com/app/{app_id}`.
  - Steam Community / Guides → the specific guide/thread URL if captured; else
    the game's Steam community hub.
  - `manual_curation`, generic "Game-Specific Communities" → likely **no URL**;
    leave null and let the UI render them as plain (unlinked) provenance labels.
  - Documentation sources (Unity/Epic/Valve/id Tech) → the relevant docs URL.
- [ ] **`last_verified_at` backfill (#3).** On the next full crawl, stamp every
  option the scraper re-confirms. Options not seen in the latest crawl keep their
  old timestamp (that staleness is exactly the signal users want).
- [ ] **Category normalization (#1).** Reduce the 225 "Uncategorized". Target
  taxonomy (keep it small and stable — the UI filter will mirror it):
  `Display, Performance, Audio, Network, Proton-Deck, Skip-Intro, Debug-Dev`
  (+ `Uncategorized` as the residual). Map common commands to categories in
  `metadata_tagging.py`.
- [ ] **risk_level review (#1).** 73% "experimental" is a blunt default. Where a
  command is well-documented and low-impact (windowed/res/skip-intro), promote to
  `safe`. Reserve `experimental` for genuinely unproven/edge commands.
- [ ] **Description enrichment (#5).** Address the ~11% <25-char descriptions;
  optionally populate `usage_example` and `effect` for the highest-traffic
  commands first (the common Source/Proton flags).

---

## 3. New / changed scraper logic

- [ ] **Re-validation pass (#3).** Add a step that re-checks existing options on
  a cadence and updates `last_verified_at` + `verification_method`. Even a light
  "still present at source" check is far better than nothing (today there is no
  validation — the tester noticed).
- [ ] **Capture `source_url` at scrape time (#2).** Going forward, record the
  exact URL each option came from so new rows never need a backfill.
- [ ] **Emit `discovered_at`** (if adopted) on first insert; never overwrite it
  on updates.
- [ ] **Category + risk tagging** improvements feed directly into the filter.

---

## 4. Pipeline facts needed for the "How This Works" page (#4)

The vanilla-slops "How This Works" / methodology page must be **honest**, so
confirm these so the copy is accurate (don't overstate validation that isn't
there yet):

1. Exact list of sources crawled + priority order. (Snapshot shows 14; confirm
   the authoritative set.)
2. How often the crawler runs (cadence).
3. How an option's `risk_level` and `categories` are actually computed
   (`metadata_tagging.py` logic in plain English).
4. What "validation" means today (currently: sourced from the sites above; no
   functional testing; votes unpopulated) and what's planned.
5. How dedup/normalization works (each command stored once, shared across games).

---

## 5. Loose ends / cracks surfaced during analysis

- [ ] `supabase/schema.sql` is stale (see §1).
- [ ] Voting is unwired — 0/0 across all rows. Either wire it up or don't imply
  it in the UI/methodology copy.
- [ ] `verified` column is legacy (retired from UI). Decide: drop it, or keep as
  historical. Don't reintroduce it as a trust signal.
- [ ] `engine_compatibility` only 29% populated — low confidence for any
  engine-based feature until improved.
