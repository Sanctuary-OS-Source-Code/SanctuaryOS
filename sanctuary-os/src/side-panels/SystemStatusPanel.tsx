import React, { useEffect, useState, useRef } from "react";
import { SidePanel, HoverTooltip } from "../shared";
import { UniversalGroup } from "../components/universal/UniversalLayout";
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

  const cleanUpdateVersion = String(updatePayload?.version || "")
    .replace(/^v/i, "")
    .trim();

  const diskUsagePercent =
    telemetry && telemetry.disk_total > 0
      ? Math.min(100, Math.round((telemetry.disk_used / telemetry.disk_total) * 100))
      : 0;

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("system_status", "System Status")}
      subtitle={t("sys_panel_desc", "Hardware & Environment Telemetry")}
      icon={t("icon_memory", "memory")}
      widthClass="w-[600px]"
      noPadding={true}
      noScroll={true}
    >
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pr-1">
        <div className="p-6 flex flex-col gap-8">
          <UniversalGroup
            className="animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out relative z-10"
            title={t("sys_info_app", "Application")}
            icon={t("icon_terminal", "terminal")}
            innerClassName="flex flex-col gap-3"
          >
            {updatePayload && (
              <button
                type="button"
                onClick={() => {
                  setIsUpdatePanelOpen(true);
                }}
                className="w-full glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_55%,transparent)] transition-all duration-300 flex items-center justify-between gap-4 relative group cursor-pointer text-left"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[color-mix(in_srgb,var(--accent)_18%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)]">
                    <span className="material-symbols-outlined !text-[20px] animate-bounce">
                      {t("icon_downloading", "downloading")}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--accent)] opacity-85 truncate">
                      {t("sys_stat_update_available", "Update Available")}
                    </span>
                    <span className="text-sm font-mono font-black tracking-wide text-[var(--text)] truncate mt-0.5">
                      v{cleanUpdateVersion}
                    </span>
                  </div>
                </div>

                <div className="w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] flex items-center justify-center shrink-0 text-[var(--accent)] group-hover:bg-[color-mix(in_srgb,var(--accent)_24%,transparent)] group-hover:translate-x-0.5 transition-all">
                  <span className="material-symbols-outlined !text-[18px]">
                    {t("icon_arrow_forward", "arrow_forward")}
                  </span>
                </div>
              </button>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatBox
                label={t("sys_stat_version", "Build Version")}
                value={`v${String(packageJson.version || "").replace(/^v/i, "")}`}
                monoValue={true}
                icon={t("icon_tag", "tag")}
                onClick={(e) => {
                  if (e.altKey) {
                    setUpdatePayload({
                      version: "9.9.9",
                      date: new Date().toISOString(),
                      body: "This is a simulated update payload for UI testing.",
                      downloadAndInstall: async () => {
                        console.log("Simulating install...");
                      },
                    } as any);
                  }
                }}
              />
              <StatBox
                label={t("sys_stat_online", "Uplink Status")}
                value={
                  <span className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        telemetry
                          ? "bg-[var(--success)] animate-pulse"
                          : "bg-[var(--warning)] animate-pulse"
                      }`}
                    />
                    <span>
                      {telemetry
                        ? t("sys_stat_connected_status", "Connected")
                        : t("sys_stat_scanning_status", "Scanning...")}
                    </span>
                  </span>
                }
                icon={t("icon_cloud", "cloud")}
                variant={telemetry ? "success" : "default"}
              />
            </div>
          </UniversalGroup>

          <UniversalGroup
            className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 ease-out fill-mode-both relative z-10"
            title={t("sys_info_os", "System Environment")}
            icon={t("icon_public", "public")}
            innerClassName="flex flex-col gap-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatBox
                label={t("sys_stat_os_name", "Operating System")}
                value={telemetry?.host_os || navigator.userAgent}
                tooltipSubtitle={telemetry?.host_os || navigator.userAgent}
                icon={t("icon_devices", "devices")}
              />
              <StatBox
                label={t("target_patch", "Detected Patch")}
                value={selectedVersion || t("status_unknown", "Unknown")}
                monoValue={Boolean(selectedVersion)}
                icon={t("icon_verified_user", "verified_user")}
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
              />
            </div>
          </UniversalGroup>

          <UniversalGroup
            className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200 ease-out fill-mode-both relative z-10"
            title={t("sys_info_app_footprint", "Sanctuary OS Footprint")}
            icon={t("icon_monitoring", "monitoring")}
            innerClassName="flex flex-col gap-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatBox
                label={t("sys_stat_mem_working_set", "Memory (Working Set)")}
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
                icon={t("icon_memory", "memory")}
              />
              <StatBox
                label={t("sys_stat_mem_private_set", "Memory (Private Bytes)")}
                value={
                  appFootprint ? (
                    (() => {
                      const s = parseBytes(appFootprint.memory_private);
                      return <AnimatedNumber value={s.val} suffix={s.unit} />;
                    })()
                  ) : (
                    t("scanning", "Scanning...")
                  )
                }
                icon={t("icon_memory", "memory")}
              />
              <StatBox
                label={t("sys_stat_total_disk_read", "Disk Read")}
                value={
                  appFootprint ? (
                    (() => {
                      const s = parseBytes(appFootprint.disk_read_speed);
                      return <AnimatedNumber value={s.val} suffix={`${s.unit}/s`} />;
                    })()
                  ) : (
                    t("scanning", "Scanning...")
                  )
                }
                icon={t("icon_download", "download")}
              />
              <StatBox
                label={t("sys_stat_total_disk_write", "Disk Write")}
                value={
                  appFootprint ? (
                    (() => {
                      const s = parseBytes(appFootprint.disk_write_speed);
                      return <AnimatedNumber value={s.val} suffix={`${s.unit}/s`} />;
                    })()
                  ) : (
                    t("scanning", "Scanning...")
                  )
                }
                icon={t("icon_upload", "upload")}
              />
            </div>

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
            />
          </UniversalGroup>

          <UniversalGroup
            className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300 ease-out fill-mode-both relative z-10"
            title={t("sys_info_local_storage", "Local System Storage")}
            icon={t("icon_hard_drive", "hard_drive")}
            innerClassName="flex flex-col gap-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatBox
                label={t("sys_stat_usage", "Local Storage Used")}
                value={
                  telemetry ? (
                    (() => {
                      const s = parseBytes(telemetry.disk_used);
                      return <AnimatedNumber value={s.val} suffix={s.unit} />;
                    })()
                  ) : (
                    t("scanning", "Scanning...")
                  )
                }
                icon={t("icon_data_usage", "data_usage")}
              />
              <StatBox
                label={t("sys_stat_quota", "Local Storage Capacity")}
                value={
                  telemetry ? (
                    (() => {
                      const s = parseBytes(telemetry.disk_total);
                      return <AnimatedNumber value={s.val} suffix={s.unit} />;
                    })()
                  ) : (
                    t("scanning", "Scanning...")
                  )
                }
                icon={t("icon_storage", "storage")}
              />
            </div>

            {telemetry && telemetry.disk_total > 0 && (
              <div className="glass-surface rounded-2xl p-3.5 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3.5">
                <div className="flex-1 h-2 rounded-full overflow-hidden bg-[color-mix(in_srgb,var(--text)_8%,transparent)] relative">
                  <div
                    className="h-full bg-[var(--accent)] transition-all duration-1000 ease-out rounded-full shadow-[0_0_12px_var(--accent)]"
                    style={{ width: `${diskUsagePercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono font-black text-[var(--accent)] shrink-0">
                  {diskUsagePercent}%
                </span>
              </div>
            )}
          </UniversalGroup>

          {vaultSize !== null && (
            <UniversalGroup
              className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-500 ease-out fill-mode-both relative z-10"
              title={t("sys_info_vault_storage", "Sanctuary Storage Breakdown")}
              icon={t("icon_inventory_2", "inventory_2")}
              innerClassName="flex flex-col gap-3"
            >
              <StatBox
                label={t("sys_stat_vault", "Vault Footprint")}
                value={(() => {
                  const s = parseBytes(vaultSize);
                  return <AnimatedNumber value={s.val} suffix={s.unit} />;
                })()}
                icon={t("icon_inventory_2", "inventory_2")}
                variant="accent"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <StatBox
                  label={t("items", "Vault")}
                  value={(() => {
                    const s = parseBytes(artifactsSize || 0);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_extension", "extension")}
                />
                <StatBox
                  label={t("sys_stat_data", "Mod Data")}
                  value={(() => {
                    const s = parseBytes(dataSize || 0);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_database", "database")}
                />
                <StatBox
                  label={t("filter_dev", "Sandbox")}
                  value={(() => {
                    const s = parseBytes(sandboxSize || 0);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_science", "science")}
                />
                <StatBox
                  label={t("backups_title", "Time Capsule")}
                  value={(() => {
                    const s = parseBytes(timeCapsuleSize || 0);
                    return <AnimatedNumber value={s.val} suffix={s.unit} />;
                  })()}
                  icon={t("icon_history", "history")}
                />
              </div>
            </UniversalGroup>
          )}
        </div>
      </div>
    </SidePanel>
  );
}

function StatBox({
  label,
  value,
  icon,
  variant = "default",
  monoValue = false,
  tooltipSubtitle,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  icon: string;
  variant?: "default" | "accent" | "success";
  monoValue?: boolean;
  tooltipSubtitle?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const isSuccess = variant === "success";
  const isAccent = variant === "accent";

  const iconBoxClasses = isSuccess
    ? "bg-[color-mix(in_srgb,var(--success)_15%,transparent)] border-[color-mix(in_srgb,var(--success)_35%,transparent)] text-[var(--success)]"
    : "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]";

  const valueColorClass = isSuccess
    ? "text-[var(--success)]"
    : isAccent
      ? "text-[var(--accent)]"
      : "text-[var(--text)]";

  return (
    <div
      onClick={onClick}
      className={`glass-surface rounded-2xl p-4 border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-center gap-3.5 relative hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_18%,transparent)] transition-all ${
        onClick ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <div
        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconBoxClasses}`}
      >
        <span className="material-symbols-outlined !text-[20px]">{icon}</span>
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-60 truncate">
          {label}
        </span>
        <div
          className={`text-xs sm:text-sm font-black tracking-wide truncate mt-0.5 ${
            monoValue ? "font-mono" : ""
          } ${valueColorClass}`}
        >
          {value}
        </div>
      </div>

      {tooltipSubtitle && (
        <HoverTooltip
          title={label}
          subtitle={tooltipSubtitle}
          icon={icon}
          variant="info"
        />
      )}
    </div>
  );
}
