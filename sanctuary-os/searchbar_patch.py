import os, re

def extract_jsx_attribute(tag_str, attr_name):
    m = re.search(attr_name + r'\s*=\s*\{([^}]+)\}', tag_str)
    if m: return m.group(1).strip()
    m = re.search(attr_name + r'\s*=\s*"([^"]+)"', tag_str)
    if m: return '"' + m.group(1) + '"'
    m = re.search(attr_name + r"\s*=\s*'([^']+)'", tag_str)
    if m: return '"' + m.group(1) + '"'
    return None

def extract_onchange_setter(tag_str):
    m = re.search(r'onChange\s*=\s*\{\s*\(?[eE]\)?\s*=>\s*([a-zA-Z0-9_]+)\(e\.target\.value\)\s*\}', tag_str)
    if m: return m.group(1)
    m = re.search(r'onChange\s*=\s*\{\s*\(?[eE]\)?\s*=>\s*\{\s*([a-zA-Z0-9_]+)\(e\.target\.value\)\s*\}?\s*\}', tag_str)
    if m: return m.group(1)
    return None

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'SidePanelBrowser.tsx' in filepath: return False
    
    inputs = list(re.finditer(r'<input[\s\S]*?placeholder\s*=\s*\{[^\}]*search[^\}]*\}[\s\S]*?/>|<input[\s\S]*?placeholder\s*=\s*"[^"]*Search[^"]*"[\s\S]*?/>', content, re.IGNORECASE))
    if not inputs: return False
    
    changes = 0
    for match in reversed(inputs):
        input_str = match.group(0)
        
        value = extract_jsx_attribute(input_str, 'value')
        placeholder = extract_jsx_attribute(input_str, 'placeholder')
        setter = extract_onchange_setter(input_str)
        
        if not value or not placeholder:
            continue
            
        on_change_str = setter if setter else f"(v) => set{value[0].upper() + value[1:]}(v)"
                
        searchbar_str = f'<SearchBar value={{{value}}} onChange={{{on_change_str}}} placeholder={{{placeholder}}} />'
        
        start_idx = content.rfind('<div', 0, match.start())
        end_idx = content.find('</div>', match.end())
        
        if start_idx != -1 and end_idx != -1:
            div_content = content[start_idx:end_idx+6]
            if len(div_content) < 1000 and '<input' in div_content and div_content.count('<div') == 1:
                wrapper_class = extract_jsx_attribute(div_content[:div_content.find('>')], 'className') or ''
                if 'w-' in wrapper_class or 'max-w' in wrapper_class or 'flex' in wrapper_class:
                    replacement = f'<div className={{{wrapper_class}}}>\n  {searchbar_str}\n</div>'
                else:
                    replacement = searchbar_str
                    
                content = content[:start_idx] + replacement + content[end_idx+6:]
                changes += 1
            else:
                content = content[:match.start()] + searchbar_str + content[match.end():]
                changes += 1
        else:
            content = content[:match.start()] + searchbar_str + content[match.end():]
            changes += 1
            
    if changes > 0:
        if 'SearchBar' not in content:
            if 'import { ' in content and 'shared' in content:
                content = re.sub(r'(import\s*\{[^}]*)(\}\s*from\s*[\'"][./\\]*shared[\'"])', r'\1, SearchBar \2', content, count=1)
            else:
                content = "import { SearchBar } from '../shared';\n" + content
                
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

path = r'c:\Users\Jesse\Desktop\Solder Republic\sanctuary-os\src'
count = 0
for root, dirs, files in os.walk(path):
    for file in files:
        if file.endswith('.tsx'):
            if process_file(os.path.join(root, file)):
                print('Updated', file)
                count += 1
print(f'Total files updated: {count}')
