import React, { useEffect, useState, useRef } from "react";
import { SidePanel, SidePanelHeroCard, UniversalGroup, StatBox, HoverTooltip } from "../shared";
import { useModalStore } from "../store/modalStore";
import { useStore } from "../store";
import { useLexicon } from "../LexiconContext";
import packageJson from "../../package.json";
import { invoke } from "@tauri-apps/api/core";

function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let animationFrameId: number;
    const startTime = performance.now();
    const duration = 1200;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayValue(value * ease);
      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };
    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value]);

  const hasDecimals = value % 1 !== 0;
  const formatted = hasDecimals ? displayValue.toFixed(2) : Math.round(displayValue);

  return (
    <>
      {formatted}
      {suffix ? ` ${suffix}` : ""}
    </>
  );
}

export function SystemStatusPanel({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useLexicon();
  const { selectedVersion } = useStore();
  const { updatePayload, setIsUpdatePanelOpen, setUpdatePayload } = useModalStore();
  const [telemetry, setTelemetry] = useState<any>(null);
  const [vaultSize, setVaultSize] = useState<number | null>(null);
  const [artifactsSize, setArtifactsSize] = useState<number | null>(null);
  const [dataSize, setDataSize] = useState<number | null>(null);
  const [sandboxSize, setSandboxSize] = useState<number | null>(null);
  const [timeCapsuleSize, setTimeCapsuleSize] = useState<number | null>(null);
  const [appFootprint, setAppFootprint] = useState<any>(null);
  const prevFootprintRef = useRef<any>(null);
  const prevTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      invoke("fetch_system_telemetry")
        .then((res: any) => {
          setTelemetry(res);
        })
        .catch((err) => console.error("Failed to get telemetry", err));

      const fetchFootprint = () => {
        invoke("fetch_app_footprint")
          .then((res: any) => {
            const now = performance.now();
            const prev = prevFootprintRef.current;

            if (prev && prevTimeRef.current > 0) {
              const timeDelta = (now - prevTimeRef.current) / 1000;
              const readSpeed = Math.max(0, (res.disk_read - prev.disk_read) / timeDelta);
              const writeSpeed = Math.max(
                0,
                (res.disk_written - prev.disk_written) / timeDelta
              );

              setAppFootprint({
                ...res,
                disk_read_speed: readSpeed,
                disk_write_speed: writeSpeed,
              });
            } else {
              setAppFootprint({
                ...res,
                disk_read_speed: 0,
                disk_write_speed: 0,
              });
            }

            prevFootprintRef.current = res;
            prevTimeRef.current = now;
          })
          .catch((err) => console.error("Failed to get footprint", err));
      };

      fetchFootprint();
      const interval = setInterval(fetchFootprint, 3000);

      invoke("get_saved_coordinates")
        .then(async (config: any) => {
          if (config && config.vault_path) {
            try {
              const { join } = await import("@tauri-apps/api/path");
              const modsPath = await join(config.vault_path, "Mods");
              const dataPath = await join(config.vault_path, "Data");
              const devPath = await join(config.vault_path, "Dev");

              const aSize = await invoke("get_directory_size", { path: modsPath }).catch(
                () => 0
              );
              const dSize = await invoke("get_directory_size", { path: dataPath }).catch(
                () => 0
              );
              const sSize = await invoke("get_directory_size", { path: devPath }).catch(
                () => 0
              );
              const backups = await invoke<any[]>("get_backups", {
                vaultPath: config.vault_path,
              }).catch(() => []);
              const bSize = backups.reduce(
                (acc, b) => acc + (b.size_mb || 0) * 1048576,
                0
              );

              setArtifactsSize(aSize as number);
              setDataSize(dSize as number);
              setSandboxSize(sSize as number);
              setTimeCapsuleSize(bSize as number);

              // Total Vault Footprint is the sum of all components
              setVaultSize(
                (aSize as number) + (dSize as number) + (sSize as number) + bSize
              );
            } catch (err) {
              console.error("Failed to get vault sub-sizes", err);
            }
          }
        })
        .catch((err) => console.error("Failed to get config", err));

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const parseBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return { val: 0, unit: "B" };
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return {
      val: parseFloat((bytes / Math.pow(k, i)).toFixed(2)),
      unit: sizes[i] || "B",
    };
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("system_status", "System Status")}
      subtitle={t("sys_panel_desc", "Hardware & Environment Telemetry")}
      icon={t("icon_memory", "memory")}
      iconColorClass="text-[var(--accent)]"
      widthClass="w-[620px] max-w-[100vw]"
    >
      <div className="flex flex-col gap-4 mt-2 relative z-10 w-full pb-8">
        <SidePanelHeroCard
          icon={t("icon_memory", "memory")}
          overline={t("system_status", "System Status")}
          title={t("sys_panel_desc", "Hardware & Environment Telemetry")}
          badge={
            telemetry
              ? t("sys_stat_connected_status", "Connected")
              : t("sys_stat_scanning_status", "Scanning...")
          }
          badgeIcon={t("icon_cloud", "cloud")}
          variant={telemetry ? "success" : "accent"}
        />

        <UniversalGroup
          title={t("sys_info_app", "Application")}
          icon={t("icon_desktop_windows", "desktop_windows")}
        >
          <div className="grid grid-cols-2 gap-3">
            {(() => {
              const installedVersion = String(packageJson.version || "")
                .replace(/^v/i, "")
                .trim();
              const targetUpdateVersion = updatePayload
                ? String(updatePayload.version || "")
                    .replace(/^v/i, "")
                    .trim()
                : "";
              const isDevUpdate = Boolean(
                updatePayload?.isDevChannel || /dev/i.test(targetUpdateVersion)
              );
              const channelSuffix =
                installedVersion === targetUpdateVersion
                  ? ` (${
                      isDevUpdate
                        ? t("release_notes_meta_channel_dev", "Dev")
                        : t("release_notes_meta_channel_stable", "Stable")
                    })`
                  : "";
              return (
                <StatBox
                  label={
                    updatePayload
                      ? isDevUpdate
                        ? t("sys_stat_dev_update_available", "Dev Build Available")
                        : t("card_update_available", "Update Available")
                      : t("sys_stat_version", "Build Version")
                  }
                  value={
                    updatePayload && targetUpdateVersion ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span>v{installedVersion}</span>
                        <span className="material-symbols-outlined !text-[16px] text-[var(--success)]">
                          {t("icon_arrow_forward", "arrow_forward")}
                        </span>
                        <span className="text-[var(--success)]">
                          v{targetUpdateVersion}
                          {channelSuffix}
                        </span>
                      </span>
                    ) : (
                      `v${installedVersion}`
                    )
                  }
                  icon={
                    updatePayload
                      ? t("icon_system_update_alt", "system_update_alt")
                      : t("icon_tag", "tag")
                  }
                  iconColorClass={
                    updatePayload ? "text-[var(--success)]" : "text-[var(--accent)]"
                  }
                  tooltipSubtitle={
                    updatePayload
                      ? t(
                          "sys_stat_click_to_update",
                          "Click to view release notes and install update"
                        )
                      : t("sys_stat_up_to_date", "Sanctuary OS is up to date")
                  }
                  className={
                    updatePayload
                      ? "!border-[color-mix(in_srgb,var(--success)_40%,transparent)] hover:!border-[var(--success)]"
                      : ""
                  }
                  onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                    if (e.altKey) {
                      setUpdatePayload({
                        version: "9.9.9",
                        date: new Date().toISOString(),
                        body: "This is a simulated update payload for UI testing.",
                        downloadAndInstall: async () => {
                          console.log("Simulating install...");
                        },
                      } as any);
                    } else if (updatePayload) {
                      setIsUpdatePanelOpen(true);
                    }
                  }}
                />
              );
            })()}
            <StatBox
              label={t("sys_stat_online", "Uplink Status")}
              value={
                telemetry
                  ? t("sys_stat_connected_status", "Connected")
                  : t("sys_stat_scanning_status", "Scanning...")
              }
              icon={t("icon_cloud", "cloud")}
              iconColorClass={telemetry ? "text-[var(--success)]" : "text-[var(--warning)]"}
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("sys_info_os", "System Environment")}
          icon={t("icon_devices", "devices")}
          delayClass="delay-100"
        >
          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label={t("sys_stat_os_name", "Operating System")}
              value={telemetry?.host_os || navigator.userAgent}
              tooltipSubtitle={telemetry?.host_os || navigator.userAgent}
              icon={t("icon_devices", "devices")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("target_patch", "Detected Patch")}
              value={selectedVersion || t("unknown", "Unknown")}
              icon={t("icon_verified_user", "verified_user")}
              iconColorClass="text-[var(--success)]"
            />
            <StatBox
              label={t("sys_stat_cores", "Logical Cores")}
              value={
                telemetry ? (
                  <AnimatedNumber
                    value={telemetry.logical_cores}
                    suffix={t("sys_stat_cores_suffix", "Cores")}
                  />
                ) : (
                  t("scanning", "Scanning...")
                )
              }
              icon={t("icon_memory", "memory")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("sys_stat_ram", "Est. Device Memory")}
              value={
                telemetry ? (
                  <AnimatedNumber
                    value={Math.round(telemetry.total_memory / 1024 ** 3)}
                    suffix={t("unit_gb", "GB")}
                  />
                ) : (
                  t("scanning", "Scanning...")
                )
              }
              icon={t("icon_speed", "speed")}
              iconColorClass="text-[var(--success)]"
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("sys_info_app_footprint", "Sanctuary OS Footprint")}
          icon={t("icon_memory", "memory")}
          delayClass="delay-200"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatBox
              label={t("sys_stat_cpu", "CPU")}
              value={
                appFootprint ? (
                  <AnimatedNumber value={appFootprint.cpu_usage} suffix="%" />
                ) : (
                  t("scanning", "Scanning...")
                )
              }
              icon={t("icon_speed", "speed")}
              iconColorClass="text-[var(--warning)]"
            />
            <StatBox
              label={t("sys_stat_app_memory", "Memory")}
              value={
                appFootprint ? (
                  (() => {
                    const s = parseBytes(appFootprint.memory_used);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()
                ) : (
                  t("scanning", "Scanning...")
                )
              }
              tooltipSubtitle={
                appFootprint
                  ? `${t("sys_stat_working_set", "Working Set")}: ${(() => {
                      const s = parseBytes(appFootprint.memory_used);
                      return `${s.val} ${s.unit}`;
                    })()} / ${t("sys_stat_private_set", "Private Bytes")}: ${(() => {
                      const s = parseBytes(appFootprint.memory_private);
                      return `${s.val} ${s.unit}`;
                    })()}`
                  : undefined
              }
              icon={t("icon_memory", "memory")}
              iconColorClass="text-[var(--accent)]"
            />
            <StatBox
              label={t("sys_stat_disk_io", "Disk I/O")}
              value={
                appFootprint ? (
                  (() => {
                    const s = parseBytes(
                      (appFootprint.disk_read_speed || 0) + (appFootprint.disk_write_speed || 0),
                    );
                    return <AnimatedNumber value={s.val} suffix={`${s.unit}/s`} />;
                  })()
                ) : (
                  t("scanning", "Scanning...")
                )
              }
              tooltipSubtitle={
                appFootprint
                  ? `${t("sys_stat_total_disk_read", "Disk Read")}: ${(() => {
                      const s = parseBytes(appFootprint.disk_read_speed);
                      return `${s.val} ${s.unit}/s`;
                    })()} / ${t("sys_stat_total_disk_write", "Disk Write")}: ${(() => {
                      const s = parseBytes(appFootprint.disk_write_speed);
                      return `${s.val} ${s.unit}/s`;
                    })()}`
                  : undefined
              }
              icon={t("icon_swap_vert", "swap_vert")}
              iconColorClass="text-[var(--success)]"
            />
          </div>
        </UniversalGroup>

        <UniversalGroup
          title={t("sys_info_storage", "Storage & Vault")}
          icon={t("icon_storage", "storage")}
          delayClass="delay-300"
        >
          <div className="grid grid-cols-2 gap-3">
            <StatBox
              label={t("sys_stat_usage", "Local Storage Used")}
              value={
                telemetry ? (
                  (() => {
                    const used = parseBytes(telemetry.disk_used);
                    const total = parseBytes(telemetry.disk_total);
                    return `${used.val} ${used.unit} / ${total.val} ${total.unit}`;
                  })()
                ) : (
                  t("scanning", "Scanning...")
                )
              }
              icon={t("icon_data_usage", "data_usage")}
              iconColorClass="text-[var(--accent)]"
            />

            {vaultSize !== null && (
              <>
                <StatBox
                  label={t("sys_stat_vault", "{Vault} Footprint")}
                  value={(() => {
                    const s = parseBytes(vaultSize);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_folder_special", "folder_special")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("term_mods", "Vault")}
                  value={(() => {
                    const s = parseBytes(artifactsSize || 0);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_inventory_2", "inventory_2")}
                  iconColorClass="text-[var(--success)]"
                />
                <StatBox
                  label={t("sys_stat_data", "Data Matrix")}
                  value={(() => {
                    const s = parseBytes(dataSize || 0);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_database", "database")}
                  iconColorClass="text-[var(--accent)]"
                />
                <StatBox
                  label={t("filter_dev", "Sandbox")}
                  value={(() => {
                    const s = parseBytes(sandboxSize || 0);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_science", "science")}
                  iconColorClass="text-[var(--warning)]"
                />
                <StatBox
                  label={t("term_backups", "Time Capsule")}
                  value={(() => {
                    const s = parseBytes(timeCapsuleSize || 0);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_history", "history")}
                  iconColorClass="text-[var(--accent)]"
                />
              </>
            )}
          </div>
        </UniversalGroup>
      </div>
    </SidePanel>
  );
}
