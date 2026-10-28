/// <reference path="./vite.node.d.ts" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import fs from 'fs';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

const DIRECTIVE_FILE_MAP: Record<string, string> = {
  citizen_guide: "Citizen Guide.md",
  phase_roadmap: "Phase Roadmap.md",
  forking_guide: "Sanctuary OS Forking & Architecture Guide.md",
  master_architecture: "Master Architecture & Feature Document.md",
  master_protocols: "Master Protocol List.md",
  compliance_protocol: "Compliance Protocol.md",
  partners_agreement: "Partners Agreement.md",
  eula: "EULA.md",
  privacy: "Privacy Policy.md",
  terms: "Terms of Service.md",
};

function devLexiconSyncPlugin() {
  return {
    name: 'dev-lexicon-sync',
    configureServer(server: any) {
      server.middlewares.use('/__update-lexicon', (req: any, res: any) => {
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const id = String(data.id || data.file || "").trim();
              const { content } = data;
              if (id.match(/^[a-z]{2}-.+\.json$/i) || id.match(/^[a-z0-9_-]+$/i)) {
                 const fileName = id.endsWith('.json') ? id : `${id}.json`;
                 const filePath = path.resolve(__dirname, 'src/lexicons', fileName);
                 const newContentStr = JSON.stringify(content, null, 2);
                 let shouldWrite = true;
                 if (fs.existsSync(filePath)) {
                    const existingContent = fs.readFileSync(filePath, 'utf-8');
                    if (existingContent === newContentStr) {
                       shouldWrite = false;
                    }
                 }
                 if (shouldWrite) {
                    fs.writeFileSync(filePath, newContentStr);
                 }
              }
              res.statusCode = 200;
              res.end('OK');
            } catch(e) {
              res.statusCode = 500;
              res.end('Error');
            }
          });
        }
      });

      server.middlewares.use('/__sync-directives', (req: any, res: any) => {
        if (req.method === 'GET') {
          try {
            const snapshots: any[] = [];
            for (const [slug, fileName] of Object.entries(DIRECTIVE_FILE_MAP)) {
              const filePath = path.resolve(__dirname, '..', fileName);
              if (fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                const content = fs.readFileSync(filePath, 'utf-8');
                snapshots.push({
                  slug,
                  file_path: fileName,
                  content,
                  modified_epoch_ms: Math.floor(stat.mtimeMs),
                });
              }
            }
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            res.end(JSON.stringify(snapshots));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e?.message || 'Failed to read directives' }));
          }
        } else if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const { slug, content } = JSON.parse(body);
              const fileName = DIRECTIVE_FILE_MAP[slug];
              if (!fileName || typeof content !== 'string') {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid directive slug or content' }));
                return;
              }
              const filePath = path.resolve(__dirname, '..', fileName);
              fs.writeFileSync(filePath, content, 'utf-8');
              const stat = fs.statSync(filePath);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({ modified_epoch_ms: Math.floor(stat.mtimeMs) }));
            } catch (e: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e?.message || 'Failed to write directive' }));
            }
          });
        }
      });
    }
  };
}


export default defineConfig(async () => ({
  plugins: [react(), devLexiconSyncPlugin()],

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    fs: {
      allow: [".."],
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          tauri: ['@tauri-apps/api', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-opener']
        }
      }
    }
  }
}));
