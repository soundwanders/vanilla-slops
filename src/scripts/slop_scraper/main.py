#!/usr/bin/env python3
import os
import sys
import argparse
from dotenv import load_dotenv
from .core.scraper import SlopScraper
 
def get_script_dir():
    """Get directory where this script (slop_scraper) is located"""
    script_path = os.path.dirname (os.path.abspath(__file__))
    return script_path

def setup_argument_parser():
    """Set up and return the argument parser for CLI arguments"""
    parser = argparse.ArgumentParser(description='Steam Launch Options Scraper')
    parser.add_argument('--test', action='store_true', help='Run in test mode')
    parser.add_argument('--limit', type=int, default=5, help='Maximum number of games to process')
    parser.add_argument('--rate', type=float, default=2.0, help='Rate limit in seconds between requests')
    parser.add_argument('--output', type=str, default='./test-output', help='Output directory for test results')
    parser.add_argument('--absolute-path', action='store_true', help='Use absolute path for output directory')
    parser.add_argument('--force-refresh', action='store_true', help='Force refresh of game data cache')
    parser.add_argument('--test-db', action='store_true', help='Test database connection and exit')
    return parser

def main():
    """Main entry point for the application"""
    # Load environment variables
    load_dotenv()
    
    # If env not found, try parent directory (root)
    if not os.getenv("SUPABASE_URL") or not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        load_dotenv(os.path.join(project_root, ".env"))
    
    # Parse command line arguments
    parser = setup_argument_parser()
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
        force_refresh=args.force_refresh,
        debug=False
    )
    
    # Only test the database connection if requested
    if args.test_db:
        success = scraper.test_database_connection()
        sys.exit(0 if success else 1)
    
    try:
        # Run the scraper
        scraper.run()
    except KeyboardInterrupt:
        # This shouldn't be reached if signal handling works
        print("\nScript interrupted. Exiting.")
        sys.exit(1)

if __name__ == "__main__":
    main()