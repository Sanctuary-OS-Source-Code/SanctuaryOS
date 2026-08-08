import os, re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix className={'\"...\"'} to className="..."
    # We want to match: className={'\"something\"'} and replace with className="something"
    new_content = re.sub(r'className=\{\'\"([^\"]+)\"\'\}', r'className="\1"', content)
    
    # Also in case it generated className={'something'} where something had no quotes but wait, extract returned quotes.
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

path = r'c:\Users\Jesse\Desktop\Solder Republic\sanctuary-os\src'
count = 0
for root, dirs, files in os.walk(path):
    for file in files:
        if file.endswith('.tsx'):
            if process_file(os.path.join(root, file)):
                print('Fixed CSS classes in', file)
                count += 1
print(f'Total files fixed: {count}')
