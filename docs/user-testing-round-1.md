# Round 1 User Testing — Analysis & Strategy

Real feedback from real users on launchoptions.dev. Each item below is assessed
against the actual codebase and a live data snapshot (see
`docs/slop-scraper-followthrough.md` §0). Verdicts mark whether the observation holds.

> **Status (2026-08-08):** the slop-scraper work has landed — schema applied,
> 55 junk rows removed (579 → 524), risk re-graded (now majority-*safe*), and
> `source_url`/freshness columns added. See `docs/slop-scraper-followthrough.md`
> for the authoritative post-migration state and exactly what vanilla-slops
> wired in response. The outgoing `slop-scraper-handoff.md` was retired once it
> was carried over to the scraper repo; section references below point to the
> follow-through doc.

**Ownership legend:** 🟦 vanilla-slops (this repo) · 🟨 slop-scraper · 🟪 both.

---

## 1. Filter the launch options, not the count 🟪

**Verdict: valid, and the highest-value change.**

Today the "Launch Options" filter (`options` param) only buckets *games* by
`total_options_count` — `has-options / no-options / many-options / few-options`
(see `gamesService.js` `applySearchFilters`). It never filters by any property of
the options themselves.

We now have the raw material to fix this: every option carries `risk_level` and
`categories`. Proposed: replace/augment the count buckets with **attribute
filters** — filter games that contain at least one option matching a chosen
**category** (Display, Performance, Audio, Network, Proton-Deck, Skip-Intro,
Debug-Dev) and/or **risk level**.

- 🟦 API: new query path that joins `game_launch_options` → `launch_options` and
  filters games having ≥1 matching option. Add `category` / `risk` facets. Mind
  the 1000-row cap and the existing N+1 fix.
- 🟦 UI: swap the count dropdown for category (and maybe risk) selects; keep a
  simple "has options" toggle.
- 🟨 Data quality gates this: **39% of options are "Uncategorized"** and **73%
  are "experimental."** The filter works today but returns coarse results until
  risk was re-graded (followthrough §4); category coverage improves organically (followthrough §5).

**Recommendation:** build the API+UI now against real categories; ship with the
7 real categories and let coverage improve as the scraper backfills.

---

## 2. Source links / hover behavior 🟪

**Verdict: confirmed bug.** `.option-source` has `cursor: help` (the "?" cursor
the user saw) and a dotted underline — both signal an interactive
tooltip/link — but there is **no `title` attribute and no href**. The affordance
is a promise with nothing behind it. Values are also raw (`manual_curation`).

- 🟦 **Now:** stop lying. Humanize labels (`manual_curation` → "Manual curation")
  and remove `cursor: help` + dotted underline until a real target exists. Add a
  plain `title` explaining "where this option was sourced from."
- 🟨 **Real links:** uses `source_url` on each option (followthrough §1–§2, now LIVE for ~51 rows). Some
  sources (PCGamingWiki, ProtonDB, docs) have derivable URLs; generic ones
  (`manual_curation`) legitimately have none → render unlinked.
- 🟦 **Then:** when `source_url` exists, render the source as an
  `target="_blank" rel="noopener"` link; otherwise plain text.

---

## 3. Show when discovered / last verified 🟪

**Verdict: valid, and the tester's guess ("no validation logic") is correct** —
there is no `last_verified_at` and votes are 0/0 across all rows.

- 🟦 **Now (real data):** `created_at` is genuinely meaningful — 14 distinct
  scrape batches, not one bulk import — so surface it as **"Added {date}"** on
  each option. Honest and immediately useful.
- 🟨 **"Last Verified" (the valuable one):** needs `last_verified_at` +
  `verification_method` and an actual re-validation pass in the scraper
  (followthrough §1, §3) — now wired: shown only when populated, so we never display a "verified" freshness claim we
  can't back up.
- 🟦 **Then:** show "Last checked {date}" and optionally a staleness hint
  (e.g. muted styling if older than N months).

---

## 4. "How This Works" section 🟪

**Verdict: strong idea; audience is semi-technical and wants the methodology.**

- 🟦 Build a dedicated, SEO-friendly page (fits the existing server-rendered
  page pattern, e.g. `/how-it-works`) covering: how options are generated, where
  they're sourced, how the crawler works, update cadence, how/whether they're
  validated, and a glossary of fields (risk levels, categories, source).
- 🟨 Content must be accurate → needs authoritative pipeline facts from
  slop-scraper (followthrough §6). Notably, be **honest about validation**: today
  options are sourced, not functionally tested; voting isn't populated yet.

This doubles as SEO surface area and directly raises trust.

---

## 5. Syntax examples & usage documentation 🟪

**Verdict: valid.** Descriptions mostly exist (0.7% missing) but ~11% are very
short, and none carry structured "example / effect / where to enter."

- 🟦 **General usage section (do now):** one static, reusable explainer — "How to
  apply launch options in Steam" (Steam → Library → right-click game →
  Properties → General → Launch Options) with a screenshot. This is identical for
  every option, so it belongs once on the game page and/or the How-It-Works page,
  not per-row.
- 🟨 **Per-option enrichment:** `usage_example` + `effect` columns (followthrough §1, §7 — still unpopulated)
  populated for high-traffic commands first; improve the thin descriptions.
- 🟦 **Then:** render `usage_example` / `effect` in the option card when present
  (defensive, like the current metadata badges).

---

## Cross-cutting cracks in the armor

Surfaced while investigating — worth fixing alongside:

1. ~~**`supabase/schema.sql` is stale**~~ — **resolved.** The `supabase/` dir was
   a gitignored, never-tracked backup left over from the old DB migration; its
   `seed.sql` self-dated to a 2025-08-22 backup and had drifted from prod. Deleted
   it — the live Supabase DB is the source of truth.
2. **Voting is unwired** — 0 up/0 down across all 524 options (still true post-
   migration, followthrough §6). Either implement it or avoid implying it exists
   (relevant to #3, #4 trust copy).
3. **`verified` is legacy** — retired from the UI. Decide keep vs drop; never
   reintroduce as a trust signal.
4. ~~**risk skew (73% experimental) & 39% uncategorized**~~ — **much improved.**
   Junk removal + re-grading put the catalog at **58% safe** (305/524) and **33%
   uncategorized** (172/524). The #1 filter is now viable against real data
   (followthrough §4–§5).

---

## Suggested sequencing

**Phase A — vanilla-slops quick wins (no scraper dependency): ✅ DONE**
1. [x] Fix the misleading Source affordance + humanize labels, link-ready (#2
   frontend) — SPA (`table.js`) + SEO game page (`seoController.js`).
2. [x] Show "Added {date}" from `created_at` (#3 frontend) — SPA + SEO.
3. [x] "How to apply on Steam" general usage section (#5 general) — SEO game page.
4. [x] ~~Regenerate `supabase/schema.sql`~~ — obviated (dir deleted, see cracks §1).

**Phase B — vanilla-slops feature (uses existing data): ✅ DONE**
5. [x] Attribute filter by category/risk (#1 API + UI) — games are filtered to
   those with ≥1 option matching the chosen category and/or risk, via an
   embedded inner-join (distinct-game count verified against ground truth).
   Category + Risk dropdowns added, fed by new launch-option facets.
6. [x] "How This Works" page (#4) — shipped at `/how-it-works`.

**Phase C — slop-scraper side (done), wired up in vanilla-slops:**
7. [x] `source_url` → real source links (#2) — scraper adds it; SPA + SEO now
   render live links for the ~51 rows that have one.
8. [x] `last_verified_at` → "Last checked {date}" (#3) — wired conditionally
   (shown only when populated; grows as `--rescan` runs).
9. [~] Category/risk backfill → sharpens the #1 filter — risk done, categories
   improve organically.
10. `usage_example`/`effect` enrichment → per-option docs (#5) — still open
    (columns exist but unpopulated, followthrough §7).
