## Vanilla Slops

<p align="left">
  <img src="./src/client/public/frogslops.png" alt="FrogSlops Logo" width="140">
</p>

We call it Vanilla Slops because it’s exactly that: a clean, no frills frontend built with vanilla JavaScript. all about cataloging Steam Launch Options (SLOPs). Powered by Supabase and an Express.js API, this full-stack project gives users fast, filterable access to thousands of Steam games and their launch options.

This project's core philosophy is to recreate functionality that modern frameworks abstract away, 
while staying lightweight, fast, and minimal. 

I call it Vanilla Slops because it’s exactly that: a vanilla JavaScript project cataloging Steam Launch Options (SLOPs). Backed by a Supabase database and a custom Node.js API, it helps users search and filter thousands of games for useful startup flags.

### 🛠️ Building Blocks
- **Frontend:** Vanilla JavaScript
- **Backend:** Node.js + Express
- **Database:** Supabase (PostgreSQL) 
- **Slop Scraper** Python

---


### ⚙️ **The Bones Make the Skeleton**

#### 🖥️ Frontend (`src/client`)

* Supports:

  * 🔍 Game searching (debounced)
  * 🧩 Filtering (genre, engine, platform)
  * ↕ Sorting (A → Z)
  * 🎨 Light/Dark theme toggle
* Semantic, accessible HTML

#### 📦 Backend (`src/server`)

* Acts as an API layer between **Supabase** and the frontend
* Serves:

  * `/api/games` endpoint for fetching filtered, paginated data
* Sanitizes and validates query params using middleware + `zod`
* Caching, rate limiting, and logging

#### 🧹 Data Collection (`src/scripts`)

A lovely Python script named `Slop Scraper` that:
- Fetches games from the Steam API
- Scrape launch options for each game from various sources
- Filters out non-game content (DLC, demos, NSFW)
- Saves data to Supabase (or JSON if running in test mode)
- Supports CLI flags for test mode, rate limits, and batch size
- Uses caching to avoid redundant API calls

---

<small>Built with ❤️</small>