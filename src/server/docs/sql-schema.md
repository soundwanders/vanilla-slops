# 🌼 Vanilla Slops Supabase SQL Schema Readme

## 📋 Tables Overview

### `games`
Stores basic information about each Steam game.

| Column            | Type       | Description                            |
|-------------------|------------|----------------------------------------|
| `app_id`          | BIGINT     | Steam app ID (primary key)             |
| `title`           | TEXT       | Game title                             |
| `developer`       | TEXT       | Game developer                         |
| `publisher`       | TEXT       | Game publisher                         |
| `release_date`    | TEXT       | Release date string                    |
| `engine`          | TEXT       | Game engine (e.g., Source, Unity)      |
| `total_options_count` | INT   | Count of launch options (auto-managed) |
| `created_at`      | TIMESTAMPTZ | Timestamp when added                  |
| `updated_at`      | TIMESTAMPTZ | Auto-updated on modification          |

---

### `launch_options`
Contains **unique launch commands**, shared across multiple games.

| Column       | Type    | Description                                 |
|--------------|---------|---------------------------------------------|
| `id`         | UUID    | Primary key                                 |
| `command`    | TEXT    | Unique launch command (e.g., `-novid`)      |
| `description`| TEXT    | Optional explanation                        |
| `source`     | TEXT    | Source (linked to `sources(name)`)         |
| `verified`   | BOOL    | Whether it's verified to work               |
| `upvotes`    | INT     | Community endorsement                      |
| `downvotes`  | INT     | Community rejection                        |
| `created_at` | TIMESTAMPTZ | Created timestamp                     |
| `updated_at` | TIMESTAMPTZ | Updated timestamp                     |

---

### `game_launch_options`
This is a **junction table** (many-to-many) linking games to launch options.

| Column              | Type  | Description                         |
|---------------------|-------|-------------------------------------|
| `game_app_id`       | BIGINT | FK to `games(app_id)`              |
| `launch_option_id`  | UUID   | FK to `launch_options(id)`         |
| `created_at`        | TIMESTAMPTZ | When the relationship was made |

---

### `sources`
Reference table to define where options come from.

| Column             | Type     | Description                           |
|--------------------|----------|---------------------------------------|
| `id`               | SERIAL   | Primary key                           |
| `name`             | TEXT     | Source name (unique)                  |
| `description`      | TEXT     | Optional description                  |
| `reliability_score`| FLOAT    | How trustworthy the source is         |
| `created_at`       | TIMESTAMPTZ | When the source was added          |

---

## ⚙️ Triggers & Functions

### `update_game_options_count()`
Automatically updates `games.total_options_count` whenever a game gets a new launch option or one is removed (via the `game_launch_options` table).

- Triggered on **INSERT/DELETE** in `game_launch_options`.

---

### `update_modified_column()`
Updates the `updated_at` timestamp **before any row is updated** in:

- `games`
- `launch_options`
- (optional: `game_launch_options`)

---

## 🔐 Security: Row Level Security (RLS)

To protect user data and restrict unauthorized access:

- **RLS is enabled** on all public tables.
- **Authenticated users** can:
  - Insert, update, and delete records (per policy).
  - Read data if permitted.
- Supabase/PostgREST uses these policies to enforce access control.

---

## 💒 The Junction Table Ties the Room Together

- ✅ **Normalization**: Avoids data duplication.
- ✅ **Foreign Keys**: Ensures referential integrity.
- ✅ **Junction Table**: Models many-to-many relationships.
- ✅ **Triggers**: Keeps counts and timestamps accurate.
- ✅ **Security**: Hardened functions and RLS enforcement.

---