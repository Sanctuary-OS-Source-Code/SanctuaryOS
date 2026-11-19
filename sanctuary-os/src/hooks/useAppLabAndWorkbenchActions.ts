import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useStore } from "../store";
import { supabase } from "../supabase";
import {
  ModData,
  deriveHumanReadableVersion,
  getExtensionRegex,
} from "../shared";
import { scrubLogUserData, buildFormattedLabReportText, extractReportLoadoutFromLogAndContext } from "../utils/logScrubber";
import { matchExceptionRules } from "../components/KnownErrorDiagnosisBanner";
import { isUnrelatedGameBugLog, getExceptionRules } from "../components/KnownExceptionRules";
import { checkAndPromptSymlinkCloudSyncConsent } from "../utils/cloudSyncGuard";

export function useAppLabAndWorkbenchActions({
  t,
  setMetaAllowWriteInput,
  setStatus,
  session,
  modList,
  setModList,
  activeGameSchema,
  fetchVault,
  view,
  shelterActive,
  setShelterActive,
  activeDossier,
  setActiveDossier,
  setLabQueue,
  activeLabMod,
  setActiveLabMod,
  setTestErrorFound,
  testErrorFound,
  setLogWatcher,
  logWatcher,
  logWatcherRef,
  setTestLogSnippet,
  testLogSnippet,
  setIsSubmittingReport,
  setEditMode,
  setConfigContent,
  configContent,
  setIsEditingMeta,
  setIsCorrectingMeta,
  setMetaNameInput,
  setMetaAuthorInput,
  setMetaUrlInput,
  setMetaImageInput,
  setMetaDescInput,
  setMetaStatusMsgInput,
  setMetaStatusInput,
  setMetaVersionInput,
  setMetaManifestUrlInput,
  setMetaIsPaidInput,
  setMetaIsEarlyAccessInput,
  selectedVersion,
  associatedMods,
  setAssociatedMods,
  conflictTarget,
  setConflictTarget,
  setIsLoadingAssociated,
  setLabConflicts,
  setMasonProfileAboveDossier,
  equipPlaySet,
  toggleInActiveSet,
  displayModList,
}: any) {
  const resolveUserDataDir = (config: any): string =>
    useStore.getState().docsPath ||
    config?.docs_path ||
    config?.user_data_path ||
    String(config?.mods_path || "").replace(/[\\/][^\\/]+[\\/]?$/, "");

  async function executeHotSwap() {
    if (!activeLabMod) return;
    const runHotSwapInternal = async (skipCloudCheck: boolean) => {
      try {
        const preConfig: any = await invoke("get_saved_coordinates");
        if (!skipCloudCheck) {
          const allowed = await checkAndPromptSymlinkCloudSyncConsent({
            modsPath: preConfig?.mods_path,
            vaultPath: preConfig?.vault_path,
            docsPath: resolveUserDataDir(preConfig),
            livePath: preConfig?.live_path,
            actionLabel: t("lab_btn_hot_swap", "Lab Hot-Swap"),
            onAuthorizedProceed: () => {
              void runHotSwapInternal(true);
            },
          });
          if (!allowed) {
            setStatus(
              t(
                "cloud_guard_pending_action_canceled",
                "Cloud-sync folder consent required before projecting symlinks."
              )
            );
            return;
          }
        }
        if (!shelterActive) {
          setStatus(t("status_auto_isolate", "Auto-isolate..."));
          await invoke("evacuate_to_shelter");
          setShelterActive(true);
          fetchVault();
        }
        setStatus(t("status_injecting", "Injecting..."));
        await invoke("move_to_lab", { filename: activeLabMod.physical_path || activeLabMod.name });
        const config: any = await invoke("get_saved_coordinates");
        const dPath = resolveUserDataDir(config);
        setStatus(t("status_purging_logs", "Deleting Logs..."));
        await invoke("airgap_saves", { docsPath: dPath, enable: true });
        await invoke("clear_old_logs", { docsPath: dPath });
        try {
          const currentRules = getExceptionRules(activeGameSchema);
          await invoke("update_active_game_schema", {
            schema: { ...(activeGameSchema || {}), exception_rules: currentRules },
          });
        } catch {}
        try {
          await invoke("start_lab_verification_session", {
            dnaHash: activeLabMod?.hash || activeLabMod?.name || "lab_session",
            modName: activeLabMod.displayName || activeLabMod.name || "Unknown",
            docsPath: dPath,
            vaultPath: config.vault_path || "",
            linkedFiles: [activeLabMod.name].filter(Boolean),
            notificationLabels: {
              failed_title: t("lab_stage_failed", "Simulation Failed"),
              timer_complete_title: t(
                "lab_overlay_timer_up_title",
                "TIMED TEST COMPLETE (0:00) — SAVE GAME NOW!"
              ),
              timer_complete_body: t(
                "lab_overlay_timer_up_desc",
                "Open the in-game menu and click Save to verify save serialization and unlock publishing."
              ),
              verified_title: t("lab_overlay_verified_title", "VERIFICATION PASSED & SIGNED!"),
              verified_body: t(
                "lab_overlay_verified_desc",
                "Save checkpoint verified. You may now safely exit the game."
              ),
            },
          });
        } catch {}
        setStatus(t("status_igniting", "Starting Engines..."));
        await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });
        setTestErrorFound(false);
        setTestLogSnippet("");
        if (logWatcherRef.current) {
          clearInterval(logWatcherRef.current);
        }
        const interval = setInterval(async () => {
          const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
          if (res !== "Clean" && !isUnrelatedGameBugLog(res, useStore.getState().activeGameSchema)) {
            setTestErrorFound(true);
            setTestLogSnippet(res);
            setStatus(`${t("status_fatal_error", "Fatal:")} ${res.substring(0, 50)}...`);
            clearInterval(interval);
            logWatcherRef.current = null;
            setLogWatcher(null);
          }
        }, 5000);
        logWatcherRef.current = interval;
        setLogWatcher(interval);
      } catch (err) {
        const errStr = typeof err === "string" ? err : (err as any)?.message || String(err);
        setStatus(`${t("status_lab_error", "Lab Error:")} ${t(errStr, errStr)}`);
      }
    };
    await runHotSwapInternal(false);
  }
  async function openWorkbench(modPath: string) {
    try {
      const content = await invoke<string>("read_config_file", {
        path: modPath,
      });
      setConfigContent(content);
      setEditMode(true);
    } catch (err) {
      setStatus(t("status_no_editable", "No editable config."));
    }
  }
  async function saveWorkbenchChanges() {
    if (!activeDossier) return;
    setStatus(t("status_committing", "Committing Changes..."));
    try {
      const configPath = activeDossier.name.replace(/\.[^/.]+$/, ".cfg");
      const config: any = await invoke("get_saved_coordinates");
      const fullPath = `${config.mods_path}/${configPath}`;
      const msg = await invoke<string>("save_config_file", {
        path: fullPath,
        content: configContent,
      });
      setStatus(`${t("icon_check_circle", "check_circle")} ${msg}`);
      setEditMode(false);
    } catch (err) {
      setStatus(`${t("status_save_failure", "Save Failure:")}${err}`);
    }
  }
  async function ensureSpokeModVersion(targetMod: any, desiredStatus = "under_review"): Promise<{ modId: string; versionId: string }> {
    const modHash = targetMod.hash || targetMod.id || targetMod.name;
    const { data: existingVer, error: searchError } = await supabase
      .from("mod_versions")
      .select("id, mod_id")
      .eq("dna_hash", modHash)
      .limit(1)
      .maybeSingle();
    if (searchError) throw searchError;

    if (existingVer?.id && existingVer?.mod_id) {
      return { modId: existingVer.mod_id, versionId: existingVer.id };
    }

    const rawName = targetMod.name || targetMod.displayName || "Unknown Artifact";
    const cleanName = rawName.split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), "") || rawName;
    const searchPattern = cleanName.replace(/[_ ]/g, "%");

    const { data: existingMods } = await supabase
      .from("mods")
      .select("id")
      .ilike("name", searchPattern)
      .limit(1);

    let targetModId = existingMods?.[0]?.id;
    if (!targetModId) {
      const { data: modData, error: modError } = await supabase
        .from("mods")
        .insert([
          {
            name: cleanName,
            status: desiredStatus,
            description: "Homestead Lab Diagnostic Artifact",
          },
        ])
        .select("id")
        .single();
      if (modError) throw modError;
      targetModId = modData.id;
    }

    const { data: createdVer, error: verError } = await supabase
      .from("mod_versions")
      .insert([
        {
          mod_id: targetModId,
          version_label: deriveHumanReadableVersion(rawName, modHash),
          game_version: selectedVersion || "Local",
          dna_hash: modHash,
        },
      ])
      .select("id")
      .single();
    if (verError) throw verError;

    return { modId: targetModId, versionId: createdVer.id };
  }

  async function submitLabReport(reportOverride?: any): Promise<boolean> {
    if (!session) {
      alert(t("alert_guest_mode_uploads", "Guest Mode Active:\nUploads are disabled."));
      return false;
    }
    const targetMod = reportOverride?.mod || activeLabMod;
    const rawSnippet = reportOverride?.logSnippet || testLogSnippet || "";
    const targetSnippet = scrubLogUserData(rawSnippet);
    if (!targetMod) return false;
    const isRestrictedOrUnknownMod = (m: any) =>
      !m ||
      (Number(m.compliance_tier || 0) >= 1 && Number(m.compliance_tier || 0) <= 4) ||
      !m.isSynced ||
      !m.dbId ||
      String(m.status || "").toLowerCase() === "unverified";
    const stagedModsForCheck = [
      targetMod,
      ...(reportOverride?.stagedExtras || []),
      ...(associatedMods || []),
      reportOverride?.conflictTarget || conflictTarget,
      ...(reportOverride?.conflictExtras || []),
    ].filter(Boolean);
    if (stagedModsForCheck.some(isRestrictedOrUnknownMod)) {
      alert(
        t(
          "alert_restricted_no_lab_reports",
          "Tier 1–5 and unverified/unknown {mods} cannot be submitted to the global Homestead {Lab} database."
        )
      );
      return false;
    }
    setIsSubmittingReport(true);
    setStatus(t("status_submitting_report", "Uploading Lab Intel..."));
    let ok = false;
    try {
      const { modId, versionId } = await ensureSpokeModVersion(targetMod, "under_review");
      await supabase
        .from("mods")
        .update({ status: "under_review" })
        .eq("id", modId);

      const autoLoadout = extractReportLoadoutFromLogAndContext({ targetMod, logText: targetSnippet, explicitDependencies: [...(reportOverride?.stagedExtras || []), ...(associatedMods || [])], explicitConflictTarget: reportOverride?.conflictTarget || conflictTarget, explicitConflictExtras: reportOverride?.conflictExtras, linkedFiles: reportOverride?.linkedFiles, modList, activeGameSchema });
      const stagedDepsList = (autoLoadout.dependencies || []).map((m: any) => m.name).filter(Boolean);
      const conflictExtrasList = (autoLoadout.conflictExtras || []).map((m: any) => m.name).filter(Boolean);
      const hasContextPayload = Boolean(
        autoLoadout.conflictTarget ||
          stagedDepsList.length > 0 ||
          conflictExtrasList.length > 0
      );

      const notePayload = hasContextPayload
        ? JSON.stringify({
            conflictTarget: autoLoadout.conflictTarget?.name,
            dependencies: stagedDepsList,
            conflictExtras: conflictExtrasList,
          })
        : t("status_report_automated", "Automated System Report");

      const currentExceptionRules = useStore.getState().exceptionRules || [];
      const matchedRules = matchExceptionRules(targetSnippet, currentExceptionRules);
      const formattedReportLog = buildFormattedLabReportText({
        reportNumber: reportOverride?.reportNumber || 1,
        date: reportOverride?.time
          ? new Date(reportOverride.time).toLocaleString()
          : new Date().toLocaleString(),
        gameVersion: selectedVersion || "Local",
        targetMod,
        conflictTarget: autoLoadout.conflictTarget,
        stagedExtras: autoLoadout.dependencies,
        conflictExtras: autoLoadout.conflictExtras,
        missingDeps: reportOverride?.missingDeps,
        linkedFiles: reportOverride?.linkedFiles,
        matchedRules,
        rawLogText: targetSnippet,
        errorFound: true,
        verified: false,
        activeGameSchema,
        modList,
      });

      const { error } = await supabase.from("homestead_lab_logs").insert([
        {
          mod_id: modId,
          version_id: versionId,
          mod_version_id: versionId,
          log_snippet: targetSnippet,
          log_text: formattedReportLog,
          status: "pending",
          tester_note: notePayload,
        },
      ]);
      if (error) throw error;
      setStatus(t("status_report_secured", "Intel Secured"));
      useStore.getState().pushStatus(t("status_report_secured", "Intel Secured"), "success");
      ok = true;
    } catch (err: any) {
      const errMsg = `${t("status_report_failed", "Intel Upload Failed:")}${err?.message || String(err)}`;
      setStatus(errMsg);
      useStore.getState().pushStatus(errMsg, "error");
    }
    setIsSubmittingReport(false);
    return ok;
  }
  async function concludeTest(
    labContext?: any,
    targetModOverride?: any,
    errorFoundOverride?: boolean,
  ): Promise<boolean> {
    const targetMod = targetModOverride || activeLabMod;
    const isError = errorFoundOverride !== undefined ? errorFoundOverride : testErrorFound;
    setStatus(
      t(
        "lab_status_closing_and_restoring",
        "Closing sandbox & restoring live saves..."
      )
    );
    const config: any = await invoke("get_saved_coordinates").catch(() => ({}));
    const dPath = resolveUserDataDir(config);
    try {
      await invoke("teardown_lab_sandbox_session", {
        docsPath: dPath,
        closeGame: true,
      });
    } catch (e: any) {
      const rawErr = typeof e === "string" ? e : e?.message || String(e);
      const formattedErr = rawErr.includes("lab_err_game_running_saves_locked")
        ? t(
            "lab_err_game_running_saves_locked",
            "Close the running game first so your live saves can be unlocked and restored safely."
          )
        : `${t("status_teardown_error", "Teardown Error:")} ${rawErr}`;
      setStatus(formattedErr);
      useStore.getState().pushStatus(formattedErr, "error");
      return false;
    }

    if (logWatcherRef.current) {
      clearInterval(logWatcherRef.current);
      logWatcherRef.current = null;
    }
    if (logWatcher) {
      clearInterval(logWatcher);
      setLogWatcher(null);
    }

    try {
      if (shelterActive) {
        setStatus(t("status_restoring_bunker_full", "Restoring Loadout..."));
        const lastSet = localStorage.getItem(
          `sanctuary_${useStore.getState().activeWorkspaceId || "default"}_active_set`
        );
        if (lastSet) {
          await equipPlaySet(lastSet);
        } else {
          await invoke("deploy_playset_bulk", {
            mods: [],
            modsPath: config.mods_path,
            vaultPath: config.vault_path,
          });
        }
        setShelterActive(false);
      }

      if (!targetMod) {
        setTestErrorFound(false);
        setTestLogSnippet("");
        setStatus(
          t(
            "status_airgap_restored",
            "SAVE AIRGAP DISENGAGED: Live saves restored."
          )
        );
        return true;
      }

      const effectiveHash = String(targetMod.hash || targetMod.name || "").trim();
      const hasSignedCertificate = !isError
        ? await invoke<boolean>("verify_lab_certificate_exists", {
            vaultPath: config.vault_path || "",
            dnaHash: effectiveHash,
          }).catch(() => false)
        : false;

      // If the user exited the sandbox BEFORE completing the 4-stage gameplay & save checkpoint (and no error occurred),
      // restore live saves & loadout cleanly WITHOUT marking the {mod} as Verified!
      if (!isError && !hasSignedCertificate) {
        setActiveLabMod(null);
        setTestErrorFound(false);
        setTestLogSnippet("");
        setStatus(
          t(
            "lab_status_sandbox_exited_unverified",
            "Sandbox exited & live saves restored — {Mod} remains unverified until all 4 {Lab} stages complete."
          )
        );
        return true;
      }

      const finalStatus = isError ? "broken" : "verified";
      const spokeModStatus = isError ? "under_review" : "verified";
      const uiStatus = isError
        ? t("status_corrupted", "Corrupted")
        : t("verified", "Verified");
      const uiColor = isError ? "var(--danger)" : "var(--success)";
      const isTargetEligibleForCloudSync =
        targetMod.isSynced &&
        targetMod.dbId &&
        Number(targetMod.compliance_tier || 0) === 0 &&
        String(targetMod.status || "").toLowerCase() !== "unverified";
      if (isTargetEligibleForCloudSync) {
        try {
          const { modId } = await ensureSpokeModVersion(targetMod, spokeModStatus);
          await supabase
            .from("mods")
            .update({ status: spokeModStatus })
            .eq("id", modId);
        } catch (dbErr) {
          console.warn("Could not sync concluded test to Spoke DB:", dbErr);
        }
      }
      if (isError && targetMod.name) {
        try {
          toggleInActiveSet(targetMod.name, true, true);
        } catch (e) { }
      }
      setLabQueue((prev: any) => prev.filter((m: any) => m.hash !== targetMod.hash));
      setModList((prev: any) =>
        prev.map((m: any) =>
          m.hash === targetMod.hash
            ? { ...m, status: uiStatus, color: uiColor, isSynced: true }
            : m,
        ),
      );
      setActiveLabMod(null);
      setTestErrorFound(false);
      setTestLogSnippet("");
      setStatus(
        `${t("status_artifact_secured_prefix", "{MOD} SECURED: Marked as")} ${finalStatus.toUpperCase()}`,
      );
      return true;
    } catch (err: any) {
      setStatus(`${t("status_teardown_error", "Teardown Error:")}${err.message}`);
      return false;
    }
  }
  const fetchLabAssociated = async (mod: ModData) => {
    setIsLoadingAssociated(true);
    try {
      let modId = mod.dbId;
      if (!modId) {
        if (mod.hash) {
          const { data: mvInDb } = await supabase
            .from("mod_versions")
            .select("mod_id, mods!inner(file_extension)")
            .eq("dna_hash", mod.hash)
            .maybeSingle();
          if (mvInDb) {
            const isLocalScript = mod.name?.toLowerCase().includes("script");
            const isDBScript = (mvInDb.mods as any)?.file_extension?.toLowerCase().includes("script");
            if (!!isLocalScript === !!isDBScript) {
              modId = mvInDb.mod_id;
            }
          }
        }
      }
      if (!modId) {
        const cleanMod = (mod.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(getExtensionRegex(activeGameSchema), "")
          .trim();
        if (cleanMod && cleanMod.length >= 4) {
          const { data: modsInDb } = await supabase
            .from("mods")
            .select("id, file_extension")
            .ilike("name", cleanMod);

          if (modsInDb && modsInDb.length > 0) {
            const isScript = mod.name?.toLowerCase().includes("script");
            const exactMatch = modsInDb.find((m: any) =>
              isScript
                ? m.file_extension?.toLowerCase().includes("script")
                : !m.file_extension?.toLowerCase().includes("script")
            );
            modId = exactMatch ? exactMatch.id : modsInDb[0].id;
          }
        }
      }

      if (modId) {
        const { data: modInDb } = await supabase
          .from("mods")
          .select("id")
          .eq("id", modId)
          .single();

        if (modInDb) {
          const { data: deps } = await supabase
            .from("mod_dependencies")
            .select("parent_id")
            .eq("child_id", modInDb.id);
          const { data: twins } = await supabase
            .from("mod_relationships")
            .select("child_id")
            .eq("parent_id", modInDb.id)
            .eq("relationship_type", "twin");
          const { data: twinParents } = await supabase
            .from("mod_relationships")
            .select("parent_id")
            .eq("child_id", modInDb.id)
            .eq("relationship_type", "twin");
          const { data: addonParents } = await supabase
            .from("mod_relationships")
            .select("parent_id")
            .eq("child_id", modInDb.id)
            .eq("relationship_type", "addon");

          const relatedIds = [
            ...(deps?.map((d) => String(d.parent_id)) || []),
            ...(twins?.map((t) => String(t.child_id)) || []),
            ...(twinParents?.map((t) => String(t.parent_id)) || []),
            ...(addonParents?.map((a) => String(a.parent_id)) || []),
          ];
          if (relatedIds.length > 0) {
            const { data: relatedMods, error } = await supabase
              .from("mods")
              .select("id, name, master_author, file_extension")
              .in("id", relatedIds);
            if (error) console.error("Error fetching associated mods:", error);
            setAssociatedMods(relatedMods || []);
          } else {
            setAssociatedMods([]);
          }
        } else {
          setAssociatedMods([]);
        }
      } else {
        setAssociatedMods([]);
      }
    } catch (err) {
      console.error("Lab Association Failed:", err);
    }
    setIsLoadingAssociated(false);
  };
  useEffect(() => {
    if (view === "lab" && activeLabMod) {
      fetchLabAssociated(activeLabMod);
      setConflictTarget(null);
      setLabConflicts([]);
    }
  }, [activeLabMod, view]);

  useEffect(() => {
    const handleOpenDossierEvent = (e: Event) => {
      const rawTarget = (e as CustomEvent)?.detail;
      if (!rawTarget) return;

      const stripSanctuaryPrefix = (val: string) =>
        String(val || "").replace(/^Sanctuary\d*[/\\]/i, "");
      const cleanBaseName = (val: string) =>
        stripSanctuaryPrefix(val)
          .split(/[\\/]/)
          .pop()
          ?.replace(getExtensionRegex(activeGameSchema), "")
          .trim()
          .toLowerCase() || "";

      const resolveSingleMod = (item: any) => {
        const isStr = typeof item === "string";
        const rawName = isStr
          ? item
          : String(item?._originalSetName || item?.name || item?.path || item?.displayName || "");
        const strippedName = stripSanctuaryPrefix(rawName);
        const targetBase = cleanBaseName(rawName);
        const targetHash = !isStr && item?.hash ? String(item.hash) : "";
        const targetDbId = !isStr && item?.dbId ? String(item.dbId).split("@")[0] : "";

        const allPool: any[] = [...modList];
        for (const dm of displayModList) {
          if (dm && !allPool.includes(dm)) allPool.push(dm);
          if (Array.isArray(dm?.flavors)) {
            for (const f of dm.flavors) {
              if (f && !allPool.includes(f)) allPool.push(f);
            }
          }
        }

        const matched = allPool.find((m: any) => {
          if (!m || m.isCollection) return false;
          if (targetHash && m.hash && String(m.hash) === targetHash) return true;
          if (targetDbId && m.dbId && String(m.dbId).split("@")[0] === targetDbId && !m.isVirtual)
            return true;
          const mName = stripSanctuaryPrefix(String(m.name || ""));
          if (strippedName && mName.toLowerCase() === strippedName.toLowerCase()) return true;
          return Boolean(targetBase && cleanBaseName(m.name || m.displayName || "") === targetBase);
        });

        if (isStr) {
          return matched ? { ...matched } : { name: strippedName || rawName, displayName: strippedName || rawName };
        }
        return matched
          ? {
              ...matched,
              ...item,
              name: matched.name || item.name || strippedName,
              displayName: item.displayName || matched.displayName || matched.name || strippedName,
              author:
                item.author && item.author !== "Unknown"
                  ? item.author
                  : matched.author || item.author,
              version:
                item.version && String(item.version).toLowerCase() !== "v.local"
                  ? item.version
                  : matched.version || item.version,
              description: item.description || matched.description,
              image_url: item.image_url || item.imageUrl || matched.image_url || matched.imageUrl,
              url: item.url || item.download_url || matched.url || matched.download_url,
              hash: item.hash || matched.hash,
              dbId: item.dbId || matched.dbId,
              compatible_versions: item.compatible_versions || matched.compatible_versions,
              requiredDLC: item.requiredDLC || matched.requiredDLC,
              status_reason: item.status_reason || matched.status_reason,
              _alert_reason: item._alert_reason,
            }
          : {
              ...item,
              name: item.name || strippedName || item.displayName || "",
              status_reason: item.status_reason,
              _alert_reason: item._alert_reason,
            };
      };

      let resolvedMod: any;
      const groupedItems = Array.isArray(rawTarget?.flavors)
        ? rawTarget.flavors
        : Array.isArray(rawTarget?._groupedMods) && rawTarget._groupedMods.length > 1
          ? rawTarget._groupedMods
          : null;

      if (groupedItems && groupedItems.length > 1) {
        const resolvedFlavors = groupedItems.map((gm: any) => resolveSingleMod(gm));
        const famId = String(
          rawTarget?.baseFamilyId ||
            rawTarget?.familyId ||
            rawTarget?.dbId ||
            resolvedFlavors[0]?.baseFamilyId ||
            resolvedFlavors[0]?.dbId ||
            ""
        ).split("@")[0];
        const isCollectionTarget = Boolean(
          rawTarget?._isCollectionGroup || rawTarget?.isCollection
        );
        const setTargetId = String(rawTarget?.setId || rawTarget?.dbId || "").trim();
        const virtualMatch = displayModList.find((dm: any) => {
          if (!dm?.isVirtual) return false;
          if (isCollectionTarget && dm.isCollection) {
            return Boolean(setTargetId && String(dm.dbId || "").trim() === setTargetId);
          }
          if (dm.isCollection) return false;
          return (
            (famId &&
              (String(dm.dbId || "").split("@")[0] === famId ||
                String(dm.baseFamilyId || "").split("@")[0] === famId)) ||
            (rawTarget?.displayName &&
              String(dm.displayName || "").toLowerCase() ===
                String(rawTarget.displayName).toLowerCase())
          );
        });
        const primaryRef = resolvedFlavors[0] || {};
        resolvedMod = {
          ...(virtualMatch || {}),
          ...primaryRef,
          ...rawTarget,
          isVirtual: true,
          displayName:
            rawTarget.displayName ||
            rawTarget._groupedTitle ||
            virtualMatch?.displayName ||
            primaryRef.displayName ||
            primaryRef.name,
          name:
            rawTarget.name ||
            virtualMatch?.name ||
            primaryRef.name ||
            rawTarget.displayName ||
            "",
          flavors: resolvedFlavors,
          status_reason: rawTarget.status_reason || primaryRef.status_reason,
          _alert_reason: rawTarget._alert_reason || primaryRef._alert_reason,
        };
      } else {
        resolvedMod = resolveSingleMod(rawTarget);
      }

      const defaultName =
        (resolvedMod.displayName || resolvedMod.name || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(getExtensionRegex(activeGameSchema), "")
          .replace(/_/g, " ") || "";
      setMetaNameInput(defaultName);
      setMetaAuthorInput(resolvedMod.author || "");
      setMetaVersionInput(resolvedMod.version || "");
      setMetaDescInput(resolvedMod.description || "");
      setMetaImageInput(resolvedMod.image_url || resolvedMod.imageUrl || "");
      setMetaUrlInput(resolvedMod.url || "");
      setMetaManifestUrlInput(resolvedMod.manifest_url || "");
      setMetaStatusMsgInput(resolvedMod.status_reason || "");
      setMetaStatusInput(resolvedMod.status || "WORKING");
      setMetaAllowWriteInput(resolvedMod.allow_write || false);
      setMetaIsPaidInput(resolvedMod.is_paid || false);
      setMetaIsEarlyAccessInput(resolvedMod.is_early_access || false);
      setIsEditingMeta(false);
      setEditMode(false);
      setIsCorrectingMeta(false);
      setMasonProfileAboveDossier(false);
      setActiveDossier(resolvedMod);
    };

    window.addEventListener("sanctuary-open-dossier", handleOpenDossierEvent);
    return () =>
      window.removeEventListener("sanctuary-open-dossier", handleOpenDossierEvent);
  }, [modList, displayModList, activeGameSchema]);
  const runLabSimulation = async () => {
    if (!activeLabMod || !conflictTarget) return;
    setIsLoadingAssociated(true);
    const { data } = await supabase
      .from("logical_conflicts")
      .select("*")
      .or(
        `and(mod_a.eq."${activeLabMod.name}",mod_b.eq."${conflictTarget.name}"),and(mod_a.eq."${conflictTarget.name}",mod_b.eq."${activeLabMod.name}")`,
      );
    setLabConflicts(data || []);
    setIsLoadingAssociated(false);
  };
  const runProvingRun = async (
    extraDeployNames: string[] = [],
    customToolPath?: string,
    skipCloudCheck = false
  ) => {
    if (!activeLabMod) return;
    try {
      setStatus(t("status_diagnostic_run", "Initiating proving run: staging simulation..."));

      let depPaths: string[] = [];
      let modAId = activeLabMod.dbId;
      if (!modAId) {
        const { data: verA } = await supabase.from("mod_versions").select("mod_id").eq("dna_hash", activeLabMod.hash).maybeSingle();
        modAId = verA?.mod_id;
      }
      if (!modAId) {
        const cleanModA = (activeLabMod.name || "").split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
        const { data: modA } = await supabase.from("mods").select("id").ilike("name", cleanModA || "").maybeSingle();
        modAId = modA?.id;
      }

      let modBId = conflictTarget?.dbId;
      if (conflictTarget && !modBId) {
        const { data: verB } = await supabase.from("mod_versions").select("mod_id").eq("dna_hash", conflictTarget.hash).maybeSingle();
        modBId = verB?.mod_id;
      }
      if (conflictTarget && !modBId) {
        const cleanModB = (conflictTarget.name || "").split(/[\\/]/).pop()?.replace(getExtensionRegex(activeGameSchema), '');
        const { data: modB } = await supabase.from("mods").select("id").ilike("name", cleanModB || "").maybeSingle();
        modBId = modB?.id;
      }
      const ids = [modAId, modBId].filter(Boolean);

      if (ids.length > 0) {
        const orQuery = ids.map(id => `child_id.eq.${id}`).join(',');

        const { data: depLinks } = await supabase.from('mod_dependencies').select('parent_id, child_id').or(orQuery);
        const { data: addonLinks } = await supabase.from('mod_relationships').select("parent_id").or(orQuery).eq('relationship_type', 'addon');

        let allIds = new Set<string>();
        if (depLinks) depLinks.forEach((l: any) => allIds.add(l.parent_id));
        if (addonLinks) addonLinks.forEach((l: any) => allIds.add(l.parent_id));

        if (allIds.size > 0) {
          const { data: depMods } = await supabase.from('mods').select("name").in('id', Array.from(allIds));
          if (depMods) depPaths = depMods.map((m: any) => m.name);
        }
      }

      const config: any = await invoke("get_saved_coordinates");
      if (!skipCloudCheck) {
        const allowed = await checkAndPromptSymlinkCloudSyncConsent({
          modsPath: config?.mods_path,
          vaultPath: config?.vault_path,
          docsPath: config?.docs_path || config?.user_data_path,
          livePath: config?.live_path,
          actionLabel: t("lab_btn_start_proving_run", "Start Proving Run"),
          onAuthorizedProceed: () => {
            void runProvingRun(extraDeployNames, customToolPath, true);
          },
        });
        if (!allowed) {
          setStatus(
            t(
              "cloud_guard_pending_action_canceled",
              "Cloud-sync folder consent required before projecting symlinks."
            )
          );
          return;
        }
      }
      await invoke("evacuate_to_shelter");

      const expandSingleTargetOrTwins = (modTarget: any): string[] => {
        if (!modTarget) return [];
        if (
          modTarget.isVirtual &&
          Array.isArray(modTarget.flavors) &&
          !modTarget.isCollection &&
          !modTarget._isCollectionGroup &&
          modTarget.flavors.length <= 3
        ) {
          return modTarget.flavors.map((f: any) => f.name).filter(Boolean);
        }
        return [
          modTarget.physical_path ||
            modTarget.name ||
            modTarget.flavors?.[0]?.name,
        ].filter(Boolean);
      };

      const rawDeploySet = new Set([
        ...expandSingleTargetOrTwins(activeLabMod),
        ...(conflictTarget ? expandSingleTargetOrTwins(conflictTarget) : []),
        ...depPaths,
        ...associatedMods.map((m: any) => m.name),
        ...extraDeployNames
      ]);

      const normalizeLookup = (s: string) =>
        (s || "")
          .split(/[\\/]/)
          .pop()
          ?.replace(getExtensionRegex(activeGameSchema), "")
          .replace(/[^a-z0-9]/gi, "")
          .toLowerCase() || "";

      const deployPaths = Array.from(rawDeploySet)
        .map((modName: string) => {
          const targetNorm = normalizeLookup(modName);
          const modObj = modList.find((m: any) => {
            if (m.isVirtual) return false;
            if (m.name === modName || m.displayName === modName) return true;
            const mNorm = normalizeLookup(m.name);
            return mNorm && targetNorm && mNorm === targetNorm;
          });
          return modObj ? (modObj.physical_path || modObj.name) : modName;
        })
        .filter(Boolean);

      const primaryPath = activeLabMod.physical_path || activeLabMod.name;
      const additionalMods = deployPaths.filter((p) => p !== primaryPath);

      const linkedFiles = await invoke<string[]>("deploy_mod_for_lab_test", {
        modPathOrName: primaryPath,
        dnaHash: activeLabMod.hash || null,
        additionalMods,
        isSandbox: false,
        modsPath: config.mods_path,
        vaultPath: config.vault_path || "",
      });

      setShelterActive(true);
      fetchVault();

      const dPath = resolveUserDataDir(config);
      setStatus(t("status_purging_logs", "Deleting Logs..."));
      await invoke("airgap_saves", { docsPath: dPath, enable: true });
      await invoke("clear_old_logs", { docsPath: dPath });

      try {
        await invoke("start_lab_verification_session", {
          dnaHash: activeLabMod?.hash || activeLabMod?.name || "lab_session",
          modName: activeLabMod.displayName || activeLabMod.name || "Unknown",
          docsPath: dPath,
          vaultPath: config.vault_path || "",
          linkedFiles,
          notificationLabels: {
            failed_title: t("lab_stage_failed", "Simulation Failed"),
            timer_complete_title: t(
              "lab_overlay_timer_up_title",
              "TIMED TEST COMPLETE (0:00) — SAVE GAME NOW!"
            ),
            timer_complete_body: t(
              "lab_overlay_timer_up_desc",
              "Open the in-game menu and click Save to verify save serialization and unlock publishing."
            ),
            verified_title: t("lab_overlay_verified_title", "VERIFICATION PASSED & SIGNED!"),
            verified_body: t(
              "lab_overlay_verified_desc",
              "Save checkpoint verified. You may now safely exit the game."
            ),
          },
        });
      } catch (e) {}

      if (customToolPath && customToolPath.trim()) {
        setStatus(t("status_external_tool_launched", "Saves Airgapped & External Program Launched."));
        await invoke("launch_external_tool", {
          toolPath: customToolPath.trim(),
          docsPath: dPath,
          enforceAirgap: true,
        });
      } else {
        setStatus(t("status_igniting", "Starting Engines..."));
        await invoke("launch_game", { livePath: config.live_path, modsPath: config.mods_path });
      }

      setTestErrorFound(false);
      setTestLogSnippet("");
      if (logWatcherRef.current) {
        clearInterval(logWatcherRef.current);
      }
      const interval = setInterval(async () => {
        const res = await invoke<string>("scan_game_logs", { docsPath: dPath });
        if (res !== "Clean" && !isUnrelatedGameBugLog(res, useStore.getState().activeGameSchema)) {
          const scrubbedRes = scrubLogUserData(res);
          setTestErrorFound(true);
          setTestLogSnippet(scrubbedRes);
          setStatus(`${t("status_fatal_error", "Fatal:")} ${scrubbedRes.substring(0, 50)}...`);
          clearInterval(interval);
          logWatcherRef.current = null;
          setLogWatcher(null);
          // Do NOT disable save airgap while the game/tool is still running!
          // Airgap remains engaged until concludeTest() or repopulate_from_shelter().
        }
      }, 5000);
      logWatcherRef.current = interval;
      setLogWatcher(interval as any);
    } catch (err) {
      const errStr = typeof err === "string" ? err : (err as any)?.message || String(err);
      setStatus(`${t("status_lab_error", "Lab Error:")} ${t(errStr, errStr)}`);
    }
  };


  return {
    executeHotSwap,
    openWorkbench,
    saveWorkbenchChanges,
    submitLabReport,
    concludeTest,
    runLabSimulation,
    runProvingRun,
  };
}
