import React, { useEffect, useState, useRef } from 'react';
import { SidePanel } from './shared';
import { useModalStore } from './store/modalStore';
import { useLexicon } from './LexiconContext';
import packageJson from '../package.json';
import { invoke } from '@tauri-apps/api/core';

function AnimatedNumber({ value, suffix = '' }: { value: number, suffix?: string }) {
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
  
  return <>{formatted}{suffix ? ` ${suffix}` : ''}</>;
}

export function SystemStatusPanel({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const { t } = useLexicon();
  const { updatePayload, setIsUpdatePanelOpen, setUpdatePayload } = useModalStore();
  const [telemetry, setTelemetry] = useState<any>(null);
  const [vaultSize, setVaultSize] = useState<number | null>(null);
  const [artifactsSize, setArtifactsSize] = useState<number | null>(null);
  const [dataSize, setDataSize] = useState<number | null>(null);
  const [sandboxSize, setSandboxSize] = useState<number | null>(null);
  const [timeCapsuleSize, setTimeCapsuleSize] = useState<number | null>(null);
  const [appFootprint, setAppFootprint] = useState<any>(null);
  const [usePrivateMemory, setUsePrivateMemory] = useState(true);
  const prevFootprintRef = useRef<any>(null);
  const prevTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isOpen) {
      invoke('fetch_system_telemetry').then((res: any) => {
        setTelemetry(res);
      }).catch(err => console.error("Failed to get telemetry", err));

      const fetchFootprint = () => {
        invoke('fetch_app_footprint').then((res: any) => {
          const now = performance.now();
          const prev = prevFootprintRef.current;
          
          if (prev && prevTimeRef.current > 0) {
            const timeDelta = (now - prevTimeRef.current) / 1000;
            const readSpeed = Math.max(0, (res.disk_read - prev.disk_read) / timeDelta);
            const writeSpeed = Math.max(0, (res.disk_written - prev.disk_written) / timeDelta);
            
            setAppFootprint({
              ...res,
              disk_read_speed: readSpeed,
              disk_write_speed: writeSpeed
            });
          } else {
            setAppFootprint({
              ...res,
              disk_read_speed: 0,
              disk_write_speed: 0
            });
          }
          
          prevFootprintRef.current = res;
          prevTimeRef.current = now;
        }).catch(err => console.error("Failed to get footprint", err));
      };
      
      fetchFootprint();
      const interval = setInterval(fetchFootprint, 3000);

      invoke('get_saved_coordinates').then(async (config: any) => {
        if (config && config.vault_path) {
          try {
            const vSize = await invoke('get_directory_size', { path: config.vault_path });
            setVaultSize(vSize as number);
            
            const { join } = await import('@tauri-apps/api/path');
            const modsPath = await join(config.vault_path, "Mods");
            const dataPath = await join(config.vault_path, "Data");
            const devPath = await join(config.vault_path, "Dev");
            const backupsPath = await join(config.vault_path, "Backups");
            
            const aSize = await invoke('get_directory_size', { path: modsPath }).catch(() => 0);
            const dSize = await invoke('get_directory_size', { path: dataPath }).catch(() => 0);
            const sSize = await invoke('get_directory_size', { path: devPath }).catch(() => 0);
            const bSize = await invoke('get_directory_size', { path: backupsPath }).catch(() => 0);
            
            setArtifactsSize(aSize as number);
            setDataSize(dSize as number);
            setSandboxSize(sSize as number);
            setTimeCapsuleSize(bSize as number);
          } catch (err) {
             console.error("Failed to get vault sub-sizes", err);
          }
        }
      }).catch(err => console.error("Failed to get config", err));

      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const parseBytes = (bytes: number) => {
    if (bytes === 0) return { val: 0, unit: 'B' };
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return { val: parseFloat((bytes / Math.pow(k, i)).toFixed(2)), unit: sizes[i] };
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={t("sys_panel_title")}
      subtitle={t("sys_panel_desc")}
      icon="memory"
      widthClass="w-[575px]"
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-8">
        
        {/* App Info */}
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 ease-out relative z-10">
          <SectionHeader icon="terminal" title={t("sys_info_app")} glowColor="rgba(var(--accent-rgb),0.8)" />
          {updatePayload && (
            <button onClick={() => { setIsUpdatePanelOpen(true); }} className="w-full theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] hover:bg-[color-mix(in_srgb,var(--accent)_25%,transparent)] transition-all duration-300 hover:shadow-[0_0_25px_rgba(var(--accent-rgb),0.3)] flex items-center justify-between overflow-hidden relative group hover:-translate-y-1 mt-2">
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />
                 <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')] opacity-10" />
                 <div className="flex items-center gap-4 relative z-10">
                     <div className="w-12 h-12 rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] flex items-center justify-center border border-[color-mix(in_srgb,var(--accent)_50%,transparent)] group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]">
                         <span className="material-symbols-outlined theme-text-accent text-[24px] animate-bounce">downloading</span>
                     </div>
                     <div className="flex flex-col items-start">
                         <span className="text-[10px] font-black uppercase tracking-[0.2em] theme-text-accent opacity-90 drop-shadow-sm">{t("sys_stat_update_available")}</span>
                         <span className="text-2xl font-black uppercase tracking-tighter theme-text-accent drop-shadow-md">V{updatePayload.version}</span>
                     </div>
                 </div>
                 <div className="relative z-10 opacity-50 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0 duration-300 flex items-center pr-2">
                     <span className="material-symbols-outlined theme-text-accent text-3xl">arrow_right_alt</span>
                 </div>
            </button>
          )}

          <div className="grid grid-cols-2 gap-4">
            <StatBox 
              label={t("sys_stat_version")} 
              value={`V${packageJson.version}`} 
              icon="new_releases" 
              glowColor="rgba(255,255,255,0.2)"
              onClick={(e) => {
                if (e.altKey) {
                  setUpdatePayload({
                    version: "9.9.9",
                    date: new Date().toISOString(),
                    body: "This is a simulated update payload for UI testing.",
                    downloadAndInstall: async () => { console.log("Simulating install..."); }
                  } as any);
                }
              }} 
            />
            <StatBox 
              label={t("sys_stat_online")} 
              value={
                <div className="flex items-center gap-2">
                  {telemetry && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />}
                  <span className={telemetry ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]" : ""}>
                    {telemetry ? t("sys_stat_connected_status") : t("sys_stat_scanning_status")}
                  </span>
                </div>
              } 
              icon="cloud" 
              glowColor="rgba(16,185,129,0.4)"
            />
          </div>
        </div>

        {/* Environment Info */}
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-150 ease-out fill-mode-both relative z-10">
          <SectionHeader icon="public" title={t("sys_info_os")} glowColor="rgba(168,85,247,0.8)" />
          <div className="theme-glass-inner p-4 rounded-xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] transition-all hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:shadow-lg relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none" />
            <div className="flex flex-col relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined !text-[14px]" style={{ color: "rgba(168,85,247,0.8)" }}>devices</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 group-hover:opacity-100 transition-opacity drop-shadow-sm">{t("sys_stat_os_name")}</span>
              </div>
              <div className="text-[20px] font-black uppercase tracking-tighter drop-shadow-md relative z-10 transition-colors text-white break-words">{telemetry?.host_os || navigator.userAgent}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatBox 
              label={t("sys_stat_cores")} 
              value={telemetry ? <AnimatedNumber value={telemetry.logical_cores} suffix={t("sys_stat_cores_suffix")} /> : t("sys_stat_scanning_dots")} 
              icon="memory" 
              glowColor="rgba(168,85,247,0.4)"
            />
            <StatBox 
              label={t("sys_stat_ram")} 
              value={telemetry ? <AnimatedNumber value={Math.round(telemetry.total_memory / (1024 ** 3))} suffix={t("sys_stat_gb_suffix")} /> : t("sys_stat_scanning_dots")} 
              icon="speed" 
              glowColor="rgba(59,130,246,0.4)"
            />
          </div>
        </div>

        {/* App Footprint */}
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200 ease-out fill-mode-both relative z-10">
          <div className="flex items-center justify-between border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-2">
            <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--subtext)] opacity-70 flex items-center gap-2">
              <span className="material-symbols-outlined !text-[16px]" style={{ color: "rgba(234,88,12,0.8)" }}>{t("ui_icon_monitoring") || "monitoring"}</span>
              <span className="drop-shadow-sm">{t("sys_info_app_footprint")}</span>
            </h3>
            
            <div className="flex items-center gap-1 theme-glass-panel rounded-xl p-1 border border-white/5 shadow-inner shrink-0 scale-90 origin-right">
              <button 
                onClick={() => setUsePrivateMemory(false)} 
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${!usePrivateMemory ? 'bg-[rgba(234,88,12,0.2)] text-[rgba(234,88,12,1)] border border-[rgba(234,88,12,0.3)] shadow-[0_0_15px_rgba(234,88,12,0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
              >
                {t("sys_stat_working_set")}
              </button>
              <button 
                onClick={() => setUsePrivateMemory(true)} 
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${usePrivateMemory ? 'bg-[rgba(234,88,12,0.2)] text-[rgba(234,88,12,1)] border border-[rgba(234,88,12,0.3)] shadow-[0_0_15px_rgba(234,88,12,0.2)]' : 'text-[var(--subtext)] hover:text-[var(--text)] hover:bg-white/5 border border-transparent'}`}
              >
                {t("sys_stat_private_set")}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <StatBox 
              label={usePrivateMemory ? t("sys_stat_mem_private_set") : t("sys_stat_mem_working_set")} 
              value={appFootprint ? (() => { const s = parseBytes(usePrivateMemory ? appFootprint.memory_private : appFootprint.memory_used); return <AnimatedNumber value={s.val} suffix={s.unit} />; })() : t("sys_stat_scanning_dots")} 
              icon={t("ui_icon_memory") || "memory"} 
              glowColor="rgba(234,88,12,0.4)"
            />
            <StatBox 
              label={t("sys_stat_cpu")} 
              value={appFootprint ? <AnimatedNumber value={appFootprint.cpu_usage} suffix="%" /> : t("sys_stat_scanning_dots")} 
              icon={t("ui_icon_speed") || "speed"} 
              glowColor="rgba(234,88,12,0.4)"
            />
            <StatBox 
              label={t("sys_stat_total_disk_read") || "Disk Read"} 
              value={appFootprint ? (() => { const s = parseBytes(appFootprint.disk_read_speed); return <AnimatedNumber value={s.val} suffix={`${s.unit}/s`} />; })() : t("sys_stat_scanning_dots")} 
              icon={t("ui_icon_download") || "download"} 
              glowColor="rgba(234,88,12,0.4)"
            />
            <StatBox 
              label={t("sys_stat_total_disk_write") || "Disk Write"} 
              value={appFootprint ? (() => { const s = parseBytes(appFootprint.disk_write_speed); return <AnimatedNumber value={s.val} suffix={`${s.unit}/s`} />; })() : t("sys_stat_scanning_dots")} 
              icon={t("ui_icon_upload") || "upload"} 
              glowColor="rgba(234,88,12,0.4)"
            />
          </div>
        </div>

        {/* Storage Info */}
        <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300 ease-out fill-mode-both relative z-10">
          <SectionHeader icon="hard_drive" title={t("sys_info_local_storage")} glowColor="rgba(244,63,94,0.8)" />
          <div className="grid grid-cols-2 gap-4">
            <StatBox 
              label={t("sys_stat_usage")} 
              value={telemetry ? (() => { const s = parseBytes(telemetry.disk_used); return <AnimatedNumber value={s.val} suffix={s.unit} />; })() : t("sys_stat_scanning_dots")} 
              icon="data_usage" 
              glowColor="rgba(244,63,94,0.4)"
            />
            <StatBox 
              label={t("sys_stat_quota")} 
              value={telemetry ? (() => { const s = parseBytes(telemetry.disk_total); return <AnimatedNumber value={s.val} suffix={s.unit} />; })() : t("sys_stat_scanning_dots")} 
              icon="storage" 
              glowColor="rgba(20,184,166,0.4)"
            />
          </div>
          
          {telemetry && telemetry.disk_total > 0 && (
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-[color-mix(in_srgb,var(--text)_5%,transparent)] mt-1 shadow-inner relative">
              <div 
                className="h-full theme-bg-accent transition-all duration-[1500ms] ease-out relative shadow-[0_0_15px_var(--accent)]"
                style={{ width: `${(telemetry.disk_used / telemetry.disk_total) * 100}%` }}
              >
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagonal-stripes.png')] opacity-30 animate-[shimmer_2s_linear_infinite]" />
                <div className="absolute top-0 right-0 bottom-0 w-10 bg-gradient-to-r from-transparent to-white/50 animate-pulse" />
              </div>
            </div>
          )}
        </div>

        {vaultSize !== null && (
             <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-500 ease-out fill-mode-both relative z-10 mt-2">
                <SectionHeader icon="inventory_2" title={t("sys_info_vault_storage")} glowColor="rgba(234,179,8,0.8)" />
                <StatBox 
                  label={t("sys_stat_vault")} 
                  value={(() => { const s = parseBytes(vaultSize); return <AnimatedNumber value={s.val} suffix={s.unit} />; })()} 
                  icon="inventory_2" 
                  glowColor="rgba(234,179,8,0.4)"
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <StatBox 
                    label={t("sys_stat_artifacts")} 
                    value={(() => { const s = parseBytes(artifactsSize || 0); return <AnimatedNumber value={s.val} suffix={s.unit} />; })()} 
                    icon="extension" 
                    glowColor="rgba(59,130,246,0.4)"
                  />
                  <StatBox 
                    label={t("sys_stat_data")} 
                    value={(() => { const s = parseBytes(dataSize || 0); return <AnimatedNumber value={s.val} suffix={s.unit} />; })()} 
                    icon="database" 
                    glowColor="rgba(16,185,129,0.4)"
                  />
                  <StatBox 
                    label={t("sys_stat_sandbox")} 
                    value={(() => { const s = parseBytes(sandboxSize || 0); return <AnimatedNumber value={s.val} suffix={s.unit} />; })()} 
                    icon="science" 
                    glowColor="rgba(245,158,11,0.4)"
                  />
                  <StatBox 
                    label={t("sys_stat_time_capsule")} 
                    value={(() => { const s = parseBytes(timeCapsuleSize || 0); return <AnimatedNumber value={s.val} suffix={s.unit} />; })()} 
                    icon="history" 
                    glowColor="rgba(168,85,247,0.4)"
                  />
                </div>
             </div>
          )}
      </div>
    </SidePanel>
  );
}

function SectionHeader({ icon, title, glowColor }: { icon: string, title: string, glowColor: string }) {
  return (
    <h3 className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--subtext)] opacity-70 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-2 flex items-center gap-2">
      <span className="material-symbols-outlined !text-[16px]" style={{ color: glowColor }}>{icon}</span>
      <span className="drop-shadow-sm">{title}</span>
    </h3>
  );
}

function StatBox({ label, value, icon, accent = false, pulseIcon = false, glowColor, onClick }: { label: string, value: React.ReactNode, icon: string, accent?: boolean, pulseIcon?: boolean, glowColor: string, onClick?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div 
      ref={boxRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`p-4 rounded-xl border flex flex-col gap-2 transition-all duration-300 hover:-translate-y-0.5 relative overflow-hidden group ${onClick ? 'cursor-pointer hover:shadow-lg' : ''}
      ${accent ? 'theme-glass-inner theme-border-accent bg-[color-mix(in_srgb,var(--accent)_5%,transparent)] hover:shadow-[0_4px_20px_rgba(var(--accent-rgb),0.1)]' : 'theme-glass-inner border-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_15%,transparent)] hover:shadow-lg'}`}
    >
      {/* Spotlight Effect */}
      <div 
        className="absolute inset-0 pointer-events-none transition-opacity duration-300 z-0 mix-blend-screen"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(120px circle at ${mousePos.x}px ${mousePos.y}px, ${glowColor.replace('0.4', '0.15')}, transparent 80%)`
        }}
      />
      
      {/* Base Shimmer Sweep */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-[150%] group-hover:translate-x-[150%] transition-transform duration-1000 ease-in-out pointer-events-none z-0" />
      
      <div className="flex items-center gap-2 relative z-10">
        <span className={`material-symbols-outlined !text-[16px] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6 ${pulseIcon ? 'animate-pulse' : ''}`} style={{ color: glowColor.replace('0.4', '1').replace('0.5', '1') }}>{icon}</span>
        <span className="text-[9px] font-black uppercase tracking-widest text-[var(--subtext)] opacity-70 group-hover:text-[var(--text)] transition-colors">{label}</span>
      </div>
      <div className={`text-lg font-black uppercase tracking-tighter drop-shadow-sm relative z-10 transition-colors ${accent ? 'theme-text-accent' : 'text-[var(--text)]'}`}>
        {value}
      </div>
    </div>
  );
}
