from dotenv import load_dotenv
load_dotenv()
import os
import time
import json
import requests
import argparse
from bs4 import BeautifulSoup
from supabase import create_client
from tqdm import tqdm 

class SlopScraper:
    def __init__(self, test_mode=False, cache_file='appdetails_cache.json', rate_limit=None, force_refresh=False, max_games=5, output_dir="./test_output"):
        self.test_mode = test_mode
        self.force_refresh = force_refresh
        self.rate_limit = rate_limit
        self.cache_file = cache_file
        self.max_games = max_games
        self.output_dir = output_dir
        
        # Create output directory if it doesn't exist
        if self.test_mode and not os.path.exists(self.output_dir):
            try:
                os.makedirs(self.output_dir)
                print(f"Created output directory: {self.output_dir}")
            except Exception as e:
                print(f"Error creating output directory: {e}")
                # Fall back to current directory if we can't create the specified one
                self.output_dir = "./"
                print(f"Falling back to current directory: {self.output_dir}")
        
        self.cache = self.load_cache()
        
        if not self.test_mode:
            url = os.getenv("SUPABASE_URL")
            key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
            
            # Check if environment variables are set
            if not url or not key:
                print("⚠️ Supabase credentials not found in environment variables.")
                print("Checking for credentials file...")
                
                # Try loading from a credentials file as fallback
                creds_file = os.path.join(os.path.expanduser('~'), '.supabase_creds')
                if os.path.exists(creds_file):
                    try:
                        with open(creds_file, 'r') as f:
                            creds = json.load(f)
                            url = creds.get('url')
                            key = creds.get('key')
                            print("✅ Loaded Supabase credentials from file.")
                    except Exception as e:
                        print(f"Error loading credentials file: {e}")
                
                # Allow manual entry if still not found
                if not url or not key:
                    print("\nSupabase credentials not found. You can:")
                    print("1. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables")
                    print("2. Create a .supabase_creds file in your home directory")
                    print("3. Enter credentials now (not recommended for security reasons)")
                    
                    use_manual = input("Enter credentials manually? (y/n): ").lower() == 'y'
                    if use_manual:
                        url = input("Enter Supabase URL: ")
                        key = input("Enter Supabase Service Role Key: ")
                    else:
                        print("Running in test mode instead.")
                        self.test_mode = True
            
            if url and key and not self.test_mode:
                try:
                    self.supabase = create_client(url, key)
                    print("✅ Connected to Supabase successfully.")
                except Exception as e:
                    print(f"Error connecting to Supabase: {e}")
                    print("Falling back to test mode.")
                    self.test_mode = True
        
        # Initialize test results dict if test mode is on
        if self.test_mode:
            self.test_results = {
                "games_processed": 0,
                "games_with_options": 0,
                "total_options_found": 0,
                "options_by_source": {},
                "games": []
            }

    def load_cache(self):
        if os.path.exists(self.cache_file):
            try:
                with open(self.cache_file, 'r') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                print("⚠️ Cache file is corrupt. Starting fresh.")
                return {}
            except Exception as e:
                print(f"⚠️ Error loading cache: {e}")
                return {}
        return {}

    def save_cache(self):
        try:
            with open(self.cache_file, 'w') as f:
                json.dump(self.cache, f, indent=2)
            print(f"✅ Cache saved to {self.cache_file}")
        except Exception as e:
            print(f"⚠️ Error saving cache: {e}")
    
    def get_steam_game_list(self, limit=100):
        print(f"Fetching game list (force_refresh={self.force_refresh})...")

        if self.test_mode and limit <= 10:
            return [
                {"appid": 570, "name": "Final Fantasy IX"},
                {"appid": 730, "name": "Counter-Strike 2"},
                {"appid": 440, "name": "Marvel Rivals"},
                {"appid": 578080, "name": "Dave the Diver"},
                {"appid": 252490, "name": "Blasphemous"}
            ][:limit]

        url = "https://api.steampowered.com/ISteamApps/GetAppList/v2/"
        try:
            response = requests.get(url)
            response.raise_for_status()
            all_apps = response.json()['applist']['apps']
            print(f"Fetched {len(all_apps)} total apps")

            filtered_games = []
            for app in all_apps:
                if len(filtered_games) >= limit:
                    break

                app_id = str(app['appid'])
                name = app['name']

                if not name or any(k in name.lower() for k in ['dlc', 'soundtrack', 'beta', 'test']):
                    continue

                store_data = None
                if not self.force_refresh and app_id in self.cache:
                    store_data = self.cache[app_id]
                else:
                    store_url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&cc=us&l=en"
                    try:
                        store_res = requests.get(store_url, timeout=3)
                        raw = store_res.json()
                        store_data = raw.get(app_id, {}).get("data", {})
                        if store_data:
                            self.cache[app_id] = store_data
                        time.sleep(0.2)
                    except Exception as inner_e:
                        print(f"Failed to fetch store data for {app_id}: {inner_e}")
                        continue

                if not store_data or store_data.get("type") != "game":
                    continue
                if store_data.get("release_date", {}).get("coming_soon", False):
                    continue
                if store_data.get("required_age", 0) >= 18:
                    continue
                if store_data.get("recommendations", {}).get("total", 0) < 100:
                    continue

                filtered_games.append({
                    "appid": int(app_id),
                    "name": store_data.get("name", name),
                    "developer": store_data.get("developers", [""])[0],
                    "release_date": store_data.get("release_date", {}).get("date", ""),
                    "engine": store_data.get("engine", None)
                })

                print(f"✔️ Added: {name}")

            self.save_cache()
            print(f"✅ Final game count: {len(filtered_games)}")
            return filtered_games

        except Exception as e:
            print(f"Error fetching game list: {e}")
            return []

    
    def fetch_pcgamingwiki_launch_options(self, game_title):
        """Fetch launch options from PCGamingWiki"""
        print(f"  Checking PCGamingWiki for '{game_title}'")
        
        # Format game title for URL
        formatted_title = game_title.replace(' ', '_')
        url = f"https://www.pcgamingwiki.com/wiki/{formatted_title}"
        
        # Add a delay for rate limiting
        if self.rate_limit:
            time.sleep(self.rate_limit)
        
        try:
            response = requests.get(url)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                  
                # Look for launch options section
                launch_options_section = soup.find(id="Launch_options")
                if not launch_options_section:
                    # Alternative section titles
                    for section_id in ["Command_line_arguments", "Parameters", "Launch_parameters"]:
                        section = soup.find(id=section_id)
                        if section:
                            launch_options_section = section
                            break
                
                if launch_options_section:
                    # Find the table after this section
                    table = launch_options_section.find_next('table')
                    if table:
                        options = []
                        rows = table.find_all('tr')[1:]  # Skip header row
                        for row in rows:
                            cells = row.find_all('td')
                            if len(cells) >= 2:
                                command = cells[0].get_text(strip=True)
                                description = cells[1].get_text(strip=True)
                                options.append({
                                    'command': command,
                                    'description': description,
                                    'source': 'PCGamingWiki'
                                })
                        print(f"    Found {len(options)} options on PCGamingWiki")
                          
                        # Update test statistics
                        if self.test_mode:
                            source = 'PCGamingWiki'
                            if source not in self.test_results['options_by_source']:
                                self.test_results['options_by_source'][source] = 0
                            self.test_results['options_by_source'][source] += len(options)
                              
                        return options
                else:
                    print("    No launch options section found")
        except Exception as e:
            print(f"    Error fetching from PCGamingWiki: {e}")
        
        return []
    
    def fetch_steam_community_launch_options(self, game_title, app_id):
        """Fetch launch options from Steam Community guides"""
        print(f"  Checking Steam Community for '{game_title}'")
        
        # Search for guides containing "launch options" for this game
        url = f"https://steamcommunity.com/app/{app_id}/guides/"
        
        # Add a delay for rate limiting
        if self.rate_limit:
            time.sleep(self.rate_limit)
        
        try:
            response = requests.get(url)
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, 'html.parser')
                guides = soup.find_all('div', class_='guide_item')
                
                relevant_guides = []
                for guide in guides:
                    title_elem = guide.find('div', class_='guide_title')
                    if title_elem:
                        title = title_elem.text.lower()
                        if 'launch' in title and ('option' in title or 'command' in title or 'parameter' in title):
                            link_elem = guide.find('a')
                            if link_elem and 'href' in link_elem.attrs:
                                relevant_guides.append({
                                    'title': title_elem.text,
                                    'url': link_elem['href']
                                })
                
                options = []
                for guide in relevant_guides[:3]:  # Limit to 3 guides for testing
                    # In real implementation, you'd fetch and parse each guide
                    # For testing, just note that we found relevant guides
                    options.append({
                        'command': f"(See guide: {guide['title']})",
                        'description': f"Found in Steam Community guide: {guide['url']}",
                        'source': 'Steam Community'
                    })
                
                print(f"    Found {len(options)} relevant guides on Steam Community")
                
                # Update test statistics
                if self.test_mode:
                    source = 'Steam Community'
                    if source not in self.test_results['options_by_source']:
                        self.test_results['options_by_source'][source] = 0
                    self.test_results['options_by_source'][source] += len(options)
                
                return options
        except Exception as e:
            print(f"    Error fetching from Steam Community: {e}")
        
        return []
    
    def save_to_database(self, game, options):
        """Save game and launch options to Supabase"""
        if self.test_mode:
            return

        try:
            # Insert game info
            res = self.supabase.table("games").upsert({
                "app_id": game['appid'],
                "title": game['name']
            }).execute()
            
            # Check response
            if hasattr(res, 'error') and res.error:
                print(f"Error saving game {game['name']}: {res.error}")
                return

            print(f"✅ Saved game {game['name']} to database")

            # Insert each launch option
            success_count = 0
            for option in options:
                try:
                    self.supabase.table("launch_options").insert({
                        "app_id": game['appid'],
                        "command": option['command'],
                        "description": option['description'],
                        "source": option['source'],
                        "verified": False
                    }).execute()
                    success_count += 1
                except Exception as inner_e:
                    print(f"Error saving option {option['command']}: {inner_e}")
            
            print(f"✅ Saved {success_count}/{len(options)} options to database")
            
        except Exception as e:
            print(f"⚠️ Database error: {e}")
            print("Make sure your Supabase tables are set up correctly with the right columns")
    
    def save_test_results(self):
        """Save test results to JSON file"""
        if not self.test_mode:
            return
            
        try:
            output_file = os.path.join(self.output_dir, "test_results.json")
            with open(output_file, 'w') as f:
                json.dump(self.test_results, f, indent=4)
            
            print(f"\nTest results saved to {output_file}")
            print(f"Games processed: {self.test_results['games_processed']}")
            print(f"Games with options found: {self.test_results['games_with_options']}")
            print(f"Total options found: {self.test_results['total_options_found']}")
            print("Options by source:")
            for source, count in self.test_results['options_by_source'].items():
                print(f"  {source}: {count}")
        except Exception as e:
            print(f"Error saving test results: {e}")
            print("Try running the script with sudo or check directory permissions")
    
    def save_game_results(self, app_id, title, options):
        """Save individual game results to file"""
        if not self.test_mode:
            return
            
        try:
            game_file = os.path.join(self.output_dir, f"game_{app_id}.json")
            with open(game_file, 'w') as f:
                json.dump({
                    'app_id': app_id,
                    'title': title,
                    'options': options
                }, f, indent=4)
            print(f"  Game data saved to {game_file}")
        except Exception as e:
            print(f"  Error saving game data: {e}")
    
    def run(self):
        """Main execution method"""
        print(f"Running in {'TEST' if self.test_mode else 'PRODUCTION'} mode")
        
        # Get list of games (limited by max_games)
        games = self.get_steam_game_list(self.max_games)
        
        # Process each game
        for game in tqdm(games, desc="Processing games"):
            app_id = game['appid']
            title = game['name']
            
            print(f"\nProcessing game: {title} (AppID: {app_id})")
            
            # Fetch launch options from different sources
            wiki_options = self.fetch_pcgamingwiki_launch_options(title)
            community_options = self.fetch_steam_community_launch_options(title, app_id)
            
            # Combine options
            all_options = wiki_options + community_options
            
            # Update test statistics
            if self.test_mode:
                self.test_results['games_processed'] += 1
                if all_options:
                    self.test_results['games_with_options'] += 1
                self.test_results['total_options_found'] += len(all_options)
                
                # Add game data to test results
                self.test_results['games'].append({
                    'app_id': app_id,
                    'title': title,
                    'options_count': len(all_options),
                    'options': all_options
                })
                
                # Save individual game results to separate file
                self.save_game_results(app_id, title, all_options)
            else:
                # Save to database in production mode
                self.save_to_database(game, all_options)
            
            print(f"Found {len(all_options)} launch options for {title}")
        
        # Save test results summary
        if self.test_mode:
            self.save_test_results()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Steam Launch Options Scraper')
    parser.add_argument('--test', action='store_true', help='Run in test mode')
    parser.add_argument('--limit', type=int, default=5, help='Maximum number of games to process')
    parser.add_argument('--rate', type=float, default=2.0, help='Rate limit in seconds between requests')
    parser.add_argument('--output', type=str, default='./test_output', help='Output directory for test results')
    parser.add_argument('--absolute-path', action='store_true', help='Use absolute path for output directory')
    parser.add_argument('--force-refresh', action='store_true', help='Force refresh of game data cache')
    
    args = parser.parse_args()
    
    # Convert to absolute path if requested
    if args.absolute_path:
        args.output = os.path.abspath(args.output)
        print(f"Using absolute path: {args.output}")
    
    # Initialize scraper
    scraper = SlopScraper(
        rate_limit=args.rate,
        max_games=args.limit,
        test_mode=args.test,
        output_dir=args.output,
        force_refresh=args.force_refresh
    )
    
    # Run the scraper
    scraper.run()
