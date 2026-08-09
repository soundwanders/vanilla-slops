# slop-scraper → vanilla-slops — Round 1 Follow-Through (FINAL)

> **Purpose:** What changed in `slop-scraper`, what is live in production now,
> and what the website should expect. Supersedes the earlier draft of this
> file — the coverage numbers in that version were mid-flight and are now
> stale. Everything below is measured against the live database.

_Last updated: 2026-08-09 · live `launch_options` snapshot: **541 rows**._

---

## 0. Headline

Two rounds of work: provenance/freshness columns were added and populated, and
a description-quality bug was root-caused and fixed at the source.

**The frontend needs no changes for any of this.** Every column the
vanilla-slops v1.2.2 release wired defensively now has real data flowing into
it. The conditional `source_url` link and the "Last checked" chip will simply
start appearing on far more rows.

---

## 1. Coverage — what actually has data now

| Column | Populated | Change this round |
|---|---|---|
| `source_url` | **387 / 541 (72%)** | was 50 |
| `last_verified_at` | **339 / 541 (63%)** | was 0 |
| `verification_method` | 339 / 541 | was 0 |
| `description` | 427 / 541 (79%) | 114 deliberately empty — see §3 |
| `usage_example` | 0 | still unpopulated |
| `effect` | 0 | still unpopulated |

`source_url` by source: PCGamingWiki 201, Steam Community 80, ProtonDB 58,
manual_curation 23, plus documentation sources.

`verification_method` values in use: `pcgamingwiki-scrape`,
`steam-community-scrape`, `protondb-scrape`. (`manual` and `curated` exist in
the code but no rows carry them yet.)

---

## 2. The single most important number for the UI

Of the 114 rows with no description:

- **95 have a `source_url`** → the site renders the provenance link, which is
  the intended fallback.
- **19 have neither** → these render blank. That is the true remaining gap,
  down from 103 mid-round.

So "missing description" is now overwhelmingly a *handled* state, not a hole.
**Do not treat a null description as an error condition** — it is a deliberate
signal (see §3), and in 83% of cases there is a link to show instead.

---

## 3. Descriptions: why 114 are intentionally empty

Three bugs in the PCGamingWiki wikitext parser were writing text that was
wrong rather than merely thin:

1. **Mismatch (worst).** The parser searched a ~500-character window for any
   `description=` template parameter and bound the first hit to the current
   command — so a *neighbouring* option's text got attached to the wrong flag.
   `-resx=1920` was documented as "Enable Direct3D 11";
   `-localization=english` as "Disable SLI/Crossfire". Confidently wrong data.
2. **Mangling.** The command was deleted from anywhere in the sentence,
   shredding prose: "Use the `-hz`=x command line argument" → "Use the =x
   command line argument".
3. **Markup leakage** — template syntax surviving into descriptions.

All three are fixed. 119 corrupted rows were repaired or cleared, including
every confirmed-wrong one.

**Policy going forward, and the reason for the empty rows:** a description
that is wrong, circular ("Use the -nomovie"), a pasted list of *other* flags,
or a non-answer ("Not tested yet") is stored as **NULL** rather than kept.
The site showing a source link is more honest than text that looks like an
answer without being one. This is enforced on the write path
(`validation/description_quality.py`), not by a cleanup script — an earlier
attempt that only cleaned the database was silently undone the moment the
scraper ran again.

**Consequence worth knowing:** description coverage will not climb much from
re-scraping. The good text mostly is not in the source in a form that can be
attributed safely, and the parser now declines to guess. Raising this number
requires the curated flag dictionary (§6), not more crawling.

---

## 4. `risk_level` and `categories`

| risk_level | rows |
|---|---|
| safe | 310 |
| experimental | 223 |
| caution | 8 |

The catalogue is now **majority-safe (57%)**, reversed from the 73%-experimental
skew reported in Round 1. Any copy or color logic assuming "most options are
experimental" is out of date.

Categories: Display 156, Proton-Deck 85, Performance 63, Skip-Intro 28,
Audio 23, Debug-Dev 23, Network 12, **Uncategorized 184 (34%)**. The
Uncategorized remainder is genuinely obscure game-specific flags
(`-force_device_id`, `-EpicPortal`, `-uplay_steam_mode`), not a classifier
gap to chase to zero.

---

## 5. Pipeline facts for the "How This Works" page

Verified against the code, not assumed:

1. **Source order per game:** `game_specific.py` (curated engine lists +
   manual_curation) → PCGamingWiki → Steam Community guides → ProtonDB.
2. **Cadence:** on-demand only. No cron or scheduler exists in the repo — it
   runs when the maintainer runs it. Do not imply a refresh schedule.
3. **Risk/category computation:** a pure function of the command string and
   source. No ML, no network calls — a curated rule set
   (`validation/metadata_tagging.py`).
4. **What "validation" means today:** a save gate rejects malformed commands
   and non-descriptions before insert; `last_verified_at` records when an
   option was last re-confirmed at its source. **Voting remains entirely
   unwired** (0 upvotes/downvotes across all rows) — do not claim it works.
5. **Dedup:** `command` is unique in `launch_options`; a flag found for many
   games is stored once and shared via the `game_launch_options` junction.
6. **Honest caveat worth publishing:** PCGamingWiki simply does not document
   launch options for most games. Verified directly — Dark Souls II, INSIDE
   and Beat Saber have zero documented flags on their wiki pages. A game with
   no options is usually accurate, not a scraper failure.

---

## 6. Still open

- **`usage_example` / `effect`: still 0 rows.** The frontend renders them when
  present, so populating them is purely scraper-side work.
- **Curated flag dictionary** — the highest-value remaining item. Most
  well-known flags (Source, Unity, Unreal, Proton, id Tech) have authoritative
  documented meanings. A hand-verified `command → {description, effect,
  usage_example}` map would fix thin descriptions *and* seed the usage-docs UI
  in one pass. This is the only thing that meaningfully raises description
  coverage.
- **19 rows with neither description nor link** — the residual gap.
- **136 rows still lacking a `source_url`** (PCGamingWiki 80, Steam Community
  56). These are options the scraper could not re-find on the page it
  originally came from, so no URL could be attributed honestly. Not fixable
  by re-crawling.
- **Voting** — still unwired.
- **`verified` column** — still legacy/retired from the UI.

---

## 7. What the vanilla-slops side already shipped (v1.2.2)

For continuity, from the previous handoff: `source_url` links,
conditional "Last checked" chip, defensive `effect`/`usage_example`
rendering, category/risk attribute filter, `/how-it-works`, "Added" dates,
and the "Suggest an option" flow. **All of it now has substantially more data
behind it than when it was built.**
