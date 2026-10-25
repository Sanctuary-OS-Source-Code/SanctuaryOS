import { useState, useMemo, useEffect } from "react";
import {
  formatDisplayName,
  SidePanel,
  SidePanelHeroCard,
  SidePanelPillToggle,
  UniversalGroup,
  StatBox,
  PanelHeaderGroup,
  PanelHeaderButton,
  ActionButton,
  getNormalizedArtifactName,
} from "./shared";
import { useLexicon } from "./LexiconContext";
import { useStore } from "./store";
import { createPortal } from "react-dom";
import { supabase } from "./supabase";
import { useModalStore } from "./store/modalStore";
import { packageBlueprintLoadOrder } from "./hooks/usePlaySetLogic";

const VAULT_CHIP_CLASS =
  "px-2.5 py-1 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--text)] flex items-center gap-1.5 shrink-0";

export default function BlueprintMatrix({
  isOpen,
  onClose,
  playSet,
  modList,
  onUpload,
  onUpdatePlaySet,
}: any) {
  const { t } = useLexicon();
  const { session, activeGameSchema } = useStore();
  const [isPublic, setIsPublic] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [isMarketListed, setIsMarketListed] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (isOpen && playSet) {
      setGeneratedCode(playSet.code || null);
      setIsPublic(playSet.is_public ?? true);
      setIsLocked(playSet.is_locked ?? false);
      setIsMarketListed(playSet.is_market_listed ?? false);
      setUploadError("");
      setUploadSuccess(false);
      setIsUploading(false);

      const fetchCloudState = async () => {
        try {
          let query = supabase
            .from("blueprints")
            .select("code, is_public, is_locked, is_market_listed");
          if (playSet.code) {
            query = query.eq("code", playSet.code);
          } else {
            const sessionResult = await supabase.auth.getSession();
            const activeSession = sessionResult.data?.session;
            if (!activeSession) return;

            let { data: masonData } = await supabase
              .from("masons")
              .select("id")
              .eq("profile_id", activeSession.user.id)
              .maybeSingle();

            if (!masonData) {
              const username = activeSession.user.user_metadata?.username;
              if (!username) return;
              const { data: byName } = await supabase
                .from("masons")
                .select("id")
                .ilike("name", username)
                .maybeSingle();
              masonData = byName;
            }

            if (!masonData) return;
            query = query.eq("mason_id", masonData.id).ilike("name", playSet.name);
          }
          const { data } = await query.maybeSingle();
          if (data) {
            setGeneratedCode(data.code);
            setIsPublic(data.is_public);
            setIsLocked(data.is_locked);
            setIsMarketListed(data.is_market_listed);
          }
        } catch (e) {
          console.warn("Failed to sync matrix settings with cloud", e);
        }
      };
      fetchCloudState();
    }
  }, [isOpen, playSet]);

  const modLookup = useMemo(() => {
    if (!isOpen || !Array.isArray(modList) || modList.length === 0) return null;
    const byExact = new Map<string, any>();
    const byCleanLower = new Map<string, any>();
    let byNorm: Map<string, any> | null = null;

    for (let i = 0; i < modList.length; i++) {
      const m = modList[i];
      if (!m || !m.name) continue;
      if (!byExact.has(m.name)) byExact.set(m.name, m);
      const lastSlash = Math.max(m.name.lastIndexOf("/"), m.name.lastIndexOf("\\"));
      const clean = lastSlash >= 0 ? m.name.slice(lastSlash + 1) : m.name;
      const cleanLow = clean.toLowerCase();
      if (!byCleanLower.has(cleanLow)) byCleanLower.set(cleanLow, m);
    }

    const findMod = (modName: string, cleanLower: string, norm: string) => {
      const exact = byExact.get(modName);
      if (exact) return exact;
      const cleanMatch = byCleanLower.get(cleanLower);
      if (cleanMatch) return cleanMatch;
      if (!byNorm) {
        byNorm = new Map<string, any>();
        for (let i = 0; i < modList.length; i++) {
          const m = modList[i];
          if (!m || !m.name) continue;
          const n = getNormalizedArtifactName(m.name);
          if (n && !byNorm.has(n)) byNorm.set(n, m);
        }
      }
      return byNorm.get(norm);
    };

    return { findMod };
  }, [isOpen, modList]);

  const { allowedMods, blockedMods, packagedLoadOrder } = useMemo(() => {
    if (!isOpen || !playSet) return { allowedMods: [], blockedMods: [], packagedLoadOrder: null };
    const allowed: any[] = [];
    const blocked: any[] = [];
    const packagedLO = packageBlueprintLoadOrder(playSet, activeGameSchema);

    const seenNames = new Set<string>();
    const modsArr = Array.isArray(playSet.mods) ? playSet.mods : [];
    const modHashes = playSet.modHashes;
    const modMeta = playSet.modMeta;
    const unknownAuthor = t("unknown", "Unknown");

    for (let i = 0; i < modsArr.length; i++) {
      const rawEntry = modsArr[i];
      const modName = typeof rawEntry === "string" ? rawEntry : rawEntry?.name || "";
      if (
        !modName ||
        modName.startsWith("FOLDER_") ||
        modName.startsWith("SET_") ||
        modName.startsWith("LOCAL_SET_")
      ) {
        continue;
      }

      const lastSlash = Math.max(modName.lastIndexOf("/"), modName.lastIndexOf("\\"));
      const cleanName = lastSlash >= 0 ? modName.slice(lastSlash + 1) || modName : modName;
      const norm = getNormalizedArtifactName(cleanName);
      if (!norm || seenNames.has(norm)) continue;
      seenNames.add(norm);

      const mod = modLookup ? modLookup.findMod(modName, cleanName.toLowerCase(), norm) : undefined;
      if (mod?.isVirtual) continue;

      const entry = {
        name: modName,
        hash: mod?.hash || modHashes?.[modName] || modHashes?.[cleanName] || "",
        url: mod?.url || modMeta?.[modName]?.url || modMeta?.[cleanName]?.url || "",
        author:
          mod?.author || modMeta?.[modName]?.author || modMeta?.[cleanName]?.author || unknownAuthor,
        compliance_tier: mod?.compliance_tier || 0,
        displayName: mod?.displayName,
        isVirtual: mod?.isVirtual,
      };

      if (entry.compliance_tier >= 1 && entry.compliance_tier <= 5) {
        blocked.push(entry);
      } else {
        const lower = modName.toLowerCase();
        if (lower.includes("customchallenge_")) {
          allowed.push(entry);
        } else if (
          !lower.includes("merged") &&
          !lower.includes("simmatticly") &&
          !lower.includes("batch fix") &&
          !lower.includes("batch_fix")
        ) {
          allowed.push(entry);
        }
      }
    }

    return {
      allowedMods: packagedLO.enrichAndSortArtifacts(allowed),
      blockedMods: blocked,
      packagedLoadOrder: packagedLO,
    };
  }, [isOpen, playSet, modLookup, activeGameSchema, t]);

  const handleUpload = async () => {
    setIsUploading(true);
    setUploadError("");
    setUploadSuccess(false);
    const code = await onUpload(isPublic, isLocked, allowedMods, isMarketListed);
    if (code) {
      setGeneratedCode(code);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
      useStore
        .getState()
        .pushStatus(t("matrix_uplink_success", "Blueprint uplinked successfully!"), "success");
      navigator.clipboard.writeText(code).catch(() => {});
    } else {
      setUploadError(t("err_save_failed", "Failed to save blueprint"));
    }
    setIsUploading(false);
  };

  const isGuest = !session;
  const isBanned = localStorage.getItem("sanctuary_blacklisted") === "true";
  const hasViolations = blockedMods.length > 0;
  const showDefconAlert = useModalStore((state: any) => state.showDefconAlert);
  const isUploadBlocked = isGuest || isBanned || hasViolations || showDefconAlert;

  if (!isOpen || !playSet) return null;

  const handleRemoveArtifact = (modName: string) => {
    if (!playSet || !onUpdatePlaySet) return;
    const targetNorm = getNormalizedArtifactName(modName);
    const updatedMods = (playSet.mods || []).filter((m: any) => {
      const mName = typeof m === "string" ? m : m?.name || "";
      return getNormalizedArtifactName(mName) !== targetNorm;
    });
    onUpdatePlaySet({ ...playSet, mods: updatedMods });
  };

  const handleRemoveAllViolating = () => {
    if (!playSet || !onUpdatePlaySet) return;
    const violatingNorms = new Set(blockedMods.map((m: any) => getNormalizedArtifactName(m.name)));
    const updatedMods = (playSet.mods || []).filter((m: any) => {
      const mName = typeof m === "string" ? m : m?.name || "";
      return !violatingNorms.has(getNormalizedArtifactName(mName));
    });
    onUpdatePlaySet({ ...playSet, mods: updatedMods });
  };

  const blockedReasonTooltip = isBanned
    ? t("alert_comm_banned", "Communications Banned")
    : showDefconAlert
      ? t("alert_defcon_blocked", "Alert Active")
      : hasViolations
        ? t("tooltip_uplink_blocked_title", "Uplink Blocked")
        : isGuest
          ? t("alert_guest_mode_uploads", "Guest Mode")
          : isUploading
            ? t("scanning", "Scanning...")
            : t("matrix_btn_upload", "Sync To {Nexus}");

  return createPortal(
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("matrix_title", "{Blueprint} Sync")}
      subtitle={t("matrix_subtitle", "Configure cloud visibility and security parameters")}
      icon={t("icon_cloud_upload", "cloud_upload")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[90vw] md:w-[680px]"
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={isUploading ? t("icon_sync", "sync") : t("icon_cloud_upload", "cloud_upload")}
            variant={isUploadBlocked ? "danger" : "accent"}
            disabled={isUploading || isUploadBlocked}
            onClick={handleUpload}
            tooltip={blockedReasonTooltip}
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_cloud_upload", "cloud_upload")}
          overline={t("matrix_title", "{Blueprint} Sync")}
          title={playSet.name}
          description={t(
            "matrix_subtitle",
            "Configure cloud visibility and security parameters before generating an uplink code."
          )}
          badge={generatedCode || t("status_active", "Ready")}
          badgeIcon={
            hasViolations
              ? t("icon_warning_amber", "warning_amber")
              : t("icon_check_circle", "check_circle")
          }
          variant={hasViolations ? "danger" : "accent"}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-1">
            <StatBox
              label={t("term_mods", "Allowed Artifacts")}
              value={allowedMods.length}
              icon={t("icon_check_circle", "check_circle")}
              iconColorClass="text-[var(--success)]"
            />
            <StatBox
              label={t("matrix_tier_warning_title", "Restricted")}
              value={blockedMods.length}
              icon={t("icon_warning_amber", "warning_amber")}
              iconColorClass={blockedMods.length > 0 ? "text-[var(--danger)]" : "text-[var(--subtext)]"}
            />
            <StatBox
              label={t("load_order_queue", "Load Rules")}
              value={packagedLoadOrder?.load_rules?.length || 0}
              icon={t("icon_low_priority", "low_priority")}
              iconColorClass="text-[var(--accent)]"
            />
          </div>
        </SidePanelHeroCard>

        <UniversalGroup
          title={t("matrix_title", "{Blueprint} Sync")}
          icon={t("icon_tune", "tune")}
        >
          <div className="flex flex-col gap-3">
            {/* Public / Private */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SidePanelPillToggle
                checked={isPublic}
                onChange={() => setIsPublic(true)}
                label={t("matrix_public", "Public")}
                icon={t("icon_public", "public")}
                variant="success"
              />
              <SidePanelPillToggle
                checked={!isPublic}
                onChange={() => setIsPublic(false)}
                label={t("matrix_private", "Private")}
                icon={t("icon_visibility_off", "visibility_off")}
                variant="accent"
              />
            </div>
            <p className="text-[11px] font-bold text-[var(--subtext)] px-1">
              {isPublic
                ? t("matrix_public_desc", "{Blueprint} visible to all {Citizens} on the {Nexus}.")
                : t("matrix_private_desc", "{Blueprint} restricted to your account.")}
            </p>

            {/* Locked / Unlocked */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <SidePanelPillToggle
                checked={isLocked}
                onChange={() => setIsLocked(true)}
                label={t("matrix_locked", "Locked")}
                icon={t("icon_lock", "lock")}
                variant="danger"
              />
              <SidePanelPillToggle
                checked={!isLocked}
                onChange={() => setIsLocked(false)}
                label={t("matrix_unlocked", "Unlocked")}
                icon={t("icon_lock_open", "lock_open")}
                variant="success"
              />
            </div>
            <p className="text-[11px] font-bold text-[var(--subtext)] px-1">
              {isLocked
                ? t("matrix_locked_desc", "Prevent modifications after syncing this blueprint.")
                : t(
                    "matrix_unlocked_desc",
                    "Allow users to customize this blueprint after syncing."
                  )}
            </p>

            {/* Market Listed / Unlisted */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[color-mix(in_srgb,var(--text)_6%,transparent)]">
              <SidePanelPillToggle
                checked={isMarketListed}
                onChange={() => setIsMarketListed(true)}
                label={t("matrix_market", "{Nexus} Listing")}
                icon={t("icon_storefront", "storefront")}
                variant="success"
              />
              <SidePanelPillToggle
                checked={!isMarketListed}
                onChange={() => setIsMarketListed(false)}
                label={t("matrix_market_off", "Unlisted")}
                icon={t("icon_visibility_off", "visibility_off")}
                variant="accent"
              />
            </div>
            <p className="text-[11px] font-bold text-[var(--subtext)] px-1">
              {isMarketListed
                ? t("matrix_market_desc", "{Blueprint} is visible on the public {Nexus}.")
                : t("matrix_market_off_desc", "{Blueprint} is hidden from the {Nexus}.")}
            </p>
          </div>
        </UniversalGroup>

        {blockedMods.length > 0 && (
          <UniversalGroup
            title={t("matrix_tier_warning_title", "Restricted Artifacts Detected")}
            icon={t("icon_warning_amber", "warning_amber")}
            headerColorClass="text-[var(--danger)]"
            headerAction={
              <button
                type="button"
                onClick={handleRemoveAllViolating}
                className="px-3 h-7 rounded-lg glass-surface border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] hover:border-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] text-[9px] font-black uppercase tracking-wider text-[var(--danger)] inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined !text-[13px]">
                  {t("icon_delete_sweep", "delete_sweep")}
                </span>
                <span>{t("matrix_btn_remove_all", "Remove All")}</span>
              </button>
            }
          >
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-bold text-[var(--danger)] opacity-80">
                {t("matrix_tier_warning_desc", "The following {mods} violate process compliance and cannot be synced:")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {blockedMods.map((mod: any) => (
                  <div
                    key={mod.name}
                    className="flex flex-col justify-between gap-2.5 p-3.5 glass-surface rounded-2xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_35%,transparent)] transition-all group/item"
                  >
                    <div className="flex items-start justify-between gap-2.5 min-w-0">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined !text-[18px]">
                            {t("icon_gpp_bad", "gpp_bad")}
                          </span>
                        </div>
                        <span className="text-xs font-black text-[var(--text)] truncate">
                          {formatDisplayName(mod.name)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveArtifact(mod.name)}
                        className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] hover:border-[color-mix(in_srgb,var(--danger)_45%,transparent)] text-[var(--subtext)] hover:text-[var(--danger)] flex items-center justify-center transition-all cursor-pointer shrink-0"
                      >
                        <span className="material-symbols-outlined !text-[16px]">
                          {t("icon_delete", "delete")}
                        </span>
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 pt-2 border-t border-[rgba(var(--text-rgb),0.06)]">
                      <span className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--danger)_40%,transparent)] !text-[var(--danger)]`}>
                        <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                          {t("icon_shield", "shield")}
                        </span>
                        <span>
                          {t("stat_tier", "Tier")} {mod.compliance_tier}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </UniversalGroup>
        )}

        {packagedLoadOrder && (
          <UniversalGroup
            title={t("load_order_queue", "Load Order Queue")}
            icon={t("icon_low_priority", "low_priority")}
            headerAction={
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_description", "description")}
                </span>
                <span>{packagedLoadOrder.compiled.manifestFile}</span>
              </span>
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_extension", "extension")}
                </span>
                <span>
                  {packagedLoadOrder.load_order.length} {t("term_mods", "Items")}
                </span>
              </span>
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--accent)]">
                  {t("icon_low_priority", "low_priority")}
                </span>
                <span>
                  {Object.keys(packagedLoadOrder.mod_tiers).length}{" "}
                  {t("lo_priority_tier", "Priority Tier")}
                </span>
              </span>
              <span className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--warning)]">
                  {t("icon_tune", "tune")}
                </span>
                <span>
                  {packagedLoadOrder.load_rules.length}{" "}
                  {t("load_order_rules", "Load Order Rules")}
                </span>
              </span>
            </div>
          </UniversalGroup>
        )}

        <UniversalGroup
          title={t("sidebar_uplink", "Uplink Code")}
          icon={t("icon_qr_code_2", "qr_code_2")}
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <input
                readOnly
                value={generatedCode || ""}
                placeholder={t("matrix_code_placeholder", "Click uplink to generate code...")}
                className="flex-1 glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] rounded-xl px-4 py-3 text-[var(--text)] font-mono font-bold tracking-widest text-center focus:outline-none"
              />
              <ActionButton
                variant={isCopied ? "success" : "glass"}
                disabled={!generatedCode || isCopied}
                icon={isCopied ? t("icon_check", "check") : t("icon_content_copy", "content_copy")}
                label={isCopied ? t("copied", "Copied") : t("btn_copy", "Copy")}
                onClick={() => {
                  if (generatedCode) {
                    navigator.clipboard
                      .writeText(generatedCode)
                      .then(() => {
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      })
                      .catch(() => {});
                  }
                }}
              />
            </div>

            <ActionButton
              variant="glass"
              className="w-full justify-center"
              disabled={isUploading || isUploadBlocked}
              icon={isUploading ? t("icon_sync", "sync") : t("icon_cloud_upload", "cloud_upload")}
              label={
                isUploading
                  ? t("scanning", "Scanning...")
                  : t("matrix_btn_upload", "Sync To {Nexus}")
              }
              onClick={handleUpload}
            />

            {uploadError && (
              <span className="text-[10px] font-black text-[var(--danger)] capitalize tracking-widest flex items-center justify-center gap-2">
                <span className="material-symbols-outlined !text-[14px]">
                  {t("icon_error", "error")}
                </span>
                {uploadError}
              </span>
            )}
            {uploadSuccess && (
              <div className="flex justify-center">
                <div className={`${VAULT_CHIP_CLASS} !border-[color-mix(in_srgb,var(--success)_40%,transparent)] !text-[var(--success)]`}>
                  <span className="material-symbols-outlined !text-[12px] text-[var(--success)]">
                    {t("icon_check_circle", "check_circle")}
                  </span>
                  <span>
                    {t("matrix_uplink_success", "Blueprint uplinked successfully!")}
                  </span>
                </div>
              </div>
            )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>,
    document.body
  );
}
