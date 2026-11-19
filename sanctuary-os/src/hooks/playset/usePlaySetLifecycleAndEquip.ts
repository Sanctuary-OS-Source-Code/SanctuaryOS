import { useStore } from "../../store";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isDesktop } from "../../utils/envUtils";
import {
  getExtensionRegex,
  deduplicateBlueprintArtifacts,
  stripPriorityTierPrefix,
} from "../../shared";
import { mergeImportedModWithClientPriority } from "../../utils/blueprintOverrideUtils";
import { checkAndPromptSymlinkCloudSyncConsent } from "../../utils/cloudSyncGuard";
import {
  translateExternalModlistToBlueprint,
  type DroppedJsonInspectionReport,
} from "../../utils/jsonAssetDropInstaller";
import type { CompiledLoadOrderItem } from "./types";
import { compileLoadOrder, unpackBlueprintLoadOrder } from "./loadOrderCompiler";
import { precomputeBlueprintConflicts } from "./conflictPrecomputer";

export function usePlaySetLifecycleAndEquip({
  playSets,
  setPlaySets,
  setActivePlaySetIndex,
  activeSetName,
  setActiveSetName,
  modList,
  activeGameSchema,
  setStatus,
  t,
  setPendingImportSet,
  setMissingImportMods,
  modMap,
  hashToMod,
  baseToMod,
}: any) {
  function deletePlaySet(setName: string) {
    const updatedSets = playSets.filter((s: any) => s.name !== setName);
    setPlaySets(updatedSets);

    if (activeSetName === setName) {
      setActiveSetName(null);
      localStorage.removeItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`);
    }
    setStatus(
      `${t("status_removed_manifest_prefix", "Removed: '")}${setName}${t("status_removed_manifest_suffix", "' {blueprint} was deleted.")}`,
    );
  }

  const renamePlaySet = (oldName: string, newName: string) => {
    let finalName = newName;
    let copyIndex = 1;
    while (playSets.some((s: any) => s.name.toLowerCase() === finalName.toLowerCase() && s.name !== oldName)) {
      finalName = `${newName} (${copyIndex})`;
      copyIndex++;
    }

    setPlaySets((prev: any[]) => {
      const copy = [...prev];
      const target = copy.find(s => s.name === oldName);
      if (target) {
        target.name = finalName;
      }

      return copy;
    });
    if (activeSetName === oldName) {
      setActiveSetName(finalName);
      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`, finalName);
    }
  };

  async function importPlaySet() {
    try {
      const selected = await open({
        filters: [
          {
            name: "Blueprints & Modlists",
            extensions: ["json", "mrpack", "wabbajack", "zip"],
          },
        ],
      });
      if (!selected) return;
      const selectedPath = String(selected);
      const lowerSelected = selectedPath.toLowerCase();
      let parsed: any = null;

      if (
        lowerSelected.endsWith(".mrpack") ||
        lowerSelected.endsWith(".wabbajack") ||
        lowerSelected.endsWith(".zip")
      ) {
        const report = await invoke<DroppedJsonInspectionReport>("inspect_dropped_json_bundles", {
          paths: [selectedPath],
        });
        for (const jf of report.json_files || []) {
          try {
            const candidate = JSON.parse(jf.json_text);
            parsed = translateExternalModlistToBlueprint(jf.file_name, candidate) || candidate;
            if (parsed?.sanctuary_profile) break;
          } catch { }
        }
        if (!parsed?.sanctuary_profile) {
          for (const zb of report.zip_bundles || []) {
            for (const entry of zb.json_entries || []) {
              try {
                const candidate = JSON.parse(entry.json_text);
                parsed =
                  translateExternalModlistToBlueprint(entry.entry_name, candidate) ||
                  candidate;
                if (parsed?.sanctuary_profile) break;
              } catch { }
            }
            if (parsed?.sanctuary_profile) break;
          }
        }
      } else {
        const content = await invoke<string>("read_blueprint", {
          path: selectedPath,
        });
        const rawParsed = JSON.parse(content);
        parsed = translateExternalModlistToBlueprint(selectedPath, rawParsed) || rawParsed;
      }

      if (!parsed || !parsed.sanctuary_profile) {
        const invalidMsg = t("status_invalid_profile", "Invalid Profile format.");
        setStatus(invalidMsg);
        useStore.getState().pushStatus?.(invalidMsg, "error");
        return;
      }
      const missing: any[] = [];
      const rawAvailableMods: string[] = [];
      const nextModHashes: Record<string, string> = {};
      const nextModMeta: Record<string, any> = {};
      const lockArtifacts: any[] = Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
      const lockArtByHash = new Map<string, any>();
      const lockArtByName = new Map<string, any>();
      for (const art of lockArtifacts) {
        if (art?.sha256) lockArtByHash.set(String(art.sha256).toLowerCase(), art);
        if (art?.name) lockArtByName.set(String(art.name).toLowerCase(), art);
      }
      const nextHiddenFiles: Record<string, string[]> = {};
      const nameRemap = new Map<string, string>();
      const extRegex = getExtensionRegex(activeGameSchema);
      let localOverrides: Record<string, any> = {};
      let edgeLogic: Record<string, any> = {};
      let localOverridesDirty = false;
      try {
        localOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
      } catch { }
      try {
        edgeLogic = JSON.parse(localStorage.getItem("sanctuary_edge_logic") || "{}");
      } catch { }

      (parsed.mods || []).forEach((importedMod: any) => {
        let found = null;
        const rawNameToCheck = typeof importedMod === 'string' ? importedMod : (importedMod.name || importedMod.path || '');
        const cleanImportedFile = rawNameToCheck.split(/[\\/]/).pop() || rawNameToCheck;
        const rawHash = typeof importedMod !== "string" ? importedMod?.hash || importedMod?.sha256 : "";
        const lockArt =
          (rawHash ? lockArtByHash.get(String(rawHash).toLowerCase()) : undefined) ||
          (rawNameToCheck ? lockArtByName.get(String(rawNameToCheck).toLowerCase()) : undefined);

        if (importedMod && typeof importedMod !== 'string' && importedMod.hash) {
          found = hashToMod.get(importedMod.hash);
        }
        if (!found) {
          found = modMap.get(rawNameToCheck) || modMap.get(cleanImportedFile);
          if (!found) {
            const targetBase = cleanImportedFile.replace(extRegex, '');
            if (targetBase) found = baseToMod.get(targetBase);
          }
        }

        if (importedMod && typeof importedMod !== 'string') {
          const targetHash = importedMod.hash || lockArt?.sha256 || found?.hash;
          const metaKey = found ? found.name : rawNameToCheck;
          const merged = mergeImportedModWithClientPriority({
            importedMod,
            targetHash,
            localOverrides,
            edgeLogic,
            existingPlaysetMeta: metaKey ? nextModMeta[metaKey] : undefined,
          });
          if (metaKey && Object.keys(merged.resolvedModMeta).length > 0) {
            nextModMeta[metaKey] = merged.resolvedModMeta;
          }
          if (targetHash && merged.shouldWriteLocalOverride && merged.nextOverrideEntry) {
            localOverrides[targetHash] = merged.nextOverrideEntry;
            localOverridesDirty = true;
          }
        }

        if (found) {
          const resolvedClean = found.name.split(/[\\/]/).pop() || found.name;
          if (cleanImportedFile) {
            nameRemap.set(cleanImportedFile.toLowerCase(), resolvedClean);
          }
          rawAvailableMods.push(found.name);
          if (found.hash) nextModHashes[found.name] = found.hash;
          else if (typeof importedMod !== 'string' && importedMod.hash) nextModHashes[found.name] = importedMod.hash;
          if (Array.isArray(lockArt?.hidden_files) && lockArt.hidden_files.length > 0) {
            const folderKey = String(found.name).replace(/\\/g, "/").split("/")[0] || found.name;
            nextHiddenFiles[folderKey] = lockArt.hidden_files;
          }
        }
        else {
          const baseMissing =
            typeof importedMod === "string" ? { name: importedMod } : { ...importedMod };
          if (lockArt) {
            baseMissing.hash = baseMissing.hash || lockArt.sha256;
            baseMissing.download_url = baseMissing.download_url || lockArt.download_url;
            baseMissing.manifest_url = baseMissing.manifest_url || lockArt.manifest_url;
            baseMissing.url = baseMissing.url || lockArt.url;
            baseMissing.author = baseMissing.author || lockArt.author;
            baseMissing.fomod_selections =
              baseMissing.fomod_selections || lockArt.fomod_selections;
            baseMissing.hidden_files = baseMissing.hidden_files || lockArt.hidden_files;
          }
          missing.push(baseMissing);
          if (typeof importedMod !== 'string') {
            if (importedMod.hash) nextModHashes[rawNameToCheck] = importedMod.hash;
          }
        }
      });

      if (localOverridesDirty) {
        try {
          localStorage.setItem("sanctuary_local_overrides", JSON.stringify(localOverrides));
        } catch { }
      }

      const { loadRules, modTiers, loadOrder, ignoredConflicts, formatModWithTier } = unpackBlueprintLoadOrder(
        parsed,
        nameRemap,
        activeGameSchema
      );
      const availableMods = deduplicateBlueprintArtifacts(
        rawAvailableMods.map((mName) => formatModWithTier(mName)),
        activeGameSchema
      );

      let baseName = `${parsed.name} (Imported)`;
      let newName = baseName;
      let counter = 1;
      while (
        playSets.some((s: any) => s.name.toLowerCase() === newName.toLowerCase())
      ) {
        newName = `${baseName} (${counter})`;
        counter++;
      }
      const configDeltas = Array.isArray(parsed.config_deltas) ? parsed.config_deltas : [];
      const readySet = {
        name: newName,
        mods: availableMods,
        modHashes: nextModHashes,
        modMeta: nextModMeta,
        loadRules,
        modTiers,
        loadOrder,
        ignoredConflicts,
        ignoredGhosts: [],
        ...(Object.keys(nextHiddenFiles).length > 0 ? { hiddenFiles: nextHiddenFiles } : {}),
        ...(lockArtifacts.length > 0 ? { artifacts: lockArtifacts } : {}),
        ...(configDeltas.length > 0 ? { configDeltas } : {}),
      };
      if (missing.length > 0) {
        setPendingImportSet(readySet);
        setMissingImportMods(missing);
        return "missing";
      } else {
        if (isDesktop() && configDeltas.length > 0) {
          void invoke("hydrate_blueprint_lockfile_batch", {
            items: [],
            configDeltas,
            concurrency: 1,
          }).catch(() => {});
        }
        finalizeImport(readySet);
        return "success";
      }
    } catch (err) {
      setStatus(`${t("icon_block", "block")} ${t("alert_import_failed", "Import Failed:")}${err}`);
      return "error";
    }
  }
  function finalizeImport(setToAdd: any) {
    if (!setToAdd) return;

    let finalName = setToAdd.name;
    let copyIndex = 1;
    while (playSets.some((s: any) => s.name.toLowerCase() === finalName.toLowerCase())) {
      finalName = `${setToAdd.name} (${copyIndex})`;
      copyIndex++;
    }
    setToAdd.name = finalName;

    const updatedSets = [...playSets, setToAdd];
    setPlaySets(updatedSets);

    setStatus(
      `${t("icon_check_circle", "check_circle")} ${t("status_profile_imported", "Profile Imported")}${setToAdd.name}`,
    );
    setMissingImportMods(null);
    setPendingImportSet(null);
  }

  async function equipPlaySet(
    setName: string | number,
    overrideSet?: any,
    skipCloudCheck = false,
    onAfterAuthorizedDeploy?: () => void
  ): Promise<boolean> {
    const latestPlaySets = useStore.getState().playSets || playSets;
    const targetSet =
      overrideSet ||
      (typeof setName === "number"
        ? latestPlaySets[setName]
        : latestPlaySets.find((s: any) => s.name === setName) ||
        playSets.find((s: any) => s.name === setName));
    if (!targetSet) return false;
    const resolvedSetName = targetSet.name || String(setName);
    setStatus(
      `${t("status_deploying_prefix", "DEPLOYING: {Blueprint} [")}${resolvedSetName}${t("status_deploying_suffix", "]...")}`,
    );
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      useStore.setState({ activeConflictCount: { total: 0, tier4: 0, tier3: 0 }, activeBrokenCounts: { broken: 0, unstable: 0 } });
      console.time("equipPlaySet_JS_overhead");
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

      targetSet.mods.forEach((rawMod: any) => {
        const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
        if (!modName) return;

        let modObj = modMap.get(modName);
        if (!modObj) {
          const targetBase = modName.split(/[\\/]/).pop()?.replace(extRegex, '');
          if (targetBase) modObj = modBaseMap.get(targetBase);
        }

        let parsedStructure = modObj?.folder_structure;
        if (typeof parsedStructure === 'string') {
          try { parsedStructure = JSON.parse(parsedStructure); } catch (e) { }
        }
        if (Array.isArray(parsedStructure) && parsedStructure.length > 0) {
          buildPathMap(parsedStructure, "");
        }
      });

      const preserveStructure = Boolean(
        activeGameSchema?.constraints?.preserve_archive_folder_structure
      );
      const sharedWithVanilla = Boolean(
        activeGameSchema?.constraints?.mods_dir_is_shared_with_vanilla
      );
      const loadStrategy = String(
        activeGameSchema?.load_order?.strategy || "manifest_list"
      ).toLowerCase();
      const deployedDirUnits = new Set<string>();
      const deployedDirUnitPrefixes = new Set<string>();

      targetSet.mods.forEach((rawMod: any) => {
        const modName = typeof rawMod === 'string' ? rawMod : String(rawMod?.name || rawMod?.path || '');
        if (!modName) return;

        const strippedModName = stripPriorityTierPrefix(modName, activeGameSchema);
        let modObj = modMap.get(modName) || modMap.get(strippedModName);
        if (!modObj) {
          const targetBase = strippedModName.split(/[\\/]/).pop()?.replace(extRegex, '');
          if (targetBase) modObj = modBaseMap.get(targetBase);
        }
        if (!modObj && modList.length > 0) return;

        const vaultSourcePath = modObj?.name || strippedModName;
        const flatFileName = vaultSourcePath.split(/[\\/]/).pop() || vaultSourcePath;
        let targetPath = flatFileName;

        const flatLower = flatFileName.toLowerCase();
        const noExt = flatFileName.replace(customExtRegex, "").toLowerCase();
        const norm = normalize(noExt);

        const folderPath = fileNameToPathMap.get(flatLower) ?? fileNameToPathMap.get(noExt) ?? fileNameToPathMap.get(norm);
        const firstSlashSeg = String(vaultSourcePath || modName || "").replace(/\\/g, "/").split("/")[0]?.toLowerCase() || "";
        const schemaTierMatch = (activeGameSchema?.load_order?.priority_tiers || []).find(
          (pt: any) => String(pt?.folder || "").toLowerCase() === firstSlashSeg
        );

        const vaultRelClean = stripPriorityTierPrefix(
          String(vaultSourcePath || "").replace(/\\/g, "/").replace(/^\/+/, ""),
          activeGameSchema
        );
        const vaultRelSegs = vaultRelClean.split("/").filter(Boolean);

        if (preserveStructure && vaultRelSegs.length > 1 && folderPath === undefined) {
          const rootModFolder = vaultRelSegs[0];
          const unitVaultPath = schemaTierMatch?.folder
            ? `${schemaTierMatch.folder}/${rootModFolder}`
            : rootModFolder;
          const unitKey = unitVaultPath.toLowerCase();
          if (!deployedDirUnits.has(unitKey)) {
            deployedDirUnits.add(unitKey);
            deployedDirUnitPrefixes.add(`${rootModFolder.toLowerCase()}/`);
            const unitTargetPath = sharedWithVanilla
              ? ""
              : (schemaTierMatch?.folder ? `${schemaTierMatch.folder}/${rootModFolder}` : rootModFolder);
            const hiddenMap = targetSet.hiddenFiles || {};
            const hiddenForUnit = Array.isArray(hiddenMap[rootModFolder])
              ? hiddenMap[rootModFolder]
              : Array.isArray(hiddenMap[rootModFolder.toLowerCase()])
                ? hiddenMap[rootModFolder.toLowerCase()]
                : Array.isArray(hiddenMap[unitVaultPath])
                  ? hiddenMap[unitVaultPath]
                  : [];
            deployPayload.push({
              path: unitVaultPath,
              allow_write: Boolean(modObj?.allow_write),
              target_path: unitTargetPath,
              is_dir_unit: true,
              hidden_files: hiddenForUnit,
            });
          }
          return;
        }

        if (folderPath !== undefined && folderPath !== null) {
          targetPath = folderPath ? `${folderPath}/${flatFileName}` : flatFileName;
        }

        if (schemaTierMatch?.folder && !targetPath.toLowerCase().startsWith(`${schemaTierMatch.folder.toLowerCase()}/`)) {
          targetPath = `${schemaTierMatch.folder}/${targetPath}`;
        }

        deployPayload.push({ path: vaultSourcePath, allow_write: modObj?.allow_write || false, target_path: targetPath });
      });

      const explicitlyDeployedFlatNames = new Set(
        deployPayload.map(dp => {
          const flat = dp.path.split(/[\\/]/).pop() || dp.path;
          return flat.toLowerCase();
        })
      );

      const deployPayloadPaths = new Set(deployPayload.map(dp => dp.path));

      modList.forEach((m: any) => {
        if (deployPayloadPaths.has(m.name)) return;
        const mClean = stripPriorityTierPrefix(String(m.name || "").replace(/\\/g, "/").replace(/^\/+/, ""), activeGameSchema).toLowerCase();
        for (const unitPrefix of deployedDirUnitPrefixes) {
          if (mClean.startsWith(unitPrefix)) return;
        }

        const flatFileName = m.name.split(/[\\/]/).pop() || m.name;
        const flatLower = flatFileName.toLowerCase();
        const noExt = flatFileName.replace(customExtRegex, "").toLowerCase();
        const norm = normalize(noExt);

        if (!explicitlyDeployedFlatNames.has(flatLower)) {
          const folderPath = fileNameToPathMap.get(flatLower) ?? fileNameToPathMap.get(noExt) ?? fileNameToPathMap.get(norm);
          if (folderPath !== undefined && folderPath !== null) {
            let targetPath = folderPath ? `${folderPath}/${flatFileName}` : flatFileName;
            const firstSegM = String(m.name || "").replace(/\\/g, "/").split("/")[0]?.toLowerCase() || "";
            const tierM = (activeGameSchema?.load_order?.priority_tiers || []).find(
              (pt: any) => String(pt?.folder || "").toLowerCase() === firstSegM
            );
            if (tierM?.folder && !targetPath.toLowerCase().startsWith(`${tierM.folder.toLowerCase()}/`)) {
              targetPath = `${tierM.folder}/${targetPath}`;
            }
            deployPayload.push({ path: m.name, allow_write: true, target_path: targetPath });
            explicitlyDeployedFlatNames.add(flatLower);
            deployPayloadPaths.add(m.name);
          }
        }
      });

      const potentialPrefixMap = new Map<string, any>();
      deployPayload.forEach(dp => {
        if ((dp.target_path || dp.folder_structure) && !dp.target_path?.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
          const flatFileName = dp.path.split(/[\\/]/).pop() || dp.path;
          const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
          const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();
          if (!potentialPrefixMap.has(prefix)) {
            potentialPrefixMap.set(prefix, dp);
          }
        }
      });

      modList.forEach((m: any) => {
        if (m.name.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
          if (!deployPayloadPaths.has(m.name)) {
            const flatFileName = m.name.split(/[\\/]/).pop() || m.name;
            const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
            const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();

            const matchingMod = potentialPrefixMap.get(prefix);

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
              deployPayloadPaths.add(m.name);
            }
          }
        }
      });

      deployPayload.forEach(dp => {
        if (dp.target_path && dp.target_path.match(/\.(cfg|ini|json|xml|log|txt)$/i)) {
          const flatFileName = dp.path.split(/[\\/]/).pop() || dp.path;
          const prefixMatch = flatFileName.match(/^([a-zA-Z0-9]+)[_ -]/);
          const prefix = prefixMatch ? prefixMatch[1].toLowerCase() : flatFileName.split('.')[0].toLowerCase();

          const matchingMod = potentialPrefixMap.get(prefix);

          if (matchingMod && matchingMod !== dp) {
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

      const compiledOrder = compileLoadOrder(
        targetSet.mods || [],
        targetSet.loadRules || [],
        targetSet.modTiers || {},
        targetSet.loadOrder || [],
        activeGameSchema,
        modList
      );
      const compiledByClean = new Map<string, CompiledLoadOrderItem>();
      compiledOrder.items.forEach((item) => {
        compiledByClean.set(item.cleanName.toLowerCase(), item);
      });
      const knownTierFoldersLower = new Set(
        compiledOrder.priorityTiers.map((pt) => (pt.folder || "").toLowerCase()).filter(Boolean)
      );

      deployPayload.forEach((dp) => {
        const flatFileName = dp.path.split(/[\\/]/).pop() || dp.path;
        let compiled = compiledByClean.get(flatFileName.toLowerCase());
        if (!compiled && dp.is_dir_unit) {
          const unitPrefix = `${flatFileName.toLowerCase()}/`;
          compiled = compiledOrder.items.find((item) =>
            item.cleanName.toLowerCase().startsWith(unitPrefix)
          );
        }
        if (compiled) {
          dp.load_order_index = compiled.index;
          if (compiled.tierFolder) {
            dp.priority_tier = compiled.tierFolder;
            const currentTarget = String(dp.target_path ?? flatFileName).replace(/\\/g, "/");
            if (currentTarget === "" && sharedWithVanilla && loadStrategy !== "folder_priority") {
              dp.target_path = "";
            } else {
              const segs = currentTarget.split("/").filter(Boolean);
              if (segs.length > 1 && knownTierFoldersLower.has(segs[0].toLowerCase())) {
                segs[0] = compiled.tierFolder;
                dp.target_path = segs.join("/");
              } else {
                dp.target_path = segs.length > 0 ? `${compiled.tierFolder}/${segs.join("/")}` : compiled.tierFolder;
              }
            }
          }
        }
      });

      deployPayload.sort((a, b) => (a.load_order_index ?? 999999) - (b.load_order_index ?? 999999));

      console.timeEnd("equipPlaySet_JS_overhead");
      if (!skipCloudCheck) {
        const allowed = await checkAndPromptSymlinkCloudSyncConsent({
          modsPath: config.mods_path,
          vaultPath: config.vault_path,
          docsPath: config.docs_path,
          livePath: config.live_path,
          actionLabel: `${t("btn_equip", "Deploy {Blueprint}")}: ${resolvedSetName || targetSet.name}`,
          onAuthorizedProceed: () => {
            void equipPlaySet(setName, overrideSet, true).then((ok) => {
              if (ok && onAfterAuthorizedDeploy) onAfterAuthorizedDeploy();
            });
          },
        });
        if (!allowed) {
          setStatus(
            t(
              "cloud_guard_pending_action_canceled",
              "Cloud-sync folder consent required before projecting symlinks."
            )
          );
          return false;
        }
      }
      const msg = await invoke("deploy_playset_bulk", {
        mods: deployPayload,
        modsPath: config.mods_path,
        vaultPath: config.vault_path,
        profileId: resolvedSetName,
      });
      setActiveSetName(resolvedSetName);
      localStorage.setItem(`sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`, resolvedSetName);

      const currentSets = useStore.getState().playSets || playSets;
      const newIndex = currentSets.findIndex((s: any) => s.name === resolvedSetName);
      if (newIndex !== -1 && setActivePlaySetIndex) {
        setActivePlaySetIndex(newIndex);
      }
      setStatus(`${t("icon_check_circle", "check_circle")} ${t("btn_deployed", "DEPLOYED")} ${msg as string} ${t("backend_deployed_suffix", "{mods}.")} `);
      precomputeBlueprintConflicts(resolvedSetName, targetSet.mods, config.vault_path).catch(() => { });
      return true;
    } catch (err) {
      const errStr = typeof err === "string" ? err : (err as any)?.message || String(err);
      setStatus(`${t("status_deploy_failed", "Deployment Failed:")} ${t(errStr, errStr)}`);
      return false;
    }
  }

  return {
    deletePlaySet,
    renamePlaySet,
    importPlaySet,
    finalizeImport,
    equipPlaySet,
  };
}
