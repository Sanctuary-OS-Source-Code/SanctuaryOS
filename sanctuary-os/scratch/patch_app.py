import sys

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if 'listen("dna_match_detected",' in line:
        new_lines.append('    if (isDesktop()) { ' + line.lstrip())
    elif '}).then((handler) => { unlisten = handler; });' in line and 'dna_match_detected' in ''.join(lines[i-15:i]):
        new_lines.append(line.replace('}).then((handler) => { unlisten = handler; });', '}).then((handler) => { unlisten = handler; }); }'))
    
    elif 'listen("malware_detected",' in line:
        new_lines.append('    if (isDesktop()) { ' + line.lstrip())
    elif '    });' in line and i > 0 and 'else unlistenMalware = unlisten;' in lines[i-1]:
        new_lines.append(line.rstrip() + ' }\n')
        
    elif 'const unlisten = listen("vault_changed", () => fetchBackups());' in line:
        new_lines.append('    const unlisten = isDesktop() ? listen("vault_changed", () => fetchBackups()) : Promise.resolve(() => {});\n')
        
    elif 'invoke("start_downloads_watch",' in line:
        new_lines.append('    if (isDesktop()) { ' + line.lstrip())
    elif '});' in line and 'unlisten = handler;' in lines[i-1]:
        new_lines.append(line.rstrip() + ' }\n')
        
    elif 'invoke("stop_downloads_watch").catch(console.warn);' in line:
        new_lines.append(line.replace('invoke(', 'if (isDesktop()) invoke('))
    else:
        new_lines.append(line)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)
