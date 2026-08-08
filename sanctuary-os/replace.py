import os
import re

src_dir = r'c:\Users\Jesse\Desktop\Solder Republic\sanctuary-os\src'

def should_keep_rounded_full(cls):
    # Exclude small dots
    if re.search(r'w-[1-4]\b.*h-[1-4]\b', cls) and not re.search(r'px-', cls):
        return True
    
    # Exclude switch thumbs (often have translate-x)
    if 'translate-x-' in cls:
        return True
        
    # Exclude switch tracks (w-14 h-8, w-12 h-6, w-10 h-5)
    if re.search(r'w-14\s+h-8', cls) or re.search(r'w-12\s+h-6', cls) or re.search(r'w-10\s+h-5', cls):
        return True
        
    # Exclude progress bars / skinny lines
    if re.search(r'h-[1-2]\b.*w-full', cls) or re.search(r'w-full.*h-[1-2]\b', cls):
        return True
    if re.search(r'w-1\b', cls) or re.search(r'w-2\b', cls) or re.search(r'h-1\b', cls) or re.search(r'h-2\b', cls):
        # Only exclude if not a pill/badge
        if not re.search(r'px-', cls) and not re.search(r'py-', cls):
            return True
            
    return False

total_replaced = 0
files_changed = 0

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # Find all instances of rounded-full
            # We need to replace only in className strings, but safely we can just replace 'rounded-full' 
            # if we parse lines or we can just use a replacer function on the whole text.
            
            lines = content.split('\n')
            new_lines = []
            changed = False
            
            for line in lines:
                if 'rounded-full' in line:
                    # check context
                    match = re.search(r'className=[r\']?[\"\`]?([^\'\"\{\`\>]*rounded-full[^\'\"\{\`\>]*)[\"\`]?', line)
                    if match:
                        cls = match.group(1)
                    else:
                        cls = line
                    
                    if not should_keep_rounded_full(cls):
                        new_line = line.replace('rounded-full', 'rounded-[var(--radius)]')
                        new_lines.append(new_line)
                        changed = True
                        total_replaced += line.count('rounded-full')
                    else:
                        new_lines.append(line)
                else:
                    new_lines.append(line)
                    
            if changed:
                with open(path, 'w', encoding='utf-8') as file:
                    file.write('\n'.join(new_lines))
                files_changed += 1

print(f"Replaced {total_replaced} instances in {files_changed} files.")
