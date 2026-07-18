import { useStore } from "../store";
import { useModalStore } from "../store/modalStore";
import { useLexicon } from "../LexiconContext";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { getExtensionRegex } from "../shared";

export function usePlaySetLogic() {
  const { playSets, setPlaySets, activePlaySetIndex, setActivePlaySetIndex, activeSetName, setActiveSetName, anarchyRules, modList, activeGameSchema, setStatus, ownedDLC, maskedDLC, } = useStore();
  const { t } = useLexicon();
  const { setPendingImportSet, setMissingImportMods } = useModalStore();



  const toggleInActiveSet = (targetName: string, excludeBroken: boolean = true, forceRemove: boolean = false, forceActive: boolean = false) => {
    setPlaySets((prevSets) => {
      const currentSet = prevSets[activePlaySetIndex];
      if (!currentSet) return prevSets;
      const currentRules = anarchyRules || {
        highlander: true,
        family: true,
        dependencies: true,
        intercept: true,
      };
      let newMods = new Set(currentSet.mods);

      const byDbId = new Map();
      const byHash = new Map();
      const byName = new Map();
      const namesAndDisplayNames: { name: string, displayNameUpper: string, displayNameSpaced: string, orig: any }[] = [];

      modList.forEach((ml: any) => {
         byName.set(ml.name, ml);
         if (!ml.isVirtual) {
            if (ml.dbId) byDbId.set(String(ml.dbId), ml);
            if (ml.hash) byHash.set(ml.hash, ml);
            const dn = ml.displayName || "";
            namesAndDisplayNames.push({
               name: ml.name || "",
               displayNameUpper: dn.toUpperCase(),
               displayNameSpaced: dn.toUpperCase().replace(/_/g, " "),
               orig: ml
            });
         }
      });
      
      const checkGhosted = (mObj: any) => {
        if (mObj.isGhosted) return true;
        let rDLC = mObj.requiredDLC || [];
        if (typeof rDLC === 'string') rDLC = rDLC.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (rDLC.some((dlc: string) => {
           const baseCode = dlc.split(' ')[0].toUpperCase();
           return !ownedDLC.includes(baseCode) || maskedDLC.includes(baseCode);
        })) return true;
        if (mObj.requirements) {
           const hasMissing = mObj.requirements.some((req: any) => {
               const reqId = typeof req === 'string' ? req : req.id || req.dbId;
               const reqName = typeof req === 'string' ? req : req.name;
               const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase();
               const isReqNumeric = !isNaN(Number(reqName));
               let match = null;
               if (reqId) {
                   match = byDbId.get(String(reqId)) || byHash.get(reqId);
                   if (!match) match = modList.find(m => m.interchangeableIds?.includes(String(reqId)));
               }
               if (!match && !isReqNumeric && reqBaseName) {
                   match = namesAndDisplayNames.find(n => n.displayNameUpper.includes(reqBaseName) || n.displayNameSpaced.includes(reqBaseName.replace(/_/g, " ")))?.orig;
               }
               return !match;
           });
           if (hasMissing) return true;
        }
        if (mObj.conflicts) {
           const hasFatal = mObj.conflicts.some((c: any) => {
              if (c.severity_rank === 4 && currentRules.intercept !== false) {
                 const matchStr = Array.from(newMods as Set<string>).find((n: string) => {
                    const mData = byName.get(n);
                    if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                    if (c.enemy_name) {
                       const targetClean = c.enemy_name.toUpperCase();
                       const cleanN = n.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase();
                       if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) return true;
                    }
                    return false;
                 });
                 return !!matchStr;
              }
              return false;
           });
           if (hasFatal) return true;
        }
        return false;
      };

      const targetMod = byName.get(targetName) || modList.find((m: any) => m.name === targetName);
      if (!targetMod) {
         if (forceRemove && newMods.has(targetName)) {
            newMods.delete(targetName);
            const updatedSets = [...prevSets];
            updatedSets[activePlaySetIndex] = { ...currentSet, mods: Array.from(newMods) };
            localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
            window.dispatchEvent(new Event("storage"));
            return updatedSets;
         }
         return prevSets;
      }
      const kids = targetMod.isVirtual
        ? modList.filter(
            (m) =>
              (String(m.familyId) === String(targetMod.dbId) ||
                String(m.setId) === String(targetMod.dbId)) &&
              !m.isVirtual
          )
        : [];
      const isActuallyFlavorFolder =
        targetMod.isVirtual && kids.some((k) => k.flavorGroupId != null);
      let isEquipping = targetMod.isVirtual
        ? !kids.some((k) => newMods.has(k.name))
        : !newMods.has(targetName);
      if (forceRemove) isEquipping = false;
      if (forceActive) isEquipping = true;
      const deepDelete = (nameToDelete: string) => {
        if (!newMods.has(nameToDelete)) return;
        newMods.delete(nameToDelete);
        if (currentRules.dependencies !== false) {
          const mData = byName.get(nameToDelete);
          if (mData) {
            Array.from(newMods as Set<string>).forEach((depName: string) => {
               const dep = byName.get(depName);
               if (!dep || !dep.requirements) return;
               const dependsOnDeleted = dep.requirements.some((r: any) => {
                  const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                  const reqName = typeof r === 'string' ? r : r.name;
                  const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase();
                  const isReqNumeric = !isNaN(Number(reqName));
                  return (reqId && String(mData.dbId) === String(reqId)) ||
                         (reqId && mData.hash === reqId) ||
                         (!isReqNumeric && reqBaseName && mData.displayName && (mData.displayName.toUpperCase().includes(reqBaseName) || mData.displayName.toUpperCase().replace(/_/g, " ").includes(reqBaseName.replace(/_/g, " "))));
               });
               if (dependsOnDeleted) {
                  const isStillSatisfied = dep.requirements.every((r: any) => {
                      const reqId = typeof r === 'string' ? r : r.id || r.dbId;
                      const reqName = typeof r === 'string' ? r : r.name;
                      const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase();
                      const isReqNumeric = !isNaN(Number(reqName));
                      
                      return Array.from(newMods as Set<string>).some((n: string) => {
                         const equipped = byName.get(n);
                         return equipped && (
                           String(equipped.dbId) === String(reqId) ||
                           (reqId && equipped.interchangeableIds && equipped.interchangeableIds.includes(String(reqId))) ||
                           (!isReqNumeric && reqBaseName && equipped.displayName && equipped.displayName.toUpperCase().includes(reqBaseName))
                         );
                      });
                  });
                  if (!isStillSatisfied) deepDelete(depName);
               }
            });
          }
        }
      };
      const applyConflicts = (modObj: any) => {
        if (currentRules.highlander !== false) {
          Array.from(newMods as Set<string>).forEach((mName: string) => {
             const m = byName.get(mName);
             if (m && m.name !== modObj.name) {
                 const isFlavorRival = m.flavorGroupId && String(m.flavorGroupId) === String(modObj.flavorGroupId) && m.relationshipType !== "twin" && modObj.relationshipType !== "twin";
                 const isBetaRival = modObj.relationshipType !== 'beta' && m.relationshipType === 'beta' && (String(m.familyId) === String(modObj.familyId) || String(m.dbId) === String(modObj.familyId || modObj.dbId));
                 
                 if (isFlavorRival || isBetaRival) {
                     deepDelete(m.name);
                 }
             }
          });
        }
        if (modObj.conflicts && currentRules.intercept !== false) {
           modObj.conflicts.forEach((c: any) => {
              if (c.severity_rank === 4 && currentRules.intercept !== false) {
                 const matchStr = Array.from(newMods as Set<string>).find((n: string) => {
                    const mData = byName.get(n);
                    if (c.enemy_id && String(mData?.dbId) === String(c.enemy_id)) return true;
                    if (c.enemy_name) {
                       const targetClean = c.enemy_name.toUpperCase();
                       const cleanN = n.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase();
                       if (cleanN === targetClean || mData?.displayName?.toUpperCase() === targetClean) return true;
                    }
                    return false;
                 });
                 if (matchStr) {
                    deepDelete(matchStr);
                 }
              }
           });
        }
      };
      
      const addWithFamily = (modObj: any) => {
        if (!modObj || !modObj.name) return;
        if (excludeBroken && (modObj.status === t("status_broken") || modObj.status?.includes("BROKEN") || checkGhosted(modObj))) {
          setStatus(t("critical_action"));
          return;
        }
        
        newMods.add(modObj.name);
        applyConflicts(modObj);
        const anchor = modObj.familyId || modObj.dbId;
        if (anchor && currentRules.family !== false) {
          modList.forEach((m) => {
            if (
              (String(m.familyId) === String(anchor) ||
                String(m.dbId) === String(anchor)) &&
              m.name &&
              !m.isVirtual
            ) {
              const objV = modObj.version;
              const mV = m.version;
              const sharesVersion = !objV || !mV || objV === "v.Local" || mV === "v.Local" || objV === mV;
              if (!sharesVersion) return;

              const isRival =
                m.flavorGroupId &&
                String(m.flavorGroupId) === String(modObj.flavorGroupId) &&
                m.name !== modObj.name;
              if (
                !isRival &&
                (m.relationshipType === "twin" ||
                  m.relationshipType === "beta" ||
                  m.relationshipType === "core" ||
                  !m.relationshipType)
              ) {
                if (!(excludeBroken && (m.status === t("status_broken") || m.status?.includes("BROKEN") || checkGhosted(m)))) {
                  applyConflicts(m);
                  newMods.add(m.name);
                }
              }
            }
          });
        }
      };
      if (isEquipping) {
        if (targetMod.isVirtual) {
          let validKids = kids;
          if (excludeBroken) {
            validKids = kids.filter((k) => {
              if (k.status === t("status_broken") || k.status?.includes("BROKEN") || checkGhosted(k)) {
                return false;
              }
              return true;
            });
          }
          if (isActuallyFlavorFolder) {
            const coreFiles = validKids.filter((k) => k.flavorGroupId == null);
            const flavorFiles = validKids.filter((k) => k.flavorGroupId != null);
            coreFiles.forEach((k) => addWithFamily(k));
            const groups = new Map<string, any[]>();
            flavorFiles.forEach((f) => {
              const gid = String(f.flavorGroupId);
              if (!groups.has(gid)) groups.set(gid, []);
              groups.get(gid)!.push(f);
            });
            groups.forEach((groupKids) => {
              if (
                !groupKids.some((f) => newMods.has(f.name)) &&
                groupKids.length > 0
              ) {
                const sortedKids = [...groupKids].sort((a: any, b: any) => {
                  const getRank = (m: any) => {
                    if (m.relationshipType === 'core') return 1;
                    if (m.relationshipType === 'twin') return 2;
                    if (m.relationshipType === 'beta') return 3;
                    if (!m.relationshipType) return 4;
                    return 5;
                  };
                  return getRank(a) - getRank(b);
                });
                addWithFamily(sortedKids[0]);
              }
            });
          } else {
            validKids.forEach((k) => addWithFamily(k));
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
              const mData = byName.get(name as string);
              if (mData?.requirements) {
                for (const req of mData.requirements) {
                  const reqId = typeof req === 'string' ? req : req.id || req.dbId;
                  const reqName = typeof req === 'string' ? req : req.name;
                  const reqBaseName = reqName?.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "").toUpperCase();
                  const isReqNumeric = !isNaN(Number(reqName));
                  
                  const alreadySatisfied = Array.from(newMods as Set<string>).some((n: string) => {
                    const equipped = byName.get(n);
                    return equipped && (
                      String(equipped.dbId) === String(reqId) ||
                      (reqId && equipped.interchangeableIds && equipped.interchangeableIds.includes(String(reqId))) ||
                      (!isReqNumeric && reqBaseName && equipped.displayName && equipped.displayName.toUpperCase().includes(reqBaseName))
                    );
                  });
                  if (!alreadySatisfied) {
                    let provider = null;
                    if (reqId) {
                        provider = byDbId.get(String(reqId)) || byHash.get(reqId);
                        if (!provider) provider = modList.find((m: any) => m.interchangeableIds?.includes(String(reqId)));
                    }
                    if (!provider && !isReqNumeric && reqBaseName) {
                        provider = namesAndDisplayNames.find(n => n.displayNameUpper.includes(reqBaseName))?.orig;
                    }
                    if (provider) {
                      const beforeSize = newMods.size;
                      addWithFamily(provider);
                      if (newMods.size > beforeSize) {
                        checkAgain = true;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } else {
        const familyAnchor = targetMod.familyId || targetMod.dbId;
        const isMaster =
          targetMod.dbId && String(targetMod.dbId) === String(familyAnchor);
        if (
          targetMod.isVirtual ||
          (currentRules.family !== false &&
            (isMaster ||
              targetMod.relationshipType === "core"))
        ) {
          modList
            .filter(
              (m) =>
                (String(m.familyId) === String(familyAnchor) ||
                  String(m.dbId) === String(familyAnchor) ||
                  String(m.setId) === String(targetMod.dbId)) &&
                m.name &&
                !m.isVirtual,
            )
            .forEach((m) => deepDelete(m.name));
        } else {
          deepDelete(targetName);
        }
      }
      const updatedSets = [...prevSets];
      updatedSets[activePlaySetIndex] = {
        ...currentSet,
        mods: Array.from(newMods),
      };
      localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
      window.dispatchEvent(new Event("storage"));
      return updatedSets;
    });
  };
  function deletePlaySet(setName: string) {
    const updatedSets = playSets.filter((s) => s.name !== setName);
    setPlaySets(updatedSets);
    localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
    if (activeSetName === setName) {
      setActiveSetName(null);
      localStorage.removeItem("sanctuary_active_set");
    }
    setStatus(
      `${t("status_removed_manifest_prefix")}${setName}${t("status_removed_manifest_suffix")}`,
    );
  }

  const renamePlaySet = (oldName: string, newName: string) => {
    setPlaySets((prev: any[]) => {
      const copy = [...prev];
      const target = copy.find(s => s.name === oldName);
      if (target) {
        target.name = newName;
      }
      localStorage.setItem("sanctuary_playsets", JSON.stringify(copy));
      return copy;
    });
    if (activeSetName === oldName) {
      setActiveSetName(newName);
      localStorage.setItem("sanctuary_active_set", newName);
    }
  };

  async function importPlaySet() {
    try {
      const selected = await open({
        filters: [{ name: "Sanctuary Profile", extensions: ["json"] }],
      });
      if (!selected) return;
      const content = await invoke<string>("read_blueprint", {
        path: selected as string,
      });
      const parsed = JSON.parse(content);
      if (!parsed.sanctuary_profile) {
        alert(t("status_invalid_profile"));
        return;
      }
      const missing: any[] = [];
      const availableMods: string[] = [];
      
      const extRegex = getExtensionRegex(activeGameSchema);
      const modMap = new Map<string, any>();
      const hashToMod = new Map<string, any>();
      const baseToMod = new Map<string, any>();
      
      modList.forEach((m: any) => {
          modMap.set(m.name, m);
          if (m.hash) hashToMod.set(m.hash, m);
          const mBase = m.name.split(/[\\/]/).pop()?.replace(extRegex, '');
          if (mBase) baseToMod.set(mBase, m);
      });

      parsed.mods.forEach((importedMod: any) => {
          let found = null;
          if (importedMod.hash) {
              found = hashToMod.get(importedMod.hash);
          }
          if (!found) {
              const nameToCheck = typeof importedMod === 'string' ? importedMod : (importedMod.name || importedMod.path || '');
              found = modMap.get(nameToCheck);
              if (!found) {
                  const targetBase = nameToCheck.split(/[\\/]/).pop()?.replace(extRegex, '');
                  if (targetBase) found = baseToMod.get(targetBase);
              }
          }

          if (found) availableMods.push(found.name);
          else missing.push(importedMod);
      });
      let newName = parsed.name;
      let counter = 1;
      while(
        playSets.some((s) => s.name.toLowerCase() === newName.toLowerCase())
      ) {
        newName = `${parsed.name} (${counter})`;
        counter++;
      }
      const readySet = { name: newName, mods: availableMods };
      if (missing.length > 0) {
        setPendingImportSet(readySet);
        setMissingImportMods(missing);
        return "missing";
      } else {
        finalizeImport(readySet);
        return "success";
      }
    } catch (err) {
      setStatus(`${t("icon_block")} ${t("alert_import_failed")}${err}`);
      return "error";
    }
  }
  function finalizeImport(setToAdd: any) {
    if (!setToAdd) return;
    const updatedSets = [...playSets, setToAdd];
    setPlaySets(updatedSets);
    localStorage.setItem("sanctuary_playsets", JSON.stringify(updatedSets));
    setStatus(
      `${t("icon_check_circle")} ${t("status_profile_imported")}${setToAdd.name}`,
    );
    setMissingImportMods(null);
    setPendingImportSet(null);
  }

  async function equipPlaySet(setName: string) {
    const targetSet = playSets.find((s) => s.name === setName);
    if (!targetSet) return;
    setStatus(
      `${t("status_deploying_prefix")}${setName}${t("status_deploying_suffix")}`,
    );
    try {
      const config: any = await invoke("get_saved_coordinates");
        let deployPayload: any[] = [];
        const fileNameToPathMap = new Map<string, string>();
        const normalize = (s: string) => s.replace(/[^a-z0-9]/gi, "").toLowerCase();
        
        const customExtRegexStr = `\\.(${(activeGameSchema?.extensions?.supported || []).map((e: any) => e.replace('.', '')).join('|') || '[a-z0-9]+'}|cfg|ini|dat|tmbin|json|xml|log|txt)$`;
        const customExtRegex = new RegExp(customExtRegexStr, 'i');
        const extRegex = getExtensionRegex(activeGameSchema);

        const modMap = new Map<string, any>();
        const modBaseMap = new Map<string, any>();
        modList.forEach((m: any) => {
            modMap.set(m.name, m);
            const mBase = m.name.split(/[\\/]/).pop()?.replace(extRegex, '');
            if (mBase) modBaseMap.set(mBase, m);
        });
        
        const buildPathMap = (nodes: any[], currentPath: string) => {
            for (const node of nodes) {
                if (node.node_type === "folder" || node.type === "folder") {
                    const nextPath = currentPath ? `${currentPath}/${node.name}` : node.name;
                    if (node.children) buildPathMap(node.children, nextPath);
                } else if (node.node_type === "file" || node.type === "file") {
                    fileNameToPathMap.set(node.name.toLowerCase(), currentPath);
                    const noExt = node.name.replace(customExtRegex, "");
                    fileNameToPathMap.set(noExt.toLowerCase(), currentPath);
                    if (node.assignedModName) {
                        fileNameToPathMap.set(normalize(node.assignedModName), currentPath);
                    }
                }
            }
        };

        targetSet.mods.forEach((modName: string) => {
            let modObj = modMap.get(modName);
            if (!modObj) {
                const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
                if (targetBase) modObj = modBaseMap.get(targetBase);
            }
            
            let parsedStructure = modObj?.folder_structure;
            if (typeof parsedStructure === 'string') {
                 try { parsedStructure = JSON.parse(parsedStructure); } catch (e) {}
            }
            if (Array.isArray(parsedStructure) && parsedStructure.length > 0) {
                 buildPathMap(parsedStructure, "");
            }
        });

        targetSet.mods.forEach((modName: string) => {
            let modObj = modMap.get(modName);
            if (!modObj) {
                const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
                if (targetBase) modObj = modBaseMap.get(targetBase);
            }
            
            const flatFileName = modName.split(/[\\/]/).pop() || modName;
            let targetPath = flatFileName;
            
            const flatLower = flatFileName.toLowerCase();
            const noExt = flatFileName.replace(customExtRegex, "").toLowerCase();
            const norm = normalize(noExt);

            const folderPath = fileNameToPathMap.get(flatLower) ?? fileNameToPathMap.get(noExt) ?? fileNameToPathMap.get(norm);
            if (folderPath !== undefined && folderPath !== null) {
                targetPath = folderPath ? `${folderPath}/${flatFileName}` : flatFileName;
            }
            
            deployPayload.push({ path: modName, allow_write: modObj?.allow_write || false, target_path: targetPath });
        });

        // Pull in unequipped loose files if they are required by the folder structure
        const explicitlyDeployedFlatNames = new Set(
            deployPayload.map(dp => {
                const flat = dp.path.split(/[\\/]/).pop() || dp.path;
                return flat.toLowerCase();
            })
        );

        modList.forEach((m: any) => {
            if (deployPayload.some(dp => dp.path === m.name)) return;
            
            const flatFileName = m.name.split(/[\\/]/).pop() || m.name;
            const flatLower = flatFileName.toLowerCase();
            const noExt = flatFileName.replace(customExtRegex, "").toLowerCase();
            const norm = normalize(noExt);
            
            if (!explicitlyDeployedFlatNames.has(flatLower)) {
                const folderPath = fileNameToPathMap.get(flatLower) ?? fileNameToPathMap.get(noExt) ?? fileNameToPathMap.get(norm);
                if (folderPath !== undefined && folderPath !== null) {
                    const targetPath = folderPath ? `${folderPath}/${flatFileName}` : flatFileName;
                    deployPayload.push({ path: m.name, allow_write: true, target_path: targetPath });
                    explicitlyDeployedFlatNames.add(flatLower);
                }
            }
        });

        modList.forEach(m => {
            if (m.name.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
                if (!deployPayload.some(dp => dp.path === m.name)) {
                    const flatFileName = m.name.split(/[\\/]/).pop() || m.name;
                    const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
                    const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();
                    
                    const matchingMod = deployPayload.find(other => {
                        if (!other.target_path && !other.folder_structure) return false;
                        if (other.target_path && other.target_path.match(/\.(cfg|ini|json|xml|log|txt)$/i)) return false;
                        const otherFlat = other.path.split(/[\\/]/).pop() || other.path;
                        return otherFlat.toLowerCase().startsWith(prefix);
                    });

                    if (matchingMod) {
                        let folderName = "";
                        if (matchingMod.target_path && matchingMod.target_path.includes('/')) {
                            folderName = matchingMod.target_path.split('/')[0];
                        } else if (matchingMod.folder_structure && Array.isArray(matchingMod.folder_structure) && matchingMod.folder_structure.length > 0) {
                            folderName = matchingMod.folder_structure[0].name;
                        }
                        
                        if (folderName) {
                            deployPayload.push({ path: m.name, allow_write: true, target_path: `${folderName}/${flatFileName}` });
                        } else {
                            deployPayload.push({ path: m.name, allow_write: true, target_path: flatFileName });
                        }
                    }
                }
            }
        });

        deployPayload.forEach(dp => {
           if (dp.target_path && dp.target_path.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
               const flatFileName = dp.path.split(/[\\/]/).pop() || dp.path;
               const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
               const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();
               
               const matchingMod = deployPayload.find(other => {
                  if (other === dp || (!other.target_path && !other.folder_structure)) return false;
                  if (other.target_path && other.target_path.match(/\.(cfg|ini|json|xml|log|txt)$/i)) return false;
                  const otherFlat = other.path.split(/[\\/]/).pop() || other.path;
                  return otherFlat.toLowerCase().startsWith(prefix);
               });

               if (matchingMod) {
                   let folderName = "";
                   if (matchingMod.target_path && matchingMod.target_path.includes('/')) {
                       folderName = matchingMod.target_path.split('/')[0];
                   } else if (matchingMod.folder_structure && Array.isArray(matchingMod.folder_structure) && matchingMod.folder_structure.length > 0) {
                       folderName = matchingMod.folder_structure[0].name;
                   }
                   
                   if (folderName) {
                       dp.target_path = `${folderName}/${flatFileName}`;
                   }
               }
           }
        });

        const msg = await invoke("deploy_playset_bulk", {
        mods: deployPayload,
        modsPath: config.mods_path,
        vaultPath: config.vault_path,
      });
      setActiveSetName(setName);
      localStorage.setItem("sanctuary_active_set", setName);
      
      const newIndex = playSets.findIndex((s) => s.name === setName);
      if (newIndex !== -1 && setActivePlaySetIndex) {
        setActivePlaySetIndex(newIndex);
      }

      setStatus(`${t("icon_check_circle")} ${t("btn_deployed")} ${msg as string} ${t("backend_deployed_suffix")}`);
    } catch (err) {
      setStatus(`${t("status_deploy_failed")} ${typeof err === "string" ? t(err) : t((err as any)?.message || String(err))}`);
    }
  }

  return { toggleInActiveSet, deletePlaySet, renamePlaySet, importPlaySet, finalizeImport, equipPlaySet };
}
