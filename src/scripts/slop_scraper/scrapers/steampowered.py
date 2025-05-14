import re
import requests
import time
from tqdm import tqdm

from ..utils.cache import save_cache

def get_steam_game_list(cache, debug, limit, force_refresh, test_mode, cache_file='appdetails_cache.json'):
    print(f"Fetching game list (force_refresh={force_refresh})...")
    print(f"Debug: Attempting to fetch up to {limit} games")

    if test_mode and limit <= 10:
        return [
            {"appid": 570, "name": "Dota 2"},
            {"appid": 730, "name": "Counter-Strike 2"},
            {"appid": 264710, "name": "Subnautica"},
            {"appid": 377840, "name": "Final Fantasy IX"},
            {"appid": 1868140, "name": "Dave the Diver"},
        ][:limit]

    url = "https://api.steampowered.com/ISteamApps/GetAppList/v2/"
    try:
        response = requests.get(url)
        response.raise_for_status()
        all_apps = response.json()['applist']['apps']
        print(f"Fetched {len(all_apps)} total apps")

        # Blocklist of terms to exclude
        blocklist_terms = [
            'dlc', 'soundtrack', 'beta', 'demo', 'test', 'adult', 'hentai', 'xxx', 'mature', 'expansion', 'tool', 'software'
        ]

        # Regex patterns for filtering unwanted games
        blocklist_pattern = re.compile(r'(?i)(' + '|'.join(re.escape(term) for term in blocklist_terms) + ')')
        non_latin_pattern = re.compile(r'[^\x00-\x7F]')
        only_numeric_special = re.compile(r'^[0-9\s\-_+=.,!@#$%^&*()\[\]{}|\\/<>?;:\'"`~]*$')

        # Known game engines to keep
        known_engines = ['unreal', 'unity', 'godot', 'source', 'cryengine', 'frostbite', 'id tech']

        filtered_games = []

        # Use tqdm for processing apps
        with tqdm(total=min(limit * 3, len(all_apps)), desc="Filtering games") as pbar:
            for app in all_apps:
                if len(filtered_games) >= limit:
                    break

                app_id = str(app['appid'])
                name = app['name']
                pbar.update(1)

                # Skip invalid or unwanted entries based on blocklist
                if not name or blocklist_pattern.search(name) or non_latin_pattern.search(name) or only_numeric_special.match(name):
                    continue

                # Check if the game is using a known engine, if required
                if not any(engine in name.lower() for engine in known_engines):
                    continue

                store_data = None
                if not force_refresh and app_id in cache:
                    store_data = cache[app_id]
                else:
                    # Fetch detailed data from store if not cached or forced refresh
                    store_url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&cc=us&l=en"
                    try:
                        store_res = requests.get(store_url, timeout=5)
                        store_res.raise_for_status()
                        raw = store_res.json()
                        store_data = raw.get(app_id, {}).get("data", {})

                        if store_data:
                            cache[app_id] = store_data
                        else:
                            pbar.write(f"⚠️ No valid data for app_id {app_id}. Skipping.")
                            continue
                        time.sleep(0.2)
                    except Exception as e:
                        pbar.write(f"⚠️ Error fetching data for app_id {app_id}: {e}. Skipping.")
                        continue

                # Validate store_data before proceeding
                if not store_data or not isinstance(store_data, dict):
                    pbar.write(f"⚠️ Invalid or missing data for app_id {app_id}. Skipping.")
                    continue

                # Additional validation checks
                if store_data.get("type") != "game":
                    pbar.write(f"⚠️ app_id {app_id} is not a game. Skipping.")
                    continue
                if store_data.get("release_date", {}).get("coming_soon", False):
                    pbar.write(f"⚠️ app_id {app_id} is marked as 'coming soon'. Skipping.")
                    continue
                if store_data.get("is_free", False) and "demo" in store_data.get("name", "").lower():
                    pbar.write(f"⚠️ app_id {app_id} is a demo. Skipping.")
                    continue

                # Add the game to the filtered list if it passes all checks
                filtered_games.append({
                    "appid": int(app_id),
                    "name": store_data.get("name", name),
                    "developer": store_data.get("developers", [""])[0],
                    "release_date": store_data.get("release_date", {}).get("date", ""),
                    "engine": store_data.get("engine", "Unknown")
                })

                pbar.write(f"✔️ Added: {name}")

        save_cache(cache, cache_file)
        print(f"✅ Final game count: {len(filtered_games)}")
        return filtered_games

    except Exception as e:
        print(f"Error fetching game list: {e}")
        return []