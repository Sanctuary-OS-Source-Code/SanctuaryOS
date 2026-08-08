import os
import re
from collections import defaultdict

src_dir = r'c:\Users\Jesse\Desktop\Solder Republic\sanctuary-os\src'

categories = defaultdict(list)

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                lines = file.readlines()
                for i, line in enumerate(lines):
                    if 'rounded-full' in line:
                        match = re.search(r'className=[r\']?[\"\`]?([^\'\"\{\`\>]*rounded-full[^\'\"\{\`\>]*)[\"\`]?', line)
                        if match:
                            cls = match.group(1)
                        else:
                            cls = line.strip()
                        
                        cat = 'other'
                        if re.search(r'w-\d+ h-\d+', cls) and not re.search(r'w-[1-6]\b', cls):
                            cat = 'icon-circle-large'
                        elif re.search(r'px-\d*\.?\d+ py-\d*\.?\d+', cls):
                            cat = 'pill-badge'
                        elif re.search(r'translate-x-', cls):
                            cat = 'switch-thumb'
                        elif re.search(r'w-[1-6]\b.*h-[1-6]\b', cls) or re.search(r'h-[1-6]\b.*w-[1-6]\b', cls):
                            cat = 'small-circle'
                        elif re.search(r'w-\d*\.?\d+\s+h-[1-2]\b', cls) or re.search(r'h-\d*\.?\d+\s+w-[1-2]\b', cls) or re.search(r'h-\d*\.?\d+\s+w-full', cls) or re.search(r'w-full\s+h-\d*\.?\d+', cls):
                            cat = 'progress-or-bar'
                        
                        categories[cat].append((path, i+1, cls))

with open('replace_plan.txt', 'w', encoding='utf-8') as out:
    for cat, items in categories.items():
        out.write(f'\n--- {cat} ({len(items)} items) ---\n')
        for item in items:
            out.write(f'{item[0]}:{item[1]}\n')

print("Done. Check replace_plan.txt")
