# Changelog

All notable changes to Vanilla Slops will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### Version Numbering
- **Major** (X.0.0): Breaking changes, major feature additions
- **Minor** (0.X.0): New features, significant improvements
- **Patch** (0.0.X): Bug fixes, small improvements

### Categories
- **Added**: New features
- **Changed**: Changes to existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security vulnerability fixes

## [Unreleased]

## [1.2.15] - 2026-08-15 — The cold start

### Where three seconds actually went

The catalogue took up to three seconds to appear, on every device and every
connection, and searching took just under three seconds *every single time* —
warm, cold, ethernet, 4G. That consistency was the clue: a problem that ignores
the network is not a network problem.

It was one line. `fetchGames` ended by computing the filter facets and attaching
them to its response. Facets fan out into seven queries, and one of them counted
launch-option popularity by paging the entire 16,466-row junction table in
seventeen sequential round trips — to produce a list of eight. Every request for
a page of games paid for that.

Nothing ever read the result. The only two references were the server attaching
the field and the client copying it into an object nobody consulted. So the most
expensive thing the listing did was assemble a value with no reader.

Search was worse than the rest because the facets cache is skipped whenever a
search term is present, on the reasoning that facets should reflect the search.
That made the cache useless exactly when someone was waiting.

And the cache barely helped anyway. It lives in module scope, and every cold
serverless invocation gets a fresh module scope — so on a site with modest
traffic it was empty far more often than it was warm. The 3-second load was not
an occasional unlucky request. It was the normal one.

| | before | after |
|---|---|---|
| Catalogue, cold start | 3.00s | **1.04s** |
| **Search** | **2.71s** | **0.25s** |
| Filter dropdowns, cold start | 2.60s | 0.56s |
| Response size | 11.0KB | **7.1KB** |

### Changed

- **The listing no longer computes facets.** Filter dropdowns come from
  `/api/games/facets`, which is what the site was already calling on load. This
  is the fix behind almost all of the numbers above, and it is a deletion.
- **Popular options are counted in one query instead of seventeen.** The
  database can return each option's link count alongside the option, which
  turns a full scan of the junction table into a single request over 421 rows —
  2,820ms to 166ms. The eight results are identical; that was checked against
  the old implementation before the old one was removed. They are now sorted
  with a tie-break, because several flags sit on exactly the same number of
  games and the list was quietly reordering itself every time the cache warmed.
- **Catalogue responses are cacheable at the edge.** An in-process cache cannot
  survive a cold start, so it was doing the least good precisely when it was
  needed most. The CDN has no such problem: one visitor absorbs the cost and
  everyone else gets an edge hit, and `stale-while-revalidate` means no one ever
  waits for a refresh. Browsers still revalidate, so your own filter changes are
  never answered from a stale copy.
- **The table and the filter dropdowns now load at the same time.** They were
  sequential, so the games table could not appear until two requests had
  completed one after the other — on a cold function, two waits instead of one.

### Fixed

- **Expanding a game's launch options no longer feels like a stall.** The
  suspicion was that games with many options were slow to load. They are not:
  thirty-three options cost 23ms more than one, because the cost is per-request,
  not per-option. There was nothing to make faster — the delay was a round trip
  during which nothing on screen acknowledged the click, followed by an entire
  section appearing at once.

  Three changes, none of which touch the query. Options are **prefetched when
  the pointer reaches the button** (or a finger lands on it, or it takes keyboard
  focus), so by the time the click resolves the data is usually already in hand.
  The row **opens immediately** holding a placeholder, so the click has a visible
  result before the data arrives. And the content **settles in** rather than
  snapping into place.

  The placeholder's fade-in is delayed slightly, which means a prefetched
  expansion replaces it before it is ever seen — no flash of loading state on the
  fast path, and no dead air on the slow one. That delay lives in CSS rather than
  in a timer, so there is no race that can leave a spinner stranded.

### Removed

- **A dead duplicate router** (`src/server/routes.js`). Nothing imported it, and
  its own imports pointed at a directory that does not exist, so it would have
  thrown if anything ever had.

## [1.2.14] - 2026-08-15 — Reading the published catalogue

### A partial switch looks exactly like a finished one

The database grew a rule this round that the pipeline had only been following by
hand: a row that cannot answer *what confirmed this is real?* does not ship. That
rule lives in two views — `public_launch_options`, which hides 97 of 518 option
rows, and `public_games`, which hides 6 of 2,452 games that Steam publishes twice
under different App IDs.

The site was reading one of them, in one place. `getCatalogStats` counted through
`public_launch_options` while every query that actually served data still read
the tables underneath. So the headline figures described the published catalogue
and the catalogue itself didn't — the difference applied at the only spot where
it was invisible. Nothing errored, no page looked broken, and the numbers agreed
with themselves. That is what made it worth going after: there was no symptom to
notice.

This release finishes the switch. Every read the site serves now goes through a
view, and the published totals are **2,446 games and 421 launch options**.

### Fixed

- **Duplicate games no longer appear twice in the catalogue.** Steam publishes
  Counter-Strike: Condition Zero as both app 80 and app 100, and Black Ops II as
  both 202970 and 202990 — same title, same options, two rows. The listing showed
  each of them twice. Searching "Condition Zero" now returns one game.
- **A URL for the hidden App ID still works.** `/game/100` redirects to the
  canonical game rather than disappearing, which is the same "one URL per game"
  rule the slug redirect already applied. All six duplicate IDs resolve.
- **Filter chips can no longer offer a value that returns nothing.** The category
  and risk facets were built from the whole options table, so a value carried
  only by unpublished rows could appear in the dropdown and then match no games.
  The same was true of the release-year and option-count facets.
- **Game pages no longer show options with no provenance.** Joining through the
  junction table can't reach an *unlinked* row, but it can still reach an
  unsourced one — the view is what keeps a page from listing an option the
  catalogue can't say where it found.
- **The sitemap no longer publishes duplicate URLs.** It was generated from the
  games table, so both App IDs of the same game were submitted for indexing.
- **The copy button was handing out a string that does nothing.** `gamemode` and
  `mangohud` are stored as bare tool names, and Steam substitutes `%command%`
  with the game's executable — so a wrapper tool has to wrap it
  (`gamemoderun %command%`). Pasted as stored, neither did anything, across
  roughly 4,000 game-option links. The button now offers the working form.

  The rule is deliberately narrow: it triggers only when a usage example wraps
  `%command%`, never on a list of tool names, so a wrapper documented later needs
  no code change — and, more importantly, an option whose example is merely
  *illustrative* is left alone. `-w 640` documents `-w 1920 -h 1080`; copying
  that would have handed over a different resolution than the one clicked.

### Changed

- **`npm run db:verify` now checks both views**, and reports a zero count as a
  failure rather than a pass — a missing GRANT surfaces as an empty result, not
  as an error, which is precisely the case worth catching.
- **Vocabulary note:** `source = 'manual_curation'` no longer exists; those rows
  became PCGamingWiki, Steam Community and a new `Universal` value. Nothing in
  the UI was keyed on it, so no filter broke — the source label renderer handles
  it generically.
- Corrected four code comments that the data has outgrown — `usage_example` and
  `effect` described as unpopulated (46 rows, covering 90% of game-option pairs),
  freshness signals as null across the catalogue (390 of 421), `source_url` as
  "~50 rows" (411 of 421), and the metadata badges as reading columns not yet in
  the query.

## [1.2.13] - 2026-08-14 — Clearing filters actually clears them

### The bug that only happened sometimes

Filter yourself into a corner — an engine, then a year, then a category — until
the catalog runs out of matches and offers to clear everything for you. Click
the offer. Some of the time you land back on the front page. Some of the time
the chips vanish, the filters really are gone, and the page underneath doesn't
move: you are still looking at "no games match your filters", now with nothing
to clear.

It looked like a network problem, and in a sense it was — but the network only
decided which way a race fell. The button cleared the search box and then fired
a change event at each of the six filter dropdowns in turn, which produced seven
filter-change notifications inside a single synchronous burst. The loader
guarded against overlapping requests by dropping any that arrived while one was
in flight, so the first notification took the lock and the other six were
discarded. The one that survived had been assembled before a single dropdown was
touched. It went out still carrying every filter the user was trying to escape,
came back empty, and redrew the same dead end.

The six discarded calls had already updated the app's state, which is why the
chips cleared correctly and the results didn't. Whether it looked broken came
down to cache temperature: with a warm cache the first request could finish in
the gap between two event handlers, releasing the lock in time for a later one
to get through with the real query. Cold cache or a slow connection, and the
screen simply stopped responding to the button.

### Fixed

- **"Clear all filters" now goes through one path and sends one request.** The
  search component already owned the query, the filters and the sort order, and
  already knew how to reset all three and announce it once — the active-filter
  "Clear all" chip used that path and never had the bug. The empty-state button
  now uses it too, instead of reaching in and poking each control by hand.
- **A filter change made while a request is in flight is no longer thrown
  away.** The loader queues the newest one and runs it when the current request
  settles, and because the query is built from state at send time, a burst of
  changes collapses into a single request for the final state. Dropping was the
  underlying mistake: the discarded call had already changed the app's state, so
  discarding it left the screen describing a query nobody had asked for.
- **An unfiltered empty result no longer blames your filters.** The empty state
  decided whether filters were active by testing every key on the filter object,
  and sort and order always carry a value — so "your filters are too
  restrictive" was the verdict even with nothing filtered, above an active-filter
  list reading "No specific filters". Only real filters count now.
- **The first filter change no longer knocks the front page off Featured.** The
  search component's sort defaulted to Title A–Z while the app's state defaulted
  to Featured, and every filter notification carries a sort — so on a fresh
  visit, touching any filter silently swapped the curated ordering introduced in
  1.2.12 for an alphabetical one. The default now lives in one place that all
  three of the state, the URL and the search component read from.
- **Empty-state buttons no longer stack duplicate click handlers.** The handlers
  are delegated off the document and already survived redraws, but they were
  being rebound on every render, so each visit to an empty state added another
  copy that re-ran the same click.

### Changed

- **Filters, search, sort and page now live in the URL.** Only sort changes ever
  reached the address bar, so a reload restored whatever stale query happened to
  still be sitting in it — including, after all of the above, the filters you had
  just cleared. A filtered view is now something you can reload, bookmark or send
  to somebody.

  The URL is written at the moment a request goes out rather than from each
  control, which means it always describes the results on screen: changes that
  get coalesced away leave no trace, and a failed request leaves the address bar
  alone. Filter, search, sort and page changes are treated as navigation and get
  a history entry, so Back steps through them one at a time instead of dropping
  you off the site; startup, retries and reconnects replace the entry rather than
  adding one. Defaults stay out of the query string, so an unfiltered catalog is
  a bare URL again — which is what clearing every filter should leave you
  looking at.

- **How It Works subtitle, second pass.** "What we don't claim about it yet"
  described a hole; "where we draw the line" describes a decision, which is the
  truer frame for a project whose nulls are deliberate. Also dropped "on it"
  from "what every field on it means" — the pronoun reached back two clauses to
  "the data" and read like nothing anyone says aloud — and softened "every" to
  "each", since the glossary walks the fields rather than promising to exhaust
  them.

## [1.2.12] - 2026-08-13 — A curated front page

### A change in approach: the catalog now has an editorial layer

Every ordering in this project has so far been derived straight from the data —
option counts, release dates, titles. That is the right default for a catalog
whose whole pitch is that it doesn't overclaim, and it stays the rule
everywhere a number is reported. But the homepage is not a query result. It is
the first ten seconds of the project, and ranking it by `total_options_count`
optimised for *where we hold the most data* rather than *what a visitor
recognises*. Those two goals agree almost everywhere and diverge at precisely
the position where it costs the most: the top of page one.

The concrete symptom was Counter-Strike. The 2000 original carries 29 options
and Counter-Strike 2 carries 24, so a catalog of Steam launch options opened
with a game superseded a decade ago in its second row, five rows above its own
successor. Nothing about that was a data error — 1.6 genuinely has more
documented flags — which is exactly why no amount of better data would have
fixed it. It needed a judgement call.

So this release introduces a deliberately small editorial layer, bounded by
three rules that keep it from leaking into anything the project asserts:

1. **It decides reading order, and nothing else.** No game is hidden, no count
   is inflated, no row's claims change. Counter-Strike 1.6 still appears with
   its honest 29 options — at #18 instead of #2.
2. **The honest ordering stays one click away and keeps its name.** "Most
   options" remains in the sort dropdown and still returns the pure
   `total_options_count` order. Curation became a *new* sort value rather than
   a silent reshuffle of the existing one, so no control in the UI misreports
   what it does.
3. **The visitor's intent always wins.** Any active search or filter takes
   precedence over the lineup; featured games that don't match simply drop out.

The lineup is also short on purpose — sixteen entries against a twenty-row
page — so the tail of page one is still ranked by evidence and the catalog
visibly stops being hand-built before the first scroll ends.

**The rule for what earns a slot** matters more than today's list, and lives in
`src/server/config/featuredGames.js`: recognisable on sight, current rather
than merely famous, real data behind it. The subtle one is *current*: age alone
is not disqualifying — Team Fortress 2 is from 2007 and belongs there because
it is still the live product — but where the catalog holds a successor, the
successor is featured. That is the distinction between TF2 and CS 1.6, and it
is written down so future edits don't have to rediscover it.

### Added
- **A curated "Featured" ordering, now the catalog's default view.** Sixteen
  flagship games lead, then the list falls through to option count. Implemented
  as a real sort value (`sort=featured`) with its own pagination path, since the
  result set is two differently-ordered blocks and the seam between them has to
  stay coherent across pages — `app_id` breaks option-count ties so rows can't
  repeat or vanish between page requests.
- Test coverage for the lineup's invariants and the new sort default.

### Changed
- **"Most options" is now an explicit choice rather than the silent default.**
  Unchanged in behaviour; it simply no longer doubles as the landing order.
- **The whole active-filter tag is now the remove button**, not the ~24px `×`
  inside it. The mobile styles already gave the full tag a press-down state, so
  the smaller hit target was contradicting the affordance it advertised; the tag
  now carries a 44px touch target and the `×` is decoration, hidden from
  assistive tech. Removal is also one delegated listener that survives
  re-renders rather than a fresh set of handlers per tag.
- Reworded the How It Works subtitle: "and, just as importantly, what we don't
  claim about it yet" became a short closing sentence.

### Fixed
- Filter values containing a quote (`Bloody "Nine" Games`) could close an HTML
  attribute early in the active-filter markup — `escapeHtml()` serialises a text
  node and leaves quotes intact, which is correct for element content but not
  for attribute positions. Attribute values now escape through `escapeAttr()`.

## [1.2.11] - 2026-08-13 — Published figures, and a How It Works copy pass

### Changed
- **Catalog figures now count `public_launch_options` instead of the raw table.**
  The figures line advertised 518 launch options; the view the project is willing
  to stand behind holds 421. The 97-row gap is rows that are unlinked or lack
  provenance, and 88 of the 97 are unreachable from any game page — so the larger
  number claimed a catalog bigger than the one you can actually search, on the
  page that promises the opposite. `getCatalogStats` now reads the view for both
  the count and the `lastUpdated` timestamp, so the two cannot drift apart. The
  rest of the service (suggestions, facets, game pages) still reads the raw
  table; migrating those is a separate pass with its own product decisions.
- **How It Works copy pass.** Em dashes removed from the body copy entirely (ten
  of them). The "how options are categorized and risk-rated" section is cut by
  about a third and no longer leans on a rhetorical triple to make its point —
  determinism is stated plainly instead. "When a field is blank on purpose" loses
  two sentences that restated the payoff.
- **Footer lines are separated rather than stacked.** Three paragraphs at
  `margin: 0` and `line-height: 1.625` read as one block of running text. Line
  height is tightened and the breathing room moved between the lines, where it
  does the work.

### Added
- **A launch-option safety notice** in the shared "how to apply" block, so it
  appears on every game page as well as How It Works: a flag can break rendering,
  reset local settings, or trip anti-cheat, and anything above Safe deserves a
  deliberate try. Carries a caution-toned rule rather than an alert box.
- **A closing "Why this exists" section** on How It Works, covering the scattered
  state of launch-option documentation and what the project commits to. Every
  privacy claim in it was checked against the code first: no analytics of any
  kind, no cookies or session middleware, and theme preference as the only
  client-side storage. It stops short of claiming nothing is ever collected,
  because Sentry receives server-side error reports.

### Fixed
- **The Universal source example named two options that are no longer Universal.**
  1.2.10's migration 004 promoted `-novid` to PCGamingWiki and `-windowed` to
  Steam Community, leaving `-high` as the only Universal flag of the three the
  page cited — the copy went stale the moment the migration ran. Examples are now
  `-high`, `-fullscreen` and `-console`, all verified against the view. The same
  sentence claimed most Universal options have no link to follow; 7 of 9 do, so
  that claim is gone.
- **Server-rendered routes fell through to the SPA home page in local dev.** The
  Vite dev server proxied only `/api`, so `/how-it-works`, `/game/:appid` and
  `/sitemap.xml` never reached Express and its SPA fallback answered with
  `index.html`. Production was unaffected. `/assets` is proxied too, because
  those pages link the hashed bundle from `dist/index.html`, which Vite does not
  serve from source — the cause of their arriving unstyled in dev.

## [1.2.10] - 2026-08-12 — How It Works rebuilt, and the end of manual_curation

### Changed
- **The `manual_curation` source is retired.** It was a frozen batch of 42 rows
  from the first data load — the generic cross-game flags (`-novid`,
  `-windowed`, `-high`, `-dx11`) typed in by hand before the scraper pipeline
  existed. No scraper has ever emitted it. Every other value in the column names
  a *place*; this one named a *process*, which is why it read as a placeholder,
  and it reached further than its row count suggests: those options are attached
  to 500 games, about 11% of all game↔option links. It had also started
  contradicting itself, since later scrapes backfilled real source URLs onto
  rows still labelled "Manual curation". Migration 004 promotes the rows a live
  scrape has since confirmed to **PCGamingWiki** or **Steam Community**, and
  renames the remainder to **Universal** — the value the scraper already emits
  for this class of flag, describing what the option *is* rather than how it got
  here. How It Works explains the new name.
- **How It Works is reorganized into three movements** — where the data comes
  from, what you're looking at, and what we claim and don't — with chapter
  markers between them. The field glossary and the Steam how-to were buried at
  the bottom of a flat run of eight sections; they now sit in the middle, where
  someone looking up what a badge means will actually find them. Update cadence
  folds into the sourcing section and the two "honesty about gaps" sections are
  merged, taking eight headings down to six.
- **The page reads at a sane line length.** Body text ran ~95 characters per
  line, well past the 60–75 that reads comfortably. The prose column is now
  capped at 66 characters and the reclaimed width holds a sticky table of
  contents, so the page's length is navigable instead of endless. Paragraphs
  stay narrow while the glossary, claims cards, and how-to box use the full
  width — they're scanned, not read line by line.
- **The three "verified" claims are now cards** rather than bullets, and the
  source list is a numbered pipeline with a connector rail, since it genuinely
  is a priority order.

### Added
- **Catalog figures on How It Works** — games catalogued, launch options, and
  when the newest option landed. The last of those makes the "runs on demand, in
  batches" claim checkable rather than a promise. Backed by its own hour-long
  cache, deliberately separate from the facets cache that sits on the catalog's
  hot path, so it costs about 24 database reads a day whatever the traffic. The
  line is omitted entirely if the counts aren't available.

### Fixed
- **Missing static assets no longer return HTML.** The SPA catch-all served
  `index.html` for any unmatched path, including `/assets/*.css`, so a browser
  holding cached HTML after a deploy changed the bundle hash would request a
  stylesheet, receive HTML, and silently render the page unstyled. Paths with a
  file extension now 404.
- **How It Works is no longer cached for an hour in development**, where that
  guaranteed a stale bundle hash after every rebuild. Production caching is
  unchanged.

### Removed
- **Hover tint and rotating diamond on How It Works sections.** Hover feedback
  on a block of text promises interactivity that isn't there — the same mistake
  as the old `cursor: help` on option sources.
- **The staggered page-load animation**, which delayed content on a page whose
  only job is being read, and whose delays covered five of eight sections so the
  rest arrived out of rhythm.

## [1.2.9] - 2026-08-10 — Engine accuracy & honest suggestions

### Changed
- **Engine filter is now an exact match.** Filtering by an engine returns only
  that exact family — picking "Source Engine" no longer sweeps in "Source 2",
  and families like GoldSrc, id Tech, and Gamebryo each stand on their own
  instead of bleeding into one another via substring matches.
- **Game pages show the exact engine version when we have it.** A game whose
  engine we've pinned down (e.g. "id Tech 3") now displays that, falling back to
  the broader family ("id Tech") otherwise. Unknown engines are simply omitted.
- **Search suggestions no longer offer launch options that no game uses.** An
  option linked to zero games would return an empty result if picked, so those
  57 orphans are filtered out of suggestions. The filter is dynamic — the moment
  a game is added with one of those options, it becomes searchable again on its
  own, with no manual list to maintain.

### Docs
- **How It Works audit.** Added a section on why a description — or an entire
  game's option list — can be deliberately blank rather than broken, corrected
  the risk-rating explanation to match the deterministic rule set (no "human
  sign-off" step that doesn't exist), and documented the Engine field.

## [1.2.8] - 2026-08-10 — Launch-option card polish

### Changed
- **Launch-option cards now have a clear internal hierarchy.** The description
  reads as the primary answer, and the curated Effect/Example docs are grouped
  into their own inset panel — so cards with a lot of content no longer collapse
  into one undifferentiated block of gray text.
- **Experimental risk badge is now a striking violet** instead of gray. Gray
  read as "mundane / safe"; the violet marks Experimental as its own category,
  distinct from Caution's amber, without being an alarming red.
- **"Unknown" is omitted from the Engine filter** dropdown — it's the absence of
  data, not a useful choice to filter by (consistent with how "Uncategorized"
  is handled for categories).

### Fixed
- **Long commands no longer wrap onto a second line.** Commands now always fit a
  single row: the text scales down just enough to fit its container (one
  mechanism, no per-breakpoint tweaking), on both the main table and the
  server-rendered game pages. The full command is always preserved for copying.

## [1.2.7] - 2026-08-09 — Cosmetic contrast & shape fixes

### Fixed
- **Pagination contrast in dark mode.** The active page button and "Go" button
  showed muted-gray text on the bright accent (a specificity collision let the
  generic dark `.pagination-btn` color win). They now use high-contrast dark
  text on the accent.
- **Theme toggle shape on mobile.** The global 48px touch-target `min-height`
  was stretching the 40px-wide toggle into a vertical oval; its width is now
  pinned to match, so it stays a clean circle (and a comfortable touch target).

## [1.2.6] - 2026-08-09 — Popular landing, faster startup, header fix

### Changed
- The homepage now leads with the games that have the **most launch options**
  (Counter-Strike, Dota, GTA…) instead of an alphabetical list, so the first
  games you see are recognizable and useful rather than obscure A–Z entries.

### Fixed
- Removed a redundant startup pass that fired the initial games request (and the
  facets request) **twice** on page load.
- The game / SEO page header no longer wraps the theme toggle onto its own line
  on narrow screens — the logo and toggle share the top row, with the "Search
  all games" and "How it works" links on the row below.

## [1.2.5] - 2026-08-09 — Search by launch option

### Added
- **Search by launch option.** Type a flag you know (`-novid`) or a concept you
  don't (`skip`, `fps`, `vsync`) into the search bar to find the games that use
  it — suggestions match on the command *and* its description. Focusing the
  empty box shows a "Popular launch options" browse list so you can discover and
  pick one without knowing the flag. Selecting it filters to the matching games
  with a removable chip and highlights the option in each game's expansion.

### Changed
- **Calmer search.** Typing now updates the live suggestions only; the results
  table updates on an explicit action (Enter, picking a suggestion, clearing the
  box, or clicking away) instead of refetching on every keystroke. The skeleton
  loader shows only on the first load rather than flashing on every update.
- Option cards no longer show placeholder descriptions ("Launch option from
  PCGamingWiki") — they show the source link instead.

### Internal
- Added a commit-message guard hook to prevent stray co-author attribution;
  synced the slop-scraper follow-through doc to the latest snapshot.

## [1.2.4] - 2026-08-09 — Balanced filter grid

### Changed
- The desktop filter toolbar now lays out as a balanced **3 × 2** grid instead
  of an orphaned 4 + 2. Collapses to 2 columns on tablet and 1–2 on mobile as
  before.

### Fixed
- Local dev/preview over http no longer renders unstyled. Helmet's default
  `upgrade-insecure-requests` was forcing asset requests to https on
  `localhost`, blocking all CSS/JS; it's now disabled in the development CSP
  branch only (the production https CSP is unchanged).

## [1.2.3] - 2026-08-09 — Header polish

### Fixed
- The "How It Works" page header no longer wraps the theme toggle onto a second
  line — the redundant self-link to the current page is now omitted there (the
  link still appears in the header on every other page).

## [1.2.2] - 2026-08-09 — Round 1: filter payoff, usage docs & contribution path

### Added
- **Filter payoff:** when a Category/Risk filter is active, the matching options
  float to the top of a game's expansion with a "Matches filter" marker, and the
  results line reads e.g. "2,271 games with a Safe option".
- **Sort control** in the results header (most options, newest added,
  newest/oldest release, title A–Z / Z–A) plus a "Clear all" filter reset.
- **"Suggest an option"** contribution path — a prefilled GitHub issue from the
  per-game empty state and the How It Works page (no write API needed).
- Per-option **Effect / Example** rows, rendered whenever that data is present.
- **In-expansion filter** for games with 8+ launch options.
- Filter-aware empty state that lists the active filters.

### Changed
- Warmer, less formal How It Works copy.
- Performance/SEO: `theme-color` on all pages, Steam-CDN preconnect on game
  pages, async image decoding.

### Fixed
- The search suggestions dropdown could render behind the filters row; it now
  always sits in front.
- Active-filter chip labels are capitalized ("Risk: Safe"); the results count is
  now an ARIA live region for screen readers.

## [1.2.1] - 2026-08-09 — Round 1: honest provenance, freshness, filters & How It Works

### Added
- Server-rendered **/how-it-works** methodology page — sourcing, update cadence,
  how options are tagged/validated, a field glossary, and "how to apply on Steam".
- **Category / Risk filters**: filter by the launch options' own attributes, not
  just how many a game has.
- Real **source links** on options that have a source URL (e.g. ProtonDB).
- **"Added {date}"** on every option, plus a conditional **"Last checked {date}"**
  freshness chip that appears once an option has been re-verified.
- "How It Works" link in the site header.

### Fixed
- The misleading source "?" affordance (looked interactive but did nothing) is
  gone; raw source labels are now humanized (e.g. "Manual curation").

## [1.2.0] - 2026-07-26 — Facelift & mobile polish

### Changed
- **Cosmetic facelift.** New cool-primary / warm-secondary palette — crisp cobalt +
  vivid emerald in light, ice-blue + luminous cream-gold in dark. A soft cool light
  ground (no more blinding white) and clearly-stepped dark surfaces (no more flat
  blue sheet). Every pairing verified to WCAG AA.
- **Compact, data-first header.** The tall hero is replaced by a slim toolbar (logo,
  inline search, theme toggle); the games table is now visible above the fold.
- Theme toggle redesigned — circular, theme-adaptive, sun/moon icons — and moved into
  the header instead of floating as a fixed button.
- Game-page header shows the game title alone with a small "Launch Options" chip; the
  redundant "— Steam Launch Options" suffix is gone (keyword preserved in the `<title>`
  tag for SEO).
- Footer simplified to three centered lines with a GitHub icon link.
- Verified badges and the "Slops" wordmark now use the warm cream accent.

### Added
- Sentry error tracking (server-side, 5xx only, gated on `SENTRY_DSN`; flushes before
  the Vercel serverless function freezes so reports aren't dropped).

### Fixed
- Filter toolbar: removed the stale glassy hero box, fixed the mobile grid (a
  specificity bug had it stuck at 4 columns on phones), and made the selects
  token-based so they're visible in light theme.
- Smoother mobile launch options: removed swipe-to-close (it fought scrolling and
  caused accidental closes) and the double-tap blocker (it swallowed quick taps);
  double-tap-zoom is now prevented via `touch-action: manipulation`.
- Long filter-chip values no longer hide the × remove button (ellipsis truncation).
- Hide Options button restyled from a plain gray slab into a proper pill.
- Mobile long/multi-word launch options no longer collide with the copy hint.

### Removed
- Dead hero CSS orphaned by the facelift and 3 unused keyframes (net ~600 lines
  lighter across the overhaul).

## [1.1.0] - 2026-07-19 — Discoverability & simplification

### Added
- **Discoverability**: server-rendered per-game landing pages at `/game/:appid/:slug`
  with unique `<title>`/meta/canonical, Open Graph (each game's Steam header art),
  and VideoGame + BreadcrumbList JSON-LD — real crawlable content, no client JS
- Dynamic `sitemap.xml` (homepage + every game with options) and `robots.txt`
- Internal linking: homepage game titles now link to their `/game/...` page, giving
  crawlers a link path from the homepage (the ↗ remains the Steam store link)
- Release-date column sorting re-enabled now that dates are stored as ISO
- Dark mode + theme toggle on game pages (CSP-safe external script, set before
  first paint so there's no flash of light arriving from a dark homepage)
- `docs/sql-snippets.sql` — curated Supabase query reference (health, data-quality, insight)
- `docs/scraper-data-quality-handoff.md` — extractor-fix spec for the slop-scraper repo

### Changed
- **Removed the "Show All Games" toggle.** With 95.7% of the catalog having options
  (and the scraper only saving games that do), it duplicated the existing "Launch
  Options" filter. All games are now shown; those without options display
  "No known options yet" instead of being hidden — so searching a game we *do*
  have no longer dead-ends on an empty screen. Net −740 lines across 14 files.
- Facet counts now cover every game, matching the default view

### Fixed
- **Game statistics were badly wrong** (`+735` instead of `+71`): rows were counted in
  JavaScript, but Supabase caps returned rows at 1000 while `count` stays exact.
  Replaced with count-only queries; the same latent bug in facet counts is fixed
  by paging.
- Long filter-chip values (e.g. "Paradox Development Studio") overflowed and hid the
  × remove button, making filters impossible to clear — the value now truncates
  with an ellipsis and the × can never shrink or be clipped
- Mobile: filter chips, the Show All box, and the game-page header layout
- Empty-string release dates normalised to `NULL` so blanks sort last

### Removed
- Retired `performance` / `graphics` option values (they silently behaved as
  "has options"); unknown values now degrade to no filter rather than erroring
- Empty `vendor` build chunk (`@supabase/supabase-js` is server-only)

## [1.0.1] - 2026-07-19 — Post-launch hardening

### Fixed
- **Data quality**: removed 46 junk ProtonDB rows (`WINEPREFIX=` setup instructions,
  truncated fragments, trailing-punctuation, prose-words) and cleaned ~30 polluted
  descriptions (raw wiki markup from PCGamingWiki, garbled ProtonDB report fragments)
- Mobile: long / multi-word launch options no longer collide with the "Tap to copy" hint
- README Features/Architecture corrected to match reality (dropped the removed Category
  filter, the "categorized by purpose" claim, and the "Zod throughout the stack"
  overclaim); added a Visit-the-Site link and Vercel hosting note
- `.env` `DOMAIN_URL` had `NODE_ENV=production` mashed onto it (malformed value)

### Changed
- Scraper rescan: coverage grew to ~1,430 games with options; release dates now stored
  as ISO `YYYY-MM-DD` (unblocks clean chronological date sorting)

## [1.0.0] - 2026-07-12 — Public launch

First production release. Live at **launchoptions.dev**.

### Added
- Deployed to Vercel (Express as a serverless function via `api/index.js` + `vercel.json`)
- Custom domain `launchoptions.dev` (Porkbun DNS, `www` → apex 301 redirect)
- SEO meta tags pointed at production domain (canonical, Open Graph, Twitter Card, JSON-LD)
- Supabase keepalive via cron-job.org (weekly REST ping); GitHub Actions workflow kept as a manual backup
- "5+ options" and "1–4 options" launch-option count filters
- Regression tests for filter-clear behavior

### Fixed
- Clearing a filter token now actually clears it — removed filters send an explicit empty value (previously left filters stuck and caused "No games found" loops)
- "No Launch Options" filter returning 400 (contradictory validation rule + options/hasOptions precedence)
- Year filter returning 500 (raw SQL `extract()` replaced with `ilike` substring match)
- Facet dropdown counts now match the default options-first view
- Show All toggle: inverted help text, blank count badge, and now hidden when it would do nothing
- Release-year list no longer truncated to 10 newest years
- Mobile logo flashing full-size on load (explicit `width`/`height`)
- Doubled "Tap to copy" hint and duplicated source/verified/vote icons
- Dark-mode hero title now legible (ice-blue accent instead of near-invisible dark blue)

### Changed
- Compacted launch-option cards (less padding, smaller command text, tighter grid)
- Scraper rescan raised coverage from 208 → 699 games with launch options

### Removed
- Dead Category filter and non-functional Performance/Graphics filter options

## [0.9.0] - 2026-06-28 — Prototype → production overhaul

Diamond-tier hardening pass across architecture, testing, and infrastructure.

### Added
- Vitest test suite + GitHub Actions CI (lint + test on PRs)
- Husky + lint-staged pre-commit hooks
- Structured logging with pino (request id, status, duration)
- Standardized API error shape (`{ error: { code, message } }`)
- Centralized constants module (`constants.js`) for magic numbers
- Column sort (title / developer / options count) with Steam store links
- Skeleton loading screens and offline detection
- WebP logo with PNG fallback

### Changed
- Split the 1,700-line `table.js` into focused UI modules (table, empty-states, filters, mobile-gestures, pagination, search, theme)
- Consolidated stylesheet count (~17 → 9 files) around design tokens
- Server-side facets cache (5-min TTL) + N+1 launch-options query collapsed into a single nested select
- Upgraded client cache from FIFO to LRU eviction

### Fixed
- Broken inline `onclick` handlers on empty-state buttons (moved to event delegation)
- Missing `<html lang>` attribute (WCAG 3.1.1)
- Misleading JSDoc on search handlers

### Deferred
- Sentry error tracking and a formal OpenAPI spec (post-launch)

## [0.8.0] - 2025-05-30

### Added
- Smart pagination with page number display (e.g., `1 2 ... 5 6 7 ... 99 100`)
- Quick jump functionality for large datasets
- Mobile-responsive pagination controls
- ARIA labels and screen reader support for pagination
- Enhanced loading states with user feedback
- Copy buttons for launch options display
- Dark theme support across all components

### Changed
- Replaced infinite scroll with traditional pagination for better performance
- Improved table layout with card-style display on mobile devices
- Enhanced launch options layout with accent stripes
- Upgraded error handling with user-friendly retry options

### Removed
- Infinite scroll implementation due to performance concerns with large datasets
- Scroll sentinel references from HTML structure

### Fixed
- `renderPagination() not found` error preventing games from loading
- Memory usage issues with large game datasets
- Accessibility issues in table navigation

## [0.7.0] - 2025-05-29

### Added
- Complete design system with fluid typography and responsive scaling
- Token-based color system with automatic dark mode support
- Component library including buttons (6 variants, 4 sizes), forms, tables, cards, modals
- WCAG 2.1 AA compliant accessibility features
- Keyboard navigation support for all interactive components
- Performance optimizations with GPU acceleration and content visibility
- Steam-specific components for game data display

### Changed
- Migrated to mobile-first responsive design approach
- Implemented Perfect Fourth scale (1.333) for consistent spacing
- Enhanced visual hierarchy with semantic color tokens

## [0.6.2] - 2025-05-28

### Added
- ESLint configuration with ES2021 module support
- Basic test infrastructure in `src/client/__tests__/`
- Environment configuration template (`.env.example`)
- Production build scripts (`build:client`, `build`, `start`)
- Code linting scripts (`lint`, `lint:fix`)

### Fixed
- GitHub Actions workflow (`cicada.yml`) build failures
- ES module server handling in CI/CD pipeline
- Branch-specific validation for dev vs production environments

### Changed
- Optimized CI/CD triggers to run only on `main` and `dev` branches
- Updated package.json scripts for better build management

## [0.6.1] - 2025-05-28

### Added
- Dynamic filter population via API calls
- Engine filter with automatic creation and population
- "Clear All Filters" button for easy reset
- Loading states for filter operations
- Enhanced URL state management for deep linking

### Changed
- Improved search filters component with dual compatibility support
- Enhanced dropdown labels and options display
- Better visual styling for filter dropdowns

### Fixed
- Year filter display issues (automatically hidden)
- Filter synchronization across components

## [0.6.0] - 2025-05-26

### Added
- Centralized state management with AppState object
- Smart caching with TTL and size limits
- Debounced search with autocomplete suggestions
- Request deduplication and retry logic
- Loading states and error boundaries
- Active filter display with removal functionality
- Comprehensive JSDoc documentation

### Added - API Endpoints
- `GET /api/games` - Games list with search, filter, and pagination
- `GET /api/games/suggestions` - Search autocomplete
- `GET /api/games/facets` - Available filter options
- `GET /api/games/:id` - Single game with launch options
- `GET /api/games/:id/launch-options` - Game-specific launch options

### Fixed
- Missing backend service functions (`getSearchSuggestions`, `getFacets`, etc.)
- Frontend-backend contract misalignment
- Parameter mapping between frontend filters and backend expectations
- Response validation in frontend components

### Changed
- Improved coordination between search component and main controller
- Enhanced error logging with development vs production handling
- Better filter synchronization across all components

## [0.5.0] - 2025-05-20

### Added
- End-to-end data flow from user input to database rendering
- Real-time games data fetching and table rendering
- Responsive design for search controls and games table
- Design tokens for consistent styling

### Changed
- Integrated Supabase data rendering in main UI
- Unified button, card, and pagination styles
- Improved CSS utility structure

### Removed
- Unused CSS styles and redundant design elements

## [0.4.0] - 2025-05-19

### Added
- Comprehensive JSDoc documentation for client and server JavaScript files

## [0.3.2] - 2025-05-18

### Added
- Semantic HTML structure for improved accessibility
- URL state synchronization for page tracking
- Search filters system with sort selector
- Deep linking support for pagination and filtering
- URL parameter parsing on page load

### Changed
- Refactored client-side JavaScript into smaller, focused modules
- Enhanced UX for searching and filtering operations
- Improved DOM structure and HTML semantics

## [0.3.1] - 2025-05-16

### Added
- Express.js backend API foundation
- RESTful routes under `/api/games` endpoint
- Pagination and sorting query support (`?page=1&limit=20&sort=name&order=asc`)
- Request validation using Zod schemas
- Middleware for logging, CORS, error handling, and 404 responses
- Clean route/controller architecture

### Changed
- Established standardized error handling patterns
- Implemented graceful fallback defaults for API parameters

## [0.3.0] - 2025-05-14

### Added
- Improved database insert/upsert logic for launch options
- Junction table support for many-to-many relationships
- Nested query patterns for efficient data retrieval

### Fixed
- Database query error in `fetch_steam_launch_options_from_db` function
- Incorrect filtering on non-existent `app_id` column
- Many-to-many relationship integrity in normalized schema

### Changed
- Updated launch options fetching to use proper junction table queries
- Maintained separation between `games`, `launch_options`, and `game_launch_options` tables

## [0.2.0] - 2025-05-13

### Added
- Modular Python package structure with `core/`, `scrapers/`, `utils/`, and `constants/`
- CLI interface with `argparse` support
- Command-line flags: `--top-sellers`, `--top-played`, `--limit`, `--force-refresh`, `--test`
- Centralized constants for regex patterns and game engines
- Safe parameter handling for optional test results

### Changed
- Refactored `SlopScraper` class to manage state while scrapers remain stateless
- Functions now receive explicit context objects instead of relying on class state
- Deduplicated launch option patterns and engine detection logic

### Fixed
- Import errors across modules with proper exports/imports
- Operator precedence in conditional checks
- Recursion parameter passing to prevent silent failures

## [0.1.0] - 2025-04-22

### Added
- Progress bars for game filtering and source checking
- Signal handlers for graceful shutdown (SIGINT, SIGTERM)
- Periodic cache saving every 3 games during long runs
- Dedicated signal handler method in main class

### Changed
- Enhanced progress bar output with current game indication
- Improved error handling with partial result saving
- Streamlined source checking process
- Cleaner output formatting

### Fixed
- Exit handling to properly save cache and data before termination