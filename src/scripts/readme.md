### How to Use This Test Script:

1. **Basic Test Run**:
   ```
   python launch-options.py --test --limit 5
   ```
   This will run in test mode, processing 5 games and saving results to `./test_output/`

2. **Adjust Rate Limit**:
   ```
   python launch-options.py --test --limit 10 --rate 3
   ```
   This will wait 3 seconds between requests

3. **Production Run** (when you're ready to rumble):
   ```
   python launch-options.py --limit 100
   ```