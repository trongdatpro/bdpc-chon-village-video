import requests
import re
import json

url = "https://docs.google.com/spreadsheets/d/1A-DGSU4oPx74xdzloBQW4ekyhcjATwgh6dKf0Ky0XKg/gviz/tq?gid=214041162"
response = requests.get(url)
content = response.text

# Extract JSON from JSONP
match = re.search(r'google\.visualization\.Query\.setResponse\((.*)\);', content)
if match:
    data = json.loads(match.group(1))
    table = data.get('table', {})
    rows = table.get('rows', [])
    
    if rows:
        # Print header (if available in first row)
        # Usually GVIZ starts from raw data, but let's see.
        for i, row in enumerate(rows[:10]):
            cells = [c.get('v') if c else None for c in row.get('c', [])]
            formatted_cells = [c.get('f') if c else None for c in row.get('c', [])]
            print(f"Row {i} (values): {cells}")
            print(f"Row {i} (formatted): {formatted_cells}")
else:
    print("Could not parse JSONP response")
