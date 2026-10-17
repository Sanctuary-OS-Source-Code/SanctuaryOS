import { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { isDesktop } from './utils/envUtils';
import { mkdir, writeTextFile, readDir, readTextFile, remove, exists } from '@tauri-apps/plugin-fs';
import enSanctuary from './lexicons/en-sanctuary.json';
import enDefault from './lexicons/en-default.json';
import enSims from './lexicons/Simlish.json';
import { supabase, supabaseAuth } from './supabase';
import { useStore } from './store';

const LexiconContext = createContext<any>(null);

export const LexiconProvider = ({ children }: any) => {
  const activeWorkspaceId = useStore((state) => state.activeWorkspaceId);
  const wsId = activeWorkspaceId || 'default';

  const BUILTIN_LEXICON_IDS = new Set(['en-default', 'en-sanctuary', 'en-sims', 'Simlish']);

  const readRegistryFromStorage = (workspaceId: string) => {
    try {
      const key = `sanctuary_${workspaceId}_lexicon_registry`;
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      let hadBuiltins = false;
      for (const id of BUILTIN_LEXICON_IDS) {
        if (id in parsed) {
          delete parsed[id];
          hadBuiltins = true;
        }
      }
      if (hadBuiltins) {
        try {
          localStorage.removeItem(key);
          if (Object.keys(parsed).length > 0) {
            localStorage.setItem(key, JSON.stringify(parsed));
          }
        } catch {}
      }
      return parsed;
    } catch {
      return {};
    }
  };

  const saveRegistryToStorage = (workspaceId: string, reg: Record<string, any>) => {
    const key = `sanctuary_${workspaceId}_lexicon_registry`;
    const customOnly: Record<string, any> = {};
    for (const [k, v] of Object.entries(reg || {})) {
      if (!BUILTIN_LEXICON_IDS.has(k)) {
        customOnly[k] = v;
      }
    }
    if (Object.keys(customOnly).length === 0) {
      try {
        localStorage.removeItem(key);
      } catch {}
      return;
    }
    const serialized = JSON.stringify(customOnly);
    try {
      localStorage.setItem(key, serialized);
    } catch (e) {
      // Free up space from any legacy bloated lexicon_registry keys across workspaces
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.endsWith('_lexicon_registry')) {
            localStorage.removeItem(k);
          }
        }
        localStorage.setItem(key, serialized);
      } catch (err) {
        console.warn('Could not persist custom lexicon registry to localStorage:', err);
      }
    }
  };

  const [useGlobalLexiconState, setUseGlobalLexiconState] = useState(() => localStorage.getItem('sanctuary_use_global_lexicon') === 'true');
  const [registry, setRegistry] = useState(() => readRegistryFromStorage(wsId));
  const [lexiconMeta, setLexiconMeta] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(`sanctuary_${wsId}_lexicon_meta`) || "[]");
    } catch {
      return [];
    }
  });
  const activeGameSchema = useStore((state) => state.activeGameSchema);
  const [activeLangState, setActiveLangState] = useState(() => {
    let defaultLang = "en-sanctuary";
    if (activeGameSchema?.id?.toLowerCase().includes("sims") || activeGameSchema?.name?.toLowerCase().includes("sims")) {
       defaultLang = "en-sims";
    }
    
    if (localStorage.getItem('sanctuary_use_global_lexicon') === 'true') {
      return localStorage.getItem('sanctuary_global_lang') || "en-sanctuary";
    }
    return localStorage.getItem(`sanctuary_${wsId}_lang`) || defaultLang;
  });
  const [dictionary, setDictionary] = useState<any>({});

  const setUseGlobalLexicon = (val: boolean) => {
    setUseGlobalLexiconState(val);
    try { localStorage.setItem('sanctuary_use_global_lexicon', String(val)); } catch {}
    if (val) {
      setActiveLangState(localStorage.getItem('sanctuary_global_lang') || "en-sanctuary");
    } else {
      setActiveLangState(localStorage.getItem(`sanctuary_${wsId}_lang`) || "en-sanctuary");
    }
  };

  const setActiveLang = (lang: string) => {
    setActiveLangState(lang);
    try {
      if (useGlobalLexiconState) {
        localStorage.setItem('sanctuary_global_lang', lang);
      } else {
        localStorage.setItem(`sanctuary_${wsId}_lang`, lang);
      }
    } catch {}
  };

  // When workspace changes, hydrate from local storage
  useEffect(() => {
    setRegistry(readRegistryFromStorage(wsId));
    try {
      setLexiconMeta(JSON.parse(localStorage.getItem(`sanctuary_${wsId}_lexicon_meta`) || "[]"));
    } catch {
      setLexiconMeta([]);
    }
    if (!useGlobalLexiconState) {
      let defaultLang = "en-sanctuary";
      if (activeGameSchema?.id?.toLowerCase().includes("sims") || activeGameSchema?.name?.toLowerCase().includes("sims")) {
         defaultLang = "en-sims";
      }
      setActiveLangState(localStorage.getItem(`sanctuary_${wsId}_lang`) || defaultLang);
    }
  }, [wsId, useGlobalLexiconState, activeGameSchema]);

  useEffect(() => {
    const loadLang = () => {
      let baseDict: any = enSanctuary;
      if (activeLangState === 'en-default') baseDict = enDefault;
      if (activeLangState === 'en-sims' || activeLangState === 'Simlish') baseDict = enSims;
      if (registry[activeLangState]) {
        setDictionary({ ...registry[activeLangState], ...baseDict });
      } else {
        setDictionary(baseDict);
      }
    };
    loadLang();
  }, [activeLangState, registry, wsId]);


  useEffect(() => {
    const scanVault = async () => {
      try {
        if (!isDesktop()) return;
        const config: any = await invoke('get_saved_coordinates');
        if (!config?.vault_path) return;
        const lexiconsDir = `${config.vault_path}\\Data\\Lexicons`;
        const dirExists = await exists(lexiconsDir);
        if (!dirExists) return;

        const entries = await readDir(lexiconsDir);
        let localUpdates: any = {};
        let hasLocalUpdates = false;

        for (const entry of entries) {
          if (entry.name && entry.name.endsWith('.json')) {
            const langCode = entry.name.replace('.json', '');
            // Only read if not already in registry or if we want to overwrite
            // To be safe and avoid race conditions, we'll merge
            const content = await readTextFile(`${lexiconsDir}\\${entry.name}`);
            localUpdates[langCode] = JSON.parse(content);
            hasLocalUpdates = true;
          }
        }

        if (hasLocalUpdates) {
          setRegistry((prev: any) => {
            const newReg = { ...prev, ...localUpdates };
            saveRegistryToStorage(wsId, newReg);
            return newReg;
          });
        }
      } catch (err) {
        console.error("Failed to scan vault lexicons:", err);
      }
    };
    scanVault();
  }, [wsId]);

  useEffect(() => {
    const syncMasterLexicons = async () => {
      try {
        if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

        // Fetch Core OS Lexicons ONLY if they have access
        const osRole = useStore.getState().osRole;
        const hasOSAccess = ["keeper", "admin", "core_dev"].includes(osRole);
        let osRes: { data: any[] | null, error: any } = { data: [], error: null };
        
        if (hasOSAccess) {
            osRes = await supabaseAuth.from('sanctuary_lexicons').select('id, name, badge, version, lexicon_data');
        }
        
        // Fetch Community Lexicons (via proxy to current game DB)
        const gamePromise = supabase.from('sanctuary_lexicons').select('id, name, badge, version, lexicon_data');

        const gameRes = await gamePromise;
        if (hasOSAccess && osRes.error) throw osRes.error;
        if (gameRes.error && gameRes.error.code !== '42P01') console.error("Game lexicons error:", gameRes.error); // Ignore if table doesn't exist yet
        
        // Merge them, prioritizing Game Database over OS Database if there are conflicts, OR maybe OS takes priority?
        // Actually, OS lexicons (en-sanctuary, en-default) should take priority.
        const mergedData = [...(gameRes.data || []), ...(osRes.data || [])];
        const data = Array.from(new Map(mergedData.map(item => [item.id, item])).values());

        // --- Force sync missing/updated keys to cloud ---
        if (data) {
          for (let row of data) {
            let localData: any = {};
            if (row.id === 'en-default') localData = enDefault;
            if (row.id === 'en-sanctuary') localData = enSanctuary;
            if (row.id === 'en-sims' || row.id === 'Simlish') localData = enSims;

            if (Object.keys(localData).length > 0) {
              let hasChanges = false;
              if (!row.lexicon_data) row.lexicon_data = {};
              for (const key in localData) {
                if (row.lexicon_data[key] !== localData[key]) {
                  row.lexicon_data[key] = localData[key];
                  hasChanges = true;
                }
              }

              if (hasChanges) {
                if (hasOSAccess) {
                  const token = useStore.getState().session?.access_token;
                  if (token) {
                    await supabase.rpc('secure_upsert_cloud_file', { p_token: token, p_target: 'sanctuary_lexicons', p_payload: row });
                  } else {
                    await supabase.from('sanctuary_lexicons').update({ lexicon_data: row.lexicon_data }).eq('id', row.id);
                  }
                }
              }
            }
          }
        }
        // --- END SYNC ---

        if (data && data.length > 0) {
          let cloudUpdates: any = {};
          for (const row of data) {
            if (!BUILTIN_LEXICON_IDS.has(row.id)) {
              cloudUpdates[row.id] = row.lexicon_data;
            }
          }

          setRegistry((prev: any) => {
            const newReg = { ...prev, ...cloudUpdates };
            saveRegistryToStorage(wsId, newReg);
            return newReg;
          });

          // Cache metadata like badges and names
          const meta = data.map(d => ({ id: d.id, name: d.name, badge: d.badge, version: d.version, lang: d.lexicon_data?._meta_lang || 'English' }));
          try {
            localStorage.setItem(`sanctuary_${wsId}_lexicon_meta`, JSON.stringify(meta));
          } catch {}
          setLexiconMeta(meta);

          // If in local development, automatically sync cloud lexicons back to the source code files
          if (import.meta.env.DEV && hasOSAccess) {
            for (const row of data) {
              fetch('/__update-lexicon', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: row.id, content: row.lexicon_data })
              }).catch(() => { });
            }
          }
        }
      } catch (err) {
        console.error("Failed to sync master lexicons:", err);
      }
    };
    syncMasterLexicons();
  }, [wsId]);

  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}]/u;

  const t = (key: string, fallback?: string) => {
    if (!key) return fallback || "";
    let val = dictionary[key];

    if (val === undefined || val === "") {
      val = (enSanctuary as any)[key];
    }
    if (val === undefined || val === "") {
      val = (enDefault as any)[key];
    }
    if (val === undefined || val === "") {
      val = (enSims as any)[key];
    }

    if (val !== undefined && val !== "") {
      if (emojiRegex.test(val) && (key.includes('icon') || key.startsWith('emote_'))) {
        return "";
      }
      return val;
    }
    if (key.includes('icon') || key.startsWith('emote_')) return fallback && !emojiRegex.test(fallback) ? fallback : "";
    return fallback || `[${key}]`;
  };

  const importLexicon = (json: any, langCode: string) => {
    const updated = { ...registry, [langCode]: json };
    setRegistry(updated);
    saveRegistryToStorage(wsId, updated);
    setActiveLang(langCode);

    (async () => {
      try {
        if (!isDesktop()) return;
        const config: any = await invoke('get_saved_coordinates');
        if (config?.vault_path) {
          const lexiconsDir = `${config.vault_path}\\Data\\Lexicons`;
          await mkdir(lexiconsDir, { recursive: true });
          await writeTextFile(`${lexiconsDir}\\${langCode}.json`, JSON.stringify(json, null, 2));
        }
      } catch (err) { console.error("Failed to save lexicon to vault:", err); }
    })();
  };

  const deleteLexicon = (langCode: string) => {
    const { [langCode]: removed, ...remaining } = registry;
    setRegistry(remaining);
    saveRegistryToStorage(wsId, remaining);
    if (activeLangState === langCode) setActiveLang("en-sanctuary");

    (async () => {
      try {
        if (!isDesktop()) return;
        const config: any = await invoke('get_saved_coordinates');
        if (config?.vault_path) {
          const filePath = `${config.vault_path}\\Data\\Lexicons\\${langCode}.json`;
          const fileExists = await exists(filePath);
          if (fileExists) await remove(filePath);
        }
      } catch (err) { console.error("Failed to delete lexicon from vault:", err); }
    })();
  };

  return (
    <LexiconContext.Provider value={{ t, activeLang: activeLangState, setActiveLang, importLexicon, deleteLexicon, registry, lexiconMeta, useGlobalLexicon: useGlobalLexiconState, setUseGlobalLexicon }}>
      {children}
    </LexiconContext.Provider>
  );
};

export const useLexicon = () => {
  const ctx = useContext(LexiconContext);
  if (!ctx) {
    return {
      t: (key: string) => `[${key}]`,
      activeLang: 'en-sanctuary',
      setActiveLang: () => {},
      importLexicon: () => {},
      deleteLexicon: () => {},
      registry: {},
      lexiconMeta: [],
      useGlobalLexicon: false,
      setUseGlobalLexicon: () => {}
    };
  }
  return ctx;
};
