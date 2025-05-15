import json
import os

def save_test_results(test_mode, output_dir, test_results):
  """Save test results to JSON file"""
  if not test_mode:
    return
      
  try:
    output_file = os.path.join(output_dir, "test_results.json")
    with open(output_file, 'w') as f:
      json.dump(test_results, f, indent=4)
    
    print(f"\nTest results saved to {output_file}")
    print(f"Games processed: {test_results['games_processed']}")
    print(f"Games with options found: {test_results['games_with_options']}")
    print(f"Total options found: {test_results['total_options_found']}")
    print("Options by source:")
    for source, count in test_results['options_by_source'].items():
      print(f"  {source}: {count}")
  except Exception as e:
    print(f"Error saving test results: {e}")
    print("Try running the script with sudo or check directory permissions")

def save_game_results(test_mode, output_dir, app_id, title, options):
  """Save individual game results to file"""
  if not test_mode:
    return
      
  try:
    game_file = os.path.join(output_dir, f"game_{app_id}.json")
    with open(game_file, 'w') as f:
      json.dump({
        'app_id': app_id,
        'title': title,
        'options': options
      }, f, indent=4)
  except Exception as e:
    print(f"  Error saving game data: {e}")