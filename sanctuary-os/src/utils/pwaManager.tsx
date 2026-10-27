import { useEffect, useState } from "react";
import { isDesktop } from "./envUtils";
import { useLexicon } from "../LexiconContext";
import { useStore } from "../store";
import { SidePanel } from "../shared";
import { SidePanelHeroCard, UniversalGroup } from "../components/layouts/ElevatedHubLayout";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

type PwaState = {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isStandalone: boolean;
  isGuideOpen: boolean;
  bannerDismissed: boolean;
};

const checkIsStandalone = (): boolean => {
  if (typeof window === "undefined") return false;
  const isStandaloneMedia = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const isStandaloneNavigator = (window.navigator as any)?.standalone === true;
  return Boolean(isStandaloneMedia || isStandaloneNavigator);
};

export const isIosDevice = (): boolean => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIOS || isIPadOS;
};

export const isMobileDevice = (): boolean => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || "") ||
    window.innerWidth < 768
  );
};

const pwaStore: {
  state: PwaState;
  listeners: Set<() => void>;
} = {
  state: {
    deferredPrompt: null,
    isStandalone: checkIsStandalone(),
    isGuideOpen: false,
    bannerDismissed:
      typeof localStorage !== "undefined" &&
      sessionStorage.getItem("sanctuary_pwa_banner_dismissed") === "true",
  },
  listeners: new Set(),
};

function notifyPwaListeners() {
  pwaStore.listeners.forEach((l) => l());
}

export function setPwaGuideOpen(open: boolean) {
  pwaStore.state = { ...pwaStore.state, isGuideOpen: open };
  notifyPwaListeners();
}

export function dismissPwaBanner() {
  try {
    sessionStorage.setItem("sanctuary_pwa_banner_dismissed", "true");
  } catch (e) {}
  pwaStore.state = { ...pwaStore.state, bannerDismissed: true };
  notifyPwaListeners();
}

let initialized = false;

export function initPwaManager() {
  if (initialized || typeof window === "undefined" || isDesktop()) return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    pwaStore.state = {
      ...pwaStore.state,
      deferredPrompt: e as BeforeInstallPromptEvent,
    };
  });

  window.addEventListener("appinstalled", () => {
    pwaStore.state = {
      ...pwaStore.state,
      deferredPrompt: null,
      isStandalone: true,
      isGuideOpen: false,
      bannerDismissed: true,
    };
    notifyPwaListeners();
  });

  const mediaQuery = window.matchMedia?.("(display-mode: standalone)");
  if (mediaQuery?.addEventListener) {
    mediaQuery.addEventListener("change", (ev) => {
      pwaStore.state = { ...pwaStore.state, isStandalone: ev.matches };
      notifyPwaListeners();
    });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("PWA Service Worker registration skipped:", err);
      });
    });
  }
}

export function usePwaInstall() {
  const [state, setState] = useState<PwaState>(pwaStore.state);
  const { t } = useLexicon();

  useEffect(() => {
    initPwaManager();
    const listener = () => setState({ ...pwaStore.state });
    pwaStore.listeners.add(listener);
    listener();
    return () => {
      pwaStore.listeners.delete(listener);
    };
  }, []);

  const triggerInstall = async () => {
    if (state.deferredPrompt) {
      try {
        await state.deferredPrompt.prompt();
        const choice = await state.deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          pwaStore.state = {
            ...pwaStore.state,
            deferredPrompt: null,
            isStandalone: true,
            isGuideOpen: false,
          };
          useStore.getState().pushStatus(
            `${t("icon_check_circle", "check_circle")} ${t("pwa_status_installed", "Sanctuary OS installed to your device!")}`,
            "success"
          );
        } else {
          pwaStore.state = { ...pwaStore.state, deferredPrompt: null };
        }
        notifyPwaListeners();
        return;
      } catch (err) {
        console.warn("Native PWA install prompt failed, falling back to guide:", err);
      }
    }
    setPwaGuideOpen(true);
  };

  return {
    isStandalone: state.isStandalone,
    canNativePrompt: Boolean(state.deferredPrompt),
    isIos: isIosDevice(),
    isMobile: isMobileDevice(),
    isGuideOpen: state.isGuideOpen,
    bannerDismissed: state.bannerDismissed,
    setIsGuideOpen: setPwaGuideOpen,
    dismissBanner: dismissPwaBanner,
    triggerInstall,
  };
}

export function PwaInstallPrompt() {
  const { t } = useLexicon();
  const {
    isStandalone,
    canNativePrompt,
    isIos,
    isMobile,
    isGuideOpen,
    bannerDismissed,
    setIsGuideOpen,
    dismissBanner,
    triggerInstall,
  } = usePwaInstall();

  if (isDesktop()) return null;

  const showFloatingBanner = !isStandalone && !bannerDismissed && (isMobile || canNativePrompt);

  return (
    <>
      {showFloatingBanner && (
        <div className="md:hidden fixed bottom-[calc(86px+env(safe-area-inset-bottom,0px))] left-4 right-4 z-[999990] animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-auto">
          <div className="p-3.5 rounded-2xl glass-panel sa-mobile-glass-overlay border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-[0_20px_50px_rgba(0,0,0,0.65)] relative overflow-hidden">
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-10 h-10 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_12%,transparent)] flex items-center justify-center shrink-0">
                  <img src="/pwa-192x192.png" alt="" className="w-7 h-7 object-contain drop-shadow-md" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-black uppercase tracking-wider text-[var(--text)] truncate">
                    {t("pwa_banner_title", "Get the Sanctuary OS App")}
                  </span>
                  <span className="text-[10px] font-bold text-[var(--subtext)] truncate">
                    {t("pwa_banner_subtitle", "Add to your home screen for full-screen access")}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={triggerInstall}
                  className="px-3.5 py-2 rounded-xl glass-surface bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[var(--text)] hover:text-[var(--accent)] text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[15px] text-[var(--accent)]">
                    {t("icon_add_to_home_screen", "add_to_home_screen")}
                  </span>
                  {t("pwa_btn_add_short", "Add App")}
                </button>
                <button
                  type="button"
                  onClick={dismissBanner}
                  className="w-8 h-8 rounded-xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--subtext)] hover:text-[var(--text)] flex items-center justify-center transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[16px]">
                    {t("icon_close", "close")}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <SidePanel
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        title={t("pwa_guide_title", "Add to Home Screen")}
        subtitle={t("pwa_guide_subtitle", "Install Sanctuary OS as a standalone app")}
        icon={t("icon_install_mobile", "install_mobile")}
        widthClass="w-full md:w-[540px]"
      >
        <div className="flex flex-col gap-6">
          <SidePanelHeroCard
            title={t("pwa_install_title", "Install Sanctuary Web App")}
            subtitle={t(
              "pwa_install_desc",
              "Install Sanctuary OS directly to your home screen or app drawer for a full-screen standalone experience with instant workspace access."
            )}
            label={t("pwa_guide_title", "Add to Home Screen")}
            icon={t("icon_install_mobile", "install_mobile")}
            variant="accent"
          />

          {canNativePrompt && (
            <button
              type="button"
              onClick={triggerInstall}
              className="w-full py-4 px-5 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_16%,transparent)] hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--text)_12%,transparent)] text-[var(--text)] hover:text-[var(--accent)] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2.5 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[20px] text-[var(--accent)]">
                {t("icon_add_to_home_screen", "add_to_home_screen")}
              </span>
              {t("pwa_btn_install", "Install App")}
            </button>
          )}

          {isIos ? (
            <UniversalGroup
              title={t("pwa_install_subtitle", "Progressive Web App (iOS / Android / Web)")}
              icon={t("icon_ios_share", "ios_share")}
            >
              <div className="flex flex-col gap-3">
                <div className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_ios_share", "ios_share")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("pwa_ios_step1_title", "1. Tap the Share Button")}
                    </span>
                    <span className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                      {t("pwa_ios_step1_desc", "Tap the Share icon at the bottom or top of Safari.")}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_add_box", "add_box")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("pwa_ios_step2_title", "2. Select 'Add to Home Screen'")}
                    </span>
                    <span className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                      {t("pwa_ios_step2_desc", "Scroll down the share sheet and tap 'Add to Home Screen'.")}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--success)] shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_check_circle", "check_circle")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("pwa_ios_step3_title", "3. Tap 'Add' to Launch")}
                    </span>
                    <span className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                      {t(
                        "pwa_ios_step3_desc",
                        "Tap 'Add' in the top-right corner. Sanctuary OS will now open in full-screen standalone mode."
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </UniversalGroup>
          ) : (
            <UniversalGroup
              title={t("pwa_install_subtitle", "Progressive Web App (iOS / Android / Web)")}
              icon={t("icon_install_mobile", "install_mobile")}
            >
              <div className="flex flex-col gap-3">
                <div className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_more_vert", "more_vert")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("pwa_android_step1_title", "1. Open Browser Menu")}
                    </span>
                    <span className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                      {t(
                        "pwa_android_step1_desc",
                        "Tap the three-dot menu icon in Chrome or your mobile browser."
                      )}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl glass-surface border border-[color-mix(in_srgb,var(--text)_10%,transparent)] flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl glass-surface border border-[var(--glass-card-icon-border,rgba(255,255,255,0.22))] bg-[var(--glass-card-icon-bg,rgba(255,255,255,0.08))] shadow-[var(--glass-card-icon-shadow)] flex items-center justify-center text-[var(--accent)] shrink-0">
                    <span className="material-symbols-outlined !text-[20px]">
                      {t("icon_add_to_home_screen", "add_to_home_screen")}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-black uppercase tracking-wider text-[var(--text)]">
                      {t("pwa_android_step2_title", "2. Tap 'Install App' or 'Add to Home screen'")}
                    </span>
                    <span className="text-xs font-medium text-[var(--subtext)] leading-relaxed">
                      {t(
                        "pwa_android_step2_desc",
                        "Confirm the prompt to add Sanctuary OS to your app drawer and home screen."
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </UniversalGroup>
          )}
        </div>
      </SidePanel>
    </>
  );
}
