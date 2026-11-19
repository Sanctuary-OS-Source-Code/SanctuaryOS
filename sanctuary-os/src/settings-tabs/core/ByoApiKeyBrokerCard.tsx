import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { ActionButton, SidePanel, VAULT_CHIP_CLASS } from "../../shared";
import { UniversalCard } from "../../components/universal/UniversalCard";
import { SidePanelHeroCard, UniversalGroup } from "../../components/universal/UniversalLayout";

type ByoProvider = "nexus" | "curseforge" | "modrinth";

export function ByoApiKeyBrokerCard() {
  const { t } = useLexicon();
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, boolean>>({
    nexus: false,
    curseforge: false,
    modrinth: false,
  });
  const [drafts, setDrafts] = useState<Record<ByoProvider, string>>({
    nexus: "",
    curseforge: "",
    modrinth: "",
  });
  const [busyProvider, setBusyProvider] = useState<string | null>(null);

  useEffect(() => {
    invoke<Record<string, boolean>>("get_byo_api_key_status")
      .then((res) => {
        if (res) setStatusMap(res);
      })
      .catch(() => {});
  }, []);

  const handleSave = async (provider: ByoProvider) => {
    const val = drafts[provider]?.trim();
    if (!val || busyProvider) return;
    setBusyProvider(provider);
    try {
      const next = await invoke<Record<string, boolean>>("set_byo_api_key", {
        provider,
        apiKey: val,
      });
      setStatusMap(next);
      setDrafts((prev) => ({ ...prev, [provider]: "" }));
      useStore.getState().pushStatus(t("alert_saved", "Saved"), "success");
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setBusyProvider(null);
    }
  };

  const handleClear = async (provider: ByoProvider) => {
    if (busyProvider) return;
    setBusyProvider(provider);
    try {
      const next = await invoke<Record<string, boolean>>("clear_byo_api_key", {
        provider,
      });
      setStatusMap(next);
      setDrafts((prev) => ({ ...prev, [provider]: "" }));
      useStore.getState().pushStatus(t("alert_deleted", "Deleted"), "info");
    } catch (err: any) {
      useStore.getState().pushStatus(String(err?.message || err), "error");
    } finally {
      setBusyProvider(null);
    }
  };

  const providers: { id: ByoProvider; label: string; hint: string }[] = [
    {
      id: "nexus",
      label: t("byo_provider_nexus", "Nexus Mods Personal API Key"),
      hint: t("byo_hint_nexus", "Enables direct nxm:// CDN resolution inside batch downloads."),
    },
    {
      id: "curseforge",
      label: t("byo_provider_curseforge", "CurseForge API Key"),
      hint: t("byo_hint_curseforge", "Used locally when fetching direct CurseForge modpack URLs."),
    },
    {
      id: "modrinth",
      label: t("byo_provider_modrinth", "Modrinth Personal Token"),
      hint: t("byo_hint_modrinth", "Attached locally for authenticated Modrinth CDN requests."),
    },
  ];

  const configuredCount = providers.filter((p) => Boolean(statusMap[p.id])).length;

  return (
    <>
      <UniversalCard
        headerStyle="inline"
        title={t("byo_broker_title", "Local Encrypted BYO API Key Broker")}
        subtitle={t(
          "byo_broker_desc",
          "Optional hardware-sealed personal API keys stay strictly on this device and unlock zero-touch nxm:// & CDN batch downloads."
        )}
        icon={t("icon_vpn_key", "vpn_key")}
        isActive={configuredCount > 0}
        onClick={() => setIsPanelOpen(true)}
        actions={
          <span className={`${VAULT_CHIP_CLASS} ml-auto shrink-0`}>
            <span
              className={`material-symbols-outlined !text-[12px] ${
                configuredCount > 0 ? "text-[var(--success)]" : "text-[var(--subtext)]"
              }`}
            >
              {configuredCount > 0
                ? t("icon_verified_user", "verified_user")
                : t("icon_lock", "lock")}
            </span>
            <span className={configuredCount > 0 ? "text-[var(--success)]" : "text-[var(--subtext)]"}>
              {configuredCount > 0 ? `${configuredCount}/3` : t("lab_optional_label", "Optional")}
            </span>
          </span>
        }
        footer={
          <ActionButton
            variant="glass"
            icon={t("icon_vpn_key", "vpn_key")}
            label={t("byo_manage_keys_btn", "Manage Personal API Keys")}
            onClick={() => setIsPanelOpen(true)}
            className="w-full justify-center"
          />
        }
      />

      <SidePanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
        title={t("byo_broker_title", "Local Encrypted BYO API Key Broker")}
        subtitle={t("settings_browser_controls_section", "Browser & Controls")}
        icon={t("icon_vpn_key", "vpn_key")}
        iconColorClass="theme-text-accent"
        widthClass="w-[90vw] md:w-[620px]"
        position="right"
      >
        <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
          <SidePanelHeroCard
            icon={t("icon_vpn_key", "vpn_key")}
            overline={t("settings_browser_controls_section", "Browser & Controls")}
            title={t("byo_broker_title", "Local Encrypted BYO API Key Broker")}
            description={t(
              "byo_broker_desc",
              "Optional hardware-sealed personal API keys stay strictly on this device and unlock zero-touch nxm:// & CDN batch downloads."
            )}
            badge={
              configuredCount > 0
                ? `${configuredCount} / 3`
                : t("lab_optional_label", "Optional")
            }
            badgeIcon={
              configuredCount > 0
                ? t("icon_verified_user", "verified_user")
                : t("icon_lock", "lock")
            }
            variant={configuredCount > 0 ? "success" : "accent"}
          />

          {providers.map((p) => {
            const isConfigured = Boolean(statusMap[p.id]);
            const isBusy = busyProvider === p.id;
            return (
              <UniversalGroup
                key={p.id}
                title={p.label}
                icon={t("icon_key", "key")}
                headerAction={
                  <span className={VAULT_CHIP_CLASS}>
                    <span
                      className={`material-symbols-outlined !text-[12px] ${
                        isConfigured ? "text-[var(--success)]" : "text-[var(--subtext)]"
                      }`}
                    >
                      {isConfigured
                        ? t("icon_verified_user", "verified_user")
                        : t("icon_lock", "lock")}
                    </span>
                    <span
                      className={
                        isConfigured ? "text-[var(--success)]" : "text-[var(--subtext)]"
                      }
                    >
                      {isConfigured
                        ? t("status_configured", "Configured")
                        : t("status_not_set", "Not Set")}
                    </span>
                  </span>
                }
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSave(p.id);
                  }}
                  className="flex flex-col gap-3.5"
                >
                  <p className="text-xs font-medium text-[var(--subtext)] leading-relaxed m-0">
                    {p.hint}
                  </p>

                  <input
                    type="password"
                    value={drafts[p.id]}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    placeholder={
                      isConfigured
                        ? t(
                            "byo_key_replace_placeholder",
                            "Enter new key to replace sealed key..."
                          )
                        : t("byo_key_enter_placeholder", "Paste personal API key...")
                    }
                    className="w-full glass-surface rounded-xl px-3.5 py-2.5 text-xs font-mono no-text-case text-[var(--text)] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] outline-none focus:border-[var(--accent)] transition-all"
                  />

                  <div
                    className={
                      isConfigured
                        ? "grid grid-cols-1 sm:grid-cols-2 gap-2.5"
                        : "flex flex-col"
                    }
                  >
                    <ActionButton
                      type="submit"
                      variant="glass"
                      disabled={isBusy || !drafts[p.id].trim()}
                      icon={t("icon_save", "save")}
                      label={t("save", "Save Changes")}
                      className="w-full justify-center"
                    />
                    {isConfigured && (
                      <ActionButton
                        type="button"
                        variant="glass"
                        disabled={isBusy}
                        icon={t("icon_delete", "delete")}
                        label={t("clear", "Clear")}
                        onClick={() => void handleClear(p.id)}
                        className="w-full justify-center"
                      />
                    )}
                  </div>
                </form>
              </UniversalGroup>
            );
          })}
        </div>
      </SidePanel>
    </>
  );
}
