## Vanilla Slops

<p align="left">
  <img src="./src/client/public/frogslops.png" alt="FrogSlops Logo" width="140">
</p>

The name Vanilla Slops is a nod to the use of vanilla JavaScript, with our back-end powered by Supabase and an Express.js API. This project serves as a way to search and filter through the launch options for games in the Steam library.

This project's core philosophy is to recreate some of the functionality that modern frameworks abstract away, 
while staying lightweight, fast, and minimal. 

### 🛠️ Building Blocks
- **Frontend:** Vanilla JavaScript
- **Backend:** Node.js + Express
- **Database:** Supabase (PostgreSQL) 
- **Slop Scraper** Python

---


### ⚙️ **A Skeleton Made of Bones**

#### 🖥️ Frontend (`src/client`)

* Supports:

  * 🔍 Search games by title
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
- Fetches a list of games from the Steam API
- Filters out non-game content (DLC, demos, NSFW)
- Collect launch options for each fetched game
- Saves data to Supabase (or JSON if running in test mode)
- Supports CLI flags for test mode, rate limits, and batch size
- Uses caching to avoid redundant API calls

---

<small>Built with ❤️</small>