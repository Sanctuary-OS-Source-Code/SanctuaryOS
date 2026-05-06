import { useState } from "react";

interface AnarchyRules {
  highlander: boolean;
  family: boolean;
  dependencies: boolean;
  intercept: boolean;
}

export function useSolderLab(modList: any[], playSets: any[], setPlaySets: any, activePlaySetIndex: number, anarchyRules: AnarchyRules) {
  const toggleInActiveSet = (targetName: string) => {
    setPlaySets((prevSets: any) => {
      const currentSet = prevSets[activePlaySetIndex];
      if (!currentSet) return prevSets;
      const currentRules = anarchyRules || { highlander: true, family: true, dependencies: true, intercept: true };
      let newMods = new Set<string>(currentSet.mods);
      const targetMod = modList.find(m => m.name === targetName);
      if (!targetMod) return prevSets;
      
      const kids = targetMod.isVirtual 
          ? modList.filter(m => (String(m.familyId) === String(targetMod.dbId) || String(m.setId) === String(targetMod.dbId)) && !m.isVirtual)
          : [];
          
      const isActuallyFlavorFolder = targetMod.isVirtual && kids.some(k => k.flavorGroupId != null);
      let isEquipping = targetMod.isVirtual 
          ? (isActuallyFlavorFolder ? !kids.some(k => newMods.has(k.name)) : !kids.every(k => newMods.has(k.name))) 
          : !newMods.has(targetName);

      const deepDelete = (nameToDelete: string) => {
          if (!newMods.has(nameToDelete)) return;
          newMods.delete(nameToDelete);
          if (currentRules.dependencies !== false) {
            const mData = modList.find(m => m.name === nameToDelete);
            if (mData?.dbId) {
                modList.filter(m => m.requirements?.some((r: any) => String(r) === String(mData.dbId)) && newMods.has(m.name))
                       .forEach(dep => deepDelete(dep.name));
            }
          }
      };

      const addWithFamily = (modObj: any) => {
          if (!modObj || !modObj.name) return;
          if (modObj.flavorGroupId && currentRules.highlander !== false) {
              modList.filter(m => String(m.flavorGroupId) === String(modObj.flavorGroupId) && m.name !== modObj.name)
                     .forEach(rival => deepDelete(rival.name));
          }
          newMods.add(modObj.name);
          const anchor = modObj.familyId || modObj.dbId;
          if (anchor && currentRules.family !== false) {
              modList.forEach(m => {
                  if ((String(m.familyId) === String(anchor) || String(m.dbId) === String(anchor)) && m.name && !m.isVirtual) {
                      const isRival = m.flavorGroupId && String(m.flavorGroupId) === String(modObj.flavorGroupId) && m.name !== modObj.name;
                      if (!isRival && (m.relationshipType === 'twin' || m.relationshipType === 'beta' || !m.relationshipType)) {
                          newMods.add(m.name);
                      }
                  }
              });
          }
      };

      if (isEquipping) {
          if (targetMod.isVirtual) {
              if (isActuallyFlavorFolder) {
                  const coreFiles = kids.filter(k => k.flavorGroupId == null);
                  const flavorFiles = kids.filter(k => k.flavorGroupId != null);
                  coreFiles.forEach(k => addWithFamily(k));
                  const groups = new Map<string, any[]>();
                  flavorFiles.forEach(f => {
                      const gid = String(f.flavorGroupId);
                      if (!groups.has(gid)) groups.set(gid, []);
                      groups.get(gid)!.push(f);
                  });
                  groups.forEach(groupKids => {
                      if (!groupKids.some(f => newMods.has(f.name)) && groupKids.length > 0) {
                          addWithFamily(groupKids[0]);
                      }
                  });
              } else {
                  kids.forEach(k => addWithFamily(k));
              }
          } else {
              addWithFamily(targetMod);
          }
          if (currentRules.dependencies !== false) {
            let checkAgain = true;
            while (checkAgain) {
                checkAgain = false;
                const snapshot = Array.from(newMods);
                for (const name of snapshot) {
                    if (!newMods.has(name)) continue; 
                    const mData = modList.find(m => m.name === name);
                    if (mData?.requirements) {
                        for (const reqId of mData.requirements) {
                            const alreadySatisfied = Array.from(newMods).some(n => {
                                const equipped = modList.find(m => m.name === n);
                                return equipped && String(equipped.dbId) === String(reqId);
                            });
                            if (!alreadySatisfied) {
                                const provider = modList.find(m => String(m.dbId) === String(reqId) && !m.isVirtual);
                                if (provider) {
                                    addWithFamily(provider);
                                    checkAgain = true;
                                }
                            }
                        }
                    }
                }
            }
          }
      } else {
          const familyAnchor = targetMod.familyId || targetMod.dbId;
          const isMaster = targetMod.dbId && String(targetMod.dbId) === String(familyAnchor);
          if (targetMod.isVirtual || (currentRules.family !== false && (isMaster || targetMod.relationshipType === 'twin' || targetMod.relationshipType === 'beta'))) {
              modList.filter(m => (String(m.familyId) === String(familyAnchor) || String(m.dbId) === String(familyAnchor) || String(m.setId) === String(targetMod.dbId)) && m.name && !m.isVirtual)
                     .forEach(m => deepDelete(m.name));
          } else {
              deepDelete(targetName);
          }
      }
      
      const updatedSets = [...prevSets];
      updatedSets[activePlaySetIndex] = { ...currentSet, mods: Array.from(newMods) };
      return updatedSets;
    });
  };

  return { toggleInActiveSet };
}
