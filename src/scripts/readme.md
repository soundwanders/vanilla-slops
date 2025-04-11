### Basic Readme

1. **Using the Test Flag**:
   ```
   python3 slop-scraper.py --test --limit 5
   ```
   This will run in test mode, processing 5 games and saving results to `./test_output/`

2. **Adjusting Rate Limit**:
   ```
   python3 slop-scraper.py --test --limit 10 --rate 3
   ```
   This will wait 3 seconds between requests

3. **Output to a specific directory**:
   ```
   python3 slop-scraper.py --test --output /path/to/writable/dir --absolute-path
   ```

4. **Production Run** (when you think you're ready to rumble):
   ```
   python3 slop-scraper.py --limit 20 --rate 1.5
   ```