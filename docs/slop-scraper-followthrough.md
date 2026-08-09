# slop-scraper → vanilla-slops — Round 1 Follow-Through (FINAL)

> **Purpose:** What changed in `slop-scraper`, what is live in production now,
> and what the website should expect. Supersedes every earlier version of this
> file — those coverage numbers were mid-flight. Everything below is measured
> against the live database.

_Last updated: 2026-08-09 · live snapshot: **532 launch_options**, **2,367 games**, 12,391 game-option links._

---

## ⚠️ Read this first if you already have an earlier copy of this file

This replaces it. **Nothing you have already built is wrong** — but one item
below is new and does affect what is safe to build next.

**The one thing that actually matters:**

> **Do not build engine filtering or display on `games.engine` yet.** §5 is
> entirely new. Engine detection was fabricating labels — from the publisher,
> from unbounded substring matches, from game price, and from Steam app-ID
> ranges. 386 wrong labels have been cleared and the field is mid-correction.
> The earlier copy of this document said nothing about this, so if anything
> was built against that field, check §5.

**Good news, no action needed:**

> `usage_example` and `effect` are no longer empty — **18 rows each** (§4).
> Because v1.2.2 already renders them defensively, they simply start appearing.

**Everything else is a small numeric drift**, mostly from 9 unverifiable rows
being removed. Nothing changed shape or direction:

| | earlier copy | now |
|---|---|---|
| total rows | 541 | 532 |
| `source_url` | 387 | 378 |
| `last_verified_at` | 339 | 337 |
| rows with a description | 427 | 423 |
| empty → shows link | 95 | 92 |
| empty → shows nothing | 19 | 17 |
| `usage_example` / `effect` | 0 | **18** |
| risk safe / experimental | 310 / 223 | 318 / 206 |

Engine counts in §5 will keep moving — a metadata backfill is running as this
is written. That section is written to stay accurate as they change.

---

## 0. Headline

**The frontend needs no changes.** Every column vanilla-slops v1.2.2 wired
defensively now has real data behind it, including `effect` and
`usage_example`, which were empty when that release shipped.

Two rounds of work: provenance and freshness columns added and populated, then
a set of accuracy bugs found and fixed at the source — several of which were
publishing information that was outright wrong rather than merely thin.

---

## 1. Coverage

| Column | Populated | Was |
|---|---|---|
| `source_url` | **378 / 532 (71%)** | 50 |
| `last_verified_at` | **337 / 532 (63%)** | 0 |
| `verification_method` | 337 / 532 | 0 |
| `description` | 423 / 532 (79%) | — |
| `usage_example` | **18** | 0 |
| `effect` | **18** | 0 |

`risk_level`: **safe 318 · experimental 206 · caution 8**

`categories`: Display 154 · Proton-Deck 76 · Performance 63 · Skip-Intro 28 ·
Debug-Dev 23 · Audio 23 · Network 12 · **Uncategorized 184**

---

## 2. The most important number for the UI

Of the **109** rows with no description:

- **92 have a `source_url`** → the site renders the provenance link, which is
  the intended fallback.
- **17 have neither** → these render blank. Down from 103 mid-round.

**Do not treat a null description as an error.** It is a deliberate signal (see
§3), and in 84% of cases there is a link to show instead.

---

## 3. Why descriptions are deliberately missing, and why that number won't climb much

Three bugs in the PCGamingWiki parser were writing text that was wrong, not
just thin:

1. **Mismatch.** The parser searched a ~500-character window for any
   `description=` template parameter and bound the first hit to the current
   command — attaching a *neighbouring* option's text to the wrong flag.
   `-resx=1920` was documented as "Enable Direct3D 11".
2. **Mangling.** The command was deleted from anywhere in the sentence:
   "Use the `-hz`=x command line argument" → "Use the =x command line argument".
3. **Markup leakage** — template syntax surviving into descriptions.

All fixed. 119 corrupted rows repaired or cleared.

**Policy:** a description that is wrong, circular ("Use the -nomovie"), a
pasted list of *other* flags, or a non-answer ("Not tested yet") is stored as
**NULL**. A source link is more honest than text that looks like an answer
without being one. This is enforced on the write path
(`validation/description_quality.py`) — an earlier attempt that only cleaned
the database was silently undone the moment the scraper ran again.

**Consequence:** description coverage will not rise much from more crawling.
The good text mostly is not in the sources in an attributable form, and the
parser now declines to guess. Raising it requires curation (§4).

---

## 4. Curated flag dictionary — this is what fills `effect` / `usage_example`

`validation/flag_dictionary.py` holds hand-verified documentation for the
highest-reach flags, each entry carrying the primary source it was checked
against (Valve Developer Community, Unreal command-line arguments, id Tech
cvar references). It **overrides** scraped text.

18 rows documented, covering 656 game-option pairs. `effect` and
`usage_example` are populated **only** from here — they exist to tell someone
how to actually apply a flag, so a scraped guess would defeat their purpose.

Worth surfacing in the UI: `+set r_customwidth` is inert without `r_mode -1`.
No scraped description mentioned that dependency, so users were pasting a flag
that silently did nothing. It is now in the usage example.

Engine-limited flags carry their scope in the description itself — *"Skip the
startup movies (Unreal Engine games)"* — so the limitation travels with the
text.

---

## 5. `games.engine` is being corrected and will look sparser

Engine detection classified by **publisher** and by **unbounded substring
match**. `'rage'` matched "storage", `'dice'` matched any description
mentioning dice. Real examples from production: *Voodoo Dice* was a Frostbite
game (its own title matched), *Call of Duty 2* was Frostbite, *It Takes Two*
was GameMaker.

Worse, two mechanisms invented engines outright: an indie game priced under
$20 was labelled Unity, and Steam app IDs 200000–300000 were labelled
"Unity Engine (heuristic)".

All removed. 119 impossible labels cleared, 204 bad game-to-option links
removed (`-novid`, a Source flag, had reached 164 Frostbite games).

Current distribution:

| engine | games |
|---|---|
| Unknown | 1,478 |
| Unity Engine | 287 |
| **Unity Engine (heuristic)** | **267** |
| id Tech | 141 |
| Source Engine | 68 |
| Frostbite | 48 |
| Unreal | 44 |

**Two caveats for the website:**

- **The 267 "Unity Engine (heuristic)" labels are fabricated** — they come
  from the app-ID guessing described above. The code that produces them is
  gone, but the rows remain pending a decision. **Do not build engine
  filtering on this field yet**, and if you display it, consider suppressing
  the "(heuristic)" variant.
- Expect this field to get **sparser, not richer**, as correction proceeds.
  `Unknown` is the honest answer, and a re-scrape resolves individual games
  with real evidence.

---

## 6. Pipeline facts for the "How This Works" page

Verified against the code:

1. **Source order per game:** `game_specific.py` (curated engine lists +
   manual_curation) → PCGamingWiki → Steam Community guides → ProtonDB.
2. **Cadence:** on-demand only. No cron or scheduler exists — it runs when the
   maintainer runs it. Do not imply a refresh schedule.
3. **Risk/category computation:** a pure function of the command string and
   source. No ML, no network calls — a curated rule set
   (`validation/metadata_tagging.py`).
4. **What validation means today:** a save gate rejects malformed commands and
   non-descriptions before insert; `last_verified_at` records when an option
   was last re-confirmed at its source. **Voting is still entirely unwired**
   (0 upvotes/downvotes across all rows) — do not claim it works.
5. **Dedup:** `command` is unique; a flag found for many games is stored once
   and shared via the `game_launch_options` junction.
6. **Honest caveat worth publishing:** PCGamingWiki does not document launch
   options for most games. Verified directly — Dark Souls II, INSIDE and Beat
   Saber have zero documented flags on their wiki pages. A game with no
   options is usually accurate, not a scraper failure.

---

## 7. Still open

- **267 fabricated "Unity Engine (heuristic)" labels** — currently being
  removed; treat as obsolete / no longer relevant.
- **`Uncategorized` 184 / 532 (35%)** — genuinely obscure game-specific flags,
  not a classifier gap to chase to zero.
- **117 rows still hold a generic placeholder description** ("Launch option
  from PCGamingWiki"). Honest, but uninformative — dictionary candidates.
- **17 rows show neither description nor link.**
- **Voting** — unwired.
- **`verified` column** — legacy, retired from UI.
- The flag dictionary covers 18 commands. Extending it is the only thing that
  meaningfully raises description quality.
