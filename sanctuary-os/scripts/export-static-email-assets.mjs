import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const assetsTsPath = path.join(
  repoRoot,
  "supabase",
  "functions",
  "keeper-email-dispatch",
  "assetsData.ts"
);
const outDirs = [
  path.join(repoRoot, "public", "email-assets"),
  path.join(repoRoot, "public", "email"),
];

const source = fs.readFileSync(assetsTsPath, "utf8");
const regex = /"([a-z0-9._-]+\.png)"\s*:\s*\[([\s\S]*?)\]\.join\(""\)/gi;

let exportedCount = 0;
for (const dir of outDirs) {
  fs.mkdirSync(dir, { recursive: true });
}

for (const match of source.matchAll(regex)) {
  const filename = match[1];
  const arrayBody = match[2];
  const chunks = Array.from(arrayBody.matchAll(/"([^"]*)"/g)).map((m) => m[1]);
  const b64 = chunks.join("");
  if (!b64) continue;
  const buf = Buffer.from(b64, "base64");
  for (const dir of outDirs) {
    fs.writeFileSync(path.join(dir, filename), buf);
  }
  exportedCount += 1;
}

if (exportedCount === 0) {
  console.error("Failed to export any PNG assets from assetsData.ts");
  process.exit(1);
}

console.log(`Exported ${exportedCount} static email PNG assets to public/email-assets & public/email.`);
