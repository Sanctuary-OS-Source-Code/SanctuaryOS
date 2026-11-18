import { supabase } from "../../supabase";
import { isDesktop, isLinuxDesktop } from "../envUtils";
import { packageBlueprintLoadOrder } from "../../hooks/usePlaySetLogic";
import { triggerPwaWebPush } from "../webPushClient";
import { useStore } from "../../store";
import { useModalStore } from "../../store/modalStore";
import { isScriptExtension } from "../../shared";
import { sanitizeComplianceTierForLocal } from "../blueprintOverrideUtils";

import type { StagedArtifactItem, StagedCloudPayload, VaultCompanionArtifact, VaultCompanionDesktopBlueprint, VaultCompanionSnapshot, ResolvedStagedPayload } from "./types";
import { bytesToBase64, maybeCompressBytes, maybeDecompressBytes, base64ToBytes, resolveStagingVaultSecret, deriveUserStagingToken, deriveAesGcmKey, encryptStagingPayload, decryptStagingPayload } from "./cryptoPrimitives";
import { normalizeBpKey, recordMobileBlueprintEdit, applyMobileEditsToBlueprints } from "./payloadResolver";

export async function pushEncryptedStagingPayload(
  payload: StagedCloudPayload,
  session: any
): Promise<{ success: boolean; rowId?: string; error?: string }> {
  if (!session?.user?.id) {
    return { success: false, error: "Authentication required" };
  }
  try {
    const userToken = await deriveUserStagingToken(session.user.id, session.user.email);
    const targetBpKey = normalizeBpKey(
      payload.targetDesktopBlueprint || payload.blueprintName
    );

    // Check existing staging rows for this user token so editing the SAME blueprint merges & replaces its row instead of creating a duplicate blueprint
    const { data: existingRows } = await supabase
      .from("citizen_staging_queue")
      .select("*")
      .eq("user_token", userToken)
      .order("created_at", { ascending: false })
      .limit(10);

    const matchingRowIdsToDelete: string[] = [];
    let mergedPayload: StagedCloudPayload = { ...payload };

    if (Array.isArray(existingRows) && existingRows.length > 0 && targetBpKey) {
      for (const row of existingRows) {
        if (!row?.encrypted_payload || !row?.iv || !row?.salt) continue;
        const oldDecrypted = await decryptStagingPayload(
          row.encrypted_payload,
          row.iv,
          row.salt,
          session.user.id,
          session.user.email
        );
        if (!oldDecrypted) continue;
        const oldKey = normalizeBpKey(
          oldDecrypted.targetDesktopBlueprint || oldDecrypted.blueprintName
        );
        if (oldKey && oldKey === targetBpKey) {
          matchingRowIdsToDelete.push(row.id);
          if (payload.isFullRigBlueprint) {
            continue;
          }
          const getModKey = (m: any) =>
            String(m?.dbId || m?.hash || m?.id || m?.name || m?.displayName || "")
              .trim()
              .toLowerCase();
          const addedMap = new Map<string, StagedArtifactItem>();
          const removedMap = new Map<string, StagedArtifactItem>();

          (oldDecrypted.items || []).forEach((it) => {
            const k = getModKey(it);
            if (k) addedMap.set(k, it);
          });
          (oldDecrypted.removedItems || []).forEach((it) => {
            const k = getModKey(it);
            if (k) removedMap.set(k, it);
          });
          (mergedPayload.items || []).forEach((it) => {
            const k = getModKey(it);
            if (!k) return;
            removedMap.delete(k);
            addedMap.set(k, it);
          });
          (mergedPayload.removedItems || []).forEach((it) => {
            const k = getModKey(it);
            if (!k) return;
            addedMap.delete(k);
            removedMap.set(k, it);
          });

          const nextItems = Array.from(addedMap.values()).map((it, idx) => ({
            ...it,
            load_order_index: idx,
          }));
          const nextRemoved = Array.from(removedMap.values());
          mergedPayload = {
            ...mergedPayload,
            targetDesktopBlueprint:
              mergedPayload.targetDesktopBlueprint ||
              oldDecrypted.targetDesktopBlueprint ||
              oldDecrypted.blueprintName,
            items: nextItems,
            removedItems: nextRemoved.length > 0 ? nextRemoved : undefined,
          };
        }
      }
    }

    if (matchingRowIdsToDelete.length > 0) {
      await supabase
        .from("citizen_staging_queue")
        .delete()
        .in("id", matchingRowIdsToDelete);
    }

    const { encrypted_payload, iv, salt } = await encryptStagingPayload(
      mergedPayload,
      session.user.id,
      session.user.email
    );

    const totalChanges =
      (mergedPayload.items?.length || 0) + (mergedPayload.removedItems?.length || 0);

    const ttlMs = mergedPayload.isFullRigBlueprint
      ? 7 * 24 * 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;

    const { data, error } = await supabase
      .from("citizen_staging_queue")
      .insert([
        {
          user_token: userToken,
          payload_type: mergedPayload.mode,
          encrypted_payload,
          iv,
          salt,
          item_count: totalChanges,
          expires_at: new Date(Date.now() + ttlMs).toISOString(),
        },
      ])
      .select("id")
      .single();

    if (error) throw error;
    if (!data?.id) {
      return {
        success: false,
        error: "Cloud staging queue unavailable for active workspace.",
      };
    }

    triggerPwaWebPush({
      type: "blueprint_staging",
      staging_token: userToken,
      title: "Blueprint Staged to Signature Queue",
      body: `${mergedPayload.blueprintName} (${totalChanges} items) • ${mergedPayload.sourceDevice}`,
    });

    if (mergedPayload.mode === "blueprint" && !mergedPayload.isFullRigBlueprint) {
      recordMobileBlueprintEdit(
        mergedPayload.targetDesktopBlueprint || mergedPayload.blueprintName,
        mergedPayload.items || [],
        mergedPayload.removedItems || []
      );
    }

    return { success: true, rowId: data?.id };
  } catch (err: any) {
    console.error("Failed to push encrypted staging payload:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function stageFullBlueprintToRigQueue(
  targetSet: any,
  modList: any[],
  activeGameSchema: any,
  session: any,
  selectedVersion?: string
): Promise<{ success: boolean; rowId?: string; count?: number; error?: string }> {
  if (!session?.user?.id) {
    return { success: false, error: "Authentication required" };
  }
  if (!targetSet || !Array.isArray(targetSet.mods)) {
    return { success: false, error: "Invalid Blueprint" };
  }

  try {
    let localOverrides: Record<string, any> = {};
    try {
      localOverrides = JSON.parse(localStorage.getItem("sanctuary_local_overrides") || "{}");
    } catch {}

    const safeModList = Array.isArray(modList) ? modList : [];
    const byExact = new Map<string, any>();
    const byCleanLower = new Map<string, any>();

    const registerLocalMod = (m: any) => {
      if (!m || !m.name) return;
      if (!byExact.has(m.name)) byExact.set(m.name, m);
      const lastSlash = Math.max(m.name.lastIndexOf("/"), m.name.lastIndexOf("\\"));
      const clean = (lastSlash >= 0 ? m.name.slice(lastSlash + 1) : m.name).toLowerCase();
      if (clean && !byCleanLower.has(clean)) byCleanLower.set(clean, m);
    };

    for (let i = 0; i < safeModList.length; i++) {
      const m = safeModList[i];
      if (!m) continue;
      if (m.isVirtual) {
        if (Array.isArray(m.flavors)) {
          m.flavors.forEach((fl: any) => {
            if (fl && !fl.isVirtual) registerLocalMod(fl);
          });
        }
        continue;
      }
      registerLocalMod(m);
    }

    const packagedLO = packageBlueprintLoadOrder(targetSet, activeGameSchema, safeModList);

    const rawModObjects = targetSet.mods
      .map((rawMod: any) => {
        const modName =
          typeof rawMod === "string" ? rawMod : String(rawMod?.name || rawMod?.path || "");
        if (
          !modName ||
          modName.startsWith("FOLDER_") ||
          modName.startsWith("SET_") ||
          modName.startsWith("LOCAL_SET_")
        ) {
          return null;
        }
        const lastSlash = Math.max(modName.lastIndexOf("/"), modName.lastIndexOf("\\"));
        const cleanName = lastSlash >= 0 ? modName.slice(lastSlash + 1) || modName : modName;
        const mod = byExact.get(modName) || byCleanLower.get(cleanName.toLowerCase());
        if (mod?.isVirtual) return null;

        const hash = String(
          mod?.hash || targetSet.modHashes?.[modName] || targetSet.modHashes?.[cleanName] || ""
        ).trim();
        const override = hash ? localOverrides[hash] : undefined;
        const meta = targetSet.modMeta?.[modName] || targetSet.modMeta?.[cleanName];

        return {
          id: hash || mod?.dbId || cleanName,
          dbId: mod?.dbId ? String(mod.dbId) : undefined,
          name: modName,
          displayName: override?.displayName || meta?.displayName || mod?.displayName || cleanName,
          hash,
          url:
            override?.url ||
            meta?.url ||
            mod?.download_url ||
            mod?.url ||
            "",
          manifest_url:
            override?.manifest_url ||
            meta?.manifest_url ||
            mod?.manifest_url ||
            undefined,
          author:
            override?.author ||
            meta?.author ||
            mod?.author ||
            mod?.master_author ||
            "Unknown",
          version: override?.version || meta?.version || mod?.version || "v.Local",
          description: override?.description ?? meta?.description ?? mod?.description ?? undefined,
          image_url: override?.image_url ?? meta?.image_url ?? mod?.image_url ?? undefined,
          category_override:
            override?.category_override ||
            meta?.category_override ||
            mod?.category_override ||
            mod?.category ||
            undefined,
          category:
            override?.category_override ||
            meta?.category_override ||
            mod?.category_override ||
            mod?.category ||
            undefined,
          requiredDLC: override?.requiredDLC || meta?.requiredDLC || mod?.requiredDLC || [],
          compatible_versions:
            override?.compatible_versions ||
            meta?.compatible_versions ||
            mod?.compatible_versions ||
            [],
          compliance_tier: sanitizeComplianceTierForLocal(
            mod?.compliance_tier ?? meta?.compliance_tier
          ),
          status: mod?.status || "stable",
          is_paid: Boolean(override?.is_paid ?? meta?.is_paid ?? mod?.is_paid ?? false),
          is_early_access: Boolean(
            override?.is_early_access ?? meta?.is_early_access ?? mod?.is_early_access ?? false
          ),
          isLocalOverride: Boolean(override || mod?.isLocalOverride),
        };
      })
      .filter(Boolean);

    const enrichedArtifacts: StagedArtifactItem[] =
      packagedLO.enrichAndSortArtifacts(rawModObjects);

    if (enrichedArtifacts.length === 0) {
      return {
        success: false,
        error: "Cannot stage an empty Blueprint with 0 linked items.",
      };
    }

    // Enrich any items that have a DNA hash and are missing a creator URL from Spoke mod_versions (Tier 0 / Tier 5 only)
    const hashesMissingUrl = Array.from(
      new Set(
        enrichedArtifacts
          .filter((it) => it.hash && !it.url)
          .map((it) => String(it.hash).trim())
          .filter(Boolean)
      )
    );

    if (hashesMissingUrl.length > 0) {
      const dbByHash = new Map<string, any>();
      const chunkSize = 60;
      const chunks: string[][] = [];
      for (let i = 0; i < hashesMissingUrl.length; i += chunkSize) {
        chunks.push(hashesMissingUrl.slice(i, i + chunkSize));
      }
      const batchConcurrency = 4;
      for (let b = 0; b < chunks.length; b += batchConcurrency) {
        const batch = chunks.slice(b, b + batchConcurrency);
        const results = await Promise.all(
          batch.map((chunk) =>
            supabase
              .from("mod_versions")
              .select(
                "dna_hash, version_label, mods(id, is_paid, is_early_access, url, master_author, compliance_tier, category_override)"
              )
              .in("dna_hash", chunk)
          )
        );
        results.forEach(({ data: vData }) => {
          if (Array.isArray(vData)) {
            vData.forEach((row: any) => {
              if (row?.dna_hash) dbByHash.set(String(row.dna_hash), row);
            });
          }
        });
      }

      if (dbByHash.size > 0) {
        for (let i = 0; i < enrichedArtifacts.length; i++) {
          const item = enrichedArtifacts[i];
          const dbRow = item.hash ? dbByHash.get(String(item.hash)) : undefined;
          if (!dbRow) continue;
          const modRef = Array.isArray(dbRow.mods) ? dbRow.mods[0] : dbRow.mods;
          if (!modRef) continue;
          const rawTier = Number(modRef.compliance_tier ?? 0);
          if (rawTier >= 1 && rawTier <= 4) continue;
          enrichedArtifacts[i] = {
            ...item,
            dbId: item.dbId || (modRef.id ? String(modRef.id) : undefined),
            url: item.url || modRef.url || "",
            author:
              !item.author || item.author === "Unknown"
                ? modRef.master_author || item.author
                : item.author,
            version:
              !item.version || item.version === "v.Local"
                ? dbRow.version_label || item.version
                : item.version,
            compliance_tier: sanitizeComplianceTierForLocal(
              item.compliance_tier ?? modRef.compliance_tier
            ),
            category: item.category || modRef.category_override || undefined,
            category_override: item.category_override || modRef.category_override || undefined,
            is_paid: item.is_paid ?? Boolean(modRef.is_paid),
            is_early_access: item.is_early_access ?? Boolean(modRef.is_early_access),
          };
        }
      }
    }

    const payload: StagedCloudPayload = {
      mode: "blueprint",
      isFullRigBlueprint: true,
      blueprintName: String(targetSet.name || "Blueprint"),
      targetDesktopBlueprint: String(targetSet.name || "Blueprint"),
      blueprintCode: targetSet.code || undefined,
      gameVersion: selectedVersion || "all",
      autoEquip: true,
      items: enrichedArtifacts,
      loadOrderStrategy: packagedLO.load_order_strategy,
      loadRules: packagedLO.load_rules,
      modTiers: packagedLO.mod_tiers,
      loadOrder: packagedLO.load_order,
      ignoredConflicts: packagedLO.ignored_conflicts,
      stagedAt: new Date().toISOString(),
      sourceDevice: getSourceDeviceLabel(),
    };

    const res = await pushEncryptedStagingPayload(payload, session);
    if (res.success && res.rowId) {
      // Mark completed on the sending rig so it doesn't prompt this rig to re-deploy its own Blueprint,
      // while remaining pending in the cloud for the user's Steam Deck / other rigs!
      markStagingRowDeployedLocally(res.rowId);

      // Immediately hydrate volatileSignatureQueues so the Rig Beam Pipeline UI updates instantaneously
      try {
        const optimisticResolved: ResolvedStagedPayload = {
          rowId: res.rowId,
          createdAt: payload.stagedAt,
          isCompletedLocally: true,
          payload,
          resolvedItems: enrichedArtifacts.map((it) => ({
            ...it,
            isOwned: true,
            localModName: it.name,
            localHash: it.hash,
            selected: true,
          })),
        };
        const modalState = useModalStore.getState();
        const targetKey = normalizeBpKey(
          payload.targetDesktopBlueprint || payload.blueprintName
        );
        const prevList = Array.isArray(modalState.volatileSignatureQueues)
          ? (modalState.volatileSignatureQueues as ResolvedStagedPayload[])
          : [];
        const filteredPrev = prevList.filter((q) => {
          if (q?.rowId === res.rowId) return false;
          const qKey = normalizeBpKey(
            q?.payload?.targetDesktopBlueprint || q?.payload?.blueprintName || ""
          );
          return !targetKey || qKey !== targetKey;
        });
        const nextQueues = [optimisticResolved, ...filteredPrev];
        modalState.setVolatileSignatureQueues(nextQueues);
        if (!modalState.volatileSignatureQueue) {
          modalState.setVolatileSignatureQueue(optimisticResolved);
        }
      } catch {}

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("sanctuary-poll-staging-queue"));
      }
      return { success: true, rowId: res.rowId, count: enrichedArtifacts.length };
    }
    return { success: false, error: res.error || "Failed to stage Blueprint" };
  } catch (err: any) {
    console.error("Failed to stage full Blueprint to Rig Queue:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

export async function shredCloudStagingRow(
  rowId?: string,
  session?: any
): Promise<boolean> {
  try {
    if (rowId) {
      await supabase.from("citizen_staging_queue").delete().eq("id", rowId);
      return true;
    }
    if (session?.user?.id) {
      const userToken = await deriveUserStagingToken(session.user.id, session.user.email);
      await supabase.from("citizen_staging_queue").delete().eq("user_token", userToken);
    }
    return true;
  } catch (err) {
    console.error("Failed to shred cloud staging row:", err);
    return false;
  }
}

const LOCAL_DEPLOYED_ROWS_KEY = "sanctuary_deployed_staging_rows";

export function markStagingRowDeployedLocally(rowId: string): void {
  if (!rowId) return;
  try {
    const raw = localStorage.getItem(LOCAL_DEPLOYED_ROWS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const next = Array.from(new Set([rowId, ...(Array.isArray(list) ? list : [])])).slice(0, 50);
    localStorage.setItem(LOCAL_DEPLOYED_ROWS_KEY, JSON.stringify(next));
  } catch {}
}

export function unmarkStagingRowDeployedLocally(rowId: string): void {
  if (!rowId) return;
  try {
    const raw = localStorage.getItem(LOCAL_DEPLOYED_ROWS_KEY);
    if (!raw) return;
    const list: string[] = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    const next = list.filter((id) => id !== rowId);
    localStorage.setItem(LOCAL_DEPLOYED_ROWS_KEY, JSON.stringify(next));
  } catch {}
}

export function isStagingRowDeployedLocally(rowId: string): boolean {
  if (!rowId) return false;
  try {
    const raw = localStorage.getItem(LOCAL_DEPLOYED_ROWS_KEY);
    if (!raw) return false;
    const list: string[] = JSON.parse(raw);
    return Array.isArray(list) && list.includes(rowId);
  } catch {
    return false;
  }
}

export function getSourceDeviceLabel(): string {
  if (isLinuxDesktop()) return "SteamOS / Linux Rig";
  if (isDesktop()) return "Windows / Desktop Rig";
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "PWA / Mobile";
  return "Web / PWA Client";
}

export async function deriveUserCompanionToken(
  userId: string,
  email?: string,
  explicitSecret?: string
): Promise<string> {
  const secret = await resolveStagingVaultSecret(userId, explicitSecret);
  const raw = `sanctuary_citizen_companion_v2:${userId}:${(email || "").trim().toLowerCase()}:${secret}`;
  const encoded = new TextEncoder().encode(raw);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(digest));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function pushEncryptedVaultCompanionSnapshot(
  snapshot: VaultCompanionSnapshot,
  session: any
): Promise<boolean> {
  if (!session?.user?.id) return false;
  try {
    const companionToken = await deriveUserCompanionToken(session.user.id, session.user.email);
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveAesGcmKey(session.user.id, session.user.email, salt);

    const rawPlaintext = new TextEncoder().encode(JSON.stringify(snapshot));
    const plaintext = await maybeCompressBytes(rawPlaintext);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      plaintext as unknown as BufferSource
    );

    await supabase
      .from("citizen_staging_queue")
      .delete()
      .eq("user_token", companionToken);

    const { error } = await supabase.from("citizen_staging_queue").insert([
      {
        user_token: companionToken,
        payload_type: "companion_radar",
        encrypted_payload: bytesToBase64(new Uint8Array(ciphertext)),
        iv: bytesToBase64(iv),
        salt: bytesToBase64(salt),
        item_count: 0,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ]);
    if (error) throw error;

    const crit = Number(snapshot.criticalCount || 0);
    const upds = Number(snapshot.updatesCount || 0);
    if (crit > 0 || upds > 0) {
      const summaryKey = `${crit}:${upds}`;
      let lastPushed = "";
      try {
        lastPushed = localStorage.getItem("sanctuary_last_pushed_companion_summary") || "";
      } catch {}
      if (summaryKey !== lastPushed) {
        try {
          localStorage.setItem("sanctuary_last_pushed_companion_summary", summaryKey);
        } catch {}
        const parts: string[] = [];
        if (crit > 0) parts.push(`${crit} Critical Failures`);
        if (upds > 0) parts.push(`${upds} Updates Available`);
        triggerPwaWebPush({
          type: "companion_radar",
          companion_token: companionToken,
          title: "Vault Companion Radar Alert",
          body: `${parts.join(" • ")}${snapshot.activeBlueprintName ? ` (${snapshot.activeBlueprintName})` : ""}`,
          unique_id: `companion_radar_${summaryKey}`,
        });
      }
    }

    return true;
  } catch (err) {
    console.warn("Failed to sync encrypted Vault Companion snapshot:", err);
    return false;
  }
}

export async function fetchEncryptedVaultCompanionSnapshots(
  session: any
): Promise<VaultCompanionSnapshot[]> {
  if (!session?.user?.id) return [];
  try {
    const companionToken = await deriveUserCompanionToken(session.user.id, session.user.email);
    const { data, error } = await supabase
      .from("citizen_staging_queue")
      .select("*")
      .eq("user_token", companionToken)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error || !Array.isArray(data) || data.length === 0) return [];

    const row = data[0];
    if (!row?.encrypted_payload || !row?.iv || !row?.salt) return [];
    const salt = base64ToBytes(row.salt);
    const iv = base64ToBytes(row.iv);
    const ciphertext = base64ToBytes(row.encrypted_payload);
    const key = await deriveAesGcmKey(session.user.id, session.user.email, salt);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );
    const decompressedBytes = await maybeDecompressBytes(new Uint8Array(decryptedBuffer));
    const parsed = JSON.parse(
      new TextDecoder().decode(decompressedBytes)
    ) as VaultCompanionSnapshot;
    if (parsed && Array.isArray(parsed.artifacts)) {
      // Statically poll any bound Edge Manifest URLs (especially for Tier 1-4 / unknown / local mods)
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const uniqueUrls = Array.from(
          new Set(
            parsed.artifacts
              .map((a) => a.manifestUrl)
              .filter(
                (u): u is string =>
                  Boolean(
                    u &&
                      /^https?:\/\//i.test(u) &&
                      !u.includes("example.com") &&
                      !u.includes("your-domain.com")
                  )
              )
          )
        ).slice(0, 25);

        if (uniqueUrls.length > 0) {
          const manifestByUrl = new Map<string, any>();
          await Promise.all(
            uniqueUrls.map(async (mUrl) => {
              try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 3500);
                const resp = await fetch(mUrl, { signal: ctrl.signal });
                clearTimeout(timer);
                if (resp.ok) {
                  const data = await resp.json();
                  if (data) manifestByUrl.set(mUrl, data);
                }
              } catch {}
            })
          );

          if (manifestByUrl.size > 0) {
            parsed.artifacts = parsed.artifacts.map((art) => {
              if (!art.manifestUrl || !manifestByUrl.has(art.manifestUrl)) return art;
              const rawJson = manifestByUrl.get(art.manifestUrl);
              const candidates = Array.isArray(rawJson)
                ? rawJson
                : Array.isArray(rawJson?.artifacts)
                  ? rawJson.artifacts
                  : Array.isArray(rawJson?.manifests)
                    ? rawJson.manifests
                    : null;
              const needle = String(art.displayName || art.name || "").toLowerCase();
              const manifest = candidates
                ? candidates.find(
                    (c: any) =>
                      String(c?.artifact?.id || "").toLowerCase() === needle ||
                      String(c?.artifact?.name || "").toLowerCase() === needle
                  ) || candidates[0]
                : rawJson;
              if (!manifest?.artifact) return art;

              const next = { ...art };
              const edgeStatus = String(
                manifest.artifact?.status ||
                  manifest.status ||
                  manifest.atomic_logic?.status ||
                  ""
              )
                .toLowerCase()
                .trim();
              if (edgeStatus === "broken" || edgeStatus === "corrupted" || edgeStatus === "obsolete") {
                next.status = edgeStatus;
                next.alertType = "critical";
              } else if (edgeStatus === "unstable") {
                next.status = "unstable";
                if (next.alertType !== "critical") next.alertType = "alert";
              }

              const latestVer = String(manifest.artifact?.version || "")
                .replace(/^v/i, "")
                .trim();
              const curVer = String(art.version || "")
                .replace(/^v/i, "")
                .trim();
              const latestSha = String(manifest.payload?.sha256 || "")
                .toLowerCase()
                .trim();
              const curSha = String(art.hash || "")
                .toLowerCase()
                .trim();
              const prevHashes: string[] = Array.isArray(manifest.previous_hashes)
                ? manifest.previous_hashes.map((h: any) => String(h).toLowerCase().trim())
                : [];

              if (
                (latestSha && curSha && latestSha !== curSha && prevHashes.includes(curSha)) ||
                (latestVer &&
                  curVer &&
                  curVer.toLowerCase() !== "local" &&
                  curVer.toLowerCase() !== ".local" &&
                  latestVer.toLowerCase() !== curVer.toLowerCase())
              ) {
                next.hasUpdate = true;
                next.newVersion = manifest.artifact?.version || next.newVersion;
                if (manifest.payload?.download_url) {
                  next.url = manifest.payload.download_url;
                }
              }
              return next;
            });
          }
        }
      }

      if (!Array.isArray(parsed.desktopBlueprints) || parsed.desktopBlueprints.length === 0) {
        try {
          const cachedBps = localStorage.getItem("sanctuary_cached_companion_blueprints");
          if (cachedBps) {
            const parsedCached = JSON.parse(cachedBps);
            if (Array.isArray(parsedCached) && parsedCached.length > 0) {
              parsed.desktopBlueprints = parsedCached;
            }
          }
        } catch {}
      } else {
        try {
          const slimBps = parsed.desktopBlueprints.map((bp) => ({
            name: bp.name,
            code: bp.code,
            isActive: bp.isActive,
            modsCount: bp.modsCount,
            artifactIndices: bp.artifactIndices,
          }));
          localStorage.setItem("sanctuary_cached_companion_blueprints", JSON.stringify(slimBps));
        } catch {}
      }

      if (Array.isArray(parsed.desktopBlueprints)) {
        const hydratedBps = parsed.desktopBlueprints.map((bp) => ({
          ...bp,
          artifacts: Array.isArray(bp.artifacts) && bp.artifacts.length > 0
            ? bp.artifacts
            : Array.isArray(bp.artifactIndices)
              ? bp.artifactIndices
                  .map((idx) => parsed.artifacts[idx])
                  .filter(Boolean)
              : [],
        }));
        parsed.desktopBlueprints = applyMobileEditsToBlueprints(hydratedBps, parsed.syncedAt);
        if (!parsed.blueprintsCount || parsed.blueprintsCount < parsed.desktopBlueprints.length) {
          parsed.blueprintsCount = parsed.desktopBlueprints.length;
        }
      }
      return [parsed];
    }
    return [];
  } catch (err) {
    console.warn("Failed to fetch Vault Companion snapshot:", err);
    return [];
  }
}

function toCompanionArtifact(
  m: any,
  overrideStatus?: string,
  overrideAlertType?: "critical" | "alert"
): VaultCompanionArtifact {
  const firstFlavor =
    Array.isArray(m?.flavors) && m.flavors.length > 0 ? m.flavors[0] : null;
  const resolvedHash = String(
    m?.hash || firstFlavor?.hash || m?.dbId || m?._groupedTitle || m?.name || ""
  ).trim();
  const resolvedDbId = m?.dbId
    ? String(m.dbId)
    : firstFlavor?.dbId
      ? String(firstFlavor.dbId)
      : undefined;
  const cleanName =
    String(m?._groupedTitle || m?.displayName || m?.meta_name || m?.name || "")
      .split(/[\\/]/)
      .pop() || resolvedHash;
  const activeSchema = useStore.getState()?.activeGameSchema;
  const rawCompat =
    Array.isArray(m?.compatible_versions)
      ? m.compatible_versions
      : Array.isArray(m?.compatibleVersions)
        ? m.compatibleVersions
        : Array.isArray(firstFlavor?.compatible_versions)
          ? firstFlavor.compatible_versions
          : undefined;
  const compatibleVersions = Array.isArray(rawCompat)
    ? Array.from(new Set(rawCompat.map((v: any) => String(v || "").trim()).filter(Boolean)))
    : undefined;
  const isScript = Boolean(
    m?.isScript ||
      m?.is_script ||
      isScriptExtension(String(m?.name || cleanName), activeSchema)
  );
  return {
    hash: resolvedHash,
    dbId: resolvedDbId,
    name: cleanName,
    displayName: m?._groupedTitle || m?.displayName || m?.meta_name || cleanName,
    author: m?.author || firstFlavor?.author || undefined,
    version: m?.version || firstFlavor?.version || undefined,
    status: overrideStatus || m?.status || "stable",
    isEquipped: true,
    hasUpdate: Boolean(m?.hasUpdate),
    newVersion:
      m?.newVersion ||
      (Array.isArray(m?.flavors)
        ? m.flavors.find((fl: any) => fl?.newVersion)?.newVersion
        : undefined) ||
      undefined,
    url: m?.download_url || m?.url || firstFlavor?.url || undefined,
    manifestUrl: m?.manifest_url || firstFlavor?.manifest_url || undefined,
    complianceTier: typeof m?.compliance_tier === "number" ? m.compliance_tier : undefined,
    category: m?.category_override || m?.category || m?.type || undefined,
    compatibleVersions: compatibleVersions && compatibleVersions.length > 0 ? compatibleVersions : undefined,
    isScript: isScript || undefined,
    alertType: overrideAlertType,
    alertReason: m?._issue_label || m?.status_reason || undefined,
  };
}

let lastCompanionSyncSignature = "";
let lastCompanionSyncAt = 0;
let inFlightCompanionSync: Promise<boolean> | null = null;

export async function syncDesktopCompanionRadarSnapshot(
  modList: any[],
  session: any,
  activeBlueprintName?: string,
  gameVersion?: string,
  exactDesktopSummary?: {
    vaultCount?: number;
    criticalCount?: number;
    alertsCount?: number;
    updatesCount?: number;
    blueprintsCount?: number;
    criticalItems?: any[];
    alertItems?: any[];
    updateItems?: any[];
    playSets?: any[];
  }
): Promise<boolean> {
  if (!isDesktop() || !session?.user?.id) return false;
  if (localStorage.getItem("sanctuary_local_only") === "true") return false;
  if (localStorage.getItem("sanctuary_cloud_companion_sync") === "false") return false;

  const storePlaySets = useStore.getState()?.playSets;
  const candidatePlaySets = Array.isArray(exactDesktopSummary?.playSets)
    ? exactDesktopSummary!.playSets!
    : Array.isArray(storePlaySets)
      ? storePlaySets
      : [];

  const syncSig = [
    session.user.id,
    activeBlueprintName || "",
    gameVersion || "",
    Array.isArray(modList) ? modList.length : 0,
    exactDesktopSummary?.vaultCount ?? -1,
    exactDesktopSummary?.criticalCount ?? -1,
    exactDesktopSummary?.alertsCount ?? -1,
    exactDesktopSummary?.updatesCount ?? -1,
    exactDesktopSummary?.blueprintsCount ?? candidatePlaySets.length,
    Array.isArray(exactDesktopSummary?.criticalItems) ? 1 : 0,
  ].join("|");

  if (
    syncSig === lastCompanionSyncSignature &&
    Date.now() - lastCompanionSyncAt < 15_000
  ) {
    return true;
  }
  if (inFlightCompanionSync) {
    try {
      await inFlightCompanionSync;
    } catch {}
    if (
      syncSig === lastCompanionSyncSignature &&
      Date.now() - lastCompanionSyncAt < 15_000
    ) {
      return true;
    }
  }

  const safeList = Array.isArray(modList) ? modList : [];
  const virtualFolderIds = new Set<string>();
  safeList.forEach((v: any) => {
    if (!v?.isVirtual || !v.dbId) return;
    const dbIdStr = String(v.dbId);
    if (dbIdStr === "undefined" || dbIdStr === "null") return;
    if (
      (v.hash?.startsWith("local_set_") || v.name?.startsWith("LOCAL_SET_")) &&
      !dbIdStr.startsWith("f_") &&
      !dbIdStr.startsWith("local_")
    ) {
      return;
    }
    virtualFolderIds.add(dbIdStr);
  });

  const criticalKeySet = new Set<string>();
  const alertKeySet = new Set<string>();
  const updateMap = new Map<string, any>();

  (exactDesktopSummary?.criticalItems || []).forEach((m: any) => {
    const k = String(m.dbId || m.hash || m._groupedTitle || m.displayName || m.name || "").toLowerCase();
    if (k) criticalKeySet.add(k);
  });
  (exactDesktopSummary?.alertItems || []).forEach((m: any) => {
    const k = String(m.dbId || m.hash || m._groupedTitle || m.displayName || m.name || "").toLowerCase();
    if (k) alertKeySet.add(k);
  });
  (exactDesktopSummary?.updateItems || []).forEach((m: any) => {
    const k = String(m.dbId || m.hash || m.displayName || m.name || "").toLowerCase();
    if (k) updateMap.set(k, m);
  });

  const topLevelVaultItems: VaultCompanionArtifact[] = [];
  const addedTopKeys = new Set<string>();
  const nameToTopIndex = new Map<string, number>();

  const activeSchema = useStore.getState()?.activeGameSchema;
  const schemaSupportedExts: string[] = Array.isArray(activeSchema?.extensions?.supported)
    ? activeSchema.extensions.supported
        .map((ext: any) => String(ext || "").trim().toLowerCase().replace(/^\./, ""))
        .filter(Boolean)
    : [];
  const escapedExts = schemaSupportedExts.map((e) =>
    e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const supportedExtRegex =
    escapedExts.length > 0 ? new RegExp(`\\.(${escapedExts.join("|")})$`, "i") : null;
  const stripSupportedExt = (fileName?: string): string | undefined => {
    if (!fileName) return undefined;
    if (supportedExtRegex) {
      return fileName.replace(supportedExtRegex, "");
    }
    return fileName.replace(/\.[^/.]+$/, "");
  };

  for (let i = 0; i < safeList.length; i++) {
    const mod = safeList[i];
    if (!mod) continue;
    if (mod.isVirtual && (mod.hash?.startsWith("local_set_") || mod.name?.startsWith("LOCAL_SET_"))) {
      const dbIdStr = String(mod.dbId || "");
      if (!dbIdStr.startsWith("f_") && !dbIdStr.startsWith("local_")) continue;
    }
    if (!mod.isVirtual && mod.name) {
      const lowName = String(mod.name).toLowerCase();
      const isModBinary = supportedExtRegex
        ? supportedExtRegex.test(lowName)
        : /\.[a-z0-9]{1,16}$/i.test(lowName);
      if (!isModBinary) continue;
    }
    const modNameUpper = String(mod.displayName || mod.meta_name || mod.name || mod.title || "")
      .toUpperCase()
      .trim();
    const baseModName =
      modNameUpper.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, "") || modNameUpper;
    if (baseModName === "FILTERS") continue;
    if (!mod.isVirtual) {
      const folderExists =
        (mod.familyId && virtualFolderIds.has(String(mod.familyId))) ||
        (mod.setId && virtualFolderIds.has(String(mod.setId)));
      if (folderExists) continue;
    }

    const firstFlavor = Array.isArray(mod.flavors) && mod.flavors.length > 0 ? mod.flavors[0] : null;
    const resolvedHash = String(mod.hash || firstFlavor?.hash || mod.dbId || mod.name || "").trim();
    const resolvedDbId = mod.dbId
      ? String(mod.dbId)
      : firstFlavor?.dbId
        ? String(firstFlavor.dbId)
        : undefined;
    const cleanName =
      String(mod.displayName || mod.meta_name || mod.name || "").split(/[\\/]/).pop() ||
      resolvedHash;

    const kDb = resolvedDbId ? resolvedDbId.toLowerCase() : "";
    const kHash = resolvedHash.toLowerCase();
    const kTitle = String(mod.displayName || mod.name || "").toLowerCase();

    const isCrit =
      (kDb && criticalKeySet.has(kDb)) ||
      (kHash && criticalKeySet.has(kHash)) ||
      (kTitle && criticalKeySet.has(kTitle)) ||
      String(mod.status || "").toLowerCase() === "broken" ||
      String(mod.status || "").toLowerCase() === "corrupted";
    const isAlrt =
      !isCrit &&
      ((kDb && alertKeySet.has(kDb)) ||
        (kHash && alertKeySet.has(kHash)) ||
        (kTitle && alertKeySet.has(kTitle)) ||
        String(mod.status || "").toLowerCase() === "unstable");

    const matchedUpd =
      (kDb && updateMap.get(kDb)) ||
      (kHash && updateMap.get(kHash)) ||
      (kTitle && updateMap.get(kTitle));
    const hasFlavorUpdate =
      Array.isArray(mod.flavors) && mod.flavors.some((fl: any) => Boolean(fl?.hasUpdate));
    const hasUpd = Boolean(matchedUpd || mod.hasUpdate || hasFlavorUpdate);

    const dedupKey = kDb || kHash || kTitle;
    if (dedupKey) addedTopKeys.add(dedupKey);

    const rawCompat =
      Array.isArray(mod.compatible_versions)
        ? mod.compatible_versions
        : Array.isArray(mod.compatibleVersions)
          ? mod.compatibleVersions
          : Array.isArray(firstFlavor?.compatible_versions)
            ? firstFlavor.compatible_versions
            : undefined;
    const compatibleVersions = Array.isArray(rawCompat)
      ? Array.from(new Set(rawCompat.map((v: any) => String(v || "").trim()).filter(Boolean)))
      : undefined;
    const modIsScript = Boolean(
      mod.isScript ||
        mod.is_script ||
        isScriptExtension(String(mod.name || cleanName), activeSchema)
    );

    const topIdx = topLevelVaultItems.length;
    topLevelVaultItems.push({
      hash: resolvedHash,
      dbId: resolvedDbId,
      name: cleanName,
      displayName: mod.displayName || mod.meta_name || cleanName,
      author: mod.author || firstFlavor?.author || undefined,
      version: mod.version || firstFlavor?.version || undefined,
      status: isCrit ? "broken" : isAlrt ? "unstable" : mod.status || "stable",
      isEquipped: Boolean(mod.enabled || mod.inActivePlayset || mod.isEquipped),
      hasUpdate: hasUpd,
      newVersion:
        matchedUpd?.newVersion ||
        mod.newVersion ||
        (Array.isArray(mod.flavors)
          ? mod.flavors.find((fl: any) => fl?.newVersion)?.newVersion
          : undefined) ||
        undefined,
      url: mod.download_url || mod.url || firstFlavor?.url || undefined,
      manifestUrl: mod.manifest_url || firstFlavor?.manifest_url || undefined,
      complianceTier: typeof mod.compliance_tier === "number" ? mod.compliance_tier : undefined,
      category: mod.category_override || mod.category || mod.type || undefined,
      compatibleVersions: compatibleVersions && compatibleVersions.length > 0 ? compatibleVersions : undefined,
      isScript: modIsScript || undefined,
      alertType: isCrit ? "critical" : isAlrt ? "alert" : undefined,
    });

    const registerLookup = (rawStr?: string) => {
      if (!rawStr) return;
      const low = String(rawStr).toLowerCase().replace(/\\/g, "/");
      if (!nameToTopIndex.has(low)) nameToTopIndex.set(low, topIdx);
      const base = low.split("/").pop();
      if (base && !nameToTopIndex.has(base)) nameToTopIndex.set(base, topIdx);
      const noExt = stripSupportedExt(base);
      if (noExt && !nameToTopIndex.has(noExt)) nameToTopIndex.set(noExt, topIdx);
    };
    registerLookup(mod.name);
    registerLookup(mod.displayName);
    registerLookup(cleanName);
    if (Array.isArray(mod.flavors)) {
      mod.flavors.forEach((fl: any) => {
        registerLookup(fl?.name);
        registerLookup(fl?.displayName);
      });
    }
  }

  const criticalArtifacts = Array.isArray(exactDesktopSummary?.criticalItems)
    ? exactDesktopSummary!.criticalItems!.map((m) =>
        toCompanionArtifact(m, "broken", "critical")
      )
    : undefined;
  const alertArtifacts = Array.isArray(exactDesktopSummary?.alertItems)
    ? exactDesktopSummary!.alertItems!.map((m) =>
        toCompanionArtifact(m, "unstable", "alert")
      )
    : undefined;
  const updateArtifacts = Array.isArray(exactDesktopSummary?.updateItems)
    ? exactDesktopSummary!.updateItems!.map((m) => ({
        ...toCompanionArtifact(m, m?.status || "stable"),
        hasUpdate: true,
      }))
    : undefined;

  let effectivePlaySets: any[] = candidatePlaySets;
  if (effectivePlaySets.length === 0) {
    try {
      const wsId =
        localStorage.getItem("sanctuary_active_workspace") ||
        useStore.getState()?.activeWorkspaceId ||
        "";
      const rawSaved = wsId ? localStorage.getItem(`sanctuary_${wsId}_playsets`) : null;
      if (rawSaved) {
        const parsedSaved = JSON.parse(rawSaved);
        if (Array.isArray(parsedSaved)) {
          effectivePlaySets = parsedSaved;
        }
      }
    } catch {}
  }

  const desktopBlueprints: VaultCompanionDesktopBlueprint[] | undefined =
    effectivePlaySets.length > 0
      ? effectivePlaySets.map((ps: any) => {
          const rawMods = Array.isArray(ps?.mods) ? ps.mods : [];
          const matchedIdxSet = new Set<number>();
          rawMods.forEach((rm: any) => {
            const rawName = typeof rm === "string" ? rm : String(rm?.name || rm?.path || "");
            if (!rawName) return;
            const clean = rawName
              .replace(/^[1-4]_[A-Za-z]+_/i, "")
              .toLowerCase()
              .replace(/\\/g, "/");
            const base = clean.split("/").pop() || clean;
            const noExt = stripSupportedExt(base) || base;
            const idx =
              nameToTopIndex.get(clean) ??
              nameToTopIndex.get(base) ??
              nameToTopIndex.get(noExt);
            if (idx !== undefined) {
              matchedIdxSet.add(idx);
            }
          });
          const indices = Array.from(matchedIdxSet);
          return {
            name: String(ps?.name || "Blueprint"),
            code: ps?.code || undefined,
            isActive: Boolean(
              activeBlueprintName &&
                String(ps?.name || "").toLowerCase() === activeBlueprintName.toLowerCase()
            ),
            modsCount: indices.length > 0 ? indices.length : rawMods.length,
            artifactIndices: indices,
          };
        })
      : undefined;

  const snapshot: VaultCompanionSnapshot = {
    activeBlueprintName: activeBlueprintName || undefined,
    gameVersion: gameVersion || undefined,
    syncedAt: new Date().toISOString(),
    vaultCount: exactDesktopSummary?.vaultCount ?? topLevelVaultItems.length,
    criticalCount: exactDesktopSummary?.criticalCount ?? criticalArtifacts?.length,
    alertsCount: exactDesktopSummary?.alertsCount ?? alertArtifacts?.length,
    updatesCount: exactDesktopSummary?.updatesCount ?? updateArtifacts?.length,
    blueprintsCount: exactDesktopSummary?.blueprintsCount ?? desktopBlueprints?.length,
    criticalArtifacts,
    alertArtifacts,
    updateArtifacts,
    desktopBlueprints,
    artifacts: topLevelVaultItems,
  };

  const pushPromise = pushEncryptedVaultCompanionSnapshot(snapshot, session)
    .then((ok) => {
      if (ok) {
        lastCompanionSyncSignature = syncSig;
        lastCompanionSyncAt = Date.now();
      }
      return ok;
    })
    .finally(() => {
      if (inFlightCompanionSync === pushPromise) {
        inFlightCompanionSync = null;
      }
    });

  inFlightCompanionSync = pushPromise;
  return pushPromise;
}


