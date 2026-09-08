import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

import fs from 'fs';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

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
              const { id, content } = data;
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
        } else {
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
