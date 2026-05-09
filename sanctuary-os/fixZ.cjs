const fs = require('fs');
let c = fs.readFileSync('src/ArchitectHub.tsx', 'utf-8');
c = c.replace(/className="relative w-full"/g, "className={`relative w-full ${isOpen ? 'z-[6000]' : ''}`}");
c = c.replace(/className="relative w-full md:w-48 shrink-0"/g, "className={`relative w-full md:w-48 shrink-0 ${isOpen ? 'z-[6000]' : ''}`}");
c = c.replace(/className="relative flex-1"/g, "className={`relative flex-1 ${isOpen ? 'z-[6000]' : ''}`}");
c = c.replace(/className="relative"/g, "className={`relative ${isOpen ? 'z-[6000]' : ''}`}");
fs.writeFileSync('src/ArchitectHub.tsx', c);
