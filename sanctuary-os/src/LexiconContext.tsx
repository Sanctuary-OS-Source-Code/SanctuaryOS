import { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, writeTextFile, readDir, readTextFile, remove, exists } from '@tauri-apps/plugin-fs';
import enSanctuary from './lexicons/en-sanctuary.json';
import enDefault from './lexicons/en-default.json';
import enSims from './lexicons/en-sims.json';
import { supabase } from './supabase';

const LexiconContext = createContext<any>(null);

export const LexiconProvider = ({ children }: any) => {
  const [registry, setRegistry] = useState(() => JSON.parse(localStorage.getItem("sanctuary_lexicon_registry") || "{}"));
  const [lexiconMeta, setLexiconMeta] = useState<any[]>(() => JSON.parse(localStorage.getItem("sanctuary_lexicon_meta") || "[]"));
  const [activeLang, setActiveLang] = useState(() => localStorage.getItem("sanctuary_lang") || "en-sanctuary");
  const [dictionary, setDictionary] = useState<any>({});

  useEffect(() => {
    const loadLang = () => {
      let baseDict: any = enSanctuary;
      if (activeLang === 'en-default') baseDict = enDefault;
      if (activeLang === 'en-sims') baseDict = enSims;
      if (registry[activeLang]) {
        setDictionary({ ...baseDict, ...registry[activeLang] });
      } else {
        setDictionary(baseDict);
      }
    };
    loadLang();
    localStorage.setItem("sanctuary_lang", activeLang);
  }, [activeLang, registry]);


  useEffect(() => {
    const scanVault = async () => {
      try {
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
            localStorage.setItem("sanctuary_lexicon_registry", JSON.stringify(newReg));
            return newReg;
          });
        }
      } catch (err) {
        console.error("Failed to scan vault lexicons:", err);
      }
    };
    scanVault();
  }, []);

  useEffect(() => {
    const syncMasterLexicons = async () => {
      try {
        if (!navigator.onLine || localStorage.getItem("sanctuary_local_only") === "true") return;

        const { data, error } = await supabase.from('sanctuary_lexicons').select('id, name, badge, version, lexicon_data');
        if (error) throw error;

        if (data && data.length > 0) {
          let cloudUpdates: any = {};
          for (const row of data) {
            cloudUpdates[row.id] = row.lexicon_data;
          }

          setRegistry((prev: any) => {
            const newReg = { ...prev, ...cloudUpdates };
            localStorage.setItem("sanctuary_lexicon_registry", JSON.stringify(newReg));
            return newReg;
          });

          // Cache metadata like badges and names
          const meta = data.map(d => ({ id: d.id, name: d.name, badge: d.badge, version: d.version }));
          localStorage.setItem("sanctuary_lexicon_meta", JSON.stringify(meta));
          setLexiconMeta(meta);

          // If in local development, automatically sync cloud lexicons back to the source code files
          if (import.meta.env.DEV) {
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
  }, []);

  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}-\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{231A}\u{231B}\u{2328}\u{23CF}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{24C2}]/u;

  const t = (key: string) => {
    if (!key) return "";
    let val = dictionary[key];

    if (val === undefined || val === "") {
      val = (enSanctuary as any)[key];
    }
    if (val === undefined || val === "") {
      val = (enDefault as any)[key];
    }

    if (val !== undefined && val !== "") {
      if (emojiRegex.test(val) && (key.includes('icon') || key.startsWith('emote_'))) {
        return "";
      }
      return val;
    }
    if (key.includes('icon') || key.startsWith('emote_')) return "";
    return `[${key}]`;
  };

  const importLexicon = (json: any, langCode: string) => {
    const updated = { ...registry, [langCode]: json };
    setRegistry(updated);
    localStorage.setItem("sanctuary_lexicon_registry", JSON.stringify(updated));
    setActiveLang(langCode);

    (async () => {
      try {
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
    localStorage.setItem("sanctuary_lexicon_registry", JSON.stringify(remaining));
    if (activeLang === langCode) setActiveLang("en-sanctuary");

    (async () => {
      try {
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
    <LexiconContext.Provider value={{ t, activeLang, setActiveLang, importLexicon, deleteLexicon, registry, lexiconMeta }}>
      {children}
    </LexiconContext.Provider>
  );
};

export const useLexicon = () => useContext(LexiconContext);
