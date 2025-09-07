# Vanilla Slops API Documentation

**Base URL:** `https://vanilla-slops.up.railway.app/`  
**Protocol:** HTTPS only

## Overview

The Vanilla Slops API is a RESTful web service built with **Node.js** and **Express.js**, providing access to a database of Steam games and their launch options. The API uses **Supabase** for data storage and follows modern ES module patterns.

**Tech Stack:**
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Architecture**: RESTful API

Launch options are command-line parameters that can optimize game performance, enable features, or fix compatibility issues.

### Architecture

The API follows a layered architecture pattern:

- **Controllers**: Handle HTTP requests and responses (`gamesController.js`)
- **Services**: Business logic and data processing (`gamesService.js`) 
- **Models**: Data validation with Zod schemas (`gameQuerySchema.js`)
- **Middleware**: CORS, rate limiting, error handling, request logging
- **Database**: Supabase client with PostgreSQL backend

The database schema includes three main tables:
- `games`: Steam game metadata (app_id, title, developer, etc.)
- `launch_options`: Community-sourced launch commands and descriptions  
- `game_launch_options`: Junction table linking games to their launch options
- `sources`: Reference table for launch option sources

**Key Features:**
- RESTful design
- Request validation and sanitization
- Rate limiting (1000 requests/15 minutes per IP)
- CORS support for web applications
- Structured logging for readability

### What are Launch Options?

Launch options are special commands you can add to Steam games to modify how they start. Examples include:
- `-windowed` - Run the game in windowed mode
- `-high` - Set high CPU priority
- `-novid` - Skip intro videos

## Quick Start

```bash
# Get all games
curl "https://vanilla-slops.up.railway.app/api/games"

# Search for a specific game
curl "https://vanilla-slops.up.railway.app/api/games?search=half+life"

# Get launch options for Team Fortress 2 (app_id: 440)
curl "https://vanilla-slops.up.railway.app/api/games/440/launch-options"
```

## Authentication

Currently, the API is **publicly accessible** and does not require authentication. Rate limiting is applied per IP address.

## Rate Limiting

- **Limit:** 1,000 requests per 15-minute window per IP address
- **Headers:** Rate limit information is included in response headers
- **Exceeded:** Returns `429 Too Many Requests` with retry information

## Base URL & Versioning

All API requests should be made to:
```
https://vanilla-slops.up.railway.app/api/
```

The API is currently version 1.0 and is considered stable. Future breaking changes will be introduced in new versions.

## Endpoints

### Games

#### List Games
```http
GET /api/games
```

Retrieve a paginated list of Steam games with optional filtering and search.

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `search` | string | - | Search term (title, developer, publisher) |
| `developer` | string | - | Filter by developer name |
| `options` | enum | - | `has-options`, `no-options`, `performance`, `graphics` |
| `year` | string | - | Filter by release year |
| `sort` | enum | `title` | `title`, `year`, `options`, `relevance` |
| `order` | enum | `asc` | `asc`, `desc` |
| `page` | integer | 1 | Page number (1-based) |
| `limit` | integer | 20 | Items per page (1-100) |

**Example Request:**
```bash
curl "https://vanilla-slops.up.railway.app/api/games?search=valve&sort=year&order=desc&limit=10"
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
curl "https://vanilla-slops.up.railway.app/api/games/440"
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
      "source": "Community",
      "upvotes": 245,
      "downvotes": 12,
      "verified": true
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
    "source": "Community", 
    "upvotes": 245,
    "downvotes": 12,
    "verified": true
  },
  {
    "id": "uuid-here-2", 
    "command": "-high",
    "description": "Sets high CPU priority for better performance",
    "source": "Steam Guide",
    "upvotes": 189,
    "downvotes": 5,
    "verified": true
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
| `q` | string | Yes | Search query (min 2 characters) |
| `limit` | integer | No | Max suggestions (default: 10) |

**Example Request:**
```bash
curl "https://vanilla-slops.up.railway.app/api/games/suggestions?q=half&limit=5"
```

**Example Response:**
```json
[
  {
    "type": "title",
    "value": "Half-Life",
    "category": "Games"
  },
  {
    "type": "title", 
    "value": "Half-Life 2",
    "category": "Games"
  },
  {
    "type": "developer",
    "value": "Valve Corporation", 
    "category": "Developers"
  }
]
```

#### Filter Facets
```http
GET /api/games/facets
```

Get available filter options for dynamic UI generation.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Filter facets based on search context |

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

### System

#### Health Check
```http
GET /health
```

Check API health and get system information.

**Example Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-07-19T10:30:00.000Z",
  "service": "Vanilla Slops - Steam Launch Options API",
  "version": "1.0.0",
  "environment": "production",
  "uptime": 86400,
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

Get API status and available endpoints.

**Example Response:**
```json
{
  "api": "Vanilla Slops API",
  "status": "operational", 
  "timestamp": "2025-07-19T10:30:00.000Z",
  "endpoints": {
    "games": "/api/games",
    "suggestions": "/api/games/suggestions", 
    "facets": "/api/games/facets",
    "health": "/health"
  }
}
```

## Error Handling

The API uses conventional HTTP response codes and returns error details in JSON format.

### HTTP Status Codes

| Code | Description |
|------|-------------|
| `200` | OK - Request successful |
| `400` | Bad Request - Invalid parameters |
| `404` | Not Found - Resource doesn't exist |
| `429` | Too Many Requests - Rate limit exceeded |
| `500` | Internal Server Error - Server error |

### Error Response Format

```json
{
  "error": "Description of what went wrong",
  "details": "Additional technical details (development only)"
}
```

### Common Errors

**Invalid Game ID**
```json
{
  "error": "Invalid game ID"
}
```

**Game Not Found**
```json
{
  "error": "Game with ID 999999 not found"
}
```

**Rate Limit Exceeded**
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

**Validation Error**
```json
{
  "error": {
    "page": {
      "_errors": ["Page must be a positive integer string"]
    }
  }
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
| `release_date` | string | Release date (YYYY-MM-DD format) |
| `engine` | string | Game engine used |
| `total_options_count` | integer | Number of available launch options |
| `created_at` | string | ISO timestamp |
| `updated_at` | string | ISO timestamp |

### Launch Option Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (UUID) |
| `command` | string | Launch option command |
| `description` | string | Human-readable description |
| `source` | string | Source of the option |
| `upvotes` | integer | Community upvotes |
| `downvotes` | integer | Community downvotes |
| `verified` | boolean | Whether option is verified by moderators |
| `created_at` | string | ISO timestamp |

## CORS Policy

The API supports Cross-Origin Resource Sharing (CORS) for web applications:

- **Allowed Origins:** Configurable (development allows all)
- **Allowed Methods:** GET, POST, PUT, DELETE, OPTIONS
- **Allowed Headers:** Standard headers plus Authorization
- **Credentials:** Supported

## Examples

### Basic Usage

**Get popular games with launch options:**
```bash
curl "https://vanilla-slops.up.railway.app/api/games?options=has-options&sort=options&order=desc&limit=5"
```

**Search for Valve games:**
```bash
curl "https://vanilla-slops.up.railway.app/api/games?developer=valve&sort=year&order=desc"
```

**Find games from 2020:**
```bash
curl "https://vanilla-slops.up.railway.app/api/games?year=2020"
```

### JavaScript/Node.js (Express.js)

```javascript
// Using fetch API (client-side)
async function getGameLaunchOptions(appId) {
  const response = await fetch(`https://vanilla-slops.up.railway.app/api/games/${appId}/launch-options`);
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

// Express.js server-side example
import express from 'express';

const app = express();

app.get('/my-games/:appId/options', async (req, res) => {
  try {
    const { appId } = req.params;
    const response = await fetch(`https://vanilla-slops.up.railway.app/api/games/${appId}/launch-options`);
    const options = await response.json();
    
    res.json(options);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get TF2 launch options
getGameLaunchOptions(440)
  .then(options => console.log(options))
  .catch(error => console.error(error));
```

### Python

```python
import requests

def get_games(search_term="", page=1, limit=20):
    """Get games from the Vanilla Slops API"""
    url = "https://vanilla-slops.up.railway.app/api/games"
    params = {
        "search": search_term,
        "page": page,
        "limit": limit
    }
    
    response = requests.get(url, params=params)
    response.raise_for_status()
    
    return response.json()

# Search for games
games = get_games("valve", limit=10)
print(f"Found {games['total']} games")
```

### Compatible with:
- Any HTTP client library
- Express.js middleware
- React/Vue.js applications
- Mobile app frameworks
- Server-side frameworks (Next.js, Nuxt.js, etc.)