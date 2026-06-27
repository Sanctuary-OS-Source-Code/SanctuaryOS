import React, { useState, useEffect } from "react";
import { useLexicon } from "./LexiconContext";
import { supabase } from "./supabase";

export default function SAWayfinderReports() {
  const { t } = useLexicon();
  const [reports, setReports] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate fetching Wayfinder specific reports or metrics
    const fetchReports = async () => {
      setIsLoading(true);
      setTimeout(() => {
        setReports([]);
        setIsLoading(false);
      }, 1000);
    };

    fetchReports();
  }, []);

  return (
    <div className="flex flex-col gap-6 w-full h-full text-[var(--text)] overflow-hidden">
      <div className="flex justify-between items-center bg-[color-mix(in_srgb,var(--bg)_50%,transparent)] p-6 rounded-2xl border border-[color-mix(in_srgb,var(--text)_5%,transparent)] backdrop-blur-xl">
        <div className="flex flex-col">
          <h2 className="text-2xl font-black uppercase tracking-widest">{t("sa_wayfinder_reports")}</h2>
          <p className="text-sm font-bold text-[var(--subtext)]">{t("auto_analytics_and_escalated_intel_from_globa")}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-4 pb-10">
        {isLoading ? (
          <div className="flex justify-center items-center h-40 opacity-50">
            <span className="text-sm font-bold animate-pulse uppercase tracking-widest">{t("ui_btn_processing")}</span>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex justify-center items-center h-40 theme-glass-inner rounded-2xl">
            <span className="text-sm font-bold text-[var(--subtext)] uppercase tracking-widest">{t("sa_no_wayfinder")}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
             {/* Report cards would go here */}
          </div>
        )}
      </div>
    </div>
  );
}
