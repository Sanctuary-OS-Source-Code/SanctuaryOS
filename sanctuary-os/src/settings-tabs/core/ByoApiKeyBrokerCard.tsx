import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLexicon } from "../../LexiconContext";
import { useStore } from "../../store";
import { ActionButton, VAULT_CHIP_CLASS } from "../../shared";

type ByoProvider = "nexus" | "curseforge" | "modrinth";

export function ByoApiKeyBrokerCard() {
  const { t } = useLexicon();
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

  return (
    <div className="md:col-span-2 glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_14%,transparent)] flex items-center justify-center text-[var(--accent)] shrink-0">
          <span className="material-symbols-outlined !text-[18px]">
            {t("icon_vpn_key", "vpn_key")}
          </span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-black text-[var(--text)]">
            {t("byo_broker_title", "Local Encrypted BYO API Key Broker")}
          </span>
          <span className="text-[11px] font-medium text-[var(--subtext)]">
            {t(
              "byo_broker_desc",
              "Optional hardware-sealed personal API keys stay strictly on this device and unlock zero-touch nxm:// & CDN batch downloads."
            )}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-1">
        {providers.map((p) => {
          const isConfigured = Boolean(statusMap[p.id]);
          const isBusy = busyProvider === p.id;
          return (
            <div
              key={p.id}
              className="p-3 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-[var(--text)]">{p.label}</span>
                  <span className="text-[10px] font-medium text-[var(--subtext)] opacity-80">
                    {p.hint}
                  </span>
                </div>
                <span className={`${VAULT_CHIP_CLASS} ml-auto shrink-0`}>
                  <span
                    className={`material-symbols-outlined !text-[12px] ${
                      isConfigured ? "text-[var(--success)]" : "text-[var(--subtext)]"
                    }`}
                  >
                    {isConfigured
                      ? t("icon_verified_user", "verified_user")
                      : t("icon_lock", "lock")}
                  </span>
                  <span className={isConfigured ? "text-[var(--success)]" : "text-[var(--subtext)]"}>
                    {isConfigured
                      ? t("status_configured", "Configured")
                      : t("status_not_set", "Not Set")}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="password"
                  value={drafts[p.id]}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  placeholder={
                    isConfigured
                      ? t("byo_key_replace_placeholder", "Enter new key to replace sealed key...")
                      : t("byo_key_enter_placeholder", "Paste personal API key...")
                  }
                  className="flex-1 min-w-[200px] glass-surface rounded-xl px-3 py-2 text-xs font-mono text-[var(--text)] outline-none border border-[color-mix(in_srgb,var(--text)_12%,transparent)] focus:border-[var(--accent)]"
                />
                <ActionButton
                  variant="accent"
                  disabled={isBusy || !drafts[p.id].trim()}
                  icon={t("icon_save", "save")}
                  label={t("hub_save", "Save")}
                  onClick={() => void handleSave(p.id)}
                />
                {isConfigured && (
                  <ActionButton
                    variant="glass"
                    disabled={isBusy}
                    icon={t("icon_delete", "delete")}
                    label={t("clear", "Clear")}
                    onClick={() => void handleClear(p.id)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
