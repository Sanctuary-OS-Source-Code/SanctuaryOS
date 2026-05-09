const fs = require('fs');
let c = fs.readFileSync('src/AppModals.tsx', 'utf-8');

c = c.replaceAll(', sourceAction: match.source_action', '');

// Replace for "Replace" button
c = c.replaceAll(
  'try {\n                            await invoke("resolve_dna_match"',
  'setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));\n                          try {\n                            await invoke("resolve_dna_match"'
);

// Replace for "Keep Old" button
c = c.replaceAll(
  'try {\n                            ignoredHashesRef.current.add(match.hash);\n                            await invoke("resolve_dna_match"',
  'setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));\n                          try {\n                            ignoredHashesRef.current.add(match.hash);\n                            await invoke("resolve_dna_match"'
);

// Remove the old setDnaMatchQueue lines
c = c.replaceAll(
  '                          setDnaMatchQueue((prev: any[]) => prev.filter((_: any, i: number) => i !== index));\n                        }}',
  '                        }}'
);

// For "REPLACE ALL" button
c = c.replaceAll(
  'onClick={async () => {\n                    for (const match of dnaMatchQueue) {',
  'onClick={async () => {\n                    const queueCopy = [...dnaMatchQueue];\n                    setDnaMatchQueue([]);\n                    for (const match of queueCopy) {'
);

c = c.replaceAll('if (dnaMatchQueue.length > 0) runRadarSweep(true);', 'if (queueCopy.length > 0) runRadarSweep(true);');
c = c.replaceAll('setDnaMatchQueue([]);\n                  }}', '                  }}');

fs.writeFileSync('src/AppModals.tsx', c);
console.log("Patched AppModals.tsx");
