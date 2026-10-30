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
  let cachedDevSession: {
    access_token: string;
    refresh_token: string;
    user_id?: string;
    updated_at: number;
  } | null = null;
  const desktopWebAuthnClients = new Set<any>();
  const pendingWebAuthnRequests = new Map<string, { res: any; timer: any }>();

  return {
    name: 'dev-lexicon-sync',
    configureServer(server: any) {
      server.middlewares.use('/__dev-session', (req: any, res: any) => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'GET') {
          res.statusCode = 200;
          res.end(JSON.stringify({ session: cachedDevSession }));
          return;
        }
        if (req.method === 'DELETE') {
          cachedDevSession = null;
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body || '{}');
              if (data.access_token && data.refresh_token) {
                cachedDevSession = {
                  access_token: String(data.access_token),
                  refresh_token: String(data.refresh_token),
                  user_id: data.user_id ? String(data.user_id) : undefined,
                  updated_at: Date.now(),
                };
              }
              res.statusCode = 200;
              res.end(JSON.stringify({ ok: true }));
            } catch (e: any) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: e?.message || 'Invalid JSON' }));
            }
          });
          return;
        }
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
      });

      server.middlewares.use('/__dev-webauthn/stream', (req: any, res: any) => {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(': connected\n\n');
        desktopWebAuthnClients.add(res);
        req.on('close', () => {
          desktopWebAuthnClients.delete(res);
        });
      });

      server.middlewares.use('/__dev-webauthn/request', (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          if (desktopWebAuthnClients.size === 0) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'no_desktop_bridge' }));
            return;
          }
          try {
            const { kind, options } = JSON.parse(body || '{}');
            const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const timer = setTimeout(() => {
              pendingWebAuthnRequests.delete(requestId);
              if (!res.writableEnded) {
                res.statusCode = 504;
                res.end(JSON.stringify({ error: 'Desktop WebAuthn bridge timed out.' }));
              }
            }, 65000);
            pendingWebAuthnRequests.set(requestId, { res, timer });

            const payload = JSON.stringify({ requestId, kind, options });
            const targetClient = Array.from(desktopWebAuthnClients)[0];
            if (targetClient) {
              targetClient.write(`data: ${payload}\n\n`);
            }
          } catch (e: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e?.message || 'Invalid WebAuthn bridge payload' }));
          }
        });
      });

      server.middlewares.use('/__dev-webauthn/response', (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk: any) => { body += chunk; });
        req.on('end', () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const { requestId, credential, error } = JSON.parse(body || '{}');
            const pending = pendingWebAuthnRequests.get(requestId);
            if (pending) {
              clearTimeout(pending.timer);
              pendingWebAuthnRequests.delete(requestId);
              if (!pending.res.writableEnded) {
                pending.res.statusCode = error ? 400 : 200;
                pending.res.end(JSON.stringify({ credential, error }));
              }
            }
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true }));
          } catch (e: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e?.message || 'Invalid response payload' }));
          }
        });
      });

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
