"""
SlopScraper - A Python tool for gathering a list of Steam games and scraping the web to find their launch options.

This package allows users to collect various launch options for Steam games from
various sources including PCGamingWiki, Steam Community, and custom game-specific
configurations and save them into a Supabase database. 
"""

# Version information
__version__ = "0.10"
__author__ = "soundwanders"

# Import and expose the main class for ease of use
from .core.scraper import SlopScraper

if __name__ == "__main__":
    main()

__all__ = [
    "SlopScraper",  # Main class
    "main",         # Main function
    "__version__",  # Version info
]

def run_scraper():
    """Run SlopScraper from the command line."""
    from .main import main
    main()