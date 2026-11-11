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
  release_notes_public: "Release Notes (Community Blog).md",
  release_notes_dev: "Release Notes (Dev).md",
  changelog_running: "changelog (running).md",
  changelog_dev: "changelog.md",
};

function generateSanctuaryDevToken(): string {
  const bytes = new Uint8Array(32);
  const webCrypto = (globalThis as any).crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const SANCTUARY_DEV_TOKEN = generateSanctuaryDevToken();

function constantTimeTokenMatch(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function isLoopbackRemoteAddress(addr: string): boolean {
  const normalized = String(addr || "").trim().toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1"
  );
}

function isAllowedDevHost(hostHeader: string): boolean {
  const raw = String(hostHeader || "").trim().toLowerCase();
  if (!raw) return false;
  const withoutPort = raw.startsWith("[")
    ? raw.replace(/\]:\d+$/, "]")
    : raw.replace(/:\d+$/, "");
  return (
    withoutPort === "localhost" ||
    withoutPort === "127.0.0.1" ||
    withoutPort === "[::1]"
  );
}

function isAllowedDevOrigin(originHeader: string | undefined): boolean {
  if (!originHeader) return true;
  const raw = String(originHeader).trim().toLowerCase();
  if (raw === "tauri://localhost") return true;
  const match = raw.match(/^https?:\/\/(\[[0-9a-f:]+\]|[^/:]+)(?::\d+)?$/i);
  if (!match) return false;
  const hostname = match[1].toLowerCase();
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "tauri.localhost"
  );
}

function extractQueryToken(urlStr: string | undefined): string {
  if (!urlStr) return "";
  const qIdx = urlStr.indexOf("?");
  if (qIdx === -1) return "";
  const query = urlStr.slice(qIdx + 1);
  for (const part of query.split("&")) {
    const [k, v] = part.split("=");
    if (k === "token" && v) {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    }
  }
  return "";
}

function verifyDevMiddlewareRequest(
  req: any,
  res: any,
  allowQueryToken = false
): boolean {
  const remoteAddr =
    req?.socket?.remoteAddress || req?.connection?.remoteAddress || "";
  const hostHeader = req?.headers?.host || "";
  const originHeader = req?.headers?.origin;
  const headerToken =
    typeof req?.headers?.["x-sanctuary-dev-token"] === "string"
      ? req.headers["x-sanctuary-dev-token"]
      : "";
  const providedToken =
    headerToken || (allowQueryToken ? extractQueryToken(req?.url) : "");

  if (
    !isLoopbackRemoteAddress(remoteAddr) ||
    !isAllowedDevHost(hostHeader) ||
    !isAllowedDevOrigin(originHeader) ||
    !constantTimeTokenMatch(providedToken, SANCTUARY_DEV_TOKEN)
  ) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Forbidden" }));
    return false;
  }
  return true;
}

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
        if (!verifyDevMiddlewareRequest(req, res)) return;
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
        if (!verifyDevMiddlewareRequest(req, res, true)) return;
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
        if (!verifyDevMiddlewareRequest(req, res)) return;
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
        if (!verifyDevMiddlewareRequest(req, res)) return;
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
        if (!verifyDevMiddlewareRequest(req, res)) return;
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const id = String(data.id || data.file || "").trim();
              const { content } = data;
              if (id.match(/^[a-z]{2}-[a-z0-9_-]+\.json$/i) || id.match(/^[a-z0-9_-]+$/i)) {
                 const fileName = id.endsWith('.json') ? id : `${id}.json`;
                 const lexiconsRoot = path.resolve(__dirname, 'src/lexicons');
                 const filePath = path.resolve(lexiconsRoot, fileName);
                 if (!filePath.startsWith(lexiconsRoot + path.sep)) {
                   res.statusCode = 403;
                   res.end('Forbidden');
                   return;
                 }
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
          return;
        }
        res.statusCode = 405;
        res.end('Method not allowed');
      });

      server.middlewares.use('/__sync-directives', (req: any, res: any) => {
        if (!verifyDevMiddlewareRequest(req, res)) return;
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
        } else {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });
    }
  };
}


export default defineConfig(async () => ({
  plugins: [react(), devLexiconSyncPlugin()],
  define: {
    __SANCTUARY_DEV_TOKEN__: JSON.stringify(SANCTUARY_DEV_TOKEN),
  },

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
      allow: [
        ".",
        ...Object.values(DIRECTIVE_FILE_MAP).map((fileName) =>
          path.resolve(__dirname, "..", fileName)
        ),
        path.resolve(__dirname, "..", "schema.sql"),
        path.resolve(__dirname, "..", "schema_os.sql"),
      ],
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
            return "monaco";
          }
          if (
            id.includes("@tiptap") ||
            id.includes("prosemirror") ||
            id.includes("tiptap-markdown")
          ) {
            return "tiptap";
          }
          if (id.includes("@supabase")) {
            return "supabase";
          }
          if (
            id.includes("react-markdown") ||
            id.includes("remark-") ||
            id.includes("rehype-") ||
            id.includes("unified") ||
            id.includes("micromark") ||
            id.includes("mdast-") ||
            id.includes("hast-") ||
            id.includes("dompurify")
          ) {
            return "markdown";
          }
          if (id.includes("@tauri-apps")) {
            return "tauri";
          }
          if (
            id.includes("/react/") ||
            id.includes("\\react\\") ||
            id.includes("/react-dom/") ||
            id.includes("\\react-dom\\") ||
            id.includes("/scheduler/") ||
            id.includes("\\scheduler\\") ||
            id.includes("zustand")
          ) {
            return "vendor";
          }
          return undefined;
        },
      },
    },
  },
}));
