import requests
import re
import time
from bs4 import BeautifulSoup
from urllib.parse import quote

def format_game_title_for_wiki(title):
  """Format game title for PCGamingWiki URL properly"""
  # Replace common special characters
  formatted = title.replace(' ', '_')
  formatted = formatted.replace(':', '')
  formatted = formatted.replace('&', 'and')
  formatted = formatted.replace("'", '')
  formatted = formatted.replace('-', '_')
  # URL encode the result
  return quote(formatted)

def fetch_pcgamingwiki_launch_options(game_title, rate_limit=None, debug=False, test_results=None, test_mode=False):
  """Fetch launch options from PCGamingWiki"""
  # Format game title for URL
  formatted_title = format_game_title_for_wiki(game_title)
  url = f"https://www.pcgamingwiki.com/wiki/{formatted_title}"
  
  if debug:
    print(f"Fetching PCGamingWiki data from: {url}")
      
  # Add a delay for rate limiting
  if rate_limit:
    time.sleep(rate_limit)
  
  try:
      response = requests.get(url, timeout=10)
      if response.status_code == 200:
          soup = BeautifulSoup(response.text, 'html.parser')
          
          # Try to find more section headers that could contain launch options
          potential_section_ids = [
              "Command_line_arguments", 
              "Launch_options", 
              "Launch_commands",
              "Parameters", 
              "Launch_parameters",
              "Command-line_arguments",
              "Command_line_parameters",
              "Steam_launch_options"
          ]
          
          options = []
          
          # Method 1: Find tables in relevant sections
          for section_id in potential_section_ids:
              section = soup.find(id=section_id)
              if section:
                  if debug:
                    print(f"Found section: {section_id}")
                  
                  # Navigate up to the heading element
                  if section.parent and section.parent.name.startswith('h'):
                      heading = section.parent
                      
                      # Find the next table after this heading
                      table = heading.find_next('table')
                      if table and 'wikitable' in table.get('class', []):
                          if debug:
                            print(f"Found table in section {section_id}")
                          
                          rows = table.find_all('tr')[1:]  # Skip header row
                          for row in rows:
                              cells = row.find_all('td')
                              if len(cells) >= 2:
                                  command = cells[0].get_text(strip=True)
                                  description = cells[1].get_text(strip=True)
                                  if command:  # Only add non-empty commands
                                      options.append({
                                          'command': command,
                                          'description': description,
                                          'source': 'PCGamingWiki'
                                      })
          
          # Method 2: Look for lists in relevant sections
          if not options:
              for section_id in potential_section_ids:
                  section = soup.find(id=section_id)
                  if section and section.parent:
                      heading = section.parent
                      
                      # Find lists (ul/ol) after the heading
                      list_element = heading.find_next(['ul', 'ol'])
                      if list_element:
                          list_items = list_element.find_all('li')
                          for item in list_items:
                              text = item.get_text(strip=True)
                              # Try to separate command from description
                              if ':' in text:
                                  parts = text.split(':', 1)
                                  cmd = parts[0].strip()
                                  desc = parts[1].strip()
                              elif ' - ' in text:
                                  parts = text.split(' - ', 1)
                                  cmd = parts[0].strip()
                                  desc = parts[1].strip()
                              elif ' – ' in text:
                                  parts = text.split(' – ', 1)
                                  cmd = parts[0].strip()
                                  desc = parts[1].strip()
                              else:
                                  # If we can't split, look for patterns like -command or --command
                                  match = re.search(r'(-{1,2}\w+)', text)
                                  if match:
                                      cmd = match.group(1)
                                      desc = text.replace(cmd, '').strip()
                                  else:
                                      cmd = text
                                      desc = "No description available"
                              
                              if cmd and cmd.strip():  # Only add non-empty commands
                                  options.append({
                                      'command': cmd,
                                      'description': desc,
                                      'source': 'PCGamingWiki'
                                  })
          
          # Method 3: Look for code blocks or pre elements
          if not options:
              code_blocks = soup.find_all(['code', 'pre'])
              for block in code_blocks:
                  text = block.get_text(strip=True)
                  # Check if this looks like a command line argument
                  if text.startswith('-') or text.startswith('/') or text.startswith('+'):
                      parent_text = block.parent.get_text(strip=True) if block.parent else ""
                      if len(parent_text) > len(text):
                          desc = parent_text.replace(text, '', 1).strip()
                      else:
                          desc = "No description available"
                      
                      options.append({
                          'command': text,
                          'description': desc,
                          'source': 'PCGamingWiki'
                      })
          
          # Method 4: Look for text with typical command patterns
          if not options:
              potential_commands = []
              for tag in soup.find_all(['p', 'li']):
                  text = tag.get_text()
                  # Look for patterns like -command, --long-option, +option, /option
                  matches = re.finditer(r'(?:^|\s)(-{1,2}[\w\-]+|\+[\w\-]+|\/[\w\-]+)(?:\s|$)', text)
                  for match in matches:
                      cmd = match.group(1)
                      potential_commands.append({
                          'command': cmd,
                          'description': text,
                          'source': 'PCGamingWiki'
                      })
              
              # De-duplicate by command
              seen_commands = set()
              for cmd in potential_commands:
                  if cmd['command'] not in seen_commands:
                      seen_commands.add(cmd['command'])
                      options.append(cmd)
          
          # Update test statistics
          if test_mode:
              source = 'PCGamingWiki'
              if source not in test_results['options_by_source']:
                  test_results['options_by_source'][source] = 0
              test_results['options_by_source'][source] += len(options)
          
          if debug:
            print(f"Found {len(options)} options from PCGamingWiki")
          
          return options
      elif response.status_code == 404:
          if debug:
            print(f"PCGamingWiki page not found for '{game_title}'")
          # Try alternative title formats
          alt_title = game_title.split(':')[0] if ':' in game_title else None
          if alt_title and alt_title != game_title:
              if debug:
                print(f"Trying alternate title: {alt_title}")
              return fetch_pcgamingwiki_launch_options(alt_title)
          return []
      else:
          if debug:
            print(f"PCGamingWiki returned status code {response.status_code}")
          return []
  except Exception as e:
    print(f"    Error fetching from PCGamingWiki: {e}")
  return []
