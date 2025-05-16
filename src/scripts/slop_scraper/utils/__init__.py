# Import utility functions from results_utils.py
from .results_utils import (
    save_test_results,
    save_game_results
)

# Import cache handling functions from cache.py
from .cache import (
    load_cache,
    save_cache
)

# Define the public API for the utils package
__all__ = [
    # Results utilities
    "save_test_results",
    "save_game_results",
    
    # Cache utilities
    "load_cache",
    "save_cache"
]