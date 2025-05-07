# SlopScraper

SlopScraper is a tool for scraping Steam launch options from various sources and aggregating the data into a single database.

## Features

- Fetches game data from the Steam API
- Extracts launch options from various sources
- Saves launch options to Supabase database (production mode) or JSON file (test mode)
- Extensive caching system to avoid redundant API calls
- Rate limiting to avoid overloading external APIs
- Progress tracking with [tqdm](https://tqdm.github.io/)
- Signal handlers save cache and collected data before gracefully exiting

## Installation

### Prerequisites

- Python 3.6+
- Required Python packages (install with pip):

```bash
pip install python-dotenv requests beautifulsoup4 supabase tqdm
```

### Supabase Setup (for Production Mode)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Create two tables in your Supabase project:
   - `games` table with columns:
     - `app_id` (integer, primary key)
     - `title` (text)
   - `launch_options` table with columns:
     - `id` (integer, primary key, auto-increment)
     - `app_id` (integer, foreign key to games.app_id)
     - `command` (text)
     - `description` (text)
     - `source` (text)
     - `verified` (boolean)
3. Create a `.env` file in the project root with your Supabase credentials:

```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_role_key
```

## Usage

### Basic Usage

```bash
python slop-scraper.py
```

By default, this runs the script in production mode (if Supabase credentials are available) with default settings.

### Command Line Arguments

```bash
python slop-scraper.py [OPTIONS]
```

#### Available Options

| Option | Description | Default |
| ------ | ----------- | ------- |
| `--test` | Run in test mode (saves results locally instead of to Supabase) | False |
| `--limit LIMIT` | Maximum number of games to process | 5 |
| `--rate RATE` | Rate limit in seconds between requests | 2.0 |
| `--output OUTPUT` | Output directory for test results | ./test-output |
| `--absolute-path` | Use absolute path for output directory | False |
| `--force-refresh` | Force refresh of game data cache | False |

### Examples

#### Run in test mode with 10 games:
```bash
python slop-scraper.py --test --limit 10
```

#### Run with a slower rate limit (3 seconds between requests):
```bash
python slop-scraper.py --rate 3.0
```

#### Run in test mode with custom output directory:
```bash
python slop-scraper.py --test --output ./slops-logs
```

#### Use absolute path for output directory:
```bash
python slop-scraper.py --test --output /Desktop/test/slops-data --absolute-path
```

#### Force refresh the game data cache:
```bash
python slop-scraper.py --force-refresh
```

#### Run for a larger dataset (50 games) with slower rate limit:
```bash
python slop-scraper.py --limit 50 --rate 3.5
```

#### Run in production mode with 20 games and faster rate limit:
```bash
python slop-scraper.py --limit 20 --rate 1.0
```

#### Combine multiple options for a customized run:
```bash
python slop-scraper.py --test --limit 15 --rate 2.5 --output ./game_data --force-refresh
```

## Output Files (Test Mode)

When running in test mode, the script generates the following files:

- `test_results.json`: Summary of all processed games and options
- `game_[appid].json`: Individual files for each game with its launch options

## Troubleshooting

### Supabase Connection Issues

If the script can't connect to Supabase:
1. Check that your `.env` file exists and contains the correct credentials
2. Verify that your Supabase project is online
3. Ensure you've created the required tables with the correct structure

If problems persist, the script will fall back to test mode.

### Rate Limiting

If you're getting errors from external APIs, try increasing the rate limit:
```bash
python slop-scraper.py --rate 5.0
```

### Python Command

On some Linux distributions (like Xubuntu, Ubuntu, and other Debian-based systems), `python` may refer to Python 2.x while `python3` refers to Python 3.x. If you get errors running the script, try using `python3` instead:

```bash
python3 slopscraper.py --test
```

You can check your Python version with:
```bash
python --version
python3 --version
```

Make sure you're using Python 3.6 or newer.

### Permission Issues

If you encounter permission errors when saving files, you can try running with `sudo`:
```bash
sudo python slop-scraper.py --test
```
