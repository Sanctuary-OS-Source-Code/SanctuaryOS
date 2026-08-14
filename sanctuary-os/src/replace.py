import re

path = r'c:\Users\Jesse\Desktop\Solder Republic\sanctuary-os\src\ModDossier.tsx'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = [
    (r'text-red-400', r'text-[var(--danger)]'),
    (r'text-emerald-400', r'text-[var(--success)]'),
    (r'text-cyan-400', r'text-[var(--accent)]'),
    (r'text-sky-400', r'text-[var(--accent)]'),
    (r'text-purple-400', r'text-[var(--accent)]'),
    (r'text-amber-400', r'text-[var(--warning)]'),
    (r'text-amber-500', r'text-[var(--warning)]'),
    (r'text-yellow-400', r'text-[var(--warning)]'),
    (r'text-orange-400', r'text-[var(--warning)]'),
    (r'text-orange-500', r'text-[var(--warning)]'),
    (r'text-slate-400', r'text-[var(--text)]'),

    (r'bg-cyan-500', r'bg-[var(--accent)]'),
    (r'bg-sky-500', r'bg-[var(--accent)]'),
    (r'bg-purple-500', r'bg-[var(--accent)]'),
    (r'bg-amber-500', r'bg-[var(--warning)]'),
    (r'bg-slate-500', r'bg-[color-mix(in_srgb,var(--text)_50%,transparent)]'),
    (r'bg-yellow-500', r'bg-[var(--warning)]'),
    
    (r'border-sky-500/\[30%\]', r'border-[color-mix(in_srgb,var(--accent)_30%,transparent)]'),
    (r'bg-sky-500/\[10%\]', r'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'),
    (r'border-slate-500/\[30%\]', r'border-[color-mix(in_srgb,var(--text)_30%,transparent)]'),
    (r'bg-slate-500/\[10%\]', r'bg-[color-mix(in_srgb,var(--text)_10%,transparent)]'),
    
    (r'var\(--sky\)', r'var(--accent)'),
    (r'var\(--slate\)', r'var(--text)'),
    
    (r'#a855f7', r'var(--accent)'),
    (r'#d8b4fe', r'var(--accent)'),
    (r'#eab308', r'var(--warning)'),
    (r'#fef08a', r'var(--warning)'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done')
