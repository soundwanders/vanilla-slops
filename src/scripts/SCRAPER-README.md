# SlopScraper

**SlopScraper** is a Python tool for scraping Steam launch options from various sources and aggregating the data into a Supabase database.

## 📦 Features

- Fetches game data from the Steam API
- Extracts launch options from multiple sources
- Saves launch options to Supabase (production) or JSON (test mode)
- Caching system to avoid redundant API calls
- Rate limiting to avoid overloading sources
- Progress tracking with [tqdm](https://tqdm.github.io/)
- Graceful shutdown with signal handling

## 🔧 Installation

### Prerequisites

- Python 3.6+
- Required Python packages (install with pip):

```bash
pip install python-dotenv requests beautifulsoup4 supabase tqdm
```

## 🚀 Usage

### Run the Scraper

Run the scraper as a module from the root directory:

```bash
python3 -m slop_scraper [OPTIONS]
```

### Available Options

| Option            | Description                                             | Default             |
|-------------------|---------------------------------------------------------|---------------------|
| `--test`          | Run in test mode (save results locally)                | False               |
| `--limit LIMIT`   | Max number of games to process                         | 5                   |
| `--rate RATE`     | Delay (seconds) between requests                       | 2.0                 |
| `--output PATH`   | Output directory for test results                      | `./test-output`     |
| `--absolute-path` | Use absolute path for output                           | False               |
| `--force-refresh` | Force refresh of cached game data                      | False               |

### 🔍 Examples

#### Run in test mode with 10 games:
```bash
python3 -m slop_scraper --test --limit 10
```

#### Run in production mode with 20 games and a fast rate:
```bash
python3 -m slop_scraper --limit 20 --rate 1.0
```

#### Save test results to a custom directory:
```bash
python3 -m slop_scraper --test --output ./slops-logs
```

#### Use absolute path for saving test output:
```bash
python3 -m slop_scraper --test --output /Desktop/test/slops-data --absolute-path
```

#### Force refresh the cached Steam game data:
```bash
python3 -m slop_scraper --force-refresh
```

#### Combine options:
```bash
python3 -m slop_scraper --test --limit 15 --rate 2.5 --output ./game_data --force-refresh
```

---

## 🧪 Output Files (Test Mode)

When using `--test`, the following files are saved:

- `test_results.json` — Summary of all processed games and their launch options
- `game_[appid].json` — Individual game data files

---

## 🧰 Troubleshooting

### Supabase Connection Issues

1. Ensure a `.env` file exists with your Supabase URL and key.
2. Check if your Supabase instance is active.
3. Verify your database tables match the expected schema.

The script automatically switches to test mode if Supabase credentials are missing or invalid.

### Rate Limiting Errors

Try slowing requests with a higher delay:

```bash
python3 -m slop_scraper --rate 5.0
```

### Python Version

If you're on Linux, `python` might refer to Python 2. Use `python3`:

```bash
python3 --version
```

You need Python 3.6+.

### Permission Issues

If you're seeing permission errors when saving output:

```bash
sudo python3 -m slop_scraper --test
```

---

## 📁 Project Structure

```
slop-scraper/
├── main.py
├── slop_scraper/
│   ├── __init__.py
│   ├── core/
│   ├── scrapers/
│   ├── database/
│   └── utils/
├── .env
├── test-output/
└── README.md
```

---

## 📜 License

MIT License
