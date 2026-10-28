import {
  HubOverviewLanding,
  HubOverviewSection,
  SidePanelHeroCard,
  SidePanelPillToggle,
  UniversalGroup,
  UniversalInput,
  UniversalTextArea,
} from "./components/universal/UniversalLayout";
import { useState, useEffect } from "react";
import { supabase, supabaseAuth } from "./supabase";
import { useLexicon } from "./LexiconContext";
import {
  CustomDropdown,
  SidePanel,
  StatBox,
  EmptyState,
  ActionButton,
  PanelHeaderGroup,
  PanelHeaderButton,
  VAULT_CHIP_CLASS,
} from "./shared";
import { UniversalCard } from "./components/universal/UniversalCard";
import { ElevatedHubLayout } from "./components/layouts/ElevatedHubLayout";
import { useStore } from "./store";
import { logArchitectAction } from "./lib/audit";

export const ROLES = ["citizen", "mason", "architect", "oversight", "wayfinder"];

const getRoleMeta = (role: string, t: any) => {
  const r = (role || "citizen").toLowerCase();
  if (r === "mason") {
    return {
      icon: t("icon_architecture", "architecture"),
      iconColor: "text-[var(--success)]",
      colorVar: "var(--success)",
    };
  }
  if (r === "architect" || r === "core_dev") {
    return {
      icon: t("icon_engineering", "engineering"),
      iconColor: "text-[var(--accent)]",
      colorVar: "var(--accent)",
    };
  }
  if (r === "wayfinder" || r === "oversight") {
    return {
      icon: t("icon_admin_panel_settings", "admin_panel_settings"),
      iconColor: "text-[var(--warning)]",
      colorVar: "var(--warning)",
    };
  }
  if (r === "keeper" || r === "admin") {
    return {
      icon: t("icon_admin_panel_settings", "admin_panel_settings"),
      iconColor: "text-[var(--accent)]",
      colorVar: "var(--accent)",
    };
  }
  return {
    icon: t("icon_person", "person"),
    iconColor: "text-[var(--subtext)]",
    colorVar: "var(--subtext)",
  };
};

export function CustomRoleSelect({ value, onChange, roles, isBlacklisted }: any) {
  const { t } = useLexicon();
  const options = roles.map((r: string) => ({
    id: r,
    label: t(`role_${r.toLowerCase()}`, r.replace(/_/g, " ").toUpperCase()),
  }));
  return (
    <div
      className={`w-full ${
        isBlacklisted
          ? "[&_button]:!bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] [&_button]:!border-[color-mix(in_srgb,var(--danger)_30%,transparent)] [&_button]:!text-[var(--danger)]"
          : ""
      }`}
    >
      <CustomDropdown
        disableTint={true}
        value={value}
        options={options}
        onChange={(v: string[]) => onChange(v[0])}
        placeholder={t("select_role", "Select Role")}
      />
    </div>
  );
}

export function ProfileSearchDropdown({ value, onChange, profiles }: any) {
  const { t } = useLexicon();
  const options = [
    {
      id: "__unlinked__",
      label: t("unlinked_profile", "Unlinked Profile"),
    },
    ...(profiles || []).map((p: any) => ({
      id: p.id,
      label: `${p.username || t("unknown", "Unknown")} (${t(
        `role_${(p.role || "citizen").toLowerCase()}`,
        (p.role || "citizen").toUpperCase()
      )})`,
    })),
  ];

  return (
    <div className="w-full">
      <CustomDropdown
        disableTint={true}
        searchable={true}
        value={value || "__unlinked__"}
        options={options}
        onChange={(vals: string[]) => {
          const picked = Array.isArray(vals) ? vals[0] : vals;
          onChange(!picked || picked === "__unlinked__" ? null : picked);
        }}
        placeholder={t("unlinked_profile", "Unlinked Profile")}
      />
    </div>
  );
}

const EMPTY_ARRAY: any[] = [];

export function SharedIdentityEditor({
  profile,
  mason = null,
  isCreateMason = false,
  allProfiles = EMPTY_ARRAY,
  allMasons = EMPTY_ARRAY,
  onClose,
  onUpdated,
  isWayfinder = false,
  isSkinny = false,
  isKeepers = false,
  backdropZ,
  panelZ,
}: {
  profile?: any;
  mason?: any;
  isCreateMason?: boolean;
  allProfiles?: any[];
  allMasons?: any[];
  onClose: () => void;
  onUpdated: () => void;
  isWayfinder?: boolean;
  isSkinny?: boolean;
  isKeepers?: boolean;
  backdropZ?: string;
  panelZ?: string;
}) {
  const { t } = useLexicon();
  const [editRole, setEditRole] = useState("citizen");
  const [isBanned, setIsBanned] = useState(false);
  const [isCommBanned, setIsCommBanned] = useState(false);
  const [editReason, setEditReason] = useState("");
  const [editCommReason, setEditCommReason] = useState("");

  // Mason Linking State
  const [enableMasonLink, setEnableMasonLink] = useState(false);
  const [activeMasonId, setActiveMasonId] = useState<string | null>(null);
  const [masonName, setMasonName] = useState("");
  const [linkedProfileId, setLinkedProfileId] = useState<string | null>(null);
  const [isMasonVerified, setIsMasonVerified] = useState(false);
  const [localProfiles, setLocalProfiles] = useState<any[]>(allProfiles);
  const [localMasons, setLocalMasons] = useState<any[]>(allMasons);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  const isOpen = Boolean(profile || mason || isCreateMason);
  const currentUser = useStore((state) => state.session?.user);

  // Ensure profiles & masons are available even when opened standalone (e.g., from Audit Logs)
  useEffect(() => {
    if (!isOpen || isKeepers) return;
    if (allProfiles.length > 0) setLocalProfiles(allProfiles);
    if (allMasons.length > 0) setLocalMasons(allMasons);

    if (allProfiles.length === 0 || allMasons.length === 0) {
      Promise.all([
        supabase.from("profiles").select("*").order("username"),
        supabase.from("masons").select("*").order("name"),
      ]).then(([profRes, masonRes]) => {
        if (profRes.data) setLocalProfiles(profRes.data);
        if (masonRes.data) setLocalMasons(masonRes.data);
      });
    }
  }, [isOpen, isKeepers, allProfiles, allMasons]);

  // Synchronize initial state when panel opens
  useEffect(() => {
    if (!isOpen) return;
    setStatus("");

    if (isCreateMason) {
      setEnableMasonLink(true);
      setActiveMasonId(null);
      setMasonName("");
      setLinkedProfileId(null);
      setIsMasonVerified(true);
      setEditRole("citizen");
      setIsBanned(false);
      setIsCommBanned(false);
      setEditReason("");
      setEditCommReason("");
      return;
    }

    if (mason) {
      setEnableMasonLink(true);
      setActiveMasonId(mason.id);
      setMasonName(mason.name || "");
      setLinkedProfileId(mason.profile_id || null);
      setIsMasonVerified(Boolean(mason.is_verified));

      const matchedProfile =
        localProfiles.find((p: any) => p.id === mason.profile_id) ||
        allProfiles.find((p: any) => p.id === mason.profile_id) ||
        profile ||
        null;

      setEditRole(matchedProfile?.role || (mason.is_verified ? "mason" : "citizen"));
      setIsBanned(Boolean(matchedProfile?.is_banned));
      setIsCommBanned(Boolean(matchedProfile?.is_comm_banned));
      setEditReason(matchedProfile?.blacklist_reason || "");
      setEditCommReason(matchedProfile?.comm_blacklist_reason || "");
      return;
    }

    if (profile) {
      setEditRole(profile.role || "citizen");
      setIsBanned(Boolean(profile.is_banned));
      setIsCommBanned(Boolean(profile.is_comm_banned));
      setEditReason(profile.blacklist_reason || "");
      setEditCommReason(profile.comm_blacklist_reason || "");

      const matchedMason =
        localMasons.find((m: any) => m.profile_id === profile.id) ||
        allMasons.find((m: any) => m.profile_id === profile.id) ||
        null;

      if (matchedMason) {
        setEnableMasonLink(true);
        setActiveMasonId(matchedMason.id);
        setMasonName(matchedMason.name || profile.username || "");
        setLinkedProfileId(profile.id);
        setIsMasonVerified(Boolean(matchedMason.is_verified));
      } else {
        setEnableMasonLink(false);
        setActiveMasonId(null);
        setMasonName(profile.username || "");
        setLinkedProfileId(profile.id);
        setIsMasonVerified(false);
      }
    }
  }, [isOpen, profile, mason, isCreateMason, localMasons.length, localProfiles.length]);

  // Resolve currently active profile (either passed directly or linked via dropdown)
  const effectiveProfile =
    (linkedProfileId
      ? localProfiles.find((p: any) => p.id === linkedProfileId) ||
        allProfiles.find((p: any) => p.id === linkedProfileId)
      : null) || profile;

  // When changing linkedProfileId in Mason mode, hydrate that profile's role & ban state
  const handleSelectLinkedProfile = (newProfId: string | null) => {
    setLinkedProfileId(newProfId);
    if (newProfId) {
      const found =
        localProfiles.find((p: any) => p.id === newProfId) ||
        allProfiles.find((p: any) => p.id === newProfId);
      if (found) {
        if (!masonName.trim() && found.username) {
          setMasonName(found.username);
        }
        setEditRole(
          isMasonVerified && (!found.role || found.role === "citizen")
            ? "mason"
            : found.role || "citizen"
        );
        setIsBanned(Boolean(found.is_banned));
        setIsCommBanned(Boolean(found.is_comm_banned));
        setEditReason(found.blacklist_reason || "");
        setEditCommReason(found.comm_blacklist_reason || "");
      }
    }
  };

  const isEditingSelf = Boolean(
    effectiveProfile?.id && currentUser?.id === effectiveProfile.id
  );
  const isLockedStaffProfile = Boolean(
    !isWayfinder &&
      !isKeepers &&
      effectiveProfile &&
      ["oversight", "wayfinder"].includes(effectiveProfile.role)
  );

  const handleCommitUnified = async () => {
    if (effectiveProfile) {
      if (isEditingSelf && editRole !== effectiveProfile.role) {
        setStatus(t("err_self_role_modify", "Action denied: You cannot modify your own role."));
        return;
      }
      if (isBanned && !editReason.trim()) {
        setStatus(t("err_upload_ban_reason", "Reason is required for upload ban."));
        return;
      }
      if (isCommBanned && !editCommReason.trim()) {
        setStatus(t("err_comms_ban_reason", "Reason is required for comms ban."));
        return;
      }
    }

    const shouldSaveMason =
      !isKeepers &&
      Boolean(
        isMasonVerified ||
          enableMasonLink ||
          activeMasonId ||
          mason ||
          isCreateMason
      );

    if (shouldSaveMason) {
      const resolvedMasonName = (
        masonName.trim() ||
        effectiveProfile?.username ||
        ""
      ).trim();
      if (!resolvedMasonName) {
        setStatus(t("err_mason_name_req", "{Mason} name is required."));
        return;
      }
    }

    setIsSubmitting(true);
    setStatus(t("identities_updating", "Updating..."));

    try {
      // 1. Keepers Core Mode
      if (isKeepers && effectiveProfile) {
        const res = await supabaseAuth
          .from("profiles")
          .update({
            role: editRole,
            is_banned: isBanned,
            blacklist_reason: isBanned ? editReason : null,
          })
          .eq("id", effectiveProfile.id)
          .select();

        if (res.error || !res.data || res.data.length === 0) {
          throw res.error || new Error(t("permission_denied", "Permission Denied."));
        }

        await supabase.rpc("secure_sync_hub_ban_to_spokes", {
          p_target_user_id: effectiveProfile.id,
        });

        await logArchitectAction(
          isBanned ? `Banned User (Upload)` : `Updated role to ${editRole}`,
          "profiles",
          effectiveProfile.username || effectiveProfile.id,
          isBanned ? editReason : "Role Update",
          "Keepers Core",
          true,
          {
            role: { from: effectiveProfile.role || "citizen", to: editRole },
            is_banned: { from: Boolean(effectiveProfile.is_banned), to: Boolean(isBanned) },
          }
        );

        setStatus(t("identities_updated", "Identity updated."));
        onUpdated();
        setTimeout(() => {
          onClose();
          setIsSubmitting(false);
        }, 900);
        return;
      }

      // 2. Spoke Mode: Save Mason Linking / Verification if active
      let targetRoleToApply = editRole;
      if (shouldSaveMason) {
        const cleanMasonName = (
          masonName.trim() ||
          effectiveProfile?.username ||
          ""
        ).trim();
        const targetProfileId =
          linkedProfileId !== undefined
            ? linkedProfileId
            : profile?.id || null;

        if (activeMasonId) {
          const prevMason =
            mason || localMasons.find((m: any) => m.id === activeMasonId);
          const { error: mErr } = await supabase
            .from("masons")
            .update({
              name: cleanMasonName,
              profile_id: targetProfileId,
              is_verified: isMasonVerified,
            })
            .eq("id", activeMasonId);
          if (mErr) throw mErr;

          // If previous profile was unlinked, demote previous citizen if their role was mason
          if (
            prevMason?.profile_id &&
            prevMason.profile_id !== targetProfileId
          ) {
            const oldProf = localProfiles.find(
              (p: any) => p.id === prevMason.profile_id
            );
            if (oldProf && oldProf.role === "mason") {
              await supabase.rpc("secure_update_spoke_profile", {
                p_target_user_id: prevMason.profile_id,
                p_updates: { role: "citizen" },
              });
            }
          }
        } else {
          // Check if an unlinked mason with this exact name exists or insert a new one
          const existingUnlinked = localMasons.find(
            (m: any) =>
              (!m.profile_id || m.profile_id === targetProfileId) &&
              String(m.name || "").toLowerCase() === cleanMasonName.toLowerCase()
          );
          if (existingUnlinked) {
            const { error: mErr } = await supabase
              .from("masons")
              .update({
                name: cleanMasonName,
                profile_id: targetProfileId,
                is_verified: isMasonVerified,
              })
              .eq("id", existingUnlinked.id);
            if (mErr) throw mErr;
          } else {
            const { error: mErr } = await supabase.from("masons").insert({
              name: cleanMasonName,
              profile_id: targetProfileId,
              is_verified: isMasonVerified,
            });
            if (mErr) throw mErr;
          }
        }

        if (isMasonVerified && targetRoleToApply === "citizen") {
          targetRoleToApply = "mason";
        } else if (!isMasonVerified && !targetProfileId && targetRoleToApply === "mason") {
          targetRoleToApply = "citizen";
        }

        await logArchitectAction(
          activeMasonId ? "Updated Mason Link & Verification" : "Created & Linked Mason Entity",
          "masons",
          cleanMasonName,
          `Linked Profile: ${targetProfileId || "Unlinked"} | Verified: ${isMasonVerified}`,
          "Identity & Masons",
          false,
          {
            name: { to: cleanMasonName },
            profile_id: { to: targetProfileId || null },
            is_verified: { to: Boolean(isMasonVerified) },
          }
        );
      }

      // 3. Spoke Mode: Save Profile Role & Bans if a profile is selected/active
      if (effectiveProfile?.id && !isLockedStaffProfile) {
        const res: any = await supabase.rpc("secure_update_spoke_profile", {
          p_target_user_id: effectiveProfile.id,
          p_updates: {
            role: targetRoleToApply,
            is_banned: isBanned,
            is_comm_banned: isCommBanned,
            blacklist_reason: isBanned ? editReason : null,
            comm_blacklist_reason: isCommBanned ? editCommReason : null,
          },
        });
        const rpcErr =
          res.error || (res.data?.error ? new Error(res.data.error) : null);
        if (rpcErr) throw rpcErr;

        let auditReason = "Role & Identity Update";
        let auditAction = `Updated role to ${targetRoleToApply}`;
        if (isBanned || isCommBanned) {
          auditAction = `Banned User (${isBanned ? "Upload " : ""}${
            isCommBanned ? "Comms" : ""
          })`;
          auditReason = `Upload: ${editReason} | Comms: ${editCommReason}`;
        }

        await logArchitectAction(
          auditAction,
          "profiles",
          effectiveProfile.username || effectiveProfile.id,
          auditReason,
          "Identity & Masons",
          false,
          {
            role: { from: effectiveProfile.role || "citizen", to: targetRoleToApply },
            is_banned: { from: Boolean(effectiveProfile.is_banned), to: Boolean(isBanned) },
            is_comm_banned: {
              from: Boolean(effectiveProfile.is_comm_banned),
              to: Boolean(isCommBanned),
            },
          }
        );
      }

      setStatus(t("identities_updated", "Identity updated."));
      onUpdated();
      setTimeout(() => {
        onClose();
        setIsSubmitting(false);
      }, 900);
    } catch (err: any) {
      setStatus(
        `${t("identities_failed_prefix", "Failed:")} ${
          err?.message || t("permission_denied", "Permission Denied.")
        }`
      );
      setIsSubmitting(false);
    }
  };

  const heroTitle = isCreateMason
    ? masonName || t("new_mason_title", "New {Mason}")
    : mason && !profile
      ? masonName || mason.name
      : effectiveProfile?.username
        ? `@${effectiveProfile.username}`
        : masonName || t("unknown", "Unknown");

  const heroDescription = isCreateMason
    ? t("linker_create_desc", "Register and link a {Mason} creator identity.")
    : effectiveProfile
      ? `${t("landing_id_prefix", "ID:")} ${effectiveProfile.id.substring(0, 12)}`
      : t("unlinked_profile", "Unlinked Profile");

  const showMasonDetails = Boolean(
    isMasonVerified || enableMasonLink || activeMasonId || mason || isCreateMason
  );

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={
        isCreateMason
          ? t("btn_link_new_mason", "+ Link {Mason}")
          : t("edit_identity", "Edit Identity")
      }
      icon={
        isCreateMason || mason
          ? t("icon_architecture", "architecture")
          : t("icon_group", "group")
      }
      subtitle={
        effectiveProfile
          ? `UUID: ${effectiveProfile.id}`
          : mason
            ? `MASON ID: ${mason.id}`
            : t("linker_subtitle", "Verify {Masons} and link to {Citizen} profiles.")
      }
      widthClass={isSkinny ? "w-[90vw] max-w-[475px]" : undefined}
      backdropZ={backdropZ || (isSkinny ? "z-[60000]" : undefined)}
      panelZ={panelZ || (isSkinny ? "z-[60001]" : undefined)}
      headerActions={
        <PanelHeaderGroup>
          <PanelHeaderButton
            icon={t("icon_check", "check")}
            variant="success"
            tooltip={
              isSubmitting
                ? t("identities_updating", "Updating...")
                : t("ui_btn_commit", "Commit")
            }
            onClick={handleCommitUnified}
            disabled={
              isSubmitting ||
              (Boolean(effectiveProfile) && isBanned && !editReason.trim()) ||
              (Boolean(effectiveProfile) && isCommBanned && !editCommReason.trim()) ||
              (!isKeepers &&
                (Boolean(mason) || isCreateMason) &&
                !masonName.trim())
            }
          />
        </PanelHeaderGroup>
      }
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={
            isBanned || isCommBanned
              ? t("icon_gavel", "gavel")
              : isMasonVerified
                ? t("icon_verified", "verified")
                : showMasonDetails
                  ? t("icon_architecture", "architecture")
                  : t("icon_badge", "badge")
          }
          overline={
            isKeepers
              ? t("identities_title", "{Citizen} Directory")
              : t("identities_and_masons_title", "Identity & {Masons}")
          }
          title={heroTitle}
          description={heroDescription}
          badge={
            isBanned || isCommBanned
              ? t("status_restricted", "Restricted")
              : t("status_active", "Active")
          }
          badgeIcon={
            isBanned || isCommBanned
              ? t("icon_gavel", "gavel")
              : t("icon_verified_user", "verified_user")
          }
          variant={
            isBanned || isCommBanned
              ? "danger"
              : isMasonVerified
                ? "success"
                : "accent"
          }
        >
          <div className="grid grid-cols-2 gap-3 w-full">
            <StatBox
              label={t("identities_role_label", "Assigned Role")}
              value={
                effectiveProfile
                  ? t(
                      `role_${(editRole || "citizen").toLowerCase()}`,
                      (editRole || "citizen").toUpperCase()
                    )
                  : t("status_unlinked", "Unlinked")
              }
              icon={t("icon_admin_panel_settings", "admin_panel_settings")}
            />
            {isKeepers ? (
              <StatBox
                label={t("registry_label_status", "Status")}
                value={
                  isBanned || isCommBanned
                    ? t("status_restricted", "Restricted")
                    : t("status_active", "Active")
                }
                icon={
                  isBanned || isCommBanned
                    ? t("icon_block", "block")
                    : t("icon_verified_user", "verified_user")
                }
                iconColorClass={
                  isBanned || isCommBanned
                    ? "text-[var(--danger)]"
                    : "text-[var(--success)]"
                }
              />
            ) : (
              <StatBox
                label={t("mason_Name", "{Mason}")}
                value={
                  isMasonVerified
                    ? t("verified", "Verified")
                    : showMasonDetails
                      ? t("status_unlinked", "Unlinked")
                      : t("none", "None")
                }
                icon={
                  isMasonVerified
                    ? t("icon_verified", "verified")
                    : t("icon_architecture", "architecture")
                }
                iconColorClass={
                  isMasonVerified
                    ? "text-[var(--success)]"
                    : showMasonDetails
                      ? "text-[var(--warning)]"
                      : "text-[var(--subtext)]"
                }
              />
            )}
          </div>
        </SidePanelHeroCard>

        {status && (
          <div className="text-center glass-surface p-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] w-full">
            <p
              className={`text-[10px] font-black capitalize tracking-widest ${
                status.toLowerCase().includes("failed") ||
                status.toLowerCase().includes("required") ||
                status.toLowerCase().includes("denied")
                  ? "text-[var(--danger)]"
                  : "theme-text-accent"
              }`}
            >
              {status}
            </p>
          </div>
        )}

        {/* SECTION 1: ROLE & MASON VERIFICATION */}
        <UniversalGroup
          title={
            isKeepers
              ? t("identities_role_label", "Assigned Role")
              : t("identities_and_masons_title", "Identity & {Masons}")
          }
          icon={t("icon_verified_user", "verified_user")}
        >
          <div className="flex flex-col gap-3.5 w-full">
            {effectiveProfile && (
              <div className="flex flex-col gap-1.5 w-full">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                  {t("identities_role_label", "Assigned Role")}
                </span>
                {isLockedStaffProfile ? (
                  <div className="p-3.5 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--warning)_30%,transparent)] flex items-center gap-3 w-full">
                    <div className="w-9 h-9 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] text-[var(--warning)] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined !text-[18px]">
                        {t("icon_lock", "lock")}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-[var(--warning)] m-0">
                      {t(
                        "identities_wayfinder_locked",
                        "Role locked by Wayfinder oversight."
                      )}
                    </p>
                  </div>
                ) : (
                  <CustomRoleSelect
                    value={editRole}
                    roles={
                      isKeepers
                        ? ["citizen", "keeper"]
                        : isWayfinder
                          ? ROLES
                          : ["citizen", "mason", "architect"]
                    }
                    onChange={(newRole: string) => setEditRole(newRole)}
                    isBlacklisted={isBanned}
                  />
                )}
              </div>
            )}

            {!isKeepers && (
              <>
                <SidePanelPillToggle
                  label={
                    isMasonVerified
                      ? t("verified_masons_tab", "Verified {Masons}")
                      : t("mason_linked_toggle", "Mark {Mason} Verified")
                  }
                  checked={isMasonVerified}
                  onChange={(v: boolean) => {
                    setIsMasonVerified(v);
                    if (v) {
                      setEnableMasonLink(true);
                      if (!masonName.trim() && effectiveProfile?.username) {
                        setMasonName(effectiveProfile.username);
                      }
                      if (!linkedProfileId && profile?.id) {
                        setLinkedProfileId(profile.id);
                      }
                      if (editRole === "citizen") {
                        setEditRole("mason");
                      }
                    }
                  }}
                  icon={
                    isMasonVerified
                      ? t("icon_verified", "verified")
                      : t("icon_architecture", "architecture")
                  }
                  variant="success"
                />

                {showMasonDetails && (
                  <div className="grid grid-cols-1 gap-3 pt-1 animate-in fade-in slide-in-from-top-1">
                    <UniversalInput
                      label={t("mason_Name", "{Mason} Name")}
                      value={masonName}
                      onChange={setMasonName}
                      placeholder={t(
                        "placeholder_enter_mason_name",
                        "Enter {Mason} name..."
                      )}
                    />

                    <div className="flex flex-col gap-1.5 w-full">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-80 px-1">
                        {t("linked_profile", "Linked Profile")}
                      </span>
                      <ProfileSearchDropdown
                        value={linkedProfileId}
                        profiles={localProfiles}
                        onChange={handleSelectLinkedProfile}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </UniversalGroup>

        {/* SECTION 2: NETWORK RESTRICTIONS (Bans) */}
        {effectiveProfile && !isLockedStaffProfile && (
          <UniversalGroup
            title={t("ui_network_blacklist", "Network Blacklist")}
            icon={t("icon_gavel", "gavel")}
            headerColorClass={
              isBanned || isCommBanned ? "text-[var(--danger)]" : undefined
            }
          >
            <div className="flex flex-col gap-3 w-full">
              <SidePanelPillToggle
                label={
                  isWayfinder
                    ? t("identities_punitive_upload", "Upload & {Nexus} Ban")
                    : t("identities_ban", "Restrict Identity")
                }
                checked={isBanned}
                onChange={setIsBanned}
                icon={t("icon_gavel", "gavel")}
                variant="danger"
              />

              {isBanned && (
                <div className="animate-in fade-in slide-in-from-top-1 w-full">
                  <UniversalTextArea
                    label={t("ban_reason_req", "Restriction Reason")}
                    value={editReason}
                    onChange={setEditReason}
                    placeholder={t(
                      "id_reason_ban",
                      "Enter reason for restriction..."
                    )}
                    className="h-24 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] focus:border-[color-mix(in_srgb,var(--danger)_60%,transparent)] w-full text-[var(--danger)]"
                  />
                </div>
              )}

              {isWayfinder && (
                <>
                  <SidePanelPillToggle
                    label={t(
                      "identities_punitive_comm",
                      "Communications Restriction"
                    )}
                    checked={isCommBanned}
                    onChange={setIsCommBanned}
                    icon={t("icon_speaker_notes_off", "speaker_notes_off")}
                    variant="danger"
                  />

                  {isCommBanned && (
                    <div className="animate-in fade-in slide-in-from-top-1 w-full">
                      <UniversalTextArea
                        label={t("ban_reason_req", "Restriction Reason")}
                        value={editCommReason}
                        onChange={setEditCommReason}
                        placeholder={t(
                          "id_reason_comm_ban",
                          "Enter reason for communications restriction..."
                        )}
                        className="h-24 border-[color-mix(in_srgb,var(--danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--danger)_5%,transparent)] focus:border-[color-mix(in_srgb,var(--danger)_60%,transparent)] w-full text-[var(--danger)]"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </UniversalGroup>
        )}
      </div>
    </SidePanel>
  );
}

export function IdentityMatrix({
  isWayfinder = false,
  isKeepers = false,
  initialFilterRole = "overview",
}: {
  isWayfinder?: boolean;
  isKeepers?: boolean;
  initialFilterRole?: string;
}) {
  const { t } = useLexicon();
  const [rawProfiles, setRawProfiles] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [blacklistedProfiles, setBlacklistedProfiles] = useState<any[]>([]);
  const [masons, setMasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState(
    initialFilterRole === "all" ? "overview" : initialFilterRole
  );

  // FilterBar state (Role & Restriction Status)
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Unified SidePanel state
  const [selectedProfile, setSelectedProfile] = useState<any | null>(null);
  const [selectedMason, setSelectedMason] = useState<any | null>(null);
  const [isCreatingMason, setIsCreatingMason] = useState(false);

  useEffect(() => {
    if (initialFilterRole && initialFilterRole !== "all") {
      setActiveTab(initialFilterRole);
    }
  }, [initialFilterRole]);

  const fetchData = async () => {
    setLoading(true);
    const { getActiveGameClient } = await import("./supabase");
    const client = isKeepers ? supabaseAuth : getActiveGameClient() || supabase;

    const [profRes, masonRes] = await Promise.all([
      client.from("profiles").select("*").order("username"),
      !isKeepers
        ? client.from("masons").select("*").order("name")
        : Promise.resolve({ data: [] as any[] }),
    ]);

    if (profRes.data) {
      setRawProfiles(profRes.data);
      let filteredData = profRes.data;
      if (!isKeepers && !isWayfinder) {
        filteredData = profRes.data.filter(
          (p: any) => !["oversight", "wayfinder"].includes(p.role)
        );
      }
      setProfiles(
        filteredData.filter((p: any) => !p.is_banned && !p.is_comm_banned)
      );
      setBlacklistedProfiles(
        filteredData.filter((p: any) => p.is_banned || p.is_comm_banned)
      );
    }
    if (masonRes.data) {
      setMasons(masonRes.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [isKeepers, isWayfinder]);

  const allSpokeProfiles = [...profiles, ...blacklistedProfiles];
  const profileLookup = rawProfiles.length > 0 ? rawProfiles : allSpokeProfiles;
  const masonByProfileId = new Map<string, any>();
  masons.forEach((m: any) => {
    if (m.profile_id) masonByProfileId.set(m.profile_id, m);
  });

  const verifiedMasons = masons.filter((m: any) => Boolean(m.is_verified));
  const unlinkedMasons = masons.filter(
    (m: any) => !m.is_verified || !m.profile_id
  );

  const handleOpenProfile = (p: any) => {
    if (
      !isWayfinder &&
      !isKeepers &&
      ["oversight", "wayfinder"].includes(p.role)
    ) {
      useStore
        .getState()
        .pushStatus(
          t("auto_you_cannot_edit_45", "You cannot edit this identity.")
        );
      return;
    }
    setIsCreatingMason(false);
    setSelectedMason(null);
    setSelectedProfile(p);
  };

  const handleOpenMason = (m: any) => {
    setIsCreatingMason(false);
    setSelectedProfile(null);
    setSelectedMason(m);
  };

  const handleOpenCreateMason = () => {
    setSelectedProfile(null);
    setSelectedMason(null);
    setIsCreatingMason(true);
  };

  const handleCloseEditor = () => {
    setSelectedProfile(null);
    setSelectedMason(null);
    setIsCreatingMason(false);
  };

  const matchesProfileFilters = (p: any) => {
    const q = search.trim().toLowerCase();
    const linkedMason = masonByProfileId.get(p.id);
    const matchesSearch =
      !q ||
      p.username?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q) ||
      linkedMason?.name?.toLowerCase().includes(q);

    const pRole = (p.role || "citizen").toLowerCase();
    const matchesRole =
      roleFilter === "ALL" ||
      pRole === roleFilter.toLowerCase();

    const isRestricted = Boolean(p.is_banned || p.is_comm_banned);
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "active" && !isRestricted) ||
      (statusFilter === "restricted" && isRestricted) ||
      (statusFilter === "upload_banned" && Boolean(p.is_banned)) ||
      (statusFilter === "comm_banned" && Boolean(p.is_comm_banned));

    return matchesSearch && matchesRole && matchesStatus;
  };

  const matchesMasonFilters = (m: any) => {
    const q = search.trim().toLowerCase();
    const linkedProf =
      profileLookup.find((p: any) => p.id === m.profile_id) || m.profiles;
    const matchesSearch =
      !q ||
      m.name?.toLowerCase().includes(q) ||
      linkedProf?.username?.toLowerCase().includes(q) ||
      linkedProf?.email?.toLowerCase().includes(q);

    if (!linkedProf) {
      const matchesRole = roleFilter === "ALL" || roleFilter === "mason";
      const matchesStatus = statusFilter === "ALL" || statusFilter === "active";
      return matchesSearch && matchesRole && matchesStatus;
    }

    const pRole = (linkedProf.role || "citizen").toLowerCase();
    const matchesRole = roleFilter === "ALL" || pRole === roleFilter.toLowerCase();
    const isRestricted = Boolean(
      linkedProf.is_banned || linkedProf.is_comm_banned
    );
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "active" && !isRestricted) ||
      (statusFilter === "restricted" && isRestricted) ||
      (statusFilter === "upload_banned" && Boolean(linkedProf.is_banned)) ||
      (statusFilter === "comm_banned" && Boolean(linkedProf.is_comm_banned));

    return matchesSearch && matchesRole && matchesStatus;
  };

  // Keepers Core tabs vs Spoke Unified Identity & Masons tabs
  const tabs = isKeepers
    ? [
        {
          id: "overview",
          label: t("overview", "Overview"),
          icon: t("icon_dashboard", "dashboard"),
          number: String(profiles.length + blacklistedProfiles.length),
        },
        {
          id: "citizen",
          label: t("term_citizens", "{Citizens}"),
          icon: t("icon_person", "person"),
          number: String(
            profiles.filter((p) => !p.role || p.role === "citizen").length
          ),
        },
        {
          id: "keeper",
          label: t("role_keeper", "KEEPER"),
          icon: t("icon_admin_panel_settings", "admin_panel_settings"),
          number: String(profiles.filter((p) => p.role === "keeper").length),
        },
      ]
    : [
        {
          id: "overview",
          label: t("overview", "Overview"),
          icon: t("icon_dashboard", "dashboard"),
          number: String(allSpokeProfiles.length + masons.length),
          activeColor: "var(--accent)",
        },
        {
          id: "citizens",
          label: t("term_citizens", "{Citizens}"),
          icon: t("icon_person", "person"),
          number: String(allSpokeProfiles.length),
          activeColor: "var(--accent)",
        },
        {
          id: "verified_masons",
          label: t("verified_masons_tab", "Verified {Masons}"),
          icon: t("icon_verified", "verified"),
          number: String(verifiedMasons.length),
          activeColor: "var(--success)",
        },
        {
          id: "unlinked_masons",
          label: t("unlinked_masons_tab", "Unlinked {Masons}"),
          icon: t("icon_link_off", "link_off"),
          number: String(unlinkedMasons.length),
          activeColor: "var(--warning)",
        },
      ];

  const renderIdentityCard = (p: any) => {
    const isRestricted = Boolean(p.is_banned || p.is_comm_banned);
    const roleMeta = getRoleMeta(p.role, t);
    const roleLabel = t(
      `role_${(p.role || "citizen").toLowerCase()}`,
      (p.role || "CITIZEN").toUpperCase()
    );
    const linkedMason = masonByProfileId.get(p.id);

    return (
      <UniversalCard
        key={`profile-${p.id}`}
        onClick={() => handleOpenProfile(p)}
        className={
          !isWayfinder &&
          !isKeepers &&
          ["oversight", "wayfinder"].includes(p.role)
            ? "opacity-50 cursor-not-allowed pointer-events-none"
            : ""
        }
        layout="vertical"
        icon={isRestricted ? t("icon_block", "block") : roleMeta.icon}
        statusColor={
          isRestricted
            ? "border-[color-mix(in_srgb,var(--danger)_30%,transparent)]"
            : undefined
        }
        title={p.username || t("unknown", "Unknown")}
        subtitle={
          p.is_banned && p.blacklist_reason
            ? `${t("auto_upload", "Upload: ")}${p.blacklist_reason}`
            : p.is_comm_banned && p.comm_blacklist_reason
              ? `${t("auto_comms", "Comms: ")}${p.comm_blacklist_reason}`
              : `@${p.username || t("unknown", "Unknown")}`
        }
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[85%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${roleMeta.iconColor}`}
              >
                {roleMeta.icon}
              </span>
              <span>{roleLabel}</span>
            </div>
            {isRestricted && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_block", "block")}
                </span>
                <span>{t("status_restricted", "Restricted")}</span>
              </div>
            )}
          </div>
        }
        badges={
          <>
            {linkedMason && (
              <div className={VAULT_CHIP_CLASS}>
                <span
                  className={`material-symbols-outlined !text-[12px] ${
                    linkedMason.is_verified
                      ? "text-[var(--success)]"
                      : "text-[var(--warning)]"
                  }`}
                >
                  {linkedMason.is_verified
                    ? t("icon_verified", "verified")
                    : t("icon_architecture", "architecture")}
                </span>
                <span>{linkedMason.name}</span>
              </div>
            )}
            {p.is_banned && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_gavel", "gavel")}
                </span>
                <span>{t("banned_upload", "Upload Restricted")}</span>
              </div>
            )}
            {p.is_comm_banned && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_speaker_notes_off", "speaker_notes_off")}
                </span>
                <span>{t("banned_comm", "Comms Restricted")}</span>
              </div>
            )}
            <div className={VAULT_CHIP_CLASS}>
              <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                {t("icon_fingerprint", "fingerprint")}
              </span>
              <span>{p.id.substring(0, 8)}</span>
            </div>
          </>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span
              className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 truncate pr-2 ${
                isRestricted
                  ? "text-[var(--danger)] opacity-85"
                  : "text-[var(--subtext)] opacity-75"
              }`}
            >
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  isRestricted ? "text-[var(--danger)]" : "text-[var(--success)]"
                }`}
              >
                {isRestricted
                  ? t("icon_gavel", "gavel")
                  : t("icon_verified_user", "verified_user")}
              </span>
              {isRestricted
                ? t("status_restricted", "Restricted")
                : t("status_active", "Active")}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      />
    );
  };

  const renderMasonCard = (m: any) => {
    const linkedProf =
      profileLookup.find((p: any) => p.id === m.profile_id) || m.profiles;
    const isRestricted = Boolean(
      linkedProf?.is_banned || linkedProf?.is_comm_banned
    );

    return (
      <UniversalCard
        key={`mason-${m.id}`}
        onClick={() => handleOpenMason(m)}
        layout="vertical"
        icon={
          m.is_verified
            ? t("icon_verified", "verified")
            : t("icon_architecture", "architecture")
        }
        title={m.name}
        subtitle={
          linkedProf
            ? `@${linkedProf.username} ${
                linkedProf.email ? `(${linkedProf.email})` : ""
              }`
            : t("unlinked_profile", "Unlinked Profile")
        }
        imageOverlay={
          <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[85%] z-30 pointer-events-none">
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  m.is_verified
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]"
                }`}
              >
                {m.is_verified
                  ? t("icon_verified", "verified")
                  : t("icon_pending_actions", "pending_actions")}
              </span>
              <span>
                {m.is_verified
                  ? t("verified", "Verified")
                  : t("unverified", "Unverified")}
              </span>
            </div>
            {isRestricted && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--danger)]">
                  {t("icon_gavel", "gavel")}
                </span>
                <span>{t("status_restricted", "Restricted")}</span>
              </div>
            )}
          </div>
        }
        badges={
          <>
            <div className={VAULT_CHIP_CLASS}>
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  m.profile_id
                    ? "text-[var(--accent)]"
                    : "text-[var(--warning)]"
                }`}
              >
                {m.profile_id
                  ? t("icon_link", "link")
                  : t("icon_link_off", "link_off")}
              </span>
              <span>
                {linkedProf
                  ? `@${linkedProf.username}`
                  : t("status_unlinked", "Unlinked")}
              </span>
            </div>
            {linkedProf?.role && (
              <div className={VAULT_CHIP_CLASS}>
                <span className="material-symbols-outlined !text-[12px] text-[var(--subtext)]">
                  {t("icon_badge", "badge")}
                </span>
                <span>
                  {t(
                    `role_${String(linkedProf.role).toLowerCase()}`,
                    String(linkedProf.role).toUpperCase()
                  )}
                </span>
              </div>
            )}
          </>
        }
        footer={
          <div className="flex justify-between items-center w-full">
            <span className="text-[10px] font-black text-[var(--subtext)] opacity-75 uppercase tracking-widest flex items-center gap-1.5 truncate pr-2">
              <span
                className={`material-symbols-outlined !text-[12px] ${
                  m.is_verified
                    ? "text-[var(--success)]"
                    : "text-[var(--warning)]"
                }`}
              >
                {m.is_verified
                  ? t("icon_verified", "verified")
                  : t("icon_link_off", "link_off")}
              </span>
              {m.is_verified
                ? t("verified_masons_tab", "Verified {Masons}")
                : t("unlinked_masons_tab", "Unlinked {Masons}")}
            </span>
            <span className="text-[10px] font-black text-[var(--text)] group-hover:text-[var(--accent)] uppercase tracking-widest transition-all flex items-center gap-1 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 shrink-0">
              {t("edit", "Edit")} <span className="text-base leading-none">&rarr;</span>
            </span>
          </div>
        }
      />
    );
  };

  const renderLanding = () => {
    if (isKeepers) {
      return (
        <HubOverviewLanding>
          <HubOverviewSection
            icon={t("icon_group", "group")}
            iconColorClass="text-[var(--accent)]"
            title={t("identities_active_title", "Recent / Active {Citizens}")}
            isEmpty={profiles.length === 0}
            emptyIcon={t("ui_icon_person_off", "person_off")}
            emptyTitle={t("no_profiles", "No active profiles")}
          >
            {profiles.slice(0, 6).map((p: any) => renderIdentityCard(p))}
          </HubOverviewSection>

          <HubOverviewSection
            icon={t("icon_gavel", "gavel")}
            iconColorClass="text-[var(--danger)]"
            title={t(
              "banned_identities",
              "Restricted / Blacklisted ({count})"
            ).replace("{count}", blacklistedProfiles.length.toString())}
            isEmpty={blacklistedProfiles.length === 0}
            emptyIcon={t("icon_verified_user", "verified_user")}
            emptyTitle={t("no_issues", "No restricted identities")}
          >
            {blacklistedProfiles.slice(0, 6).map((p: any) => renderIdentityCard(p))}
          </HubOverviewSection>
        </HubOverviewLanding>
      );
    }

    const recentCards = [
      ...verifiedMasons.slice(0, 3).map((m: any) => renderMasonCard(m)),
      ...profiles.slice(0, 3).map((p: any) => renderIdentityCard(p)),
    ];

    const anomalyCards = [
      ...blacklistedProfiles.slice(0, 3).map((p: any) => renderIdentityCard(p)),
      ...unlinkedMasons.slice(0, 3).map((m: any) => renderMasonCard(m)),
    ];

    return (
      <HubOverviewLanding>
        <HubOverviewSection
          icon={t("icon_schedule", "schedule")}
          iconColorClass="text-[var(--accent)]"
          title={t("overview_recent", "Recent")}
          badgeCount={profiles.length + verifiedMasons.length}
          isEmpty={recentCards.length === 0}
          emptyIcon={t("ui_icon_person_off", "person_off")}
          emptyTitle={t("no_profiles", "No active profiles")}
        >
          {recentCards}
        </HubOverviewSection>

        <HubOverviewSection
          icon={t("icon_warning", "warning")}
          iconColorClass="text-[var(--warning)]"
          title={t("overview_anomalies", "Anomalies")}
          badgeCount={blacklistedProfiles.length + unlinkedMasons.length}
          isEmpty={anomalyCards.length === 0}
          emptyIcon={t("icon_verified_user", "verified_user")}
          emptyTitle={t("no_issues", "No anomalies detected")}
        >
          {anomalyCards}
        </HubOverviewSection>
      </HubOverviewLanding>
    );
  };

  const allowedRoleFilters = isKeepers
    ? ["ALL", "citizen", "keeper"]
    : isWayfinder
      ? ["ALL", ...ROLES]
      : ["ALL", "citizen", "mason", "architect"];

  const hasActiveFilters = roleFilter !== "ALL" || statusFilter !== "ALL";

  const filterPopover = {
    id: "identities_filters",
    icon: t("icon_tune", "tune"),
    label: t("filters", "Filters"),
    isActive: hasActiveFilters,
    badgeCount: (roleFilter !== "ALL" ? 1 : 0) + (statusFilter !== "ALL" ? 1 : 0),
    widthClass: "w-[320px]",
    content: (
      <div className="flex flex-col gap-4 p-1 w-[300px]">
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 px-1">
            {t("identities_role_label", "Assigned Role")}
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {allowedRoleFilters.map((r) => {
              const active = roleFilter === r;
              const label =
                r === "ALL"
                  ? t("all", "All")
                  : t(`role_${r.toLowerCase()}`, r.toUpperCase());
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all text-left truncate ${
                    active
                      ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)]"
                      : "bg-transparent border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 px-1">
            {t("registry_label_status", "Status")}
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: "ALL", label: t("all", "All") },
              { id: "active", label: t("status_active", "Active") },
              { id: "restricted", label: t("status_restricted", "Restricted") },
              { id: "upload_banned", label: t("banned_upload", "Upload Restricted") },
              ...(isWayfinder
                ? [{ id: "comm_banned", label: t("banned_comm", "Comms Restricted") }]
                : []),
            ].map((st) => {
              const active = statusFilter === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all text-left truncate ${
                    active
                      ? "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)]"
                      : "bg-transparent border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)]"
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        </div>

        {hasActiveFilters && (
          <ActionButton
            onClick={() => {
              setRoleFilter("ALL");
              setStatusFilter("ALL");
            }}
            variant="glass"
            icon={t("icon_filter_alt_off", "filter_alt_off")}
            label={t("clear", "Clear")}
            className="w-full"
          />
        )}
      </div>
    ),
  };

  const renderTabBody = () => {
    if (isKeepers) {
      const keepersFiltered = allSpokeProfiles.filter((p: any) => {
        const matchesTab =
          activeTab === "overview" ||
          (activeTab === "citizen" && (!p.role || p.role === "citizen")) ||
          p.role === activeTab;
        return matchesTab && matchesProfileFilters(p);
      });
      return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pb-16">
          {keepersFiltered.length === 0 ? (
            <EmptyState
              icon={t("ui_icon_person_off", "person_off")}
              title={t("no_profiles", "No profiles found")}
              className="col-span-full py-16"
            />
          ) : (
            keepersFiltered.map((p: any) => renderIdentityCard(p))
          )}
        </div>
      );
    }

    if (activeTab === "citizens") {
      const list = allSpokeProfiles.filter(matchesProfileFilters);
      return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pb-16">
          {list.length === 0 ? (
            <EmptyState
              icon={t("ui_icon_person_off", "person_off")}
              title={t("no_profiles", "No profiles found")}
              className="col-span-full py-16"
            />
          ) : (
            list.map((p: any) => renderIdentityCard(p))
          )}
        </div>
      );
    }

    if (activeTab === "verified_masons") {
      const list = verifiedMasons.filter(matchesMasonFilters);
      return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pb-16">
          {list.length === 0 ? (
            <EmptyState
              icon={t("icon_verified", "verified")}
              title={t("no_masons_found", "No {Masons} found")}
              className="col-span-full py-16"
            />
          ) : (
            list.map((m: any) => renderMasonCard(m))
          )}
        </div>
      );
    }

    if (activeTab === "unlinked_masons") {
      const list = unlinkedMasons.filter(matchesMasonFilters);
      return (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 pb-16">
          {list.length === 0 ? (
            <EmptyState
              icon={t("icon_link_off", "link_off")}
              title={t("no_masons_found", "No {Masons} found")}
              className="col-span-full py-16"
            />
          ) : (
            list.map((m: any) => renderMasonCard(m))
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <ElevatedHubLayout
      headerTitle={
        isKeepers
          ? t("identities_title", "{Citizen} Directory")
          : t("identities_and_masons_title", "Identity & {Masons}")
      }
      headerSubtitle={
        isKeepers
          ? t(
              "identities_subtitle",
              "Manage {citizens}, assign roles, and handle network violations."
            )
          : t(
              "identities_and_masons_subtitle",
              "Manage {citizens}, verify {masons}, assign clearance roles, and enforce network restrictions."
            )
      }
      headerIcon={t("icon_group", "group")}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={t("identities_search", "Search identities...") as string}
      primaryPopover={filterPopover}
      actions={
        !isKeepers
          ? [
              {
                id: "link_new_mason",
                icon: t("icon_person_add", "person_add"),
                label: t("btn_link_new_mason", "+ Link {Mason}"),
                onClick: handleOpenCreateMason,
              },
            ]
          : undefined
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={(id) => setActiveTab(id as string)}
    >
      {loading ? (
        <div className="glass-panel p-8 rounded-2xl text-center text-sm font-bold text-[var(--subtext)] capitalize tracking-widest animate-pulse">
          {t("audit_fetching", "Fetching identities...")}
        </div>
      ) : activeTab === "overview" ? (
        renderLanding()
      ) : (
        renderTabBody()
      )}

      <SharedIdentityEditor
        profile={selectedProfile}
        mason={selectedMason}
        isCreateMason={isCreatingMason}
        allProfiles={profileLookup}
        allMasons={masons}
        onClose={handleCloseEditor}
        onUpdated={fetchData}
        isWayfinder={isWayfinder}
        isKeepers={isKeepers}
      />
    </ElevatedHubLayout>
  );
}
