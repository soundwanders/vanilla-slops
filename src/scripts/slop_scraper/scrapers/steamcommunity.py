import requests
import re
import time
from bs4 import BeautifulSoup

def fetch_steam_community_launch_options(app_id, rate_limit=None, debug=False, test_results=None, test_mode=False):
    """Fetch launch options from Steam Community guides"""
    # Search for guides containing "launch options" for this game
    url = f"https://steamcommunity.com/app/{app_id}/guides/"
    
    if debug:
        print(f"Fetching Steam Community guides from: {url}")
    
    # Add a delay for rate limiting
    if rate_limit:
        time.sleep(rate_limit)
    
    options = []
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            guides = soup.find_all('div', class_='guide_item')
            
            relevant_guides = []
            for guide in guides:
                title_elem = guide.find('div', class_='guide_title')
                if title_elem:
                    title = title_elem.text.lower()
                    if any(keyword in title for keyword in ['launch', 'command', 'option', 'parameter', 'argument', 'fps', 'performance']):
                        link_elem = guide.find('a')
                        if link_elem and 'href' in link_elem.attrs:
                            relevant_guides.append({
                                'title': title_elem.text,
                                'url': link_elem['href']
                            })
            
            if debug:
                print(f"Found {len(relevant_guides)} relevant guides")
            
            # Process the most relevant guides (limit to 3 to avoid overloading)
            for guide in relevant_guides[:3]:
                try:
                    if debug:
                        print(f"Processing guide: {guide['title']}")
                    
                    # Add a delay between guide requests
                    if rate_limit:
                        time.sleep(rate_limit)
                    
                    guide_response = requests.get(guide['url'], timeout=15)
                    if guide_response.status_code == 200:
                        guide_soup = BeautifulSoup(guide_response.text, 'html.parser')
                        guide_content = guide_soup.find('div', class_='guide_body')
                        
                        if guide_content:
                            # Method 1: Look for code blocks or pre elements (common in guides)
                            code_blocks = guide_content.find_all(['code', 'pre'])
                            for block in code_blocks:
                                text = block.get_text(strip=True)
                                # Check if this looks like launch options text
                                if any(symbol in text for symbol in ['-', '+', '/']):
                                    # Try to identify individual options
                                    option_matches = re.finditer(r'(?:^|\s)(-{1,2}[\w\-]+|\+[\w\-]+|\/[\w\-]+)(?:\s|$)', text)
                                    for match in option_matches:
                                        cmd = match.group(1)
                                        # Find surrounding text for context
                                        parent_text = block.parent.get_text(strip=True) if block.parent else ""
                                        # Get the closest paragraph that might describe this command
                                        prev_p = block.find_previous('p')
                                        next_p = block.find_next('p')
                                        if prev_p:
                                            desc = prev_p.get_text(strip=True)
                                        elif next_p:
                                            desc = next_p.get_text(strip=True)
                                        else:
                                            desc = f"Found in guide: {guide['title']}"
                                        
                                        options.append({
                                            'command': cmd,
                                            'description': desc[:200] + "..." if len(desc) > 200 else desc,
                                            'source': 'Steam Community'
                                        })
                            
                            # Method 2: Look for paragraphs with launch options patterns
                            if not any(opt['source'] == 'Steam Community' for opt in options):
                                for p in guide_content.find_all(['p', 'li']):
                                    text = p.get_text(strip=True)
                                    if 'launch' in text.lower() and any(symbol in text for symbol in ['-', '+', '/']):
                                        # Extract commands that look like options
                                        option_matches = re.finditer(r'(?:^|\s)(-{1,2}[\w\-]+|\+[\w\-]+|\/[\w\-]+)(?:\s|$)', text)
                                        for match in option_matches:
                                            cmd = match.group(1)
                                            options.append({
                                                'command': cmd,
                                                'description': text[:200] + "..." if len(text) > 200 else text,
                                                'source': 'Steam Community'
                                            })
                        
                except Exception as guide_e:
                    print(f"    Error processing guide {guide['url']}: {guide_e}")
                    continue
            
            # If no specific options found but guides exist, add guide references
            if not options and relevant_guides:
                for guide in relevant_guides[:3]:
                    options.append({
                        'command': f"See guide: {guide['title']}",
                        'description': f"This guide may contain launch options: {guide['url']}",
                        'source': 'Steam Community'
                    })
            
            # Update test statistics
            if test_mode and test_results is not None:
                source = 'PCGamingWiki'
                test_results.setdefault('options_by_source', {})
                test_results['options_by_source'].setdefault(source, 0)
                test_results['options_by_source'][source] += len(options)

            
            if debug:
                print(f"Found {len(options)} options from Steam Community")
            
            return options
    except Exception as e:
        print(f"    Error fetching from Steam Community: {e}")
    
    return []