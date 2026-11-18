import {
  isVersionMatch,
  parseStringArray,
  toHighlanderSlotSlug,
  formatHighlanderSlotLabel,
} from "../../shared";
import { normalizeComplianceHash } from "../../utils/complianceHashTiers";

export function buildRadarPhysicalMods({
  selectedVersion,
  t,
  currentOwnedDLC,
  currentMaskedDLC,
  localMods,
  restrictedHashTierMap,
  restrictedHashesSet,
  flavorGroupNames,
  flavorGroupSlugs,
  communityGroupNames,
  getDbMod,
  isCloudMetadataRestricted,
  parentNameMap,
  cloudMap,
  setRelMap,
  flavorMap,
  communityMap,
  dbVersionMap,
  parentRelMap,
  childRelMap,
  depsMap,
  edgeLogic,
  earlyLocalOvr,
  dirMap,
  bossVersionMap,
  localByHash,
  localByNormName,
  extRegex,
  normModKey,
}: any) {
      const physicalMods = localMods.map((mod: any) => {
        const rawModHash = String(mod.hash || "").trim();
        const normHash = normalizeComplianceHash(mod.hash);
        const rpcRestrictedTier = normHash ? restrictedHashTierMap.get(normHash) : undefined;
        const isHashRestricted = Boolean(
          (typeof rpcRestrictedTier === "number" && rpcRestrictedTier >= 1 && rpcRestrictedTier <= 4) ||
          (rawModHash && restrictedHashesSet.has(rawModHash)) ||
          (normHash && restrictedHashesSet.has(normHash))
        );
        const rawCloudMatch = isHashRestricted ? null : cloudMap.get(String(mod.hash));
        const rawDbMod = isHashRestricted ? null : getDbMod(rawCloudMatch);
        const rawExplicitTier = Number(rawDbMod?.compliance_tier ?? mod.compliance_tier ?? 0);
        const detectedComplianceTier =
          typeof rpcRestrictedTier === "number" && rpcRestrictedTier >= 1 && rpcRestrictedTier <= 5
            ? rpcRestrictedTier
            : rawDbMod
              ? Number(rawDbMod.compliance_tier ?? 0)
              : Number.isFinite(rawExplicitTier) && rawExplicitTier >= 0
                ? rawExplicitTier
                : 0;
        const isRestrictedCloud = isHashRestricted || isCloudMetadataRestricted(rawDbMod);
        const cloudMatch = isRestrictedCloud ? null : rawCloudMatch;
        const dbMod = isRestrictedCloud ? null : rawDbMod;
        const dbId = dbMod?.id ? String(dbMod.id) : null;
        const modEdgeLogic = mod.hash ? edgeLogic[String(mod.hash)] : null;
        const modLocalOvr = mod.hash ? earlyLocalOvr[String(mod.hash)] : null;

        const mySetRel = dbId ? setRelMap.get(dbId) : undefined;
        const myFlavor = isRestrictedCloud ? undefined : flavorMap.get(String(mod.hash));
        const myCommunityGroup = isRestrictedCloud ? undefined : communityMap.get(String(mod.hash));

        const myParentRels = dbId ? (parentRelMap.get(dbId) || []) : [];
        const myChildRels = dbId ? (childRelMap.get(dbId) || []) : [];

        const twinRel = myParentRels.find((r: any) => r.relationship_type === "twin");
        const betaRel = myParentRels.find((r: any) => r.relationship_type === "beta");
        const addonRel = myParentRels.find((r: any) => r.relationship_type === "addon");
        const flavorRel = myParentRels.find((r: any) => r.relationship_type === "flavor");
        const moduleRel = myParentRels.find((r: any) => r.relationship_type === "module");
        const setItemRel = myParentRels.find((r: any) => r.relationship_type === "set_item");

        const childTwinRel = myChildRels.find((r: any) => r.relationship_type === "twin");
        const childBetaRel = myChildRels.find((r: any) => r.relationship_type === "beta");

        const invisibleRivalIds = myChildRels
          .filter((r: any) => r.relationship_type === "rival")
          .map((r: any) => String(r.child_id));

        const myDeps = dbId ? (depsMap.get(dbId) || []).map((d: any) => ({
          id: String(d.parent_id),
          name: parentNameMap[String(d.parent_id)]?.name || String(d.parent_id),
          url: parentNameMap[String(d.parent_id)]?.url || null
        })) : [];

        // Merge Edge Network dependencies & addons
        const edgeDeps = [
          ...(Array.isArray(modEdgeLogic?.dependencies)
            ? modEdgeLogic.dependencies.map((d: any) => {
              const depRef =
                typeof d === "string"
                  ? d.trim()
                  : String(d?.hash || d?.id || d?.name || "").trim();
              const matchedLocal = depRef
                ? localByHash.get(depRef) || localByNormName.get(normModKey(depRef))
                : null;
              return {
                id: String(matchedLocal?.hash || depRef),
                hash: String(matchedLocal?.hash || depRef),
                name:
                  matchedLocal?.name?.split(/[\\/]/).pop() ||
                  (typeof d === "object" && (d?.name || d?.id)) ||
                  String(depRef),
                min_version: typeof d === "object" ? d.min_version : undefined,
                url:
                  (typeof d === "object" && (d?.url || d?.download_url)) ||
                  matchedLocal?.url ||
                  null,
              };
            })
            : []),
          ...(Array.isArray(modEdgeLogic?.addons)
            ? modEdgeLogic.addons.map((addonHash: string) => {
              const matchedLocal =
                localByHash.get(String(addonHash)) ||
                localByNormName.get(normModKey(String(addonHash)));
              return {
                id: String(matchedLocal?.hash || addonHash),
                hash: String(matchedLocal?.hash || addonHash),
                name: matchedLocal?.name?.split(/[\\/]/).pop() || String(addonHash),
                url: matchedLocal?.url || null,
              };
            })
            : []),
        ];

        const edgeTwins = Array.isArray(modEdgeLogic?.twins)
          ? modEdgeLogic.twins.map((twinHash: string) => {
            const matchedLocal =
              localByHash.get(String(twinHash)) ||
              localByNormName.get(normModKey(String(twinHash)));
            return {
              id: String(matchedLocal?.hash || twinHash),
              hash: String(matchedLocal?.hash || twinHash),
              name: matchedLocal?.name?.split(/[\\/]/).pop() || String(twinHash),
              url: null,
            };
          })
          : [];

        // Local Dossier takes top priority for requiredDLC
        let rawDLC = parseStringArray(
          modLocalOvr?.requiredDLC !== undefined
            ? modLocalOvr.requiredDLC
            : (dbMod?.requiredDLC || modEdgeLogic?.required_dlc || [])
        );
        if (modLocalOvr?.requiredDLC === undefined && !modLocalOvr?.is_user_dossier && Array.isArray(modEdgeLogic?.required_dlc) && modEdgeLogic.required_dlc.length > 0) {
          rawDLC = Array.from(new Set([...rawDLC, ...parseStringArray(modEdgeLogic.required_dlc)]));
        }
        rawDLC = rawDLC.filter((dlc: string) => {
          const code = dlc.split(' ')[0].toUpperCase().trim();
          return Boolean(code) && code !== "BASE";
        });
        const isDlcMissing = rawDLC.some(
          (dlc: string) => {
            const baseCode = dlc.split(' ')[0].toUpperCase().trim();
            return !currentOwnedDLC.includes(baseCode) || currentMaskedDLC.includes(baseCode);
          }
        );
        let myBossId = dbId;
        let myRelType = null;
        if (twinRel) {
          myBossId = String(twinRel.parent_id);
          myRelType = "twin";
        } else if (addonRel) {
          myBossId = String(addonRel.parent_id);
          myRelType = "addon";
        } else if (flavorRel) {
          myBossId = String(flavorRel.parent_id);
          myRelType = "flavor";
        } else if (moduleRel) {
          myBossId = String(moduleRel.parent_id);
          myRelType = "module";
        } else if (setItemRel) {
          myBossId = String(setItemRel.parent_id);
          myRelType = "set_item";
        } else if (betaRel) {
          myBossId = String(betaRel.parent_id);
          myRelType = "beta";
        } else if (childTwinRel) {
          myRelType = "twin";
        } else if (childBetaRel) {
          myRelType = "core";
        } else if (myCommunityGroup) {
          myBossId = String(myCommunityGroup.group_id);
        } else if (modEdgeLogic?.artifact_id) {
          myBossId = `edge_family_${modEdgeLogic.artifact_id}`;
          if (
            Array.isArray(modEdgeLogic?.flavors) &&
            modEdgeLogic.flavors.some(
              (fh: any) => String(fh || "").toLowerCase().trim() === String(mod.hash || "").toLowerCase().trim()
            )
          ) {
            myRelType = "flavor";
          }
          if (!parentNameMap[myBossId]) {
            parentNameMap[myBossId] = {
              name:
                modLocalOvr?.parentName ||
                modLocalOvr?.displayName ||
                modEdgeLogic.name ||
                modEdgeLogic.artifact_id,
              author:
                modLocalOvr?.author !== undefined
                  ? modLocalOvr.author
                  : (modEdgeLogic.author || "Unknown"),
              url:
                modLocalOvr?.url !== undefined
                  ? (modLocalOvr.url || null)
                  : (modEdgeLogic.download_url || modEdgeLogic.manifest_url || null),
            };
          }
        }

        const isFamilyRel2 = (rt: any) =>
          rt === "twin" ||
          rt === "addon" ||
          rt === "flavor" ||
          rt === "beta" ||
          rt === "set_item" ||
          rt === "module";
        const visitedBoss2 = new Set<string>(dbId ? [dbId] : []);
        if (myBossId) visitedBoss2.add(myBossId);
        let isTracingBoss2 = true;
        let safetyTraceCount2 = 0;

        while (isTracingBoss2 && myBossId && safetyTraceCount2 < 6) {
          const nextLevelRels = parentRelMap.get(myBossId) || [];
          const nextParentRel = nextLevelRels.find((r: any) => isFamilyRel2(r.relationship_type));
          const upperBossId = nextParentRel?.parent_id ? String(nextParentRel.parent_id) : null;

          if (upperBossId && upperBossId !== myBossId) {
            if (visitedBoss2.has(upperBossId)) {
              myBossId = Array.from(visitedBoss2).sort()[0];
              isTracingBoss2 = false;
            } else {
              visitedBoss2.add(upperBossId);
              myBossId = upperBossId;
              safetyTraceCount2++;
            }
          } else {
            isTracingBoss2 = false;
          }
        }

        const originalDir = mod.name.substring(0, Math.max(mod.name.lastIndexOf("\\"), mod.name.lastIndexOf("/")));
        let dirData = null;
        let currentDir = originalDir;

        while (currentDir && currentDir.length > 0) {
          const data = dirMap.get(currentDir);
          if (data) {
            dirData = data;
            break;
          }
          const lastSlash = Math.max(currentDir.lastIndexOf("\\"), currentDir.lastIndexOf("/"));
          if (lastSlash > 0) {
            currentDir = currentDir.substring(0, lastSlash);
          } else {
            break;
          }
        }

        const hasOwnTwins = myParentRels.some((r: any) => r.relationship_type === "twin") ||
          myChildRels.some((r: any) => r.relationship_type === "twin") ||
          edgeTwins.length > 0;

        if (!myBossId && !hasOwnTwins && dirData && dirData.bossId && !isRestrictedCloud) {
          myBossId = dirData.bossId;
        }

        let effectiveCloudMatch = cloudMatch;
        let effectiveDbMod = dbMod;

        if (!dbId && !isRestrictedCloud && dirData && myBossId === dirData.bossId && !isCloudMetadataRestricted(dirData.dbMod)) {
          effectiveCloudMatch = dirData.cloudMatch;
          effectiveDbMod = dirData.dbMod || dbMod;
        }

        let unifiedVersion = null;

        if (!unifiedVersion && myBossId && !isRestrictedCloud) {
          const isDirBossValid = dirData && (dirData.bossId === myBossId || myParentRels.some((r: any) => String(r.parent_id) === String(dirData.bossId)));
          if (isDirBossValid && dirData.cloudMatch?.version_label) {
            unifiedVersion = dirData.cloudMatch.version_label;
          } else if (!effectiveCloudMatch?.version_label) {
            unifiedVersion = bossVersionMap.get(myBossId);
          }
        }

        // Local Dossier takes priority if overwritten
        let finalVersion =
          modLocalOvr?.version !== undefined
            ? modLocalOvr.version
            : (unifiedVersion || effectiveCloudMatch?.version_label || modEdgeLogic?.version || "v.Local");

        const compVerRaw =
          modLocalOvr?.compatible_versions !== undefined
            ? modLocalOvr.compatible_versions
            : (effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions || (modEdgeLogic?.game_version ? [modEdgeLogic.game_version] : []));
        const compVerArray = Array.isArray(compVerRaw) ? compVerRaw : (typeof compVerRaw === 'string' ? compVerRaw.split(',').map((s: string) => s.trim()) : []);
        if (myBossId && myBossId !== dbId && myBossId !== `local_${mod.hash}`) {
          const myVersionsRaw = effectiveCloudMatch?.game_version || effectiveDbMod?.compatible_versions;
          if (myVersionsRaw) {
            const myVArr = typeof myVersionsRaw === 'string' ? myVersionsRaw.split(',').map((s: string) => s.trim()) : myVersionsRaw;
            const bossVArr = dbVersionMap.get(myBossId);
            if (bossVArr && myVArr.length > 0 && bossVArr.length > 0) {
              let hasOverlap = false;
              if (myVArr.some((v: string) => ['vlocal', 'any', 'all', ''].includes(v.toLowerCase())) ||
                bossVArr.some((v: string) => ['vlocal', 'any', 'all', ''].includes(v.toLowerCase()))) {
                hasOverlap = true;
              } else {
                hasOverlap = myVArr.some((mv: string) => isVersionMatch(bossVArr, mv)) || bossVArr.some((bv: string) => isVersionMatch(myVArr, bv));
              }
              if (!hasOverlap) {
                myBossId = dbId;
                myRelType = null;
              }
            }
          }
        }

        let isVersionMismatch = false;
        if (selectedVersion && compVerArray.length > 0) {
          isVersionMismatch = !isVersionMatch(compVerArray, selectedVersion);
        }

        const mergedRequirements = [
          ...myDeps,
          ...myParentRels.filter((r: any) => r.relationship_type === "addon").map((r: any) => ({
            id: String(r.parent_id),
            name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
            url: parentNameMap[String(r.parent_id)]?.url || null
          })),
          ...edgeDeps,
        ];

        const mergedTwins = [
          ...myParentRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
            id: String(r.parent_id),
            name: parentNameMap[String(r.parent_id)]?.name || String(r.parent_id),
            url: parentNameMap[String(r.parent_id)]?.url || null
          })),
          ...myChildRels.filter((r: any) => r.relationship_type === "twin").map((r: any) => ({
            id: String(r.child_id),
            name: parentNameMap[String(r.child_id)]?.name || String(r.child_id),
            url: parentNameMap[String(r.child_id)]?.url || null
          })),
          ...edgeTwins,
        ];

        const resolvedImageUrl = modLocalOvr?.image_url !== undefined
          ? modLocalOvr.image_url
          : (modLocalOvr?.imageUrl !== undefined ? modLocalOvr.imageUrl : effectiveDbMod?.image_url);

        const candidateStaticManifestUrl =
          modLocalOvr?.manifest_url !== undefined
            ? (String(modLocalOvr.manifest_url || "").trim() || undefined)
            : [
              modEdgeLogic?.manifest_url,
              mod.manifest_url,
              typeof rawDbMod?.url === "string" && /\.json(\?.*)?$/i.test(rawDbMod.url.trim())
                ? rawDbMod.url.trim()
                : undefined,
              typeof rawCloudMatch?.download_url === "string" && /\.json(\?.*)?$/i.test(rawCloudMatch.download_url.trim())
                ? rawCloudMatch.download_url.trim()
                : undefined,
            ].find((u) => typeof u === "string" && u.trim().length > 0);

        const edgeStatusNorm = String(modEdgeLogic?.status || "").toLowerCase().trim();
        const lowerModHash = String(mod.hash || "").toLowerCase().trim();
        const edgeCurrentHashes: string[] = Array.isArray(modEdgeLogic?.current_hashes)
          ? modEdgeLogic.current_hashes.map((h: any) => String(h).toLowerCase().trim())
          : [];
        const edgePrevHashes: string[] = Array.isArray(modEdgeLogic?.previous_hashes)
          ? modEdgeLogic.previous_hashes.map((h: any) => String(h).toLowerCase().trim())
          : [];
        const edgeLatestSha = String(modEdgeLogic?.sha256 || "").toLowerCase().trim();
        const isEdgeOutdated = Boolean(
          modEdgeLogic &&
          lowerModHash &&
          !edgeCurrentHashes.includes(lowerModHash) &&
          (edgePrevHashes.includes(lowerModHash) ||
            (edgeLatestSha && edgeLatestSha !== lowerModHash))
        );

        const resolvedHighlanderSlot = (() => {
          const ovrSlot =
            modLocalOvr?.highlander_group ??
            modLocalOvr?.exclusive_slot ??
            modLocalOvr?.highlanderSlotKey;
          const edgeSlot = modEdgeLogic?.highlander_group ?? modEdgeLogic?.exclusive_slot;
          const rawCandidate = ovrSlot || edgeSlot;
          if (rawCandidate) {
            if (typeof rawCandidate === "string") {
              const s = toHighlanderSlotSlug(rawCandidate);
              if (s) {
                return {
                  groupId: null,
                  key: s,
                  name: modLocalOvr?.highlanderSlotName || formatHighlanderSlotLabel(rawCandidate),
                };
              }
            } else if (typeof rawCandidate === "object") {
              const s = toHighlanderSlotSlug(rawCandidate.slug || rawCandidate.id || rawCandidate.name || "");
              if (s) {
                return {
                  groupId: null,
                  key: s,
                  name: formatHighlanderSlotLabel(rawCandidate.name || rawCandidate.slug || s),
                };
              }
            }
          }
          const baseFamKey = myBossId ? String(myBossId).split("@")[0] : "";
          const canInheritParentSlot = myRelType === "twin" || myRelType === "beta";
          const dbGroupId =
            (!isRestrictedCloud && effectiveDbMod?.highlander_group_id
              ? String(effectiveDbMod.highlander_group_id)
              : "") ||
            (canInheritParentSlot && baseFamKey && parentNameMap[baseFamKey]?.highlander_group_id
              ? String(parentNameMap[baseFamKey].highlander_group_id)
              : "") ||
            (myFlavor?.group_id ? String(myFlavor.group_id) : "");
          if (dbGroupId) {
            const gName = flavorGroupNames[dbGroupId] || "";
            const gSlug =
              flavorGroupSlugs[dbGroupId] ||
              (gName ? toHighlanderSlotSlug(gName) : `group-${dbGroupId.toLowerCase()}`);
            return {
              groupId: dbGroupId,
              key: gSlug,
              name: gName || formatHighlanderSlotLabel(gSlug),
            };
          }
          return null;
        })();

        const localStatusNorm = String(modLocalOvr?.status || "").toLowerCase().trim();

        return {
          ...mod,
          ...(modLocalOvr || {}),
          physical_path: mod.name,
          name: mod.name,
          hash: mod.hash,
          dbId,
          hasChildren: myChildRels.length > 0,
          setId: mySetRel ? String(mySetRel.set_id) : null,
          flavorGroupId: null,
          flavorGroupName: null,
          highlanderGroupId: resolvedHighlanderSlot?.groupId || null,
          highlanderSlotKey: resolvedHighlanderSlot?.key || null,
          highlanderSlotName: resolvedHighlanderSlot?.name || null,
          communityGroupId: myCommunityGroup ? String(myCommunityGroup.group_id) : null,
          communityGroupName: myCommunityGroup
            ? communityGroupNames[String(myCommunityGroup.group_id)]
            : null,
          created_at: modLocalOvr?.created_at || effectiveCloudMatch?.created_at || effectiveDbMod?.created_at || mod.created_at || null,
          updated_at: modLocalOvr?.updated_at || effectiveCloudMatch?.updated_at || effectiveDbMod?.updated_at || mod.updated_at || null,
          requiredDLC: rawDLC,
          category_override: modLocalOvr?.category_override || effectiveDbMod?.category_override,
          sub_type: modLocalOvr?.sub_type || effectiveDbMod?.sub_type,
          image_url: resolvedImageUrl,
          imageUrl: resolvedImageUrl,
          description: modLocalOvr?.description !== undefined ? modLocalOvr.description : (effectiveDbMod?.description || (!isHashRestricted ? mod.description : undefined)),
          folder_structure:
            modLocalOvr?.folder_structure !== undefined
              ? modLocalOvr.folder_structure
              : effectiveDbMod?.folder_structure,
          file_extension:
            modLocalOvr?.file_extension ||
            effectiveDbMod?.file_extension ||
            dbMod?.file_extension ||
            mod.file_extension ||
            (() => {
              const extMatch = (mod.name || "").match(/\.([a-z0-9]{2,12})$/i);
              return extMatch ? extMatch[1].toLowerCase() : undefined;
            })(),
          url:
            modLocalOvr?.url !== undefined
              ? (modLocalOvr.url || null)
              : (effectiveCloudMatch?.download_url || effectiveDbMod?.url || modEdgeLogic?.download_url || (!isHashRestricted ? mod.url : null) || null),
          manifest_url: candidateStaticManifestUrl,
          author:
            modLocalOvr?.author !== undefined
              ? modLocalOvr.author
              : (modEdgeLogic?.author ||
                (Array.isArray(effectiveDbMod?.masons)
                  ? effectiveDbMod.masons[0]?.name
                  : effectiveDbMod?.masons?.name) ||
                effectiveDbMod?.master_author ||
                (!isHashRestricted ? mod.author : undefined)),
          version: finalVersion,
          compatible_versions: compVerArray,
          familyId: myBossId || dbId ? `${myBossId || dbId}` : `local_${mod.hash}`,
          baseFamilyId: myBossId || dbId ? myBossId : `local_${mod.hash}`,
          relationshipType: myRelType,
          invisibleRivals:
            invisibleRivalIds.length > 0 ? invisibleRivalIds : undefined,
          requirements:
            modLocalOvr && Array.isArray(modLocalOvr.requirements)
              ? modLocalOvr.requirements
              : (mergedRequirements.length > 0 ? mergedRequirements : undefined),
          dependencies:
            modLocalOvr && Array.isArray(modLocalOvr.requirements)
              ? modLocalOvr.requirements
              : (mergedRequirements.length > 0 ? mergedRequirements : undefined),
          twins:
            modLocalOvr && Array.isArray(modLocalOvr.twins)
              ? modLocalOvr.twins
              : (mergedTwins.length > 0 ? mergedTwins : undefined),
          interchangeableIds: [
            ...myParentRels.filter((r: any) => r.relationship_type === "beta" || r.relationship_type === "twin").map((r: any) => String(r.parent_id)),
            ...myChildRels.filter((r: any) => r.relationship_type === "beta" || r.relationship_type === "twin").map((r: any) => String(r.child_id)),
            ...edgeTwins.map((t: any) => String(t.id)),
          ],
          displayName: modLocalOvr?.displayName || effectiveDbMod?.name || modEdgeLogic?.name || (() => {
            const rawName = mod.name.split(/[\\/]/).pop() || "";
            const base = rawName.replace(extRegex, "").replace(/_/g, " ");
            return base.toUpperCase();
          })(),
          allow_write: modLocalOvr?.allow_write !== undefined ? modLocalOvr.allow_write : (dbMod?.allow_write || false),
          is_paid: modLocalOvr?.is_paid !== undefined ? modLocalOvr.is_paid : (effectiveDbMod?.is_paid || false),
          is_early_access: modLocalOvr?.is_early_access !== undefined ? modLocalOvr.is_early_access : (effectiveDbMod?.is_early_access || false),
          compliance_tier: detectedComplianceTier,
          mason_id: isHashRestricted ? null : (dbMod?.mason_id || null),
          ...(isEdgeOutdated
            ? {
              hasUpdate: true,
              newVersion: modEdgeLogic?.version || "Update",
              newGameVersion: modEdgeLogic?.game_version,
              download_url: modEdgeLogic?.download_url || candidateStaticManifestUrl,
            }
            : {}),
          status:
            localStatusNorm === "corrupted" || localStatusNorm === "broken"
              ? "corrupted"
              : localStatusNorm === "unstable"
                ? "unstable"
                : localStatusNorm && !localStatusNorm.includes("explicit local")
                  ? modLocalOvr.status
                  : edgeStatusNorm === "broken" || edgeStatusNorm === "corrupted"
                    ? "broken"
                    : edgeStatusNorm === "obsolete"
                      ? "obsolete"
                      : edgeStatusNorm === "unstable"
                        ? "unstable"
                        : dbMod
                          ? dbMod.status === "stable" || dbMod.status === "verified"
                            ? t("status_stable", "STABLE")
                            : dbMod.status === "unverified"
                              ? (modEdgeLogic || candidateStaticManifestUrl)
                                ? t("status_stable", "STABLE")
                                : t("unverified", "Unverified")
                              : dbMod.status
                          : (modEdgeLogic || candidateStaticManifestUrl)
                            ? t("status_stable", "STABLE")
                            : t("badge_local", "Local"),
          status_reason: (() => {
            const cand =
              modLocalOvr?.status_reason !== undefined
                ? modLocalOvr.status_reason
                : effectiveDbMod?.status_reason ||
                dbMod?.status_reason ||
                modEdgeLogic?.status_reason ||
                mod.status_reason ||
                "";
            const trimmed = String(cand || "").trim();
            if (!trimmed || /^\[ARCHITECT\b/i.test(trimmed)) return undefined;
            return trimmed;
          })(),
          color:
            localStatusNorm === "corrupted" || localStatusNorm === "broken" || localStatusNorm === "obsolete"
              ? "var(--danger)"
              : localStatusNorm === "unstable"
                ? "var(--warning)"
                : localStatusNorm && !localStatusNorm.includes("explicit local")
                  ? mod.color
                  : edgeStatusNorm === "broken" || edgeStatusNorm === "corrupted" || edgeStatusNorm === "obsolete"
                    ? "var(--danger)"
                    : edgeStatusNorm === "unstable"
                      ? "var(--warning)"
                      : dbMod
                        ? mod.color
                        : (modEdgeLogic || candidateStaticManifestUrl)
                          ? "var(--success)"
                          : mod.color,
          isSynced: !!(dbMod || modEdgeLogic || candidateStaticManifestUrl),
          isLocalOverride: !!modLocalOvr,
          isVirtual: false,
          isGhosted: isDlcMissing || isVersionMismatch,
          ghostReason: isDlcMissing ? "MISSING_DLC" : (isVersionMismatch ? "VERSION_MISMATCH" : null),
        };
      });
  return physicalMods;
}
