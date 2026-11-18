import { invoke } from "@tauri-apps/api/core";
import { isDesktop } from "../envUtils";
import { supabaseAuth, supabase } from "../../supabase";
import { useStore } from "../../store";
import { pullEncryptedSupporterVault, pushEncryptedSupporterVault } from "../stagingCrypto";
import { SUPPORTER_CLOUD_PULL_TTL_MS, lastCloudSupporterPullByUser, inFlightCloudSupporterPull, sanitizeTombstoneMap, mergeSupporterVaultStates, readFallbackVault, writeFallbackVault, getInstalledBuildMeta, type LocalMasonFollow, type LocalMasonSupporter, type LocalSpokeSupporter, type LocalSupporterStatePayload } from "./typesAndHelpers";

export async function syncSupporterVaultWithCloud(
  state: LocalSupporterStatePayload,
  effectiveVault: string,
  effectiveUser: string,
  forcePush = false
): Promise<LocalSupporterStatePayload> {
  const localOnly =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("sanctuary_local_only") === "true";
  if (localOnly || (typeof navigator !== "undefined" && !navigator.onLine)) {
    return state;
  }
  const session = useStore.getState().session;
  if (!session?.user?.id || session.user.id !== effectiveUser) {
    return state;
  }

  const nowMs = Date.now();
  const lastPulled = lastCloudSupporterPullByUser.get(effectiveUser) || 0;
  if (!forcePush && nowMs - lastPulled < SUPPORTER_CLOUD_PULL_TTL_MS) {
    return state;
  }

  const existingTask = inFlightCloudSupporterPull.get(effectiveUser);
  if (existingTask && !forcePush) {
    await existingTask.catch(() => {});
    const refreshed = readFallbackVault(effectiveUser);
    return {
      ...state,
      follows: refreshed.follows,
      supporters: refreshed.supporters,
      spoke_supporters: refreshed.spoke_supporters || [],
      removed_follows: refreshed.removed_follows,
      removed_supporters: refreshed.removed_supporters,
    };
  }

  const runTask = (async () => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const fallbackSnap = readFallbackVault(effectiveUser);
    const localRmFollows = sanitizeTombstoneMap(
      state.removed_follows || fallbackSnap.removed_follows,
      nowSecs
    );
    const localRmSupporters = sanitizeTombstoneMap(
      state.removed_supporters || fallbackSnap.removed_supporters,
      nowSecs
    );

    const remote = await pullEncryptedSupporterVault(session);
    lastCloudSupporterPullByUser.set(effectiveUser, Date.now());

    const merged = mergeSupporterVaultStates(
      state.follows,
      state.supporters,
      state.spoke_supporters || [],
      localRmFollows,
      localRmSupporters,
      remote,
      nowSecs
    );

    state.follows = merged.follows;
    state.supporters = merged.supporters;
    state.spoke_supporters = merged.spokeSupporters;
    state.removed_follows = merged.removedFollows;
    state.removed_supporters = merged.removedSupporters;

    if (merged.changedLocal) {
      writeFallbackVault(state);
      if (isDesktop() && effectiveVault && effectiveVault !== "web") {
        await invoke("import_synced_supporter_vault", {
          vaultPath: effectiveVault,
          follows: merged.follows,
          supporters: merged.supporters,
          removedFollowIds: Object.keys(merged.removedFollows),
          removedSupporterIds: Object.keys(merged.removedSupporters),
        }).catch(() => {});
      }
    }

    if (forcePush || merged.changedRemote) {
      await pushEncryptedSupporterVault(
        {
          version: 1,
          syncedAt: new Date().toISOString(),
          follows: merged.follows,
          supporters: merged.supporters,
          spokeSupporters: merged.spokeSupporters,
          removedFollowKeys: merged.removedFollows,
          removedSupporterKeys: merged.removedSupporters,
        },
        session
      );
    }
  })();

  inFlightCloudSupporterPull.set(effectiveUser, runTask);
  try {
    await runTask;
  } finally {
    if (inFlightCloudSupporterPull.get(effectiveUser) === runTask) {
      inFlightCloudSupporterPull.delete(effectiveUser);
    }
  }
  return state;
}


export async function getSupporterState(
  vaultPath?: string,
  userId?: string,
): Promise<LocalSupporterStatePayload> {
  const effectiveVault = vaultPath || useStore.getState().vaultPath || "";
  const effectiveUser =
    userId || useStore.getState().session?.user?.id || "local_citizen";
  const isAuthenticatedUser = Boolean(
    effectiveUser && effectiveUser !== "local_citizen",
  );

  let state: LocalSupporterStatePayload = readFallbackVault(effectiveUser);

  if (isDesktop() && effectiveVault && effectiveVault !== "web") {
    try {
      const sqliteState = await invoke<LocalSupporterStatePayload>(
        "get_local_supporter_state",
        {
          vaultPath: effectiveVault,
          userId: effectiveUser,
        },
      );
      if (sqliteState) {
        const rmFollows = state.removed_follows || {};
        const rmSupporters = state.removed_supporters || {};
        const fbSpokeSupporters = Array.isArray(state.spoke_supporters)
          ? state.spoke_supporters
          : [];
        state = {
          ...sqliteState,
          follows: (sqliteState.follows || []).filter(
            (f) => !(rmFollows[f.mason_id] && rmFollows[f.mason_id] >= Number(f.followed_at || 0))
          ),
          supporters: (sqliteState.supporters || []).filter(
            (s) =>
              !(rmSupporters[s.mason_id] && rmSupporters[s.mason_id] >= Number(s.verified_at || 0))
          ),
          spoke_supporters: Array.isArray((sqliteState as any).spoke_supporters)
            ? (sqliteState as any).spoke_supporters
            : fbSpokeSupporters,
          removed_follows: rmFollows,
          removed_supporters: rmSupporters,
          dev_build: isAuthenticatedUser
            ? sqliteState.dev_build
            : {
                user_id: "local_citizen",
                dev_build_until: 0,
                donation_credit_cents: 0,
                total_months_unlocked: 0,
                channel_enabled: false,
                updated_at: Math.floor(Date.now() / 1000),
              },
        };
        writeFallbackVault(state);
      }
    } catch (err) {
      console.warn("SQLite supporter state fallback:", err);
    }
  }

  if (!isAuthenticatedUser) {
    state.dev_build = {
      user_id: "local_citizen",
      dev_build_until: 0,
      donation_credit_cents: 0,
      total_months_unlocked: 0,
      channel_enabled: false,
      updated_at: Math.floor(Date.now() / 1000),
    };
    return state;
  }

  // Sync cumulative Global Dev Build status from Hub profile if authenticated & online
  const localOnly = localStorage.getItem("sanctuary_local_only") === "true";
  if (!localOnly && navigator.onLine && isAuthenticatedUser) {
    try {
      const client = supabaseAuth || supabase;
      const { data: profile } = await client
        .from("profiles")
        .select(
          "dev_build_until, donation_credit_cents, total_months_unlocked, web_dev_channel_enabled, role",
        )
        .eq("id", effectiveUser)
        .maybeSingle();

      if (profile) {
        const cloudUntilSecs = profile.dev_build_until
          ? Math.floor(new Date(profile.dev_build_until).getTime() / 1000)
          : 0;
        const cloudCredit = Number(profile.donation_credit_cents || 0);
        const cloudMonths = Number(profile.total_months_unlocked || 0);
        const cloudWebChannel =
          typeof (profile as any).web_dev_channel_enabled === "boolean"
            ? Boolean((profile as any).web_dev_channel_enabled)
            : undefined;
        const localChannelPref = localStorage.getItem("sanctuary_dev_build_channel");
        const resolvedChannelEnabled =
          localChannelPref === "true"
            ? true
            : localChannelPref === "false"
              ? false
              : cloudWebChannel !== undefined
                ? cloudWebChannel
                : state.dev_build.channel_enabled;

        if (
          cloudUntilSecs > state.dev_build.dev_build_until ||
          cloudMonths > state.dev_build.total_months_unlocked ||
          cloudCredit !== state.dev_build.donation_credit_cents ||
          resolvedChannelEnabled !== state.dev_build.channel_enabled
        ) {
          state.dev_build = {
            ...state.dev_build,
            user_id: effectiveUser,
            dev_build_until: Math.max(
              state.dev_build.dev_build_until,
              cloudUntilSecs,
            ),
            donation_credit_cents:
              cloudUntilSecs >= state.dev_build.dev_build_until
                ? cloudCredit
                : Math.max(state.dev_build.donation_credit_cents || 0, cloudCredit),
            total_months_unlocked: Math.max(
              state.dev_build.total_months_unlocked,
              cloudMonths,
            ),
            channel_enabled: resolvedChannelEnabled,
            updated_at: Math.floor(Date.now() / 1000),
          };
          writeFallbackVault(state);
          if (isDesktop() && effectiveVault && effectiveVault !== "web") {
            await invoke("stack_local_dev_build_donation", {
              vaultPath: effectiveVault,
              userId: effectiveUser,
              amountCents: 0,
              channelEnabled: state.dev_build.channel_enabled,
              overrideUntil: state.dev_build.dev_build_until,
              overrideCreditCents: state.dev_build.donation_credit_cents,
              overrideTotalMonths: state.dev_build.total_months_unlocked,
            }).catch(() => {});
          }
        }
      }
    } catch {
      // Cloud profile may not have new columns yet; rely on local SQLite state
    }

    try {
      state = await syncSupporterVaultWithCloud(state, effectiveVault, effectiveUser, false);
    } catch {
      // Non-fatal E2EE multi-rig sync warning
    }
  }

  return state;
}

export async function toggleLocalFollow(params: {
  masonId: string;
  masonName: string;
  avatarUrl?: string;
  workspaceId?: string;
}): Promise<boolean> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const now = Math.floor(Date.now() / 1000);

  let isFollowingNow = false;

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    try {
      isFollowingNow = await invoke<boolean>("toggle_local_mason_follow", {
        vaultPath,
        masonId: params.masonId,
        masonName: params.masonName || "",
        avatarUrl: params.avatarUrl || "",
        workspaceId:
          params.workspaceId || useStore.getState().activeWorkspaceId || "",
      });
    } catch (e) {
      console.warn("SQLite toggle_local_mason_follow fallback:", e);
    }
  }

  const fallback = readFallbackVault(userId);
  const existingIdx = fallback.follows.findIndex(
    (f) => f.mason_id === params.masonId,
  );
  if (!isDesktop() || !vaultPath || vaultPath === "web") {
    isFollowingNow = existingIdx === -1;
  }

  fallback.removed_follows = fallback.removed_follows || {};
  if (isFollowingNow) {
    delete fallback.removed_follows[params.masonId];
    const nextEntry: LocalMasonFollow = {
      mason_id: params.masonId,
      mason_name: params.masonName || "",
      avatar_url: params.avatarUrl || "",
      workspace_id:
        params.workspaceId || useStore.getState().activeWorkspaceId || "",
      notify_alerts: true,
      followed_at: now,
    };
    if (existingIdx === -1) {
      fallback.follows.unshift(nextEntry);
    } else {
      fallback.follows[existingIdx] = nextEntry;
    }
  } else {
    fallback.removed_follows[params.masonId] = now;
    if (existingIdx !== -1) {
      fallback.follows.splice(existingIdx, 1);
    }
  }
  writeFallbackVault(fallback);

  if (userId && userId !== "local_citizen") {
    lastCloudSupporterPullByUser.delete(userId);
    void syncSupporterVaultWithCloud(fallback, vaultPath, userId, true);
  }

  return isFollowingNow;
}


export async function removeLocalMasonSupporterBridge(
  masonId: string,
): Promise<void> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const now = Math.floor(Date.now() / 1000);

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    await invoke("remove_local_mason_supporter", {
      vaultPath,
      masonId,
    }).catch(() => {});
  }

  const fallback = readFallbackVault(userId);
  fallback.removed_supporters = fallback.removed_supporters || {};
  fallback.removed_supporters[masonId] = now;
  fallback.supporters = fallback.supporters.filter(
    (s) => s.mason_id !== masonId,
  );
  writeFallbackVault(fallback);
  if (userId && userId !== "local_citizen") {
    lastCloudSupporterPullByUser.delete(userId);
    void syncSupporterVaultWithCloud(fallback, vaultPath, userId, true);
  }
}

export async function clearExpiredLocalMasonSupporters(
  expiredMasonIds?: string[],
): Promise<LocalMasonSupporter[]> {
  const vaultPath = useStore.getState().vaultPath || "";
  const userId = useStore.getState().session?.user?.id || "local_citizen";
  const now = Math.floor(Date.now() / 1000);

  const fallback = readFallbackVault(userId);
  const idsToClear =
    Array.isArray(expiredMasonIds) && expiredMasonIds.length > 0
      ? expiredMasonIds
      : fallback.supporters
          .filter((s) => Boolean(s.expires_at && s.expires_at <= now))
          .map((s) => s.mason_id);

  if (isDesktop() && vaultPath && vaultPath !== "web") {
    await Promise.all(
      idsToClear.map((masonId) =>
        invoke("remove_local_mason_supporter", {
          vaultPath,
          masonId,
        }).catch(() => {}),
      ),
    );
  }

  fallback.removed_supporters = fallback.removed_supporters || {};
  for (const id of idsToClear) {
    fallback.removed_supporters[id] = now;
  }
  const idSet = new Set(idsToClear);
  fallback.supporters = fallback.supporters.filter(
    (s) =>
      !idSet.has(s.mason_id) && !(s.expires_at && s.expires_at <= now),
  );
  writeFallbackVault(fallback);
  if (userId && userId !== "local_citizen") {
    lastCloudSupporterPullByUser.delete(userId);
    void syncSupporterVaultWithCloud(fallback, vaultPath, userId, true);
  }
  return fallback.supporters;
}


export function isFoundryPatron(
  supporterState?: LocalSupporterStatePayload | null,
): boolean {
  if (!supporterState?.dev_build) return false;
  return (
    (supporterState.dev_build.total_months_unlocked || 0) > 0 ||
    (supporterState.dev_build.dev_build_until || 0) > 0 ||
    (supporterState.dev_build.donation_credit_cents || 0) > 0
  );
}


export function isClientOnDevBuildStream(
  supporterState?: LocalSupporterStatePayload | number | null,
): boolean {
  if (typeof localStorage !== "undefined") {
    const lsPref = localStorage.getItem("sanctuary_dev_build_channel");
    if (lsPref === "true") return true;
    if (lsPref === "false") return false;
  }
  if (
    supporterState &&
    typeof supporterState === "object" &&
    supporterState.dev_build?.channel_enabled
  ) {
    return true;
  }
  try {
    const envChannel = String(
      (import.meta as any)?.env?.VITE_BUILD_CHANNEL ||
        (import.meta as any)?.env?.MODE ||
        "",
    ).toLowerCase();
    if (envChannel === "dev" || envChannel === "beta") {
      return true;
    }
  } catch {
    // ignore
  }
  const installedMeta = getInstalledBuildMeta();
  if (installedMeta?.channel === "dev") return true;
  return false;
}


export function findLocalMasonSupporterPass(
  supporters: LocalMasonSupporter[],
  masonId?: string | null,
  masonName?: string | null,
): LocalMasonSupporter | null {
  const now = Math.floor(Date.now() / 1000);
  const normId = (masonId || "").trim().toLowerCase();
  const normName = (masonName || "").trim().toLowerCase();

  return (
    supporters.find((s) => {
      if (s.expires_at && s.expires_at < now) return false;
      const sId = (s.mason_id || "").trim().toLowerCase();
      const sName = (s.mason_name || "").trim().toLowerCase();
      if (normId && (sId === normId || sName === normId)) return true;
      if (normName && (sName === normName || sId === normName)) return true;
      return false;
    }) || null
  );
}


export function isSpokeSupporter(
  supporterState?: LocalSupporterStatePayload | null,
  spokeIdOrName?: string | null
): LocalSpokeSupporter | null {
  const list = supporterState?.spoke_supporters;
  if (!Array.isArray(list) || list.length === 0) return null;
  const now = Math.floor(Date.now() / 1000);
  const norm = String(spokeIdOrName || "").trim().toLowerCase();
  return (
    list.find((s) => {
      if (s?.expires_at && s.expires_at < now) return false;
      if (!norm) return true;
      return (
        String(s?.spoke_id || "").trim().toLowerCase() === norm ||
        String(s?.spoke_name || "").trim().toLowerCase() === norm
      );
    }) || null
  );
}

export function findAnyActiveMasonSupporterPasses(
  supporterState?: LocalSupporterStatePayload | null
): LocalMasonSupporter[] {
  const list = supporterState?.supporters;
  if (!Array.isArray(list) || list.length === 0) return [];
  const now = Math.floor(Date.now() / 1000);
  return list.filter((s) => !s?.expires_at || s.expires_at >= now);
}

