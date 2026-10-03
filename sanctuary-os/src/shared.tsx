export * from "./shared-components/buttons";
export * from "./shared-components/tabs";
export * from "./shared-components/dropdowns";
export * from "./shared-components/layout";
export * from "./shared-components/alerts";
export * from "./shared-components/versionUtils";
export * from "./shared-components/stringUtils";
export * from "./shared-components/modUtils";
export * from "./shared-components/misc";
export * from "./shared/LinkAssetSidePanel";

import { useStore } from "./store";
import { useLexicon } from "./LexiconContext";
import { useTheme } from "./ThemeContext";
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useModalStore } from "./store/modalStore";
import { useTooltipStore } from "./store/tooltipStore";
import { supabase } from "./supabase";
import { UniversalCard } from "./components/universal/UniversalCard";

declare global {
  interface Window {
    __sanctuaryCache?: {
      nexus: {
        homeStats: any | null;
        recentFeed: any[];
        lastHomeFetch: number;
        nexusItems: any[] | null;
        lastNexusFetch: number;
        assetResultsMap: Record<string, any[]>;
        lastAssetFetch: number;
      };
      globalFeed: {
        posts: any[];
        overviewStats: any | null;
        lastFetch: number;
      };
      support: {
        tickets: any[];
        lastFetch: number;
      };
    };
  }
}

