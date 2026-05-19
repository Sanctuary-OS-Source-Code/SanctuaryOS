import { createContext, useContext, useState, useEffect } from 'react';
import enSanctuary from './lexicons/en-sanctuary.json';
import enDefault from './lexicons/en-default.json';
import deDefault from './lexicons/de-default.json';

const LexiconContext = createContext<any>(null);

export const LexiconProvider = ({ children }: any) => {
  const [registry, setRegistry] = useState(() => JSON.parse(localStorage.getItem("sanctuary_lexicon_registry") || "{}"));
  const [activeLang, setActiveLang] = useState(() => localStorage.getItem("sanctuary_lang") || "en-sanctuary");
  const [dictionary, setDictionary] = useState<any>({});

  useEffect(() => {
    const loadLang = () => {
      if (registry[activeLang]) {
        setDictionary(registry[activeLang]);
      } else if (activeLang === 'en-default') {
        setDictionary(enDefault);
      } else if (activeLang === 'de-default') { // <-- Changed 'else' to 'else if'
        setDictionary(deDefault);
      } else { // <-- This is now your fallback default case
        setDictionary(enSanctuary);
      }
    };
    loadLang();
    localStorage.setItem("sanctuary_lang", activeLang);
  }, [activeLang, registry]);


  const t = (key: string) => dictionary[key] || `[${key}]`;

  const importLexicon = (json: any, langCode: string) => {
    const updated = { ...registry, [langCode]: json };
    setRegistry(updated);
    localStorage.setItem("sanctuary_lexicon_registry", JSON.stringify(updated));
    setActiveLang(langCode);
  };

  const deleteLexicon = (langCode: string) => {
    const { [langCode]: removed, ...remaining } = registry;
    setRegistry(remaining);
    localStorage.setItem("sanctuary_lexicon_registry", JSON.stringify(remaining));
    if (activeLang === langCode) setActiveLang("en-sanctuary");
  };

  return (
    <LexiconContext.Provider value={{ t, activeLang, setActiveLang, importLexicon, deleteLexicon, registry }}>
      {children}
    </LexiconContext.Provider>
  );
};

export const useLexicon = () => useContext(LexiconContext);