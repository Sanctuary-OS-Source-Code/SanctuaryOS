import React, { createContext, useContext } from 'react';
import { useDefconRadar } from './hooks/useDefconRadar';
import { useLexicon } from './LexiconContext';

const DefconContext = createContext<any>(null);

export const DefconProvider = ({ children, askCustom, triggerPrePatchSnapshot, triggerFullEngineBackup }: any) => {
  const { t } = useLexicon();
  const defconState = useDefconRadar(t, askCustom, triggerPrePatchSnapshot, triggerFullEngineBackup);

  return (
    <DefconContext.Provider value={defconState}>
      {children}
    </DefconContext.Provider>
  );
};

export const useDefcon = () => useContext(DefconContext);
