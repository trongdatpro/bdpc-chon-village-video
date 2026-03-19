
import urllib.request
import json
import re

urls = [
    # Pricing
    "https://docs.google.com/spreadsheets/d/1XluSzDsFCMCbgQHDjJTF7_mX7D4isUI9QbtwVCQXCbY/gviz/tq?gid=2054490170",
    # Schedule
    "https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=1441677072"
]

def fetch_gviz(url):
    print(f"Fetching: {url}")
    try:
        with urllib.request.urlopen(url) as response:
            content = response.read().decode('utf-8')
            # Extract JSON from callback
            match = re.search(r'google\.visualization\.Query\.setResponse\((.*)\);', content)
            if match:
                data = json.loads(match.group(1))
                return data
    except Exception as e:
        print(f"Error fetching {url}: {e}")
    return None

def inspect_data(data):
    if not data or 'table' not in data:
        print("Invalid data")
        return

    table = data['table']
    cols = [c.get('label', '') for c in table.get('cols', [])]
    print(f"Columns: {cols}")
    
    rows = table.get('rows', [])
    for i, row in enumerate(rows[:5]): # First 5 rows
        cells = [c.get('v', '') if c else '' for c in row.get('c', [])]
        print(f"Row {i}: {cells}")

for url in urls:
    data = fetch_gviz(url)
    inspect_data(data)
    print("-" * 40)
