### How to Use This Test Script:

1. **Basic Test Run**:
   ```
   python steam_scraper.py --test --limit 5
   ```
   This will run in test mode, processing 5 games and saving results to `./test_output/`

2. **Adjust Rate Limit**:
   ```
   python steam_scraper.py --test --limit 10 --rate 3
   ```
   This will wait 3 seconds between requests

3. **Production Run** (when you're ready):
   ```
   python steam_scraper.py --limit 100
   ```
   CAREFUL :D This will run in production mode, saving to the actual database