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