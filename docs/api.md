# Vanilla Slops API Documentation

**Base URL:** `https://launchoptions.dev`
**Protocol:** HTTPS only

## Overview

The Vanilla Slops API is a read-only web service built with **Node.js** and **Express.js** that serves a database of Steam games and their community-sourced launch options. Data is stored in **Supabase** (PostgreSQL), and the app is written entirely in modern ES modules.

Launch options are command-line parameters you can add to a Steam game to optimize performance, unlock features, or fix compatibility issues.

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

`total_options_count` is maintained automatically by a PostgreSQL trigger.

**Key features:**
- Read-only, publicly accessible (no authentication)
- Query validation and sanitization (Zod)
- Rate limiting (1,000 requests / 15 minutes per IP on `/api`)
- Trigram-indexed search across title, developer, and publisher
- Server-rendered, SEO-friendly per-game pages

### What are Launch Options?

Special commands you add to a game's launch settings on Steam to change how it starts. Examples:
- `-windowed` — run the game in windowed mode
- `-high` — set high CPU priority
- `-novid` — skip intro videos

## Quick Start

```bash
# Get games (options-first ordering by default)
curl "https://launchoptions.dev/api/games"

# Search for a specific game
curl "https://launchoptions.dev/api/games?search=half+life"

# Get launch options for Team Fortress 2 (app_id: 440)
curl "https://launchoptions.dev/api/games/440/launch-options"
```

## Authentication

The API is **publicly accessible** and does not require authentication. Rate limiting is applied per IP address.

## Rate Limiting

- **Limit:** 1,000 requests per 15-minute window per IP (applied to all `/api` routes)
- **Headers:** Standard `RateLimit-*` headers are included in responses
- **Exceeded:** Returns `429 Too Many Requests`

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
| `GET /health` | Health check and system info |
| `GET /game/{app_id}/{slug}` | Server-rendered game page (HTML, for SEO/sharing) |
| `GET /sitemap.xml` | XML sitemap of all game pages |

### Games

#### List Games
```http
GET /api/games
```

Retrieve a paginated list of Steam games with optional filtering and search. Results are ordered options-first by default (games with the most launch options appear first).

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | - | Search term (matches title, developer, publisher) |
| `developer` | string | - | Filter by developer name |
| `options` | enum | - | `has-options`, `no-options`, `many-options`, `few-options` |
| `year` | string | - | Filter by release year |
| `sort` | enum | `total_options_count` | Common values: `title`, `developer`, `options`, `year`, `release_date` |
| `order` | enum | `desc` | `asc`, `desc` |
| `page` | integer | 1 | Page number (1-based) |
| `limit` | integer | 20 | Items per page (1–100) |

> Unknown or retired query values (e.g. an old `options=performance` bookmark) are ignored rather than rejected, so stale URLs still return results.

**Example Request:**
```bash
curl "https://launchoptions.dev/api/games?search=valve&sort=options&order=desc&limit=10"
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
      "engine": "Source",
      "total_options_count": 15
    }
  ],
  "total": 150,
  "totalPages": 15,
  "currentPage": 1,
  "hasNextPage": true,
  "hasPrevPage": false,
  "facets": {
    "developers": [
      {"value": "Valve", "count": 12},
      {"value": "Bethesda", "count": 8}
    ],
    "engines": [
      {"value": "Source", "count": 5},
      {"value": "Unreal Engine 4", "count": 23}
    ]
  }
}
```

#### Get Game Details
```http
GET /api/games/{app_id}
```

Retrieve complete details for a specific game, including all launch options.

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `app_id` | integer | Steam application ID |

**Example Request:**
```bash
curl "https://launchoptions.dev/api/games/440"
```

**Example Response:**
```json
{
  "app_id": 440,
  "title": "Team Fortress 2",
  "developer": "Valve",
  "publisher": "Valve",
  "release_date": "2007-10-10",
  "engine": "Source",
  "total_options_count": 3,
  "launchOptions": [
    {
      "id": "uuid-here",
      "command": "-windowed",
      "description": "Runs the game in windowed mode",
      "source": "PCGamingWiki",
      "upvotes": 245,
      "downvotes": 12,
      "risk_level": "safe",
      "categories": ["display"],
      "engine_compatibility": ["Source"]
    }
  ]
}
```

#### Get Launch Options Only
```http
GET /api/games/{app_id}/launch-options
```

Retrieve only the launch options for a specific game (lighter response).

**Example Response:**
```json
[
  {
    "id": "uuid-here",
    "command": "-windowed",
    "description": "Runs the game in windowed mode",
    "source": "PCGamingWiki",
    "upvotes": 245,
    "downvotes": 12,
    "risk_level": "safe",
    "categories": ["display"],
    "engine_compatibility": ["Source"]
  },
  {
    "id": "uuid-here-2",
    "command": "-high",
    "description": "Sets high CPU priority",
    "source": "Community",
    "upvotes": 189,
    "downvotes": 5,
    "risk_level": "caution",
    "categories": ["performance"],
    "engine_compatibility": []
  }
]
```

### Search & Discovery

#### Search Suggestions
```http
GET /api/games/suggestions
```

Get autocomplete suggestions for search queries.

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | Yes | Search query (2–100 characters) |
| `limit` | integer | No | Max suggestions (default: 10, max: 20) |
| `prioritizeOptions` | boolean | No | Rank games that have launch options higher (default: `true`) |

**Example Request:**
```bash
curl "https://launchoptions.dev/api/games/suggestions?q=half&limit=5"
```

**Example Response:**
```json
[
  { "type": "title", "value": "Half-Life", "category": "Games" },
  { "type": "title", "value": "Half-Life 2", "category": "Games" },
  { "type": "developer", "value": "Valve Corporation", "category": "Developers" }
]
```

#### Filter Facets
```http
GET /api/games/facets
```

Get available filter values for building the filter UI.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Scope facets to a search context |
| `includeStats` | boolean | Include options statistics (default: `true`) |

**Example Response:**
```json
{
  "developers": [
    {"value": "Valve", "count": 15},
    {"value": "Bethesda Game Studios", "count": 8}
  ],
  "engines": [
    {"value": "Source", "count": 12},
    {"value": "Creation Engine", "count": 6}
  ],
  "publishers": [
    {"value": "Valve", "count": 15},
    {"value": "Bethesda Softworks", "count": 10}
  ],
  "optionsRanges": [
    {"label": "No options", "min": 0, "max": 0, "count": 1205},
    {"label": "1-5 options", "min": 1, "max": 5, "count": 342},
    {"label": "6-10 options", "min": 6, "max": 10, "count": 89},
    {"label": "11+ options", "min": 11, "max": 50, "count": 23}
  ],
  "releaseYears": ["2023", "2022", "2021", "2020"]
}
```

#### Statistics
```http
GET /api/games/statistics
```

Get aggregate counts, optionally scoped by the same filters as `/api/games`.

**Query Parameters:** `search`, `developer`, `year` (all optional).

**Example Request:**
```bash
curl "https://launchoptions.dev/api/games/statistics?search=valve"
```

**Example Response:**
```json
{
  "withOptions": 1250,
  "withoutOptions": 750,
  "total": 2000,
  "percentageWithOptions": 62.5
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
  "timestamp": "2026-07-30T10:30:00.000Z",
  "service": "Vanilla Slops - Steam Launch Options API",
  "version": "1.2.0",
  "environment": "production",
  "uptime": 86400,
  "staticFiles": "available",
  "memory": {
    "used": 145.2,
    "total": 512.0
  }
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
  "timestamp": "2026-07-30T10:30:00.000Z",
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

Returns a fully server-rendered HTML page for a single game, with meta tags, canonical URL, Open Graph tags (using the Steam header image), and JSON-LD structured data. Intended for search engines and link previews — not a JSON endpoint. The `slug` is optional and cosmetic.

#### Sitemap
```http
GET /sitemap.xml
```

Returns an XML sitemap listing every game page for crawler discovery.

## Error Handling

The API uses conventional HTTP status codes and returns errors in a standardized JSON envelope.

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | OK — request successful |
| `400` | Bad Request — validation failed |
| `404` | Not Found — resource or route doesn't exist |
| `429` | Too Many Requests — rate limit exceeded |
| `500` | Internal Server Error |

### Error Response Format

Most errors share this shape:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Game not found"
  },
  "requestId": "req-abc123"
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
      "page": { "_errors": ["Page must be a positive integer string"] }
    }
  }
}
```

**Route Not Found (404)**
```json
{
  "error": { "code": "NOT_FOUND", "message": "Route not found" }
}
```

**Rate Limit Exceeded (429)**
```json
{
  "error": "Too many requests from this IP, please try again later."
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
| `engine` | string | Game engine |
| `total_options_count` | integer | Number of launch options (auto-maintained) |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### Launch Option Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `command` | string | Launch option command |
| `description` | string | Human-readable description |
| `source` | string | Provenance (e.g. PCGamingWiki, ProtonDB, Community) |
| `upvotes` | integer | Community upvotes |
| `downvotes` | integer | Community downvotes |
| `risk_level` | string | `safe`, `caution`, or `experimental` — computed risk classification |
| `categories` | string[] | Tags such as `performance`, `display`, `compatibility` |
| `engine_compatibility` | string[] | Engines the option is known to apply to |

> **Note:** A legacy `verified` boolean still exists in the schema but is no longer surfaced in the UI. Trust signals are now conveyed by `risk_level` (computed), `source` (provenance), and community votes. Treat `verified` as deprecated.

## CORS Policy

- **Allowed Origins:** configurable via `CORS_ORIGIN` / `DOMAIN_URL` (development allows all)
- **Allowed Methods:** `GET`, `OPTIONS` (read-only API)
- **Credentials:** supported

## Examples

**Games with the most launch options:**
```bash
curl "https://launchoptions.dev/api/games?options=has-options&sort=options&order=desc&limit=5"
```

**Games by a specific developer, newest first:**
```bash
curl "https://launchoptions.dev/api/games?developer=valve&sort=year&order=desc"
```

**Games from 2020:**
```bash
curl "https://launchoptions.dev/api/games?year=2020"
```

### JavaScript

```javascript
async function getGameLaunchOptions(appId) {
  const res = await fetch(`https://launchoptions.dev/api/games/${appId}/launch-options`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

getGameLaunchOptions(440)
  .then(options => console.log(options))
  .catch(err => console.error(err));
```

### Python

```python
import requests

def get_games(search_term="", page=1, limit=20):
    """Get games from the Vanilla Slops API."""
    url = "https://launchoptions.dev/api/games"
    params = {"search": search_term, "page": page, "limit": limit}
    res = requests.get(url, params=params)
    res.raise_for_status()
    return res.json()

games = get_games("valve", limit=10)
print(f"Found {games['total']} games")
```
