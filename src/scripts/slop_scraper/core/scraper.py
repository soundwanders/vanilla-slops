import os
import sys
import signal
from tqdm import tqdm

from slop_scraper.utils.cache import load_cache, save_cache
from slop_scraper.database.supabase import (
    setup_supabase_connection, 
    test_database_connection,
    fetch_steam_launch_options_from_db,
    save_to_database
)
from slop_scraper.scrapers.steampowered import get_steam_game_list
from slop_scraper.scrapers.pcgamingwiki import fetch_pcgamingwiki_launch_options
from slop_scraper.scrapers.steamcommunity import fetch_steam_community_launch_options
from slop_scraper.scrapers.game_specific import fetch_game_specific_options
from slop_scraper.utils.results_utils import save_test_results, save_game_results

class SlopScraper:
    def __init__(self, test_mode=False, cache_file='appdetails_cache.json', 
                 rate_limit=None, force_refresh=False, max_games=5, 
                 output_dir="./test-output", debug=False):
        """Initialiaze with configuartion options"""
        self.test_mode = test_mode
        self.force_refresh = force_refresh
        self.rate_limit = rate_limit
        self.cache_file = cache_file
        self.max_games = max_games
        self.output_dir = output_dir
        self.failed_cache = set()
        self.debug = debug
        self.supabase = None
        
        # Create output directory if it doesn't exist
        if not os.path.exists(self.output_dir):
            try:
                os.makedirs(self.output_dir)
                print(f"Created output directory: {self.output_dir}")
            except Exception as e:
                print(f"Error creating output directory: {e}")
                # Fall back to current directory if we can't create the specified one
                self.output_dir = "./"
                print(f"Falling back to current directory: {self.output_dir}")
        
        # Load cache
        self.cache = load_cache(self.cache_file)
        
        # Initialize Supabase connection if not in test mode
        if not self.test_mode:
            self.supabase = setup_supabase_connection()
            if self.supabase:
                print("✅ Connected to Supabase successfully")
            else:
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
        
        # Set up signal handlers for graceful exit
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)

    def signal_handler(self, sig, frame):
        """Handle shutdown signals gracefully"""
        print("\n\nGracefully shutting down...")
        print("Saving cache and collected data...")
        
        # Save cache 
        save_cache(self.cache, self.cache_file)
        
        # Save test results if in test mode
        if self.test_mode:
            save_test_results(self.test_results, self.output_dir)
            
        print("Cleanup complete. Exiting.")
        sys.exit(0)

    def test_database_connection(self):
        """Test database connection and return status"""
        return test_database_connection(
            test_mode=self.test_mode,
            supabase=self.supabase
        )

    def run(self):
        """Main method to run the scraper"""
        print(f"Running in {'TEST' if self.test_mode else 'PRODUCTION'} mode")
        
        try:
            # Get list of games (limited by max_games)
            games = get_steam_game_list(
                max_games=self.max_games,
                force_refresh=self.force_refresh,
                cache=self.cache,
                test_mode=self.test_mode,
                debug=self.debug
            )
            
            # Process each game with better progress indication
            with tqdm(games, desc="Processing games", unit="game") as game_pbar:
                for game in game_pbar:
                    app_id = game['appid']
                    title = game['name']
                    
                    # Update progress bar description
                    game_pbar.set_description(f"Processing {title}")
                    
                    # Check if we already have data in database
                    existing_options = [] if self.test_mode else fetch_steam_launch_options_from_db(
                        app_id=app_id,
                        supabase=self.supabase
                    )
                    
                    # If we already have data and not forcing refresh, skip
                    if existing_options and not self.force_refresh:
                        game_pbar.write(f"Skipping {title} - already have {len(existing_options)} options in database")
                        continue
                    
                    # Collect options from different sources
                    all_options = []
                    
                    # Add game-specific options from our knowledge base
                    game_specific_options = fetch_game_specific_options(
                        title=title, 
                        app_id=app_id,
                        cache=self.cache,
                        test_results=self.test_results if self.test_mode else None
                    )
                    
                    if game_specific_options:
                        all_options.extend(game_specific_options)
                        game_pbar.write(f"  Added {len(game_specific_options)} game-specific options")

                    # Create a small progress bar for sources
                    sources = [
                        ("PCGamingWiki", lambda: fetch_pcgamingwiki_launch_options(
                            game_title=title,
                            rate_limit=self.rate_limit,
                            debug=self.debug,
                            test_results=self.test_results if self.test_mode else None
                        )),
                        ("Steam Community", lambda: fetch_steam_community_launch_options(
                            game_title=title, 
                            app_id=app_id,
                            rate_limit=self.rate_limit,
                            debug=self.debug,
                            test_results=self.test_results if self.test_mode else None
                        ))
                    ]
                    
                    with tqdm(sources, desc="Checking sources", leave=False) as source_pbar:
                        for source_name, source_func in source_pbar:
                            source_pbar.set_description(f"Checking {source_name}")
                            try:
                                options = source_func()
                                all_options.extend(options)
                                game_pbar.write(f"  Found {len(options)} options on {source_name}")
                            except Exception as e:
                                game_pbar.write(f"  Error fetching from {source_name}: {e}")
                    
                    # Deduplicate options by command
                    unique_options = []
                    seen_commands = set()
                    for option in all_options:
                        cmd = option['command'].strip().lower()
                        if cmd not in seen_commands:
                            seen_commands.add(cmd)
                            unique_options.append(option)
                    
                    # Update test statistics
                    if self.test_mode:
                        self.test_results['games_processed'] += 1
                        if unique_options:
                            self.test_results['games_with_options'] += 1
                        self.test_results['total_options_found'] += len(unique_options)
                        
                        # Add game data to test results
                        self.test_results['games'].append({
                            'app_id': app_id,
                            'title': title,
                            'options_count': len(unique_options),
                            'options': unique_options
                        })
                        
                        # Save individual game results to separate file
                        save_game_results(
                            app_id=app_id,
                            title=title,
                            options=unique_options,
                            output_dir=self.output_dir
                        )
                    else:
                        # Save to database in production mode
                        save_to_database(
                            game=game,
                            options=unique_options,
                            supabase=self.supabase
                        )
                    
                    game_pbar.write(f"Found {len(unique_options)} unique launch options for {title}")
                    
                    # Periodically save cache during execution
                    if game['appid'] % 3 == 0:  # Save every 3 games
                        save_cache(self.cache, self.cache_file)

            # Save test results summary
            if self.test_mode:
                save_test_results(self.test_results, self.output_dir)
                
        except Exception as e:
            print(f"\nError during execution: {e}")
            # Save what we have so far
            save_cache(self.cache, self.cache_file)
            if self.test_mode:
                save_test_results(self.test_results, self.output_dir)
            raise