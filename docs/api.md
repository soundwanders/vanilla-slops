# Vanilla Slops API Documentation

**Base URL:** `https://launchoptions.dev`
**Protocol:** HTTPS only

## Overview

The Vanilla Slops API is the read-only web service behind [launchoptions.dev](https://launchoptions.dev). It is built with **Node.js** and **Express.js** and serves a database of Steam games and their community-sourced launch options. Data is stored in **Supabase** (PostgreSQL), and the app is written entirely in modern ES modules.

Launch options are command-line parameters you can add to a Steam game to optimize performance, unlock features, or fix compatibility issues.

**Data licence:** responses contain information from [ProtonDB](https://www.protondb.com), which is made available here under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). The ProtonDB-derived data is available under the ODbL on request, [via a GitHub issue](https://github.com/soundwanders/vanilla-slops/issues/new?title=Request%3A+ProtonDB-derived+data+%28ODbL%29).

**Tech Stack:**
- **Runtime**: Node.js (22.x)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Hosting**: Vercel (serverless)

### Architecture

The API follows a layered structure:

- **Routes**: Endpoint declarations (`routes/gamesRoutes.js`)
- **Controllers**: HTTP request/response handling (`controllers/gamesController.js`)
- **Services**: Business logic and Supabase queries (`services/gamesService.js`)
- **Schemas**: Query validation with Zod (`schemas/gameQuerySchema.js`)
- **Middleware**: CORS, rate limiting, request logging, standardized error handling

The database has three tables:
- `games` — Steam game metadata (`app_id`, `title`, `developer`, `publisher`, `release_date`, `engine`, `total_options_count`)
- `launch_options` — normalized launch commands, stored once and shared across games
- `game_launch_options` — junction table linking games to their launch options (many-to-many)

The API reads them through two views, `public_games` and `public_launch_options`, which hide duplicate game entries and any option that does not say where it was documented. Every count in a response describes those published rows.

`total_options_count` is maintained automatically by a PostgreSQL trigger.

**Key features:**
- Read-only, no authentication
- Query validation and sanitization (Zod)
- Rate limiting and bot protection
- Trigram-indexed search across title, developer, and publisher
- Server-rendered, SEO-friendly per-game pages

### What are Launch Options?

Special commands you add to a game's launch settings on Steam to change how it starts. Examples:
- `-windowed` — run the game in windowed mode
- `-high` — set high CPU priority
- `-novid` — skip intro videos

## Access

The API exists to serve the site, and in production the site is in practice its only client:

- **Other websites:** a browser request sent from another origin is refused with `403 CORS_FORBIDDEN`.
- **Scripts and command-line tools:** a request from outside a browser is usually met by the host's bot protection, which answers `429` with an HTML challenge page rather than JSON.

The requests in this document are therefore written as plain `GET` lines. They describe what the site itself sends.

## Quick Start

```http
# Games, featured lineup first (the default order)
GET /api/games

# Search for a specific game
GET /api/games?search=half+life

# Launch options for Team Fortress 2 (app_id: 440)
GET /api/games/440/launch-options
```

## Rate Limiting

- **Exceeded:** `429 Too Many Requests`, either as an HTML page from the hosting firewall or as JSON from the app (see [Error Handling](#error-handling))
- **Headers:** the app's responses include standard `RateLimit-*` headers

## Endpoints

The API is read-only — every endpoint is a `GET`.

| Endpoint | Description |
|----------|-------------|
| `GET /api/games` | List games with filtering, sorting, search, and pagination |
| `GET /api/games/suggestions` | Autocomplete search suggestions |
| `GET /api/games/facets` | Available filter values (developers, engines, etc.) |
| `GET /api/games/statistics` | Aggregate counts (games with/without options) |
| `GET /api/games/{app_id}` | Full game details including launch options |
| `GET /api/games/{app_id}/launch-options` | Launch options only (lighter response) |
| `GET /api/status` | API status and endpoint index |
| `GET /health` | Health check: process up, and which release |
| `GET /game/{app_id}/{slug}` | Server-rendered game page (HTML, for SEO/sharing) |
| `GET /engine/{slug}` | Server-rendered engine page (HTML) |
| `GET /steam-launch-options` | Server-rendered guide to launch options (HTML) |
| `GET /how-it-works` | Server-rendered explanation of sources and risk levels (HTML) |
| `GET /catalog` | Server-rendered catalogue overview (HTML) |
| `GET /sitemap.xml` | XML sitemap |

### Games

#### List Games
```http
GET /api/games
```

Retrieve a paginated list of Steam games with optional filtering and search. By default, results start with a curated featured lineup, followed by every other game ordered by option count, most first.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | - | Search term (matches title, developer, publisher) |
| `developer` | string | - | Filter by developer name |
| `engine` | string | - | Filter by engine, as listed by `/api/games/facets` (e.g. `Source Engine`) |
| `category` | string | - | Games with at least one option in this category (e.g. `Display`, `Performance`) |
| `risk` | enum | - | Games with at least one option at this risk level: `safe`, `caution`, `experimental` |
| `optionSearch` | string | - | Games with a launch option whose command matches (e.g. `-novid`) |
| `options` | enum | - | `has-options`, `no-options`, `many-options`, `few-options` |
| `year` | string | - | Filter by release year |
| `sort` | enum | `featured` | `featured`, `title`, `developer`, `release_date` (or `year`), `options` (or `total_options_count`) |
| `order` | enum | `desc` | `asc`, `desc` |
| `page` | integer | 1 | Page number (1-based). A page past the end returns no games and the real `total` |
| `limit` | integer | 20 | Items per page (1–100) |

> Unknown or retired query values (e.g. an old `options=performance` bookmark) are ignored rather than rejected, so stale URLs still return results.
>
> Free-text filters (`search`, `developer`, `engine` and the rest) are capped at 200 characters; a longer value returns `400 VALIDATION_ERROR`.

**Example Request:**
```http
GET /api/games?search=team+fortress&limit=1
```

**Example Response:**
```json
{
  "games": [
    {
      "app_id": 440,
      "title": "Team Fortress 2",
      "developer": "Valve",
      "publisher": "Valve",
      "release_date": "2007-10-10",
      "engine": "Source Engine",
      "engine_detail": "Source",
      "engine_source": "pcgamingwiki",
      "duplicate_of": null,
      "total_options_count": 33,
      "display_options_count": 30,
      "created_at": "2026-06-27T17:08:57.874295+00:00",
      "updated_at": "2026-11-13T02:00:06.182607+00:00"
    }
  ],
  "total": 2,
  "totalPages": 2,
  "currentPage": 1,
  "hasNextPage": true,
  "hasPrevPage": false
}
```

`display_options_count` is the number of options the API will return for the game. `total_options_count` counts every linked option, including any withheld for not saying where they were documented, so it can be higher. Filter values for dropdowns come from [`/api/games/facets`](#filter-facets), not from this response.

#### Get Game Details
```http
GET /api/games/{app_id}
```

Retrieve complete details for a specific game, including all launch options. An unknown `app_id` returns `404 GAME_NOT_FOUND`.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `app_id` | integer | Steam application ID |

**Example Request:**
```http
GET /api/games/440
```

**Example Response** (abbreviated):
```json
{
  "app_id": 440,
  "title": "Team Fortress 2",
  "developer": "Valve",
  "publisher": "Valve",
  "release_date": "2007-10-10",
  "engine": "Source Engine",
  "engine_detail": "Source",
  "engine_source": "pcgamingwiki",
  "duplicate_of": null,
  "total_options_count": 33,
  "created_at": "2026-06-27T17:08:57.874295+00:00",
  "updated_at": "2026-11-13T02:00:06.182607+00:00",
  "launchOptions": [
    {
      "id": "7c3b8421-be2e-407f-97e6-c1c64a94c44c",
      "command": "-console",
      "description": "Enable the developer console (Source engine games)",
      "source": "Universal",
      "source_url": "https://developer.valvesoftware.com/wiki/Command_Line_Options",
      "risk_level": "experimental",
      "categories": ["Debug-Dev"],
      "engine_compatibility": ["Source Engine"]
    }
  ]
}
```

Each entry in `launchOptions` is the same object that `/launch-options` returns, below.

#### Get Launch Options Only
```http
GET /api/games/{app_id}/launch-options
```

Retrieve only the launch options for a specific game (lighter response).

**Example Response** (one option of 30):
```json
[
  {
    "id": "52fdc827-17f3-4fc4-9505-b7560953ef4d",
    "option": "-novid",
    "command": "-novid",
    "description": "Skip the intro video (Source engine games)",
    "source": "Valve Developer Community",
    "source_url": "https://developer.valvesoftware.com/wiki/Command_Line_Options",
    "upvotes": 0,
    "downvotes": 0,
    "verified": true,
    "risk_level": "safe",
    "categories": ["Skip-Intro"],
    "engine_compatibility": ["Source Engine"],
    "created_at": "2026-06-27T17:08:57.874295+00:00",
    "last_verified_at": "2026-09-24T01:00:00+00:00",
    "verification_method": "pcgamingwiki-scrape",
    "game_source": "PCGamingWiki",
    "game_source_url": "https://www.pcgamingwiki.com/w/index.php?curid=23",
    "game_verified_at": "2026-09-27T14:00:00+00:00",
    "usage_example": "-novid",
    "effect": "The startup video does not play. Saves several seconds on every launch and is the most common Source launch option."
  }
]
```

**Provenance fields.** Each option carries where its text came from, resolved per game:

| Field | Meaning |
|-------|---------|
| `description` | This game's own text for the option when its own page documents one, otherwise the text shared by every game |
| `source`, `source_url` | Where that `description` is cited from. The two always refer to the same page as the text |
| `last_verified_at` | When that page was last re-read and still listed the option; `null` means not yet re-checked |
| `game_source`, `game_source_url`, `game_verified_at` | This game's own page for the option, when it is extra evidence rather than the citation above; otherwise all `null` |

> An option with no written description currently carries the placeholder `"No description available"`. Its `source_url` is the documentation to read instead.

### Search & Discovery

#### Search Suggestions
```http
GET /api/games/suggestions
```

Get autocomplete suggestions for search queries. Each suggestion's `type` is `title`, `developer`, `publisher` or `option`; launch-option suggestions also carry a `description`.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query (2–100 characters) |
| `limit` | integer | No | Max title, developer and publisher suggestions (default: 10, max: 20). Up to 6 launch-option matches are added after them |

**Example Request:**
```http
GET /api/games/suggestions?q=half&limit=4
```

**Example Response:**
```json
[
  { "type": "title", "value": "Half-Life", "category": "Games" },
  { "type": "title", "value": "Half-Life 2", "category": "Games" },
  { "type": "title", "value": "Half-Life: Source", "category": "Games" },
  { "type": "title", "value": "Half-Life: Blue Shift", "category": "Games" },
  { "type": "option", "value": "-half", "description": "Render at half the current resolution", "category": "Launch options" }
]
```

#### Filter Facets
```http
GET /api/games/facets
```

Get available filter values for building the filter UI. Counts cover every published game, not the current search. Takes no parameters.

**Example Response** (abbreviated; counts change with every scrape):
```json
{
  "developers": [
    {"value": "Valve", "count": 30},
    {"value": "PopCap Games, Inc.", "count": 22}
  ],
  "engines": [
    {"value": "Unity Engine", "count": 749},
    {"value": "Unreal Engine", "count": 322}
  ],
  "publishers": [
    {"value": "Electronic Arts", "count": 70},
    {"value": "Ubisoft", "count": 69}
  ],
  "optionsRanges": [
    {"label": "No options", "min": 0, "max": 0, "count": 1132},
    {"label": "1-5 options", "min": 1, "max": 5, "count": 548},
    {"label": "6-10 options", "min": 6, "max": 10, "count": 1059},
    {"label": "11+ options", "min": 11, "max": 66, "count": 325}
  ],
  "releaseYears": ["2027", "2026", "2025"],
  "categories": [
    {"value": "Display", "count": 188},
    {"value": "Proton-Deck", "count": 107}
  ],
  "riskLevels": [
    {"value": "safe", "count": 314},
    {"value": "caution", "count": 24},
    {"value": "experimental", "count": 279}
  ],
  "popularOptions": [
    {"command": "-window-mode", "description": "Override fullscreen windowed mode (Unity games, Windows)", "count": 750}
  ]
}
```

#### Statistics
```http
GET /api/games/statistics
```

Get aggregate counts, optionally scoped by the same filters as `/api/games`.

**Query Parameters:** `search`, `developer`, `engine`, `year` (all optional).

**Example Request:**
```http
GET /api/games/statistics?search=valve
```

**Example Response:**
```json
{
  "withOptions": 33,
  "withoutOptions": 0,
  "total": 33,
  "percentageWithOptions": 100
}
```

### System

#### Health Check
```http
GET /health
```

**Example Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-11-15T03:28:06.465Z",
  "version": "1.7.8"
}
```

#### API Status
```http
GET /api/status
```

**Example Response:**
```json
{
  "api": "Vanilla Slops API",
  "status": "operational",
  "version": "1.7.8",
  "timestamp": "2026-11-15T03:28:06.520Z",
  "endpoints": {
    "games": "/api/games",
    "suggestions": "/api/games/suggestions",
    "facets": "/api/games/facets",
    "health": "/health"
  }
}
```

### SEO Pages

#### Game Page (HTML)
```http
GET /game/{app_id}/{slug}
```

Returns a fully server-rendered HTML page for a single game, with meta tags, canonical URL, Open Graph tags (using the Steam header image), and JSON-LD structured data. Intended for search engines and link previews — not a JSON endpoint. The `slug` is optional: a missing or outdated one redirects (`301`) to the canonical URL. If the database cannot be read, the page answers `503` with a `Retry-After` header rather than an empty page.

#### Other Pages (HTML)

`/engine/{slug}`, `/steam-launch-options`, `/how-it-works` and `/catalog` are server-rendered the same way. Any other page path answers `404` with a short, noindexed "Page not found" page.

#### Sitemap
```http
GET /sitemap.xml
```

Returns an XML sitemap of the home page, the guide, How It Works, the catalogue, the engine pages that are indexed, and every game page with at least one launch option.

## Error Handling

The API uses conventional HTTP status codes and returns errors in a standardized JSON envelope.

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | OK — request successful |
| `400` | Bad Request — validation failed |
| `403` | Forbidden — request from an origin other than the site |
| `404` | Not Found — resource or route doesn't exist |
| `429` | Too Many Requests — rate limit exceeded, or a bot-protection challenge |
| `500` | Internal Server Error |
| `503` | Service Unavailable — a server-rendered page could not read the database; see `Retry-After` |

### Error Response Format

Every error the API sends has this shape. The one exception is the hosting firewall's `429`, which is an HTML page:

```json
{
  "error": {
    "code": "GAME_NOT_FOUND",
    "message": "Game with ID 999999999 not found"
  },
  "requestId": "0zirhwcg"
}
```

`requestId` is included when available and is useful when reporting issues.

### Common Errors

**Validation Error (400)** — includes a `fields` object describing which parameters failed:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "fields": {
      "_errors": [],
      "page": { "_errors": ["Page must be a positive integer string"] }
    }
  }
}
```

**Route Not Found (404)** — any path under `/api` that does not exist, with any method:
```json
{
  "error": { "code": "NOT_FOUND", "message": "Route not found" },
  "requestId": "3f1c9e0a-7b2d-4c55-9a1e-2d8b6f4e9c10"
}
```

**Rate Limit Exceeded (429)** — from the app; a 429 from the hosting firewall is an HTML page instead:
```json
{
  "error": { "code": "RATE_LIMITED", "message": "Too many requests from this IP, please try again later." }
}
```

## Data Models

### Game Object

| Field | Type | Description |
|-------|------|-------------|
| `app_id` | integer | Steam application ID (unique) |
| `title` | string | Game title |
| `developer` | string | Game developer |
| `publisher` | string | Game publisher |
| `release_date` | string | Release date (`YYYY-MM-DD`) |
| `engine` | string | Engine, from a fixed vocabulary (e.g. `Source Engine`, `Unity Engine`, `Unknown`); what filters and facets use |
| `engine_detail` | string \| null | The engine as the source names it (e.g. `Source`, `Unreal Engine 4`) |
| `engine_source` | string \| null | Where the engine label came from: `pcgamingwiki`, `pcgamingwiki-page`, `curated` or `steam-field`; `null` when `engine` is `Unknown` |
| `duplicate_of` | integer \| null | Always `null` here, since duplicate entries are hidden |
| `total_options_count` | integer | Linked launch options (auto-maintained) |
| `display_options_count` | integer | Launch options the API will return (list responses only) |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### Launch Option Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `command` | string | Launch option command |
| `description` | string | Human-readable description |
| `source`, `source_url` | string | Where the description is cited from (e.g. PCGamingWiki, ProtonDB, Steam Community) |
| `last_verified_at` | string \| null | When the cited page last still listed the option |
| `verification_method` | string \| null | How the option was collected (e.g. `pcgamingwiki-scrape`) |
| `game_source`, `game_source_url`, `game_verified_at` | string \| null | This game's own page for the option, when it is extra evidence |
| `risk_level` | string | `safe`, `caution`, or `experimental` |
| `categories` | string[] | Tags such as `Display`, `Performance`, `Skip-Intro` |
| `engine_compatibility` | string[] | Engines the option is known to apply to |
| `usage_example` | string \| null | A worked example, when one is documented |
| `effect` | string \| null | What the option does in practice, when documented |

> **Note:** `option` repeats `command`. `upvotes` and `downvotes` are always `0`, because voting is not implemented. The legacy `verified` boolean is no longer surfaced in the UI; trust signals are `risk_level` and the provenance fields. Treat all three as deprecated.

## CORS Policy

- **Allowed Origins:** configurable via `CORS_ORIGIN` / `DOMAIN_URL` (development allows all). Any other origin gets `403 CORS_FORBIDDEN`
- **Allowed Methods:** `GET`, `OPTIONS` (read-only API)

## Examples

**Games with the most launch options:**
```http
GET /api/games?options=has-options&sort=options&order=desc&limit=5
```

**Games by a specific developer, newest first:**
```http
GET /api/games?developer=valve&sort=release_date&order=desc
```

**Games from 2020:**
```http
GET /api/games?year=2020
```

**Games with an option that skips the intro video:**
```http
GET /api/games?optionSearch=-novid
```
