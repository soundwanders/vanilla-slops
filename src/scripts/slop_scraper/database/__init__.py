# Import key functions from supabase module to make them available at the package level
from .supabase import (
    setup_supabase_connection,
    get_supabase_credentials,
    test_database_connection,
    fetch_steam_launch_options_from_db,
    save_to_database
)

__all__ = [
    "setup_supabase_connection",
    "get_supabase_credentials", 
    "test_database_connection",
    "fetch_steam_launch_options_from_db",
    "save_to_database"
]