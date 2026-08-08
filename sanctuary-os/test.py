import os, re
path = r'c:\Users\Jesse\Desktop\Solder Republic\sanctuary-os\src\MasonHub.tsx'
with open(path, 'r', encoding='utf-8') as f: content = f.read()
inputs = list(re.finditer(r'<input[^>]*placeholder\s*=\s*\{[^}]*search[^}]*\}[^>]*/>|<input[^>]*placeholder\s*=\s*"[^"]*search[^"]*"[^>]*/>', content, re.IGNORECASE))
print(len(inputs))
