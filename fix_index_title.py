#!/usr/bin/env python3
import re

with open('index.html', 'r') as f:
    content = f.read()

# Replace the entire broken title with a clean one
new_title = '<title>IsaiahWebDev - Frontend Developer & UI Designer Portfolio</title>'
content = re.sub(r'<title>.*?</title>', new_title, content, flags=re.DOTALL)

with open('index.html', 'w') as f:
    f.write(content)

print("Fixed index.html title")
